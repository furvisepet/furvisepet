import type { CareEntryRow } from "./supabase";
import type { ProposedSemanticFrame } from "./intelligence/semantic-frame/types.ts";

export type AskConcernTag =
  | "breathing_difficulty"
  | "collapse"
  | "seizure"
  | "severe_bleeding"
  | "repeated_vomiting"
  | "inability_to_urinate"
  | "extreme_lethargy"
  | "toxin_exposure"
  | "rapidly_worsening";

export type ImmediateAskEmergency = {
  tags: Array<"breathing_difficulty" | "collapse" | "seizure" | "severe_bleeding">;
};

export type RecentAskUpdate = {
  id: string;
  active: boolean | null;
  category: string;
  concernTags: AskConcernTag[];
  createdAt: string;
  details: string;
  occurredAt: string;
  severity: string | null;
  title: string;
};

type ConversationTurn = { role: string; text: string };
type ActiveConcernMessageState = "worsening" | "still_active" | "improved" | "resolved" | "recurrence" | "unclear" | "unrelated";
type ConcernConcept = { normalized_key: string };

const concernPatterns: Array<{ tag: AskConcernTag; pattern: RegExp }> = [
  { tag: "breathing_difficulty", pattern: /\b(short(?:ness|age) of breath|trouble breathing|difficulty breathing|difficult breathing|labou?red breathing|open[- ]mouth breathing|breathing (?:hard|heavily|fast)|deep breaths?|gasping|cannot breathe|can't breathe)\b/i },
  { tag: "collapse", pattern: /\b(collapse[ds]?|unconscious|fainted|(?:non|un)responsive)\b/i },
  { tag: "seizure", pattern: /\b(seizure|seizing|convulsion)\b/i },
  { tag: "severe_bleeding", pattern: /\b(severe bleeding|uncontrolled bleeding|bleeding heavily|bleeding (?:will not|won't) stop|blood in (?:vomit|stool))\b/i },
  { tag: "repeated_vomiting", pattern: /\b(repeated vomiting|keeps vomiting|vomiting repeatedly|unable to keep water down|cannot keep water down|can't keep water down)\b/i },
  { tag: "inability_to_urinate", pattern: /\b(cannot urinate|can't urinate|unable to urinate|straining to pee|blocked urine)\b/i },
  { tag: "extreme_lethargy", pattern: /\b(extreme lethargy|severe weakness|barely moving|cannot stand|can't stand|unusually tired|very tired)\b/i },
  { tag: "toxin_exposure", pattern: /\b(toxin|toxic|poison(?:ing)?|antifreeze|rat poison|ate (?:chocolate|grapes|raisins))\b/i },
  { tag: "rapidly_worsening", pattern: /\b(rapidly worsening|worsening quickly|getting worse fast|deteriorating rapidly)\b/i },
];

const immediateEmergencyPatterns: Array<{
  tag: ImmediateAskEmergency["tags"][number];
  pattern: RegExp;
}> = [
  { tag: "breathing_difficulty", pattern: /\b((?:cannot|can't|unable to) breathe|gasping|open[- ]mouth breathing|severe (?:trouble|difficulty) breathing|struggling to breathe)\b/i },
  { tag: "collapse", pattern: /\b(collapsed?|unconscious|(?:non|un)responsive|won't wake up|will not wake up)\b/i },
  { tag: "seizure", pattern: /\b(active seizure|actively seizing|seizing (?:right )?now|having (?:a |an )?seizure|in (?:a |an )?seizure|seizure (?:right )?now|won't stop seizing|will not stop seizing|convulsing)\b/i },
  { tag: "severe_bleeding", pattern: /\b(severe bleeding|uncontrolled bleeding|bleeding heavily|bleeding (?:will not|won't) stop)\b/i },
];

const generalEmergencyDiscussionPattern = /^(?:what (?:is|are|causes?) (?:a |an )?(?:seizure|collapse|breathing difficulty|severe bleeding)|what does (?:seizure|collapse|unresponsive|cannot breathe|severe bleeding) mean|(?:can|could) (?:dogs|cats|pets|animals) (?:(?:have|experience) (?:seizures?|collapse|breathing difficulty|severe bleeding)|collapse(?: from .+)?|become unresponsive(?: from .+)?)|tell me about (?:seizures?|collapse|breathing difficulty|severe bleeding)|definition of (?:seizure|collapse|breathing difficulty|severe bleeding))\??$/i;
const explicitNonPetSubjectPattern = /\b(i am|i'm|i cannot|i can't|myself|a person|someone|human|child|baby)\b/i;
const explicitPetSubjectPattern = /\b(dog|cat|pet|puppy|kitten|animal|my (?:boy|girl)|one of (?:my|our|the) (?:pets|dogs|cats))\b/i;

const generalResolutionPattern = /\b(returned to normal|back to normal|normal again|everything seems normal|(?:is|are|was|were) (?:good|fine) now|symptoms? (?:resolved|stopped|are gone|went away)|no longer happening|fully recovered)\b/i;

export function buildRecentAskUpdates(entries: CareEntryRow[], now = new Date()): RecentAskUpdate[] {
  const sorted = [...entries]
    .filter((entry) => Boolean(entry.title?.trim() || entry.note?.trim()))
    .sort((left, right) => effectiveTimestamp(right) - effectiveTimestamp(left));
  const thirtyDaysAgo = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  const recentWindowCount = sorted.filter((entry) => effectiveTimestamp(entry) >= thirtyDaysAgo).length;
  const selected = sorted.slice(0, Math.min(50, Math.max(10, recentWindowCount)));

  return selected.map((entry, index) => {
    const concernTags = detectAskConcernTags(`${entry.title || ""} ${entry.note || ""}`);
    const laterText = selected
      .slice(0, index)
      .map((later) => `${later.title || ""} ${later.note || ""}`)
      .join(" ");
    const active = concernTags.length
      ? !concernTags.every((tag) => hasResolutionForConcern(laterText, tag))
      : null;
    return {
      id: entry.id,
      active,
      category: normalizeCareCategory(entry.category),
      concernTags,
      createdAt: entry.created_at,
      details: entry.note || "",
      occurredAt: entry.occurred_at || entry.created_at,
      severity: entry.severity,
      title: entry.title?.trim() || "Care update",
    };
  });
}

export function evaluateAskSafetyContext({
  activeCareNotes = [],
  authoritativeActiveConcernTags,
  currentMessage,
  recentConversationTurns = [],
  recentlyResolvedConcernTags = [],
  recentUpdates,
  savedSafetyFlags = [],
}: {
  activeCareNotes?: string[];
  authoritativeActiveConcernTags?: AskConcernTag[];
  currentMessage: string;
  recentConversationTurns?: ConversationTurn[];
  recentlyResolvedConcernTags?: AskConcernTag[];
  recentUpdates: RecentAskUpdate[];
  savedSafetyFlags?: string[];
}) {
  const currentTags = detectAskConcernTags(currentMessage);
  const currentResolutions = allConcernTags.filter((tag) => hasResolutionForConcern(currentMessage, tag));
  const updateTags = recentUpdates
    .filter((update) => update.active)
    .flatMap((update) => update.concernTags)
    .filter((tag) => !currentResolutions.includes(tag));
  const conversationTags = unresolvedConversationConcernTags(recentConversationTurns, currentMessage);
  const savedTags = detectAskConcernTags([...activeCareNotes, ...savedSafetyFlags].join(" "))
    .filter((tag) => !currentResolutions.includes(tag));
  const historicalTags = authoritativeActiveConcernTags === undefined
    ? [...updateTags, ...conversationTags, ...savedTags]
    : authoritativeActiveConcernTags.filter((tag) => !currentResolutions.includes(tag));
  const activeConcernTags = uniqueConcernTags([...currentTags, ...historicalTags]);

  return {
    activeConcernTags,
    safetyLevel: activeConcernTags.length
      ? "urgent" as const
      : recentlyResolvedConcernTags.length ? "monitor" as const : "normal" as const,
  };
}

export function isHistoricalSafetyRelevantToTurn({
  activeConcerns,
  concernStateHint,
  currentMessage,
  frame,
}: {
  activeConcerns: ConcernConcept[];
  concernStateHint?: ActiveConcernMessageState;
  currentMessage: string;
  frame?: ProposedSemanticFrame;
}) {
  if (detectAskConcernTags(currentMessage).length) return true;
  if (["worsening", "still_active", "improved", "resolved", "recurrence"].includes(concernStateHint || "")) return true;
  if (!activeConcerns.length || !frame) return false;

  const activeConcepts = new Set(activeConcerns.map((concern) => normalizeConceptKey(concern.normalized_key)).filter(Boolean));
  const currentConcepts = new Set(frame.claims
    .filter((claim) => claim.kind === "assertion" || claim.kind === "event" || claim.kind === "state_transition")
    .flatMap((claim) => claim.kind === "state_transition"
      ? [claim.predicate.label, claim.targetConcept.label]
      : [claim.predicate.label])
    .map(normalizeConceptKey)
    .filter(Boolean));
  if ([...currentConcepts].some((concept) => activeConcepts.has(concept))) return true;

  const asksAboutCurrentSubject = frame.discourseActs.some((act) => act.kind === "question")
    && frame.mentions.some((mention) => mention.coarseType === "animal")
    && frame.claims.length === 0;
  return asksAboutCurrentSubject;
}

export function concernKeyToAskTags(key: string, title = ""): AskConcernTag[] {
  const normalized = `${key} ${title}`.toLowerCase();
  const tags = detectAskConcernTags(normalized.replace(/_/g, " "));
  if (/\bbreath/.test(normalized)) tags.push("breathing_difficulty");
  if (/\b(?:extreme_)?letharg/.test(normalized)) tags.push("extreme_lethargy");
  return uniqueConcernTags(tags);
}

export function detectAskConcernTags(value: string): AskConcernTag[] {
  return concernPatterns.filter(({ pattern }) => pattern.test(value)).map(({ tag }) => tag);
}

export function detectImmediateAskEmergency(value: string): ImmediateAskEmergency | null {
  const message = value.trim().replace(/\s+/g, " ");
  if (!message || generalEmergencyDiscussionPattern.test(message)) return null;
  if (explicitNonPetSubjectPattern.test(message) && !explicitPetSubjectPattern.test(message)) return null;
  const tags = immediateEmergencyPatterns
    .filter(({ pattern, tag }) => pattern.test(message) && !hasImmediateEmergencyResolution(message, tag))
    .map(({ tag }) => tag);
  return tags.length ? { tags: [...new Set(tags)] } : null;
}

export function buildImmediateEmergencyGuidance(emergency: ImmediateAskEmergency) {
  const classSpecificActions: Partial<Record<ImmediateAskEmergency["tags"][number], string>> = {
    breathing_difficulty: "Keep handling and exertion to a minimum while arranging transport.",
    collapse: "Keep the pet still and move them only as needed to reach care safely.",
    seizure: "Keep the pet away from stairs and hard objects. Do not restrain them or put anything in their mouth.",
    severe_bleeding: "If it is safe, hold steady pressure with a clean cloth while you travel to care.",
  };
  return {
    title: "Get emergency veterinary help now",
    summary: "Contact an emergency veterinarian or clinic now. Do not wait for Furvise to identify the pet or analyze the symptoms further.",
    sections: [{
      heading: "What to do now",
      items: [
        "Have someone call the clinic while you leave, if possible, and follow the clinic's instructions.",
        ...emergency.tags.map((tag) => classSpecificActions[tag]).filter((item): item is string => Boolean(item)),
        "Do not give food, medicine, or home remedies unless a veterinarian tells you to.",
      ],
    }],
    safetyNote: "Furvise cannot diagnose an emergency. If your regular clinic is unavailable, contact the nearest emergency veterinary clinic.",
  };
}

function hasImmediateEmergencyResolution(message: string, tag: ImmediateAskEmergency["tags"][number]) {
  if (tag === "breathing_difficulty") return /\b(breathing (?:normally|is normal)|can breathe normally|no longer (?:gasping|struggling to breathe))\b/i.test(message);
  if (tag === "collapse") return /\b(responsive again|conscious again|woke up|back to normal|fully recovered)\b/i.test(message);
  if (tag === "seizure") return /\b(no longer seizing|not seizing|seizure (?:has )?stopped|stopped seizing)\b/i.test(message);
  return /\b(no longer bleeding|not bleeding|bleeding (?:has )?stopped|stopped bleeding)\b/i.test(message);
}

export function formatConcernTag(tag: AskConcernTag) {
  return ({
    breathing_difficulty: "breathing difficulty",
    collapse: "collapse",
    seizure: "seizure",
    severe_bleeding: "severe bleeding",
    repeated_vomiting: "repeated vomiting",
    inability_to_urinate: "inability to urinate",
    extreme_lethargy: "extreme lethargy",
    toxin_exposure: "toxin exposure",
    rapidly_worsening: "rapidly worsening symptoms",
  } satisfies Record<AskConcernTag, string>)[tag];
}

export function getPetReferenceGuidance({
  name,
  pronouns,
  sex,
  species,
}: {
  name: string;
  pronouns?: string | null;
  sex?: string | null;
  species: string | null;
}) {
  const explicitPronouns = pronouns?.trim().toLowerCase() || "";
  const explicitSex = sex?.trim().toLowerCase() || "";
  if (/\bshe\s*\/\s*her\b/.test(explicitPronouns) || /^(female|f)$/.test(explicitSex)) {
    return { allowsGenderedPronouns: true, instruction: `Use she and her consistently for ${name}.` };
  }
  if (/\bhe\s*\/\s*him\b/.test(explicitPronouns) || /^(male|m)$/.test(explicitSex)) {
    return { allowsGenderedPronouns: true, instruction: `Use he and him consistently for ${name}.` };
  }
  const neutralPet = species === "cat" ? "your cat" : species === "dog" ? "your dog" : "your pet";
  return {
    allowsGenderedPronouns: false,
    instruction: `No saved sex or pronoun data is available. Use ${name}, ${neutralPet}, or neutral they wording. Never infer gender from the name, species, breed, or photo.`,
  };
}

export function removeUnsupportedGenderedPronouns(value: string, petName: string) {
  return value
    .replace(/\b(?:her|his) own\b/gi, `${petName}'s own`)
    .replace(/\b(?:herself|himself)\b/gi, petName)
    .replace(/\b(?:hers|his)\b/gi, `${petName}'s`)
    .replace(/\b(?:she|he|her|him)\b/gi, petName);
}

const allConcernTags = concernPatterns.map(({ tag }) => tag);

function unresolvedConversationConcernTags(turns: ConversationTurn[], currentMessage: string) {
  const normalized = turns.slice(-12);
  const tags: AskConcernTag[] = [];
  normalized.forEach((turn, index) => {
    detectAskConcernTags(turn.text).forEach((tag) => {
      const laterText = [...normalized.slice(index + 1).map((item) => item.text), currentMessage].join(" ");
      if (!hasResolutionForConcern(laterText, tag)) tags.push(tag);
    });
  });
  return tags;
}

function hasResolutionForConcern(value: string, tag: AskConcernTag) {
  if (generalResolutionPattern.test(value)) return true;
  if (tag === "breathing_difficulty") {
    return /\b(breathing (?:is |was |returned to |back to )?normal|breathing normally again|no (?:more|longer) (?:deep|difficult|labou?red) breathing)\b/i.test(value);
  }
  if (tag === "repeated_vomiting") return /\b(no longer vomiting|vomiting stopped|kept (?:food|water) down)\b/i.test(value);
  if (tag === "inability_to_urinate") return /\b(urinating normally|able to urinate|peed normally)\b/i.test(value);
  return false;
}

function effectiveTimestamp(entry: Pick<CareEntryRow, "occurred_at" | "created_at">) {
  const occurred = Date.parse(entry.occurred_at);
  if (Number.isFinite(occurred)) return occurred;
  const created = Date.parse(entry.created_at);
  return Number.isFinite(created) ? created : 0;
}

function normalizeCareCategory(category: string) {
  return category.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function normalizeConceptKey(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function uniqueConcernTags(tags: AskConcernTag[]) {
  return [...new Set(tags)];
}
