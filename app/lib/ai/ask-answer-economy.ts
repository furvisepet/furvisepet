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
  if (economy.depth === 4) return { ...answer, sections: dedupeSections(answer.sections, economy.maxSections, economy.maxBullets) };

  let summary = stripFormulaicLead(clean(answer.summary));
  if (economy.followUpDeltaOnly && context.previousAssistantText) {
    summary = removeRepeatedSentences(summary, context.previousAssistantText) || summary;
  }
  const normalizedSections = economy.maxSections === 0
    ? dedupeSections(answer.sections, answer.sections.length, economy.depth === 0 ? 1 : 2)
    : dedupeSections(answer.sections, economy.maxSections, economy.maxBullets);
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

export function measureAskAnswerEconomy(answer: AskEconomyAnswer) {
  const rendered = [
    answer.summary,
    ...answer.sections.flatMap((section) => [section.heading, ...section.items]),
    answer.safetyNote || "",
  ].filter(Boolean).join(" ");
  return {
    words: countWords(rendered),
    headings: answer.sections.length,
    bullets: answer.sections.reduce((sum, section) => sum + section.items.length, 0),
    repeatedSemanticContent: countSemanticRepetitions(answer),
  };
}

export function countWords(value: string) {
  return clean(value).split(/\s+/).filter(Boolean).length;
}

function plan(depth: AskAnswerDepth, followUpDeltaOnly: boolean): AskAnswerEconomyPlan {
  const values: Record<AskAnswerDepth, Omit<AskAnswerEconomyPlan, "depth" | "followUpDeltaOnly">> = {
    0: { label: "ack_social", targetWords: { min: 3, max: 45 }, maxSections: 0, maxBullets: 0, maxFollowUps: 0, allowsAutomaticHistory: false },
    1: { label: "simple", targetWords: { min: 40, max: 120 }, maxSections: 0, maxBullets: 0, maxFollowUps: 1, allowsAutomaticHistory: false },
    2: { label: "practical", targetWords: { min: 100, max: 250 }, maxSections: 2, maxBullets: 4, maxFollowUps: 2, allowsAutomaticHistory: true },
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

function dedupeSections(sections: AskEconomyAnswer["sections"], maxSections: number, maxBullets: number) {
  const normalized: AskEconomyAnswer["sections"] = [];
  const seenItems: string[] = [];
  for (const section of sections) {
    const heading = clean(section.heading);
    if (!heading || normalized.some((candidate) => materiallyOverlaps(candidate.heading, heading))) continue;
    const items: string[] = [];
    for (const rawItem of section.items) {
      const item = clean(rawItem);
      if (!item || seenItems.some((candidate) => materiallyOverlaps(candidate, item))) continue;
      items.push(item);
      seenItems.push(item);
    }
    if (items.length) normalized.push({ heading, items });
  }
  if (normalized.length <= maxSections && normalized.reduce((sum, section) => sum + section.items.length, 0) <= maxBullets) {
    return normalized;
  }

  const accepted = normalized.slice(0, Math.max(1, maxSections)).map((section) => ({ ...section, items: [...section.items] }));
  for (const overflow of normalized.slice(accepted.length)) {
    accepted[accepted.length - 1].items.push(`${overflow.heading}: ${overflow.items.map(asSentence).join(" ")}`);
  }
  const itemSlots = accepted.flatMap((section, sectionIndex) => section.items.map((item) => ({ item, sectionIndex })));
  if (itemSlots.length <= maxBullets) return accepted;

  const primary = accepted.map((section, sectionIndex) => ({ item: section.items[0], sectionIndex }));
  const remainder = accepted.flatMap((section, sectionIndex) => section.items.slice(1).map((item) => ({ item, sectionIndex })));
  const openSlots = Math.max(0, maxBullets - primary.length);
  const keptRemainder = remainder.slice(0, Math.max(0, openSlots - 1));
  const overflow = remainder.slice(keptRemainder.length).map(({ item }) => asSentence(item)).join(" ");
  for (const section of accepted) section.items = [];
  for (const slot of [...primary, ...keptRemainder]) accepted[slot.sectionIndex].items.push(slot.item);
  if (overflow) accepted[accepted.length - 1].items.push(overflow);
  return accepted.filter((section) => section.items.length);
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
  const leftTokens = significantTokens(left);
  const rightTokens = significantTokens(right);
  if (!leftTokens.size || !rightTokens.size) return false;
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return intersection / Math.min(leftTokens.size, rightTokens.size) >= 0.72;
}

function significantTokens(value: string) {
  const stop = new Set(["about", "again", "also", "because", "from", "have", "here", "into", "just", "mani", "more", "should", "that", "their", "them", "then", "there", "they", "this", "what", "when", "with", "your"]);
  return new Set((clean(value).toLowerCase().match(/[a-z0-9]{3,}/g) || []).filter((token) => !stop.has(token)));
}

function stripFormulaicLead(value: string) {
  return value.replace(/^(?:here['’]?s what (?:to do|i['’]?d do|to watch for)|the key thing is|it['’]?s worth keeping an eye on)\s*[:,-]?\s*/i, "");
}

function asSentence(value: string) {
  const sentence = clean(value).replace(/[.!?]+$/, "");
  return sentence ? `${sentence}.` : "";
}

function removeRepeatedSentences(value: string, previous: string) {
  return (value.match(/[^.!?]+[.!?]?/g) || [value])
    .map(clean)
    .filter((sentence) => sentence && !materiallyOverlaps(sentence, previous))
    .join(" ");
}

function clean(value: string) {
  return String(value || "").normalize("NFKC").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
}
