import type { CareEntryRow } from "../supabase.ts";
import { evaluateCareHistorySaveWorthiness, prepareGovernedCareHistoryEvent } from "../intelligence/care-history-policy.ts";
import type { GovernedCanonicalEvent } from "../intelligence/types.ts";
import { analyzeOwnerAssertions } from "./owner-assertion.ts";
import { assertedConcernTransitions, classifyUserTurn, type ActiveConcernMessageState, type ConcernTransitionEvidence } from "./turn-classifier.ts";

export type ConcernStatus = "active" | "monitoring" | "resolved" | "reopened" | "dismissed";
export type ConcernSeverity = "routine" | "important" | "urgent";

export type PetConcern = {
  id: string;
  user_id: string;
  pet_profile_id: string;
  title: string;
  normalized_key: string;
  status: ConcernStatus;
  severity: ConcernSeverity;
  source_care_entry_id: string | null;
  opened_at: string;
  updated_at: string;
  resolved_at: string | null;
  resolution_note: string | null;
};

export type PendingUpdateSuggestion = {
  id?: string;
  type: "history" | "memory" | "concern_resolution" | "concern_opening";
  title: string;
  details?: string;
  concernId?: string;
  payload: Record<string, unknown>;
};

export function getCurrentConcern(concerns: PetConcern[]) {
  return concerns
    .filter((concern) => concern.status !== "resolved" && concern.status !== "dismissed")
    .sort((a, b) => concernRank(b) - concernRank(a) || Date.parse(b.updated_at) - Date.parse(a.updated_at))[0] || null;
}

export function buildResolutionSuggestion({ concern, message, petName }: { concern: PetConcern; message: string; petName: string }): PendingUpdateSuggestion {
  const detail = buildResolutionDetail(concern, message, petName);
  const resolvedConcernKeys = [concern.normalized_key];
  if (concern.normalized_key === "breathing" && indicatesRecoveredTemporaryExertion(message)) {
    resolvedConcernKeys.push("extreme_lethargy", "lethargy");
  }
  return {
    type: "concern_resolution",
    title: "Save this improvement",
    details: detail,
    concernId: concern.id,
    payload: {
      category: "symptom",
      concernId: concern.id,
      note: detail,
      resolutionNote: message.trim(),
      resolvedConcernKeys,
      severity: "resolved",
      title: concern.normalized_key === "breathing" ? "Breathing returned to normal" : `${concern.title} resolved`,
    },
  };
}

function indicatesRecoveredTemporaryExertion(message: string) {
  return /\b(?:normal|fine|good|recovered|back to normal)\b/i.test(message) &&
    /\b(?:tired|energy|running|ran|exercise|exertion|rest(?:ed|ing)?)\b/i.test(message);
}

export function buildObservationSuggestion({ message, petName }: { message: string; petName: string }): PendingUpdateSuggestion {
  return {
    type: "history",
    title: "Save this update?",
    details: `${petName}: ${message.trim()}`,
    payload: { category: "general", note: message.trim(), title: "Care update" },
  };
}

export function buildSemanticEventReviewSuggestion({ event }: { event: GovernedCanonicalEvent }): PendingUpdateSuggestion {
  const proposal = prepareGovernedCareHistoryEvent(event).event;
  const category = proposal.domain === "health" ? "symptom"
    : proposal.domain === "nutrition" ? "food"
      : proposal.domain === "medication" ? "medication"
        : proposal.domain === "behavior" ? "behavior" : "general";
  return {
    type: "history",
    title: ["improved", "resolved", "corrected"].includes(proposal.transition) ? "Save this improvement" : "Save this update?",
    details: proposal.sourceExcerpt,
    payload: {
      category,
      note: proposal.sourceExcerpt,
      severity: proposal.importance === "urgent" ? "severe" : proposal.importance === "important" ? "moderate" : "mild",
      title: proposal.eventTitle,
      semanticDomain: proposal.domain,
      semanticTopic: proposal.normalizedTopic,
      semanticTransition: proposal.transition,
    },
  };
}

export function buildConcernOpeningSuggestion({ message, petName }: { message: string; petName: string }): PendingUpdateSuggestion | null {
  const clean = message.trim();
  const urgent = /\b(trouble breathing|short(ness|age) of breath|labored breathing|open.?mouth breathing|collapse|seizure|severe bleeding|cannot urinate|inability to urinate|toxin|extreme lethargy|repeated vomiting)\b/i.test(clean);
  const important = /\b(symptom|vomit|limp|pain|breath|bleed|seizure|letharg|cannot urinate)\b/i.test(clean);
  if (!urgent && !important) return null;
  return {
    type: "concern_opening",
    title: "Save this concern?",
    details: `${petName}: ${clean}`,
    payload: {
      category: "symptom",
      note: clean,
      severity: urgent ? "severe" : "moderate",
      title: "New care concern",
    },
  };
}

export function buildMemorySuggestion({ message, petName }: { message: string; petName: string }): PendingUpdateSuggestion {
  return {
    type: "memory",
    title: "Remember this detail?",
    details: `${petName}: ${message.trim()}`,
    payload: { memoryType: "preference", note: message.trim() },
  };
}

export function isPendingUpdateSuggestionGrounded(input: {
  suggestion: PendingUpdateSuggestion;
  message: string;
  hasActiveConcern?: boolean;
  concern?: PetConcern | null;
  activeConcerns?: PetConcern[];
  petId?: string;
  petName?: string;
}) {
  const assertion = analyzeOwnerAssertions(input.message);
  if (!assertion.hasOwnerAssertion) return false;
  const turn = classifyUserTurn(input.message, {
    hasActiveConcern: input.hasActiveConcern || input.suggestion.type === "concern_resolution",
  });
  if (input.suggestion.type === "concern_resolution") {
    const concern = input.concern;
    return Boolean(concern
      && input.suggestion.concernId === concern.id
      && isRecoveryGroundedForConcern({
        activeConcerns: input.activeConcerns || [concern],
        concern,
        message: input.message,
        petId: input.petId,
        petName: input.petName,
      }));
  }
  if (input.suggestion.type === "memory") {
    return turn.intent === "preference" || (turn.intent === "correction" && assertion.hasExplicitCorrection);
  }
  return evaluateCareHistorySaveWorthiness({
    category: typeof input.suggestion.payload.category === "string" ? input.suggestion.payload.category : undefined,
    title: typeof input.suggestion.payload.title === "string" ? input.suggestion.payload.title : input.suggestion.title,
    details: input.suggestion.details,
    sourceMessage: input.message,
  }).eligible;
}

const concernAliases: Array<[RegExp, RegExp]> = [
  [/vomit|stomach|nausea/, /\b(?:nausea|stomach upset|threw up|throwing up|vomit\w*)\b/i],
  [/hid|hiding|withdraw/, /\b(?:hid|hide|hiding|withdraw\w*)\b/i],
  [/breath|respirat/, /\b(?:breath\w*|respirat\w*)\b/i],
  [/letharg|energy|tired/, /\b(?:energy|letharg\w*|tired|weak)\b/i],
  [/diarr|stool/, /\b(?:diarr\w*|loose stools?|stools?)\b/i],
  [/limp|mobility/, /\b(?:limp\w*|mobility)\b/i],
  [/bleed/, /\bbleed\w*\b/i],
  [/cough/, /\bcough\w*\b/i],
  [/itch|scratch/, /\b(?:itch\w*|scratch\w*)\b/i],
  [/pain|sore/, /\b(?:pain\w*|sore|tender)\b/i],
];

export function isRecoveryGroundedForConcern(input: {
  activeConcerns: PetConcern[];
  concern: PetConcern;
  message: string;
  petId?: string;
  petName?: string;
}) {
  const state = classifyConcernEvidenceState(input);
  return state === "improved" || state === "resolved";
}

export function classifyConcernEvidenceState(input: {
  activeConcerns: PetConcern[];
  concern: PetConcern;
  message: string;
  petId?: string;
  petName?: string;
}): ActiveConcernMessageState {
  const activeConcerns = input.activeConcerns.filter(isLiveConcern);
  if (!isLiveConcern(input.concern)
    || input.petId && input.concern.pet_profile_id !== input.petId
    || !activeConcerns.some((concern) => concern.id === input.concern.id)
    || !messageMatchesPetIdentity(input.message, input.petName)) return "unrelated";

  const transitions = assertedConcernTransitions(input.message);
  const hasAnySpecificEvidence = transitions.some((transition) => concernAliases.some(([, evidence]) => evidence.test(transition.evidence)));
  const matching: ConcernTransitionEvidence[] = [];
  let hasMatchingSpecificEvidence = false;
  for (const transition of transitions) {
    if (recoveryMatchesConcern(transition.evidence, input.concern)) {
      matching.push(transition);
      hasMatchingSpecificEvidence = true;
      continue;
    }
    const isAnaphoricTransition = hasMatchingSpecificEvidence && isGenericTransitionEvidence(transition.evidence, transition.state);
    const isUnambiguousGeneric = !hasAnySpecificEvidence && activeConcerns.length === 1
      && isGenericTransitionEvidence(transition.evidence, transition.state);
    if (isAnaphoricTransition || isUnambiguousGeneric) matching.push(transition);
  }
  const finalTransition = matching.at(-1);
  if (!finalTransition) return "unrelated";
  return finalTransition.isCertain ? finalTransition.state : "unclear";
}

function recoveryMatchesConcern(evidence: string, concern: PetConcern) {
  const targetText = `${concern.normalized_key} ${concern.title}`.toLowerCase();
  const alias = concernAliases.find(([target]) => target.test(targetText));
  if (alias) return alias[1].test(evidence);
  const targetTokens = significantConcernTokens(targetText);
  const evidenceTokens = significantConcernTokens(evidence);
  return targetTokens.some((token) => evidenceTokens.includes(token));
}

function isGenericRecoveryEvidence(evidence: string) {
  return /\b(?:back to normal|doing well|doing better|feels better|fine now|is good|normal again|returned to normal|seems better|seems good|it stopped|has stopped)\b/i.test(evidence);
}

function isGenericTransitionEvidence(evidence: string, state: ConcernTransitionEvidence["state"]) {
  if (state === "recurrence") return /\b(?:it|this|that|the issue|the problem)\b/i.test(evidence);
  return isGenericRecoveryEvidence(evidence);
}

function isLiveConcern(concern: PetConcern) {
  return !["dismissed", "resolved"].includes(concern.status) && !concern.resolved_at;
}

function messageMatchesPetIdentity(message: string, petName?: string) {
  if (!petName?.trim()) return true;
  const explicitSubjects = [...message.matchAll(/(?:^|[.!?]\s+|\b(?:and|but|then)\s+)([A-Z][\p{L}'â€™-]{1,40})\s+(?:has|had|is|seems?|started|stopped|returned|came)\b/gu)]
    .map((match) => match[1])
    .filter((name) => !/^(?:Breathing|He|Hiding|I|It|She|Symptoms?|That|The|They|This|Vomiting|We)$/i.test(name));
  return explicitSubjects.length === 0 || explicitSubjects.every((name) => name.localeCompare(petName, undefined, { sensitivity: "accent" }) === 0);
}

function significantConcernTokens(value: string) {
  const ignored = new Set(["care", "concern", "improvement", "issue", "resolved", "save", "symptom", "this"]);
  return [...new Set(value.toLowerCase().match(/[a-z0-9]{3,}/g) || [])]
    .map((token) => token.replace(/(?:ing|ed|es|s)$/i, ""))
    .filter((token) => token.length > 2 && !ignored.has(token));
}

export function concernFromCareEntry(entry: CareEntryRow): { key: string; severity: ConcernSeverity; title: string } | null {
  const text = `${entry.title || ""} ${entry.note}`;
  const urgent = /\b(trouble breathing|short(ness|age) of breath|labored breathing|open.?mouth breathing|collapse|seizure|severe bleeding|cannot urinate|inability to urinate|toxin)\b/i.test(text);
  if (!urgent && (entry.category !== "symptom" || (entry.severity !== "moderate" && entry.severity !== "severe"))) return null;
  return {
    key: /breath/i.test(text) ? "breathing" : normalizeConcernKey(entry.title || entry.category),
    severity: urgent || entry.severity === "severe" ? "urgent" : "important",
    title: entry.title?.trim() || "Care concern",
  };
}

export function shouldReopenConcern(concern: PetConcern, entry: CareEntryRow) {
  const candidate = concernFromCareEntry(entry);
  return concern.status === "resolved" && candidate?.key === concern.normalized_key;
}

function buildResolutionDetail(concern: PetConcern, message: string, petName: string) {
  if (concern.normalized_key === "breathing") return `Owner reported that ${petName} appears well and is no longer showing the earlier breathing difficulty.`;
  const clean = message.trim().replace(/[.!]+$/, "");
  return `${petName} ${clean.charAt(0).toLowerCase()}${clean.slice(1)}.`;
}

function normalizeConcernKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "care_concern";
}

function concernRank(concern: PetConcern) {
  const severity = concern.severity === "urgent" ? 30 : concern.severity === "important" ? 20 : 10;
  const status = concern.status === "reopened" ? 3 : concern.status === "active" ? 2 : 1;
  return severity + status;
}
