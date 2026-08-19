export type AskAnswerDepth = 0 | 1 | 2 | 3 | 4;

export type AskAnswerEconomyPlan = {
  depth: AskAnswerDepth;
  label: "ack_social" | "simple" | "practical" | "complex" | "safety_urgent";
  targetWords: { min: number; max: number };
  maxSections: number;
  maxBullets: number;
  maxFollowUps: number;
  followUpDeltaOnly: boolean;
  allowsAutomaticHistory: boolean;
};

export type AskEconomyAnswer = {
  summary: string;
  sections: { heading: string; items: string[] }[];
  safetyNote?: string | null;
};

const acknowledgementPattern = /^(?:thanks?|thank you|okay|ok|got it|sounds good|that makes sense|understood|lol|lmao|haha|hehe|yep|yeah|nope)\b(?:[\s,!.-]+(?:thanks?|thank you|okay|ok|got it|fair|makes sense|understood))*[.!\s]*$/i;
const socialOrRoleplayPattern = /\b(?:talk (?:to me )?(?:like|as)|be (?:her|him|them) for|pretend (?:to be|you['’]?re)|just chat|how are you|good (?:morning|afternoon|evening))\b/i;
const simpleExplanationPattern = /^(?:why|is(?: it normal)?|does|do|can|could|should|what does|how come)\b/i;
const vetPreparationPattern = /\b(?:vet brief|prepare for (?:the )?vet|appointment notes?|questions?[^.?!]{0,60}(?:vet|clinic)|summari[sz]e[^.?!]{0,80}(?:vet|clinic))\b/i;
const behaviorSignalPattern = /\b(?:aggress|anxious|anxiety|bite|biting|cling|hide|hiding|hiss|meow|pace|pacing|play|scratch|sleep|stare|vocal)\w*\b/i;
const actionDomains = [
  /\b(?:medication|medicine|dose|treatment|therapy|supplement|vaccine|surgery)\b/i,
  /\b(?:appetite|eat|eating|food|diet|drink|drinking|weight)\b/i,
  /\b(?:urine|urinating|litter|stool|diarrhea|vomit|vomiting)\b/i,
  /\b(?:breath|breathing|collapse|seizure|unconscious|gums?)\b/i,
  /\b(?:pain|limp|limping|injur|wound|bleed|swelling)\w*\b/i,
  /\b(?:cough|sneez|itch|rash|skin|coat)\w*\b/i,
  /\b(?:routine|schedule|feeding|exercise|environment)\b/i,
];

export function planAskAnswerDepth(input: {
  message: string;
  minimumSafetyLevel?: "normal" | "monitor" | "urgent";
  responseMode?: string | null;
  intent?: string | null;
  recentConversation?: Array<{ role: "user" | "furvise"; text: string }>;
}): AskAnswerEconomyPlan {
  const message = clean(input.message);
  const urgent = input.minimumSafetyLevel === "urgent" || input.responseMode === "urgent_safety";
  if (urgent) return plan(4, isFollowUpDelta(message, input.recentConversation || []));
  if (input.responseMode === "grief_support") return plan(1, isFollowUpDelta(message, input.recentConversation || []));
  if (input.responseMode === "clarification") return plan(0, isFollowUpDelta(message, input.recentConversation || []));

  const social = acknowledgementPattern.test(message)
    || input.intent === "casual"
    || socialOrRoleplayPattern.test(message);
  if (social) return plan(0, isFollowUpDelta(message, input.recentConversation || []));

  if (input.intent === "vet_preparation" || vetPreparationPattern.test(message)) {
    return plan(3, isFollowUpDelta(message, input.recentConversation || []));
  }

  const domainCount = actionDomains.filter((pattern) => pattern.test(message)).length;
  const behaviorOnly = behaviorSignalPattern.test(message) && domainCount === 0;
  const needsComplexReasoning = domainCount >= 2
    || (domainCount >= 1 && /\b(?:multiple|several|complicated|interact|contraindicat|long[- ]term|over the past (?:month|year))\b/i.test(message));
  if (needsComplexReasoning) return plan(3, isFollowUpDelta(message, input.recentConversation || []));

  const safeFoodQuestion = /\b(?:food|eat|taste|treat|pumpkin|egg|chicken|cucumber|wet food)\b/i.test(message)
    && !/\b(?:allerg|diarrhea|poison|toxic|vomit|won't eat|not eating)\b/i.test(message);
  const simpleQuestion = simpleExplanationPattern.test(message)
    && (domainCount === 0 || (domainCount === 1 && safeFoodQuestion))
    && !/\b(?:new|started|changed|worse|worsening|again|hard|won't|cannot|can't)\b/i.test(message);
  if (simpleQuestion && (!behaviorOnly || message.split(/\s+/).length <= 24)) {
    return plan(1, isFollowUpDelta(message, input.recentConversation || []));
  }
  return plan(2, isFollowUpDelta(message, input.recentConversation || []));
}

export function applyAskAnswerEconomy<T extends AskEconomyAnswer>(answer: T, economy: AskAnswerEconomyPlan, context: { previousAssistantText?: string } = {}): T {
  if (economy.depth === 4) {
    return {
      ...answer,
      summary: canonicalizeAnswerProse(answer.summary),
      sections: normalizeSectionsWithoutSemanticRemoval(answer.sections, economy.maxSections, economy.maxBullets),
    };
  }

  let summary = stripFormulaicLead(canonicalizeAnswerProse(answer.summary));
  if (economy.followUpDeltaOnly && context.previousAssistantText) {
    summary = removeRepeatedSentences(summary, context.previousAssistantText) || summary;
  }
  const sectionLimit = economy.depth === 2 ? Math.min(1, economy.maxSections) : economy.maxSections;
  const normalizedSections = economy.maxSections === 0
    ? dedupeSections(answer.sections, summary, answer.sections.length, economy.depth === 0 ? 1 : 2)
    : dedupeSections(answer.sections, summary, sectionLimit, economy.maxBullets);
  if (economy.maxSections === 0 && normalizedSections.length) {
    const usefulItems = normalizedSections.flatMap((section) => section.items)
      .filter((item) => !materiallyOverlaps(item, summary))
      .slice(0, economy.depth === 0 ? 1 : 2);
    if (usefulItems.length) summary = [summary, ...usefulItems.map(asSentence)].filter(Boolean).join(" ");
  }
  return {
    ...answer,
    summary,
    sections: economy.maxSections === 0 ? [] : normalizedSections,
  };
}

export function normalizeAskListIntegrity<T extends AskEconomyAnswer>(answer: T): T {
  return {
    ...answer,
    sections: answer.sections.map((section) => ({
      ...section,
      items: section.items.flatMap((item) => splitCompositeBullet(canonicalizeAnswerProse(item))).filter(Boolean),
    })).filter((section) => section.heading && section.items.length > 0),
  };
}

export function measureAskAnswerEconomy(answer: AskEconomyAnswer, options: { petName?: string } = {}) {
  const rendered = [
    answer.summary,
    ...answer.sections.flatMap((section) => [section.heading, ...section.items]),
    answer.safetyNote || "",
  ].filter(Boolean).join(" ");
  const petNameUseCount = options.petName ? countPetNameUses(rendered, options.petName) : 0;
  const sentenceCount = countSentences(rendered);
  const petNameDensity = sentenceCount ? petNameUseCount / sentenceCount : 0;
  return {
    words: countWords(rendered),
    headings: answer.sections.length,
    bullets: answer.sections.reduce((sum, section) => sum + section.items.length, 0),
    repeatedSemanticContent: countSemanticRepetitions(answer),
    directSectionSemanticOverlap: directSectionOverlap(answer),
    repeatedRecommendationRate: countSemanticRepetitions(answer) > 0 ? 1 : 0,
    pseudoListCount: [answer.summary, ...answer.sections.flatMap((section) => section.items)]
      .filter(hasEmbeddedListMarkers).length,
    sectionNoveltyRate: sectionNoveltyRate(answer),
    malformedPersonalizationCount: options.petName ? countMalformedPetPersonalization(rendered, options.petName) : 0,
    petNameContractionCount: options.petName ? countPetNameContractions(rendered, options.petName) : 0,
    petNameUseCount,
    petNameDensity,
    petNameOveruseFlag: petNameUseCount >= 5 && petNameDensity > 0.8,
    bulletIntegrityViolationCount: countBulletIntegrityViolations(answer),
  };
}

export function semanticAnswerOverlap(left: string, right: string) {
  return semanticOverlapScore(left, right);
}

export function hasEmbeddedListMarkers(value: string) {
  return listMarkerMatches(String(value || "")).length >= 2;
}

export function canonicalizeAnswerProse(value: string) {
  const raw = String(value || "").normalize("NFKC");
  const markers = listMarkerMatches(raw);
  if (markers.length < 2) return clean(raw).replace(/^\s*(?:[-+•]|\d+[.)])\s+/, "");

  const prefix = clean(raw.slice(0, markers[0].index)).replace(/[.:;,-]+$/, "");
  const items = markers.map((marker, index) => clean(raw
    .slice(marker.index + marker.text.length, markers[index + 1]?.index ?? raw.length))
    .replace(/[.;]+$/, ""))
    .filter(Boolean);
  if (items.length < 2) return clean(raw);

  const lead = prefix || "Useful next steps";
  return `${lead}: ${joinProseItems(items)}.`;
}

export function countWords(value: string) {
  return clean(value).split(/\s+/).filter(Boolean).length;
}

function plan(depth: AskAnswerDepth, followUpDeltaOnly: boolean): AskAnswerEconomyPlan {
  const values: Record<AskAnswerDepth, Omit<AskAnswerEconomyPlan, "depth" | "followUpDeltaOnly">> = {
    0: { label: "ack_social", targetWords: { min: 3, max: 45 }, maxSections: 0, maxBullets: 0, maxFollowUps: 0, allowsAutomaticHistory: false },
    1: { label: "simple", targetWords: { min: 40, max: 120 }, maxSections: 0, maxBullets: 0, maxFollowUps: 1, allowsAutomaticHistory: false },
    2: { label: "practical", targetWords: { min: 100, max: 250 }, maxSections: 1, maxBullets: 4, maxFollowUps: 2, allowsAutomaticHistory: true },
    3: { label: "complex", targetWords: { min: 200, max: 450 }, maxSections: 4, maxBullets: 8, maxFollowUps: 3, allowsAutomaticHistory: true },
    4: { label: "safety_urgent", targetWords: { min: 0, max: Number.POSITIVE_INFINITY }, maxSections: 6, maxBullets: 12, maxFollowUps: 0, allowsAutomaticHistory: false },
  };
  return { depth, followUpDeltaOnly, ...values[depth] };
}

function isFollowUpDelta(message: string, recentConversation: Array<{ role: "user" | "furvise"; text: string }>) {
  if (!recentConversation.some((turn) => turn.role === "furvise")) return false;
  const words = message.split(/\s+/).filter(Boolean);
  if (words.length > 28) return false;
  return /^(?:and|but|also|actually|only|mostly|now|still|then|tonight|today|yesterday|she|he|they|it|that|what about)\b/i.test(message)
    || /\b(?:only|still|instead|at night|in the morning|after that|since then)\b/i.test(message);
}

function dedupeSections(sections: AskEconomyAnswer["sections"], summary: string, maxSections: number, maxBullets: number) {
  const normalized: AskEconomyAnswer["sections"] = [];
  const seenItems: string[] = [];
  for (const section of sections) {
    const heading = clean(section.heading);
    if (!heading || normalized.some((candidate) => materiallyOverlaps(candidate.heading, heading))) continue;
    const items: string[] = [];
    for (const rawItem of section.items) {
      for (const candidate of splitCompositeBullet(canonicalizeAnswerProse(rawItem))) {
        const item = removeRepeatedSentences(candidate, [summary, ...seenItems].join(" "));
        if (!item || materiallyOverlaps(item, summary) || seenItems.some((seen) => materiallyOverlaps(seen, item))) continue;
        items.push(item);
        seenItems.push(item);
      }
    }
    if (items.length) normalized.push({ heading, items });
  }
  if (normalized.length <= maxSections && normalized.reduce((sum, section) => sum + section.items.length, 0) <= maxBullets) {
    return normalized;
  }

  const accepted = normalized.slice(0, Math.max(1, maxSections)).map((section) => ({ ...section, items: [...section.items] }));
  return selectCoherentBullets(accepted, maxBullets);
}

function normalizeSectionsWithoutSemanticRemoval(sections: AskEconomyAnswer["sections"], maxSections: number, maxBullets: number) {
  const normalized = sections.slice(0, maxSections).flatMap((section) => {
    const heading = clean(section.heading);
    const items = section.items.flatMap((item) => splitCompositeBullet(canonicalizeAnswerProse(item))).filter(Boolean);
    return heading && items.length ? [{ heading, items }] : [];
  });
  return selectCoherentBullets(normalized, maxBullets);
}

function splitCompositeBullet(value: string) {
  const sentences = splitSentences(value);
  if (sentences.length < 2) return value ? [value] : [];
  const purposes = sentences.map(bulletPurposes);
  const distinctPurposes = new Set(purposes.flat());
  if (distinctPurposes.size < 2) return [value];
  return sentences;
}

function selectCoherentBullets(sections: AskEconomyAnswer["sections"], maxBullets: number) {
  const slots = sections.flatMap((section, sectionIndex) => section.items.map((item, itemIndex) => ({
    heading: section.heading,
    item,
    itemIndex,
    sectionIndex,
  })));
  if (slots.length <= maxBullets) return sections;

  const selected = new Set<string>();
  const guaranteedPerSection = sections.length * 2 <= maxBullets ? 2 : 1;
  for (const slot of slots.filter((candidate) => candidate.itemIndex < guaranteedPerSection)) {
    if (selected.size >= maxBullets) break;
    selected.add(`${slot.sectionIndex}:${slot.itemIndex}`);
  }
  const remainder = slots
    .filter((slot) => !selected.has(`${slot.sectionIndex}:${slot.itemIndex}`))
    .sort((left, right) => bulletPriority(right) - bulletPriority(left)
      || left.sectionIndex - right.sectionIndex
      || left.itemIndex - right.itemIndex);
  for (const slot of remainder) {
    if (selected.size >= maxBullets) break;
    selected.add(`${slot.sectionIndex}:${slot.itemIndex}`);
  }
  return sections.flatMap((section, sectionIndex) => {
    const items = section.items.filter((_item, itemIndex) => selected.has(`${sectionIndex}:${itemIndex}`));
    return items.length ? [{ ...section, items }] : [];
  });
}

function bulletPriority(slot: { heading: string; item: string; itemIndex: number }) {
  const value = `${slot.heading} ${slot.item}`;
  let score = slot.itemIndex === 0 ? 2 : 0;
  if (/\b(?:call|clinic|emergency|urgent|vet|veterinarian|same-day|sooner)\b/i.test(value)) score += 5;
  if (/\b(?:can(?:not|['\u2019]t) keep|collapse|difficulty breathing|not peeing)\b/i.test(value)) score += 6;
  else if (/\b(?:seems? (?:painful|weak)|stops? eating|won['\u2019]t eat)\b/i.test(value)) score += 4;
  if (/\b(?:avoid|do not|don't|never)\b/i.test(value)) score += 2;
  if (/\b(?:track|note|record|write down|watch|monitor)\b/i.test(value)) score += 1;
  return score;
}

function bulletPurposes(value: string) {
  const purposes = new Set<"ACTION" | "MONITOR" | "ESCALATE" | "AVOID" | "TRACK">();
  if (/\b(?:call|contact|clinic|emergency|urgent|vet|veterinarian|go sooner|same-day|stops? eating|can(?:not|['\u2019]t) keep|seems? (?:painful|weak))\b/i.test(value)) purposes.add("ESCALATE");
  if (/\b(?:avoid|do not|don't|never)\b/i.test(value)) purposes.add("AVOID");
  if (/\b(?:track|note|record|write down|save a photo|how much|how often|what time)\b/i.test(value)) purposes.add("TRACK");
  if (/\b(?:watch|monitor|check|look for|keep an eye)\b/i.test(value)) purposes.add("MONITOR");
  if (/\b(?:give|keep|offer|pause|reward|set up|stop|try|use)\b/i.test(value)) purposes.add("ACTION");
  return purposes;
}

function splitSentences(value: string) {
  return (String(value || "").match(/[^.!?]+(?:[.!?]+|$)/g) || [])
    .map(clean)
    .filter(Boolean);
}

function countSemanticRepetitions(answer: AskEconomyAnswer) {
  const parts = [answer.summary, ...answer.sections.flatMap((section) => section.items)].filter(Boolean);
  let repeats = 0;
  for (let index = 0; index < parts.length; index += 1) {
    if (parts.slice(0, index).some((candidate) => materiallyOverlaps(candidate, parts[index]))) repeats += 1;
  }
  return repeats;
}

function materiallyOverlaps(left: string, right: string) {
  return semanticOverlapScore(left, right) >= 0.68;
}

function semanticOverlapScore(left: string, right: string) {
  const leftTokens = significantTokens(left);
  const rightTokens = significantTokens(right);
  if (!leftTokens.size || !rightTokens.size) return 0;
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const lexical = intersection / Math.min(leftTokens.size, rightTokens.size);
  const leftConcepts = semanticConcepts(left);
  const rightConcepts = semanticConcepts(right);
  const sharedConcepts = [...leftConcepts].filter((concept) => rightConcepts.has(concept));
  const conceptScore = sharedConcepts.length / Math.max(1, Math.min(leftConcepts.size, rightConcepts.size));
  const distinctiveMatch = sharedConcepts.includes("action:short_contact") || sharedConcepts.length >= 2;
  return Math.max(lexical, distinctiveMatch ? Math.max(conceptScore, 0.72) : 0);
}

function significantTokens(value: string) {
  const stop = new Set(["about", "again", "also", "because", "from", "have", "here", "into", "just", "mani", "more", "should", "that", "their", "them", "then", "there", "they", "this", "what", "when", "with", "your"]);
  return new Set((clean(value).toLowerCase().match(/[a-z0-9]{3,}/g) || [])
    .map(canonicalToken)
    .filter((token) => !stop.has(token)));
}

function semanticConcepts(value: string) {
  const normalized = ` ${clean(value).toLowerCase().replace(/[’']/g, "'")} `;
  const concepts = new Set<string>();
  if (/\b(?:give (?:her|him|them|\w+) space|back off|step away|stop|end|pause)\b/.test(normalized)) concepts.add("action:back_off");
  if (/\b(?:overstimulat\w*|wound up|reaches? (?:her|his|their|the) limit|bite point|warning sign)\b/.test(normalized)) concepts.add("state:contact_limit");
  if (/\b(?:keep|make) (?:petting |contact |interaction )?(?:sessions? )?(?:brief|short(?:er)?)|\b(?:brief|short(?:er)?) (?:petting|contact|interaction|sessions?|touch(?:es)?)\b|\bbefore (?:she|he|they|\w+) reaches? (?:her|his|their|the) limit\b/.test(normalized)) {
    concepts.add("action:short_contact");
    concepts.add("state:contact_limit");
  }
  if (/\b(?:watch|look|notice|spot|check)\b/.test(normalized) && /\b(?:sign|signal|flick|twitch|ear|pupil|freeze|tense)\w*\b/.test(normalized)) concepts.add("action:observe_signal");
  if (/\b(?:tail\w*\s+flick\w*|flick\w*\s+tail\w*)\b/.test(normalized)) concepts.add("signal:tail_flick");
  if (/\b(?:skin\s+(?:twitch|rippl)\w*|(?:twitch|rippl)\w*\s+skin)\b/.test(normalized)) concepts.add("signal:skin_twitch");
  if (/\b(?:punish|scold|yell|hold (?:her|him|them) (?:down|in place))\b/.test(normalized)) concepts.add("avoid:punishment");
  if (/\b(?:vet|veterinarian|clinic|urgent care)\b/.test(normalized)) concepts.add("safety:vet");
  if (/\b(?:pain|sore|tender|sensitive when touched)\b/.test(normalized)) concepts.add("safety:pain");
  return concepts;
}

function canonicalToken(token: string) {
  const aliases: Record<string, string> = {
    ended: "stop", ending: "stop", ends: "stop", pause: "stop", paused: "stop", stopping: "stop",
    interactions: "contact", petting: "contact", sessions: "contact", touches: "contact",
    brief: "short", briefly: "short",
    flicked: "flick", flicking: "flick", flicks: "flick",
    looking: "watch", looks: "watch", notice: "watch", noticed: "watch", noticing: "watch",
    overstimulated: "limit", overstimulation: "limit", threshold: "limit",
    signs: "signal", signals: "signal", warnings: "signal",
  };
  return aliases[token] || token.replace(/(?:ing|ed|es|s)$/i, "");
}

function stripFormulaicLead(value: string) {
  return value.replace(/^(?:here['’]?s what (?:to do|i['’]?d do|to watch for)|the key thing is|it['’]?s worth keeping an eye on)\s*[:,-]?\s*/i, "");
}

function asSentence(value: string) {
  const sentence = canonicalizeAnswerProse(value).replace(/[.!?]+$/, "");
  return sentence ? `${sentence}.` : "";
}

function removeRepeatedSentences(value: string, previous: string) {
  return (value.match(/[^.!?]+[.!?]?/g) || [value])
    .map(clean)
    .filter((sentence) => sentence && !materiallyOverlaps(sentence, previous))
    .join(" ");
}

function directSectionOverlap(answer: AskEconomyAnswer) {
  const items = answer.sections.flatMap((section) => section.items);
  return items.length ? Math.max(...items.map((item) => semanticOverlapScore(answer.summary, item))) : 0;
}

function sectionNoveltyRate(answer: AskEconomyAnswer) {
  const items = answer.sections.flatMap((section) => section.items);
  if (!items.length) return 1;
  return items.filter((item) => semanticOverlapScore(answer.summary, item) < 0.68).length / items.length;
}

function listMarkerMatches(value: string) {
  const strong = [...value.matchAll(/(?:^|\s)(?:•|\d+[.)])\s+/g)]
    .map((match) => markerFromMatch(match));
  const lineBullets = [...value.matchAll(/(?:^|\n)\s*[-+]\s+/g)]
    .map((match) => markerFromMatch(match));
  const inlineStart = /:\s*[-+]\s+/.exec(value);
  const inlineBullets = inlineStart
    ? [...value.slice((inlineStart.index || 0) + 1).matchAll(/(?:^|\s)[-+]\s+/g)]
      .map((match) => {
        const marker = markerFromMatch(match);
        return { ...marker, index: marker.index + (inlineStart.index || 0) + 1 };
      })
    : [];
  return [...strong, ...lineBullets, ...inlineBullets]
    .sort((left, right) => left.index - right.index)
    .filter((marker, index, all) => index === 0 || marker.index !== all[index - 1].index);
}

function markerFromMatch(match: RegExpMatchArray) {
  const leadingLength = /^\s/.test(match[0]) ? match[0].search(/[-+•\d]/) : 0;
  return { index: (match.index || 0) + leadingLength, text: match[0].slice(leadingLength) };
}

function joinProseItems(items: string[]) {
  const normalized = items.map((item) => lowerListItemStart(item));
  if (normalized.length === 2) return `${normalized[0]} and ${normalized[1]}`;
  return `${normalized.slice(0, -1).join("; ")}; and ${normalized.at(-1)}`;
}

function lowerListItemStart(value: string) {
  if (/^(?:[A-Z]{2,}|[A-Z][a-z]+['’]s\b)/.test(value)) return value;
  return value.charAt(0).toLowerCase() + value.slice(1);
}

function countMalformedPetPersonalization(value: string, petName: string) {
  const name = escapeRegExp(petName);
  const apostrophe = "['\\u2019]";
  const malformedSubject = new RegExp(`(?<![\\p{L}\\p{N}])${name}${apostrophe}s\\s+(?:(?:act|avoid|bite|choose|continue|drink|eat|feel|follow|initiate|keep|like|need|prefer|seem|show|sit|sleep|start|stay|stop|try|use|want)s?|is|are|was|were|has|have|does|do|may|might|can(?:not|${apostrophe}t)?|could|will|would|should)\\b`, "giu");
  const malformedObject = new RegExp(`\\b(?:allow|ask|call|feed|feeding|follow|give|giving|help|hold|holding|leave|let|offer|pet|petting|reward|take|tell|touch|watch)\\s+${name}${apostrophe}s\\b|\\bkeep\\s+${name}${apostrophe}s(?=\\s+(?:still|quiet|calm|comfortable|safe|warm)\\b)`, "giu");
  return [
    ...value.matchAll(malformedSubject),
    ...value.matchAll(malformedObject),
    ...value.matchAll(new RegExp(`(?<![\\p{L}\\p{N}])${name}${apostrophe}(?:ll|re|ve|d)\\b`, "giu")),
  ].length;
}

function countPetNameUses(value: string, petName: string) {
  return [...value.matchAll(new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(petName)}(?:['\\u2019](?:s|ll|re|ve|d))?(?![\\p{L}\\p{N}])`, "giu"))].length;
}

function countPetNameContractions(value: string, petName: string) {
  return [...value.matchAll(new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(petName)}['\\u2019](?:ll|re|ve|d)(?![\\p{L}\\p{N}])`, "giu"))].length;
}

function countSentences(value: string) {
  return Math.max(1, splitSentences(value).length);
}

function countBulletIntegrityViolations(answer: AskEconomyAnswer) {
  return answer.sections.reduce((sum, section) => sum + section.items.filter((item) => {
    const sentences = splitSentences(item);
    if (sentences.length < 2) return false;
    return new Set(sentences.flatMap((sentence) => [...bulletPurposes(sentence)])).size >= 2;
  }).length, 0);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function clean(value: string) {
  return String(value || "").normalize("NFKC").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
}
