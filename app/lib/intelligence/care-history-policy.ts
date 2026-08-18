import type { CareEntryRow, DogProfileRow } from "../supabase.ts";
import type { GovernedCanonicalEvent, IntelligenceCareAction, SemanticEventDomain, SemanticEventTransition } from "./types.ts";

const explicitSavePattern = /\b(?:save|log|record|note|add|put)\b[\s\S]{0,80}\b(?:this|that|it|history|care history|timeline)\b|\bcan (?:you|u) (?:save|log|record|note|add)\b/i;
const conversationalNoisePattern = /\b(?:chasing?|chased)\s+butterfl(?:y|ies)\b|\bbutterfl(?:y|ies)\b|\b(?:is|was|being)\s+(?:dumb|silly|goofy|cute|funny|insane|a menace|a gremlin)(?:\s+af)?\b|\b(?:lol|lmao|haha|hehe)\b|\bnormal\s+play\b|\b(?:played?|playing)\s+(?:normally|with (?:a )?toy)\b|\b(?:more )?interested in (?:going|get(?:ting)?) outside\b/i;
const clinicalSignalPattern = /\b(?:appetite|not eating|won't eat|drank?|drinking|thirst|water intake|vomit|vomiting|diarrhea|stool|urine|urinating|elimination|weight|body condition|limp|limping|injur(?:y|ed)|wound|bleed(?:ing)?|pain|letharg(?:y|ic)|cough|sneez|itch|scratch|rash|swelling|breath(?:e|ing)|seizure|collapse|toxin|toxic|poison|exposure|ate|ingested|medication|medicine|supplement|dose|treatment|therapy|vaccine|vaccination|veterinar(?:y|ian)|vet visit|test result|lab result|diagnos|surgery)\b/i;
const behaviorChangePattern = /\b(?:still|continued?|keeps?|again|recurr(?:ed|ing)?|started?|changed?|wors(?:e|ened|ening)|improv(?:ed|ing)|resolved?|stopped?|since|for\s+(?:the\s+)?(?:last\s+)?\d+\s+(?:hours?|days?|weeks?))\b[\s\S]{0,100}\b(?:pac(?:e|ed|ing)|restless|hiding|aggress(?:ive|ion)|anxious|anxiety|vocal(?:izing)?|meow(?:ing)?|sleep|energy|activity|behavior|routine)\b|\b(?:pac(?:e|ed|ing)|restless|hiding|aggress(?:ive|ion)|anxious|anxiety|vocal(?:izing)?|meow(?:ing)?)\b[\s\S]{0,100}\b(?:still|continued?|keeps?|again|since|started?|changed?|wors(?:e|ened|ening)|improv(?:ed|ing)|resolved?|stopped?)\b/i;
const dietOrRoutineChangePattern = /\b(?:food|diet|meal|feeding|routine|schedule)\b[\s\S]{0,80}\b(?:started?|stopped?|switched?|changed?|new|more|less|increased?|decreased?)\b|\b(?:started?|stopped?|switched?|changed?)\b[\s\S]{0,80}\b(?:food|diet|meal|feeding|routine|schedule)\b/i;
const lifecycleEventPattern = /\b(?:died|passed away|death|euthanized|put (?:her|him|them) to sleep)\b/i;
const genericQuestionPattern = /^(?:can|could|do|does|did|is|are|should|would|what|when|where|why|how|which)\b[\s\S]*\?$/i;
const meaningfulTransition = new Set<SemanticEventTransition>(["started", "continued", "changed", "improved", "worsened", "resolved", "corrected", "confirmed"]);

export type CareHistorySaveDecision = { eligible: boolean; reason: string; explicitOverride: boolean };

export function isExplicitCareHistorySaveRequest(message: string) {
  return explicitSavePattern.test(clean(message));
}

export function evaluateCareHistorySaveWorthiness(input: {
  domain?: SemanticEventDomain | string;
  category?: string;
  title?: string | null;
  details?: string | null;
  sourceMessage: string;
  transition?: SemanticEventTransition;
  hasTrackedEpisode?: boolean;
}): CareHistorySaveDecision {
  const source = clean(input.sourceMessage);
  const eventText = clean([input.category, input.domain, input.title, input.details].filter(Boolean).join(" "));
  const text = clean([eventText, source].filter(Boolean).join(" "));
  const explicitOverride = isExplicitCareHistorySaveRequest(source);
  if (explicitOverride) return { eligible: true, reason: "explicit_owner_save_request", explicitOverride: true };
  if (!source) return { eligible: false, reason: "empty_source", explicitOverride: false };
  const proposedEventIsNoise = conversationalNoisePattern.test(eventText || source)
    && !clinicalSignalPattern.test(eventText || source)
    && !behaviorChangePattern.test(eventText || source);
  if (proposedEventIsNoise) {
    return { eligible: false, reason: "conversational_noise", explicitOverride: false };
  }
  if (genericQuestionPattern.test(source) && !/\b(?:my|our|he|she|they|it|[A-Z][a-z]+)\b[\s\S]{0,80}\b(?:has|had|is|was|started|stopped|changed|ate|drank|vomit|seems?)\b/.test(source)) {
    return { eligible: false, reason: "generic_question", explicitOverride: false };
  }
  if (input.hasTrackedEpisode && input.transition && meaningfulTransition.has(input.transition)) {
    return { eligible: true, reason: "tracked_concern_state_change", explicitOverride: false };
  }
  if (clinicalSignalPattern.test(text)) return { eligible: true, reason: "clinical_or_care_signal", explicitOverride: false };
  if (lifecycleEventPattern.test(text)) return { eligible: true, reason: "pet_lifecycle_event", explicitOverride: false };
  if (behaviorChangePattern.test(text)) return { eligible: true, reason: "sustained_behavior_change", explicitOverride: false };
  if (dietOrRoutineChangePattern.test(text)) return { eligible: true, reason: "material_routine_change", explicitOverride: false };
  if (["medication", "health", "safety", "care", "behavior", "nutrition", "routine"].includes(String(input.domain || "")) && input.transition && meaningfulTransition.has(input.transition)) {
    return { eligible: true, reason: "material_care_event", explicitOverride: false };
  }
  return { eligible: false, reason: "insufficient_longitudinal_value", explicitOverride: false };
}

export function isKnownConversationalCareNoise(value: string) {
  const text = clean(value);
  return conversationalNoisePattern.test(text) && !clinicalSignalPattern.test(text) && !behaviorChangePattern.test(text);
}

export function isLongitudinalCareHistoryEntry(entry: Pick<CareEntryRow, "category" | "title" | "note">) {
  return !isKnownConversationalCareNoise(`${entry.category} ${entry.title || ""} ${entry.note}`);
}

export function prepareGovernedCareHistoryEvent(event: GovernedCanonicalEvent): GovernedCanonicalEvent {
  const proposal = event.event;
  if (/^Owner (?:reported that|was uncertain whether)\b/i.test(clean(proposal.sourceExcerpt))) {
    return event;
  }
  const petName = clean(proposal.subject.name || "the pet");
  const uncertain = /\b(?:i think|maybe|might|may have|possibly|not (?:completely )?sure|uncertain|could have)\b/i.test(proposal.sourceExcerpt);
  let clause = clean(proposal.sourceExcerpt)
    .replace(/^(?:and|but|so|then)\s+/i, "")
    .replace(/^(?:i think|maybe|possibly)\s+/i, "")
    .replace(/\s*,?\s*but\s+i(?:['’]m| am)\s+not\s+(?:completely\s+)?sure\.?$/i, "")
    .replace(/\bI (?:had )?left\b/gi, "the owner had left")
    .replace(/\bmy\s+(?:cat|dog|pet)\b/gi, petName)
    .replace(/^(?:I|we)\s+(?:noticed|saw|observed|reported)\s+(?:that\s+)?(?:she|he|they|it)\b/i, petName)
    .replace(/^(?:she|he|they|it)\b/i, petName);
  clause = clause.replace(new RegExp(`\\b${escapeRegExp(petName)}\\b`, "gi"), petName);
  const namesPet = new RegExp(`\\b${escapeRegExp(petName)}\\b`, "i").test(clause);
  const standalone = uncertain
    ? `Owner was uncertain whether ${namesPet ? clause : `${petName} ${clause}`}`
    : `Owner reported that ${namesPet ? clause : `${petName} ${clause}`}`;
  const uncertainTitle = /\bwater\b/i.test(`${proposal.topic} ${proposal.eventTitle}`)
    ? `Possible outdoor water exposure for ${petName}`
    : `Possible ${proposal.eventTitle}`;
  const title = uncertain && !/\b(?:possible|possibly|may|might|suspected|uncertain)\b/i.test(proposal.eventTitle)
    ? uncertainTitle
    : proposal.eventTitle;
  return {
    ...event,
    event: {
      ...proposal,
      eventTitle: label(title, 120),
      sourceExcerpt: sentence(standalone, 500),
    },
  };
}

export function prepareGovernedCareHistoryAction(input: {
  action: IntelligenceCareAction;
  petName: string;
  sourceMessage: string;
}): IntelligenceCareAction {
  const action = input.action;
  if (action.action === "none" || action.action === "update_profile") return action;
  const petName = clean(input.petName || "the pet");
  const source = clean(input.sourceMessage);
  const uncertain = /\b(?:i think|maybe|might|may have|possibly|not (?:completely )?sure|uncertain|could have)\b/i.test(source);
  let detail = clean(action.details).replace(/^(?:and|but|so|then)\s+/i, "")
    .replace(/\bmy\s+(?:cat|dog|pet)\b/gi, petName)
    .replace(/^(?:she|he|they|it)\b/i, petName);
  if (!new RegExp(`\\b${escapeRegExp(petName)}\\b`, "i").test(detail)) detail = `${petName} ${detail}`;
  if (!/^Owner (?:reported that|was uncertain whether|explicitly asked)\b/i.test(detail)) {
    detail = uncertain ? `Owner was uncertain whether ${detail}` : `Owner reported that ${detail}`;
  }
  let title = clean(action.title).replace(/^(?:and|but|so|then)\s+/i, "");
  if (!new RegExp(`\\b${escapeRegExp(petName)}\\b`, "i").test(title)) title = `${petName} ${title}`;
  if (uncertain && !/\b(?:possible|possibly|may|might|suspected|uncertain)\b/i.test(title)) title = `Possible ${title}`;
  return { ...action, title: label(title, 120), details: sentence(detail, 500) };
}

export function findEquivalentRecentCareEntry(input: {
  title: string;
  details: string;
  severity?: string | null;
  transition?: SemanticEventTransition;
  entries: CareEntryRow[];
  now?: Date;
}) {
  if (input.transition && ["changed", "improved", "worsened", "resolved", "corrected", "started"].includes(input.transition)) return null;
  const now = (input.now || new Date()).getTime();
  const candidateTokens = significantTokens(`${input.title} ${input.details}`);
  if (!candidateTokens.length) return null;
  return input.entries.find((entry) => {
    const occurred = Date.parse(entry.occurred_at || entry.created_at);
    if (!Number.isFinite(occurred) || Math.abs(now - occurred) > 7 * 86_400_000) return false;
    if (severityRank(input.severity) > severityRank(entry.severity)) return false;
    const existingTokens = significantTokens(`${entry.title || ""} ${entry.note}`);
    const overlap = candidateTokens.filter((token) => existingTokens.includes(token)).length;
    return overlap >= 2 && overlap / Math.min(candidateTokens.length, existingTokens.length || 1) >= 0.65;
  }) || null;
}

export function buildExplicitCareHistoryAction(input: {
  currentMessage: string;
  conversationTurns: Array<{ role: "user" | "furvise"; text: string }>;
  pet: Pick<DogProfileRow, "name">;
}): IntelligenceCareAction | null {
  if (!isExplicitCareHistorySaveRequest(input.currentMessage)) return null;
  const source = [...input.conversationTurns].reverse().find((turn) => turn.role === "user" && clean(turn.text) && !isExplicitCareHistorySaveRequest(turn.text))?.text;
  if (!source) return null;
  const petName = clean(input.pet.name || "the pet");
  const text = clean(source);
  const standaloneText = text.replace(/^(?:and|but|so|then)\s+/i, "").replace(/^(?:she|he|they|it)\b/i, petName);
  const butterfly = /chasing?|chased/.test(text.toLowerCase()) && /butterfl(?:y|ies)/i.test(text);
  const pacing = /\bpac(?:e|ed|ing)\b/i.test(text);
  const title = butterfly ? `${petName} chased butterflies outside`
    : pacing ? `${petName} pacing update`
    : `Owner note about ${petName}`;
  const category = /\b(?:medication|medicine|supplement|dose)\b/i.test(text) ? "medication"
    : /\b(?:food|diet|eat|ate|appetite|drink|water)\b/i.test(text) ? "food"
    : /\b(?:symptom|vomit|diarrhea|pain|injur|bleed|breath|cough|itch)\b/i.test(text) ? "symptom"
    : "behavior";
  return {
    action: "create_entry",
    category,
    title: label(title, 120),
    details: sentence(`Owner explicitly asked to save this note about ${petName}: “${standaloneText}”`, 500),
    severity: "routine",
    confidence: 0.99,
    relatedRecordId: null,
  };
}

function significantTokens(value: string) {
  const stop = new Set(["about", "after", "again", "continued", "history", "mani", "owner", "reported", "still", "that", "their", "there", "they", "this", "update", "with"]);
  return [...new Set(clean(value).toLowerCase().match(/[a-z0-9]{3,}/g) || [])].filter((token) => !stop.has(token));
}

function severityRank(value: string | null | undefined) {
  return ({ routine: 0, mild: 1, moderate: 2, important: 2, severe: 3, urgent: 3, emergency: 4 } as Record<string, number>)[String(value || "routine")] || 0;
}

function sentence(value: string, maxLength: number) {
  const text = clean(value).slice(0, maxLength).replace(/[.,;:!?]+$/, "");
  return text ? `${text}.` : "Care update.";
}

function label(value: string, maxLength: number) {
  return clean(value).slice(0, maxLength).replace(/[.,;:!?]+$/, "") || "Care update";
}

function clean(value: string) {
  return value.normalize("NFKC").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
