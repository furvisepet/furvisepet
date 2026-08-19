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
  const message = value.trim().replace(/\s+/g, " ").replace(/\bcant\b/gi, "cannot");
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
    return { allowsGenderedPronouns: true, instruction: `Use she and her consistently. Use ${name} once when useful to establish the subject, then prefer those natural pronouns. Never contract the pet's name or replace a natural pronoun with the name.` };
  }
  if (/\bhe\s*\/\s*him\b/.test(explicitPronouns) || /^(male|m)$/.test(explicitSex)) {
    return { allowsGenderedPronouns: true, instruction: `Use he and him consistently. Use ${name} once when useful to establish the subject, then prefer those natural pronouns. Never contract the pet's name or replace a natural pronoun with the name.` };
  }
  if (/\bthey\s*\/\s*them\b/.test(explicitPronouns)) {
    return { allowsGenderedPronouns: true, instruction: `Use they and them consistently. Use ${name} once when useful to establish the subject, then prefer those natural pronouns. Never contract the pet's name or replace a natural pronoun with the name.` };
  }
  const neutralPet = species === "cat" ? "your cat" : species === "dog" ? "your dog" : "your pet";
  return {
    allowsGenderedPronouns: false,
    instruction: `No saved sex or pronoun data is available. Use ${name}, ${neutralPet}, or neutral they wording sparingly. Never infer gender or create a contraction with the pet's name.`,
  };
}

export function removeUnsupportedGenderedPronouns(value: string, petName: string) {
  const name = petName.trim() || "your pet";
  const possessive = possessiveName(name);
  return transformProtectedVisibleProse(value, (source) => source
    .replace(/\b(?:she|he)['\u2019]ll\b/gi, `${name} will`)
    .replace(/\b(?:she|he)['\u2019]re\b/gi, `${name} is`)
    .replace(/\b(?:she|he)['\u2019]ve\b/gi, `${name} has`)
    .replace(/\b(?:she|he)['\u2019]d\b/gi, `${name} would`)
    .replace(/\b(?:she|he)['\u2019]s\b/gi, `${name} is`)
    .replace(/\b(?:herself|himself)\b/gi, "themself")
    .replace(new RegExp(`\\b(${objectPronounGovernors})\\s+(?:her|him)\\b`, "gi"), `$1 ${name}`)
    .replace(/\bher\b(?=\s+[\p{L}][\p{L}'\u2019-]*)/giu, possessive)
    .replace(/\bhis\b(?=\s+[\p{L}][\p{L}'\u2019-]*)/giu, possessive)
    .replace(/\b(?:hers|his)\b/gi, possessive)
    .replace(/\b(?:she|he)\b/gi, name)
    .replace(/\b(?:her|him)\b/gi, name));
}

export function normalizePetVisibleProse(value: string, pet: {
  name: string;
  pronouns?: string | null;
  sex?: string | null;
  species?: string | null;
}, options: { reduceNameOveruse?: boolean; retainFirstName?: boolean } = {}) {
  const name = pet.name.trim() || "your pet";
  const reference = getPetReferenceGuidance({ ...pet, name, species: pet.species || null });
  if (!reference.allowsGenderedPronouns) {
    return neutralizeMalformedNamedReferences(removeUnsupportedGenderedPronouns(value, name), name, null, false);
  }

  const pronoun = petPronounSet(pet.pronouns, pet.sex);
  if (!pronoun) return neutralizeMalformedNamedReferences(removeUnsupportedGenderedPronouns(value, name), name, null, false);
  const normalized = transformProtectedVisibleProse(value, (source) => normalizeKnownPetReferences(
    source,
    name,
    pronoun,
    options.reduceNameOveruse !== false,
    options.retainFirstName !== false,
  ));
  return neutralizeMalformedNamedReferences(normalized, name, pronoun, options.reduceNameOveruse !== false);
}

export function normalizePetVisibleAnswer<T extends {
  summary: string;
  sections: { heading: string; items: string[] }[];
  safetyNote?: string | null;
}>(answer: T, pet: {
  name: string;
  pronouns?: string | null;
  sex?: string | null;
  species?: string | null;
}, options: { reduceNameOveruse?: boolean } = {}): T {
  let nameEstablished = false;
  const normalize = (value: string) => {
    const normalized = normalizePetVisibleProse(value, pet, {
      ...options,
      retainFirstName: !nameEstablished,
    });
    if (containsPetName(normalized, pet.name)) nameEstablished = true;
    return normalized;
  };
  return {
    ...answer,
    summary: normalize(answer.summary),
    sections: answer.sections.map((section) => ({
      heading: normalize(section.heading),
      items: section.items.map(normalize),
    })),
    safetyNote: answer.safetyNote ? normalize(answer.safetyNote) : answer.safetyNote,
  };
}

export function neutralizeMalformedPetReferences<T extends {
  summary: string;
  sections: { heading: string; items: string[] }[];
  safetyNote?: string | null;
}>(answer: T, pet: {
  name: string;
  pronouns?: string | null;
  sex?: string | null;
}): T {
  const name = pet.name.trim() || "your pet";
  const pronoun = petPronounSet(pet.pronouns, pet.sex);
  const repair = (value: string) => neutralizeMalformedNamedReferences(value, name, pronoun, Boolean(pronoun));
  return {
    ...answer,
    summary: repair(answer.summary),
    sections: answer.sections.map((section) => ({
      heading: repair(section.heading),
      items: section.items.map(repair),
    })),
    safetyNote: answer.safetyNote ? repair(answer.safetyNote) : answer.safetyNote,
  };
}

const objectPronounGovernors = "allow|allowed|ask|asked|call|called|feed|fed|feeding|follow|followed|following|give|gave|giving|help|helped|hold|held|holding|leave|left|leaving|let|offer|offered|offering|pet|petted|petting|reward|rewarded|rewarding|take|took|taking|tell|told|telling|touch|touched|touching|watch|watched|watching|with|for|to";
const finitePetVerbs = "act|avoid|bite|choose|continue|drink|eat|feel|follow|initiate|keep|like|need|prefer|seem|show|sit|sleep|start|stay|stop|try|use|want";
const subjectPetVerbs = `${finitePetVerbs}|acts?|avoids?|bites?|chooses?|continues?|drinks?|eats?|feels?|follows?|initiates?|keeps?|likes?|needs?|prefers?|seems?|shows?|sits?|sleeps?|starts?|stays?|stops?|tries?|uses?|wants?|is|are|was|were|has|have|had|does|do|did|may|might|can(?:not|['\u2019]t)?|could|will|would|should`;
const contractionAdjectives = "done|ready|tired|hungry|sore|calm|restless|comfortable|uncomfortable|afraid|anxious|okay|fine|better|worse";

function normalizeKnownPetReferences(
  source: string,
  name: string,
  pronoun: { subject: string; object: string; possessive: string },
  reduceNameOveruse: boolean,
  retainFirstName: boolean,
) {
  const escapedName = escapeRegExp(name);
  const apostrophe = "['\\u2019]";
  const subjectAt = (prose: string, offset: number) => sentenceAwarePronoun(pronoun.subject, prose, offset);
  const objectReference = reduceNameOveruse ? pronoun.object : name;
  let prose = source;

  prose = prose.replace(
    new RegExp(`\\b(${objectPronounGovernors})\\s+${escapedName}${apostrophe}s\\b`, "giu"),
    `$1 ${objectReference}`,
  );
  prose = prose.replace(
    new RegExp(`\\b${escapedName}${apostrophe}(ll|re|ve|d)\\b`, "giu"),
    (_match, contraction: string, offset: number) => {
      if (!reduceNameOveruse) return `${name} ${expandNameContraction(contraction)}`;
      return `${subjectAt(prose, offset)}'${contraction.toLowerCase()}`;
    },
  );
  prose = prose.replace(
    new RegExp(`\\b${escapedName}${apostrophe}s\\s+(?=(?:being|becoming|biting|breathing|doing|drinking|eating|feeling|following|getting|going|having|hiding|limping|looking|scratching|seeming|showing|sleeping|starting|trying|urinating|using|vomiting|walking|${contractionAdjectives})\\b)`, "giu"),
    (_match, offset: number) => reduceNameOveruse ? `${subjectAt(prose, offset)}'s ` : `${name} is `,
  );
  prose = prose.replace(
    new RegExp(`\\b${escapedName}${apostrophe}s\\s+(${subjectPetVerbs})\\b`, "giu"),
    (_match, verb: string, offset: number) => {
      const subject = reduceNameOveruse ? subjectAt(prose, offset) : name;
      return `${subject} ${conjugatePetVerb(verb, pronoun.subject)}`;
    },
  );
  if (reduceNameOveruse) {
    prose = prose.replace(
      new RegExp(`\\b${escapedName}${apostrophe}s\\b`, "giu"),
      (_match, offset: number) => sentenceAwarePronoun(pronoun.possessive, prose, offset),
    );
    prose = reduceRepeatedPlainPetNames(prose, name, pronoun, retainFirstName);
  }
  return prose.replace(
    new RegExp(`\\b(${pronoun.possessive})\\s+([a-z]+ing)\\s+(?:threshold|limit)\\b`, "gi"),
    "$1 tolerance for $2",
  );
}

function neutralizeMalformedNamedReferences(
  value: string,
  name: string,
  pronoun: { subject: string; object: string; possessive: string } | null,
  preferPronouns: boolean,
) {
  const escapedName = escapeRegExp(name);
  const apostrophe = "['\\u2019]";
  return transformProtectedVisibleProse(value, (source) => {
    let prose = source;
    prose = prose.replace(
      new RegExp(`\\b(${objectPronounGovernors})\\s+${escapedName}${apostrophe}s\\b`, "giu"),
      (_match, governor: string) => `${governor} ${preferPronouns && pronoun ? pronoun.object : name}`,
    );
    prose = prose.replace(
      new RegExp(`\\b(keep)\\s+${escapedName}${apostrophe}s(?=\\s+(?:still|quiet|calm|comfortable|safe|warm)\\b)`, "giu"),
      (_match, governor: string) => `${governor} ${preferPronouns && pronoun ? pronoun.object : name}`,
    );
    prose = prose.replace(
      new RegExp(`\\b${escapedName}${apostrophe}(ll|re|ve|d)\\b`, "giu"),
      (_match, contraction: string, offset: number) => {
        if (preferPronouns && pronoun) {
          return `${sentenceAwarePronoun(pronoun.subject, prose, offset)}'${contraction.toLowerCase()}`;
        }
        return `${name} ${expandNameContraction(contraction)}`;
      },
    );
    prose = prose.replace(
      new RegExp(`\\b${escapedName}${apostrophe}s\\s+(?=(?:being|becoming|biting|breathing|doing|drinking|eating|feeling|following|getting|going|having|hiding|limping|looking|scratching|seeming|showing|sleeping|starting|trying|urinating|using|vomiting|walking|${contractionAdjectives})\\b)`, "giu"),
      (_match, offset: number) => preferPronouns && pronoun
        ? `${sentenceAwarePronoun(pronoun.subject, prose, offset)}'s `
        : `${name} is `,
    );
    prose = prose.replace(
      new RegExp(`\\b${escapedName}${apostrophe}s\\s+(${subjectPetVerbs})\\b`, "giu"),
      (_match, verb: string, offset: number) => {
        const subject = preferPronouns && pronoun ? sentenceAwarePronoun(pronoun.subject, prose, offset) : name;
        return `${subject} ${conjugatePetVerb(verb, pronoun?.subject || "it")}`;
      },
    );
    return prose;
  });
}

function reduceRepeatedPlainPetNames(
  source: string,
  name: string,
  pronoun: { subject: string; object: string; possessive: string },
  retainFirstName: boolean,
) {
  const escapedName = escapeRegExp(name);
  const matcher = new RegExp(`(?<![\\p{L}\\p{N}])${escapedName}(?![\\p{L}\\p{N}'\\u2019])`, "giu");
  let retainedName = !retainFirstName;
  return source.replace(matcher, (match, offset: number) => {
    const before = source.slice(Math.max(0, offset - 40), offset);
    const after = source.slice(offset + match.length, offset + match.length + 45);
    if (!retainedName) {
      retainedName = true;
      return match;
    }
    if (new RegExp(`(?:\\b(?:${objectPronounGovernors})\\s+)$`, "i").test(before)) return pronoun.object;
    if (/\b(?:about|around|at|beside|by|for|from|near|to|toward|towards|with)\s+$/i.test(before)) return pronoun.object;
    if (new RegExp(`^\\s+(?:\\w+ly\\s+)?(?:${subjectPetVerbs})\\b`, "i").test(after)) {
      return sentenceAwarePronoun(pronoun.subject, source, offset);
    }
    return match;
  });
}

function containsPetName(value: string, name: string) {
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(name)}(?![\\p{L}\\p{N}])`, "iu").test(value);
}

function expandNameContraction(contraction: string) {
  return ({ ll: "will", re: "are", ve: "have", d: "would" } as const)[contraction.toLowerCase() as "ll" | "re" | "ve" | "d"];
}

function conjugatePetVerb(verb: string, subject: string) {
  const normalized = verb.toLowerCase();
  if (/^(?:may|might|can(?:not|['’]t)?|could|will|would|should|had|did)$/i.test(normalized)) return verb;
  if (subject === "they") {
    if (normalized === "is") return "are";
    if (normalized === "was") return "were";
    if (normalized === "has") return "have";
    if (normalized === "does") return "do";
    return verb;
  }
  if (/s$/i.test(normalized)) return verb;
  if (normalized === "are") return "is";
  if (normalized === "were") return "was";
  if (normalized === "have") return "has";
  if (normalized === "do") return "does";
  if (normalized === "go") return "goes";
  if (/[^aeiou]y$/i.test(normalized)) return `${verb.slice(0, -1)}ies`;
  if (/(?:s|x|z|ch|sh|o)$/i.test(normalized)) return `${verb}es`;
  return `${verb}s`;
}

function petPronounSet(pronouns?: string | null, sex?: string | null) {
  const explicitPronouns = pronouns?.trim().toLowerCase() || "";
  const explicitSex = sex?.trim().toLowerCase() || "";
  if (/\bshe\s*\/\s*her\b/.test(explicitPronouns) || /^(female|f)$/.test(explicitSex)) {
    return { subject: "she", object: "her", possessive: "her" };
  }
  if (/\bhe\s*\/\s*him\b/.test(explicitPronouns) || /^(male|m)$/.test(explicitSex)) {
    return { subject: "he", object: "him", possessive: "his" };
  }
  if (/\bthey\s*\/\s*them\b/.test(explicitPronouns)) {
    return { subject: "they", object: "them", possessive: "their" };
  }
  return null;
}

function possessiveName(name: string) {
  return `${name.replace(/['\u2019]s$/i, "")}\u2019s`;
}

function sentenceAwarePronoun(value: string, prose: string, offset: number) {
  const before = prose.slice(0, offset).trimEnd();
  return !before || /[.!?]$/.test(before) ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function transformProtectedVisibleProse(value: string, transform: (source: string) => string) {
  const protectedValues: string[] = [];
  const masked = String(value || "").replace(/https?:\/\/[^\s)]+|`[^`]*`|\[[^\]]*\]\([^)]*\)/g, (match) => {
    const index = protectedValues.push(match) - 1;
    return `\uE000${index}\uE001`;
  });
  return transform(masked).replace(/\uE000(\d+)\uE001/g, (_match, index: string) => protectedValues[Number(index)] || "");
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
