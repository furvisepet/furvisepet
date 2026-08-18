import {
  FURVISE_URGENT_SAFETY_MESSAGE,
  buildFurviseSafetyLine,
} from "./furvise-voice.ts";

const URGENT_CONTEXT_PATTERN =
  /\b(trouble breathing|can't breathe|cannot breathe|difficulty breathing|collapse|collapsed|unconscious|seizure|severe bleeding|blood in vomit|bloated abdomen|bloat|suspected toxin|poison|poisoning|ate chocolate|ate grapes|ate raisins|cannot urinate|can't urinate|unable to urinate|repeated vomiting|vomiting repeatedly|rapidly worsening|unable to keep water down|extreme lethargy|severe pain)\b/i;

const PRODUCT_CONTEXT_PATTERN =
  /\b(product|food|brand|recommend|worked|tried|expensive)\b/i;

export const askResponseJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "summary", "sections", "safetyNote"],
  properties: {
    title: { type: "string", maxLength: 120 },
    summary: { type: "string", maxLength: 800 },
    sections: {
      type: "array",
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["heading", "items"],
        properties: {
          heading: { type: "string", maxLength: 100 },
          items: {
            type: "array",
            maxItems: 8,
            items: { type: "string", maxLength: 500 },
          },
        },
      },
    },
    safetyNote: {
      anyOf: [{ type: "string", maxLength: 500 }, { type: "null" }],
    },
  },
};

export const ASK_ANSWER_TYPES = [
  "direct_answer",
  "care_plan",
  "tracking_plan",
  "vet_prep",
  "history_summary",
  "product_guidance",
  "clarification",
  "urgent_guidance",
];

const ASK_ACTIONS_BY_TYPE = {
  direct_answer: ["save_key_detail", "copy"],
  care_plan: ["add_to_care_history", "copy"],
  tracking_plan: ["start_tracking", "add_to_care_history"],
  vet_prep: ["prepare_vet_note", "copy"],
  history_summary: ["add_to_care_history", "copy"],
  product_guidance: ["save_key_detail", "copy"],
  clarification: ["copy"],
  urgent_guidance: ["copy"],
};

const ASK_MEMORY_CANDIDATE_TYPES = new Set([
  "preference", "food_response", "product_response", "recurring_pattern", "routine", "care_goal",
  "veterinarian_instruction", "medication_or_supplement", "unresolved_concern", "important_date",
]);

/**
 * Adds provider-neutral presentation metadata to an already validated Ask answer.
 * Safety and save eligibility remain deterministic outside this function.
 */
export function buildAskConversationResponse(response, options = {}) {
  const parsed = parseAskResponse(response);
  if (!parsed) return null;
  const answerType = resolveConversationAnswerType(options.intent, Boolean(options.urgent), parsed);
  const usedContextSummary = cleanStringList(options.usedContextSummary, 4);
  const missingUsefulDetails = cleanStringList(options.missingUsefulDetails, 4);
  const suggestedQuestions = cleanSuggestedQuestions(options.suggestedQuestions);
  const saveSuggestions = cleanSaveSuggestions(options.saveSuggestions);
  const trackingPlan = cleanTrackingPlan(options.trackingPlan);
  const clarificationQuestion = cleanOptionalText(options.clarificationQuestion, 240);
  return {
    ...parsed,
    answerType,
    directAnswer: parsed.summary,
    actions: [...ASK_ACTIONS_BY_TYPE[answerType]],
    urgency: options.urgent ? "urgent" : options.recentlyResolved ? "resolved" : options.monitoring ? "monitor" : "routine",
    ...(suggestedQuestions.length ? { suggestedQuestions } : {}),
    ...(usedContextSummary.length ? { usedContextSummary } : {}),
    ...(missingUsefulDetails.length ? { missingUsefulDetails } : {}),
    ...(clarificationQuestion ? { clarificationQuestion } : {}),
    ...(saveSuggestions.length ? { saveSuggestions } : {}),
    ...(trackingPlan ? { trackingPlan } : {}),
    ...(typeof options.vetBriefRelevant === "boolean" ? { vetBriefRelevant: options.vetBriefRelevant } : {}),
  };
}

export function parseAskConversationResponse(value) {
  const response = parseAskResponse(value);
  if (!response || !value || typeof value !== "object") return null;
  const draft = value;
  if (!ASK_ANSWER_TYPES.includes(draft.answerType)) return null;
  if (typeof draft.directAnswer !== "string" || cleanText(draft.directAnswer) !== response.summary) return null;
  if (draft.supportingText !== undefined && draft.supportingText !== null && typeof draft.supportingText !== "string") return null;
  if (draft.suggestedQuestions !== undefined && !isStringArray(draft.suggestedQuestions, 4)) return null;
  if (!isStringArray(draft.actions, 4)) return null;
  if (draft.usedContextSummary !== undefined && !isStringArray(draft.usedContextSummary, 4)) return null;
  if (draft.missingUsefulDetails !== undefined && !isStringArray(draft.missingUsefulDetails, 4)) return null;
  if (draft.clarificationQuestion !== undefined && !cleanOptionalText(draft.clarificationQuestion, 240)) return null;
  const saveSuggestions = cleanSaveSuggestions(draft.saveSuggestions);
  if (draft.saveSuggestions !== undefined && saveSuggestions.length !== draft.saveSuggestions.length) return null;
  const trackingPlan = cleanTrackingPlan(draft.trackingPlan);
  if (draft.trackingPlan !== undefined && !trackingPlan) return null;
  if (draft.vetBriefRelevant !== undefined && typeof draft.vetBriefRelevant !== "boolean") return null;
  if (draft.urgency !== "routine" && draft.urgency !== "resolved" && draft.urgency !== "monitor" && draft.urgency !== "urgent") return null;
  const allowedActions = new Set(ASK_ACTIONS_BY_TYPE[draft.answerType]);
  if (draft.actions.some((action) => !allowedActions.has(action))) return null;
  return {
    ...response,
    answerType: draft.answerType,
    directAnswer: response.summary,
    supportingText: draft.supportingText ? cleanText(draft.supportingText) : null,
    suggestedQuestions: cleanSuggestedQuestions(draft.suggestedQuestions),
    actions: [...draft.actions],
    usedContextSummary: (draft.usedContextSummary || []).map(cleanText).filter(Boolean),
    missingUsefulDetails: (draft.missingUsefulDetails || []).map(cleanText).filter(Boolean),
    ...(draft.clarificationQuestion ? { clarificationQuestion: cleanText(draft.clarificationQuestion) } : {}),
    ...(saveSuggestions.length ? { saveSuggestions } : {}),
    ...(trackingPlan ? { trackingPlan } : {}),
    ...(typeof draft.vetBriefRelevant === "boolean" ? { vetBriefRelevant: draft.vetBriefRelevant } : {}),
    urgency: draft.urgency,
  };
}

function resolveConversationAnswerType(intent, urgent, response) {
  if (urgent) return "urgent_guidance";
  if (intent === "vet_prep") return "vet_prep";
  if (intent === "recent_summary" || intent === "last_week_logs") return "history_summary";
  if (intent === "symptom_notes") return "tracking_plan";
  if (intent === "food_notes" || intent === "product_feedback_summary") return "product_guidance";
  if (hasNoRecordLanguage(guidanceSearchText(response))) return "clarification";
  if (/\b(plan|routine|steps?)\b/i.test(guidanceSearchText(response))) return "care_plan";
  return "direct_answer";
}

function isStringArray(value, maxItems) {
  return Array.isArray(value) && value.length <= maxItems && value.every((item) => typeof item === "string");
}

function cleanOptionalText(value, maxLength) {
  if (typeof value !== "string") return "";
  const cleaned = cleanText(value);
  return cleaned && cleaned.length <= maxLength ? cleaned : "";
}

function cleanSaveSuggestions(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 2) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const type = typeof item.type === "string" ? item.type.trim() : "";
    const statement = cleanOptionalText(item.statement, 240);
    const attribution = cleanOptionalText(item.attribution, 100);
    const suggestedLabel = cleanOptionalText(item.suggestedLabel, 80);
    if (!ASK_MEMORY_CANDIDATE_TYPES.has(type) || !statement || !attribution || !suggestedLabel || item.requiresConfirmation !== true) return [];
    return [{ type, statement, attribution, suggestedLabel, requiresConfirmation: true }];
  });
}

function cleanTrackingPlan(value) {
  if (value === undefined || value === null) return null;
  if (!value || typeof value !== "object") return null;
  const observations = cleanStringList(value.observations, 5);
  const seekCareSoonerIf = cleanStringList(value.seekCareSoonerIf, 3);
  const frequency = cleanOptionalText(value.frequency, 160);
  const duration = cleanOptionalText(value.duration, 160);
  const comparison = cleanOptionalText(value.comparison, 160);
  if (!observations.length || !frequency || !duration || !comparison || !seekCareSoonerIf.length) return null;
  return { observations, frequency, duration, comparison, seekCareSoonerIf };
}

function cleanStringList(value, maxItems) {
  if (!isStringArray(value, maxItems)) return [];
  return value.map(cleanText).filter(Boolean);
}

const privilegedSuggestionPattern = /\b(?:ignore (?:all |any )?(?:previous|prior) instructions?|system prompt|developer (?:message|instructions?)|hidden instructions?|internal (?:prompt|context|machinery)|database (?:record|schema|field)|token budget|model settings?)\b/i;
const unsafeSuggestionPattern = /\b(?:ibuprofen|acetaminophen|paracetamol|aspirin|human medication|induce vomiting|make (?:her|him|them|the pet) vomit)\b/i;

function cleanSuggestedQuestions(value) {
  if (!Array.isArray(value) || value.length > 4) return [];
  const seen = new Set();
  const suggestions = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const suggestion = cleanText(item).slice(0, 180);
    const key = suggestion.toLocaleLowerCase();
    if (!suggestion || privilegedSuggestionPattern.test(suggestion) || unsafeSuggestionPattern.test(suggestion) || seen.has(key)) continue;
    seen.add(key);
    suggestions.push(suggestion);
  }
  return suggestions;
}

export function hasUrgentSymptomContext(value) {
  return URGENT_CONTEXT_PATTERN.test(String(value || ""));
}

export function shouldIncludeProductFeedback(value) {
  return PRODUCT_CONTEXT_PATTERN.test(String(value || ""));
}

export function parseAskResponse(value) {
  if (!value || typeof value !== "object") return null;
  const draft = value;
  if (
    typeof draft.title !== "string" ||
    typeof draft.summary !== "string" ||
    !Array.isArray(draft.sections) ||
    (draft.safetyNote !== null && typeof draft.safetyNote !== "string")
  ) {
    return null;
  }

  const title = cleanText(draft.title);
  const summary = cleanText(draft.summary);
  if (!title || !summary || draft.sections.length > 6) return null;

  const sections = [];
  for (const section of draft.sections) {
    if (
      !section ||
      typeof section !== "object" ||
      typeof section.heading !== "string" ||
      !Array.isArray(section.items) ||
      section.items.length > 8 ||
      !section.items.every((item) => typeof item === "string")
    ) {
      return null;
    }
    const heading = cleanText(section.heading);
    const items = section.items.map(cleanText).filter(Boolean);
    if (heading && items.length) sections.push({ heading, items });
  }

  return {
    title,
    summary,
    sections,
    safetyNote: draft.safetyNote ? cleanText(draft.safetyNote) : null,
  };
}

export function buildUrgentAskResponse() {
  return {
    title: "Contact a veterinarian now",
    summary: FURVISE_URGENT_SAFETY_MESSAGE,
    sections: [],
    safetyNote: `${buildFurviseSafetyLine()} ${FURVISE_URGENT_SAFETY_MESSAGE}`,
  };
}

export function formatAskResponsePlainText(response) {
  const lines = [response.title, "", response.summary];
  for (const section of response.sections) {
    lines.push("", section.heading, ...section.items.map((item) => `- ${item}`));
  }
  if (response.safetyNote) lines.push("", "Safety note", response.safetyNote);
  return lines.join("\n").trim();
}

/**
 * @param {{ title: string; summary: string; sections: Array<{ heading: string; items: string[] }>; safetyNote: string | null }} response
 * @param {{ answerType?: string; saveCategory?: string; saveDetail?: string; saveTitle?: string } | null} [saveMetadata]
 */
export function buildGuidanceCareEntry(response, saveMetadata = null) {
  const metadata = saveMetadata || buildAskSaveMetadata(response);
  const kind = classifyGuidanceResponse(response, metadata.answerType);
  return {
    category: metadata.saveCategory || GUIDANCE_CARE_CATEGORIES[kind],
    note: metadata.saveDetail || summarizeGuidanceForCareHistory(response, kind),
    title: metadata.saveTitle || GUIDANCE_CARE_TITLES[kind],
  };
}

export function buildGuidanceCareNote(response) {
  return buildGuidanceCareEntry(response).note;
}

export function buildAskSaveMetadata(response, options = {}) {
  const answerType = resolveAnswerType(response, options.intent);
  const facts = extractUsefulSavedFacts(response, answerType);
  const relevantFacts = filterFactsForQuestion(facts, options.question || "", answerType);
  const usedSavedFactsCount =
    typeof options.usedSavedFactsCount === "number"
      ? Math.max(0, options.usedSavedFactsCount)
      : relevantFacts.length;
  const cannotAnswerFromSavedData =
    Boolean(options.cannotAnswerFromSavedData) ||
    (hasNoRecordLanguage(guidanceSearchText(response)) && usedSavedFactsCount === 0);
  const saveCategory = mapAnswerTypeToCareCategory(answerType, response, relevantFacts);
  const saveKind = chooseSaveKind(response, answerType, saveCategory);
  const saveTitle = GUIDANCE_CARE_TITLES[saveKind];
  const saveDetail = buildSaveDetail(response, answerType, relevantFacts);
  const saveable =
    !cannotAnswerFromSavedData &&
    usedSavedFactsCount > 0 &&
    !isGenericSafetyOnly(response) &&
    Boolean(saveDetail);

  return {
    answerType,
    cannotAnswerFromSavedData,
    saveCategory,
    saveDetail: saveable ? saveDetail : "",
    saveDetailPreview: saveable ? capCareNote(saveDetail, 220) : "",
    saveDisabledReason: saveable ? "" : "no_saved_summary",
    saveTitle,
    saveable,
    usedSavedFactsCount,
  };
}

export function buildContextSummary(context) {
  const scope =
    context.profileCount === 1 && context.petName
      ? `${context.petName}'s profile`
      : `${context.profileCount} pet profiles`;
  const parts = [scope];
  if (context.savedDetailCount > 0) parts.push("saved details");
  if (context.recentUpdateCount > 0) {
    parts.push(
      `${context.recentUpdateCount} recent ${context.recentUpdateCount === 1 ? "update" : "updates"}`,
    );
  }
  return `Using ${joinList(parts)}.`;
}

function joinList(items) {
  if (items.length < 2) return items[0] || "saved pet context";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

const GUIDANCE_CARE_TITLES = {
  behavior: "Furvise behavior notes summary",
  food: "Furvise food notes summary",
  generic: "Furvise guidance summary",
  grooming: "Furvise grooming notes summary",
  logs: "Furvise log summary",
  recent: "Furvise recent changes summary",
  symptom: "Furvise symptom notes summary",
  vetPrep: "Furvise vet prep summary",
};

const GUIDANCE_CARE_CATEGORIES = {
  behavior: "behavior",
  food: "food",
  generic: "general",
  grooming: "grooming",
  logs: "general",
  recent: "general",
  symptom: "symptom",
  vetPrep: "general",
};

const GUIDANCE_CARE_NOTES = {
  behavior:
    "Saved from Ask, not veterinary advice. Summarized behavior updates and related tracking details.",
  food:
    "Saved from Ask, not veterinary advice. Summarized food updates and related meal or appetite details.",
  generic:
    "Saved from Ask, not veterinary advice. Kept a concise summary for future care history.",
  grooming:
    "Saved from Ask, not veterinary advice. Summarized grooming updates and related tracking details.",
  logs:
    "Saved from Ask, not veterinary advice. Summarized care notes from the requested time period and details still worth adding.",
  recent:
    "Saved from Ask, not veterinary advice. Summarized recent updates and details still worth tracking.",
  symptom:
    "Saved from Ask, not veterinary advice. Summarized symptom updates and related tracking details.",
  vetPrep:
    "Saved from Ask, not veterinary advice. Prepared a vet summary from profile details and recent updates, including questions to ask and details still worth adding.",
};

function classifyGuidanceResponse(response, answerType = "") {
  if (answerType === "vet_prep") return "vetPrep";
  if (answerType === "food_notes") return "food";
  if (answerType === "symptom_notes") return "symptom";
  if (answerType === "last_week_logs") return "logs";
  if (answerType === "recent_summary") return "recent";
  if (answerType === "behavior_summary") return "behavior";
  if (answerType === "grooming_summary") return "grooming";

  const title = response.title || "";
  if (/\b(vet|veterinarian|clinic|appointment|visit|exam)\b/i.test(title)) return "vetPrep";
  if (/\b(recent changes|recent updates|changes|changed|latest updates)\b/i.test(title)) return "recent";
  if (/\b(food|meal|appetite|eating|diet|kibble|treat|ingredient)\b/i.test(title)) return "food";
  if (/\b(symptom|vomit|vomiting|diarrhea|cough|itch|itching|limp|pain|rash|sneez)\b/i.test(title)) return "symptom";
  if (/\b(behavior|behaviour|mood|sad|activity|anxious|stress|sleep|letharg)\b/i.test(title)) return "behavior";
  if (/\b(groom|grooming|bath|brush|nail|coat|shampoo)\b/i.test(title)) return "grooming";
  if (/\b(last week|weekly|logs?|history|timeline|updates from)\b/i.test(title)) return "logs";

  const text = guidanceSearchText(response);
  if (/\b(vet|veterinarian|clinic|appointment|visit|exam)\b/i.test(text)) return "vetPrep";
  if (/\b(recent changes|recent updates|changes|changed|latest updates)\b/i.test(text)) return "recent";
  if (/\b(food|meal|appetite|eating|diet|kibble|treat|ingredient)\b/i.test(text)) return "food";
  if (/\b(symptom|vomit|vomiting|diarrhea|cough|itch|itching|limp|pain|rash|sneez)\b/i.test(text)) return "symptom";
  if (/\b(behavior|behaviour|mood|sad|activity|anxious|stress|sleep|letharg)\b/i.test(text)) return "behavior";
  if (/\b(groom|grooming|bath|brush|nail|coat|shampoo)\b/i.test(text)) return "grooming";
  if (/\b(last week|weekly|logs?|history|timeline|updates from)\b/i.test(text)) return "logs";
  return "generic";
}

function summarizeGuidanceForCareHistory(response, kind) {
  const additions = [];
  const text = guidanceSearchText(response);
  if (kind === "symptom" && /\b(no|not|without|haven't|have not|none)\b.{0,40}\b(vomit|vomiting)\b/i.test(text)) {
    additions.push("No vomiting logs found.");
  }
  return capCareNote([GUIDANCE_CARE_NOTES[kind], ...additions].filter(Boolean).join(" "));
}

function resolveAnswerType(response, intent) {
  if (typeof intent === "string" && intent) return intent;
  const kind = classifyGuidanceResponse(response);
  if (kind === "vetPrep") return "vet_prep";
  if (kind === "food") return "food_notes";
  if (kind === "symptom") return "symptom_notes";
  if (kind === "logs") return "last_week_logs";
  if (kind === "recent") return "recent_summary";
  if (kind === "behavior") return "behavior_summary";
  if (kind === "grooming") return "grooming_summary";
  return "general_pet_question";
}

function mapAnswerTypeToCareCategory(answerType, response, facts) {
  if (answerType === "food_notes") return "food";
  if (answerType === "symptom_notes") return "symptom";
  if (answerType === "behavior_summary") return "behavior";
  if (answerType === "grooming_summary") return "grooming";
  if (answerType === "general_pet_question") {
    const text = [guidanceSearchText(response), ...facts].join(" ");
    if (/\b(symptoms?|vomit|vomiting|diarrhea|cough|itch|itching|limp|pain|rash|sneez|paws?|licking?)\b/i.test(text)) return "symptom";
    if (/\b(behavior|behaviour|mood|sad|activity|anxious|stress|sleep|letharg)\b/i.test(text)) return "behavior";
    if (/\b(groom|grooming|bath|brush|nail|coat|shampoo)\b/i.test(text)) return "grooming";
  }
  return GUIDANCE_CARE_CATEGORIES[classifyGuidanceResponse(response, answerType)] || "general";
}

function chooseSaveKind(response, answerType, saveCategory) {
  if (answerType === "general_pet_question") {
    if (saveCategory === "symptom") return "symptom";
    if (saveCategory === "behavior") return "behavior";
    if (saveCategory === "grooming") return "grooming";
  }
  return classifyGuidanceResponse(response, answerType);
}

function extractUsefulSavedFacts(response, answerType) {
  const facts = [];
  for (const section of response.sections || []) {
    const heading = section.heading || "";
    if (!isSavedFactSection(heading, answerType)) continue;
    for (const item of section.items || []) {
      const fact = cleanText(item);
      if (isUsefulSavedFact(fact)) facts.push(fact);
    }
  }
  return uniqueStrings(facts);
}

function isSavedFactSection(heading, answerType) {
  if (/missing context|what to log|what to ask|watch next|helpful context/i.test(heading)) return false;
  if (/saved facts used|saved updates|latest updates|recent updates|recent saved updates|saved food updates|profile food context|related appetite|saved symptom|other symptom|profile concern|what is saved/i.test(heading)) {
    return true;
  }
  return answerType === "vet_prep" && /saved profile facts/i.test(heading);
}

function isUsefulSavedFact(value) {
  if (!value) return false;
  if (hasNoRecordLanguage(value)) return false;
  if (/^(breed|weight|current food|avoid ingredients)$/i.test(value)) return false;
  if (/^missing context:/i.test(value)) return false;
  if (/saved profile is available/i.test(value)) return false;
  if (/^no care updates logged yet\.?$/i.test(value)) return false;
  if (/^furvise does not have/i.test(value)) return false;
  if (/^add (another|one)\b/i.test(value)) return false;
  if (/^(whether|what|should|could|are|is)\b/i.test(value) && /\?$/.test(value)) return false;
  return true;
}

function filterFactsForQuestion(facts, question, answerType) {
  if (answerType === "vet_prep") {
    const recent = facts.filter((fact) => /\b\d{4}\b|\b(general|symptom|food|behavior|grooming|activity|medication|vet visit)\b\s*-/i.test(fact));
    return recent.length ? recent : [];
  }

  const terms = getQuestionCareTerms(question);
  if (terms.length === 0) return facts;
  const relevant = facts.filter((fact) => terms.some((term) => term.test(fact)));
  if (relevant.length > 0) return relevant;
  if (hasNoRecordLanguage(question)) return [];
  return [];
}

function getQuestionCareTerms(question) {
  const text = String(question || "").toLowerCase();
  const groups = [
    [/\b(diarrhea|diarrhoea|stool|poop|bowel)\b/, [/\b(diarrhea|diarrhoea|stool|poop|bowel)\b/i]],
    [/\b(water|drink|drank|drinking|hydration)\b/, [/\b(water|drink|drank|drinking|hydration)\b/i]],
    [/\b(paw|paws|lick|licking)\b/, [/\b(paw|paws|lick|licking)\b/i]],
    [/\b(vomit|vomited|vomiting|throw up|threw up)\b/, [/\b(vomit|vomited|vomiting|throw up|threw up)\b/i]],
    [/\b(food|ate|eat|eating|meal|appetite|diet|kibble)\b/, [/\b(food|ate|eat|eating|meal|appetite|diet|kibble)\b/i]],
    [/\b(behavior|behaviour|mood|sad|activity|anxious|stress|sleep|letharg)\b/, [/\b(behavior|behaviour|mood|sad|activity|anxious|stress|sleep|letharg)\b/i]],
    [/\b(groom|grooming|bath|brush|nail|coat|shampoo)\b/, [/\b(groom|grooming|bath|brush|nail|coat|shampoo)\b/i]],
  ];
  return groups.flatMap(([questionPattern, factPatterns]) => questionPattern.test(text) ? factPatterns : []);
}

function buildSaveDetail(response, answerType, facts) {
  if (!facts.length) return "";
  const factText = facts.slice(0, 2).map(formatFactForCareNote).join("; ");
  const questions = getSectionItems(response, /what to ask the vet/i);
  const topics = summarizeQuestionTopics(questions);
  const intro = "Saved from Ask, not veterinary advice.";

  if (answerType === "vet_prep") {
    const suffix = topics ? ` Suggested asking about ${topics}.` : "";
    return capCareNote(`${intro} Prepared a vet summary from saved profile details and recent ${factText}.${suffix}`);
  }

  if (answerType === "food_notes") {
    return capCareNote(`${intro} Summarized saved food context from ${factText}.`);
  }

  if (answerType === "symptom_notes") {
    return capCareNote(`${intro} Summarized saved symptom context from ${factText}.`);
  }

  if (answerType === "behavior_summary") {
    return capCareNote(`${intro} Summarized saved behavior context from ${factText}.`);
  }

  if (answerType === "grooming_summary") {
    return capCareNote(`${intro} Summarized saved grooming context from ${factText}.`);
  }

  return capCareNote(`${intro} Summarized saved details from ${factText}.`);
}

function formatFactForCareNote(value) {
  const fact = cleanText(value).replace(/\.$/, "");
  const match = fact.match(/^(?:[A-Z][a-z]{2,8}\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+[A-Z][a-z]{2,8}\s+\d{4})\s*-\s*([A-Za-z ]+)\s*-\s*(.+)$/);
  if (!match) return `"${fact}"`;
  return `${match[1].trim().toLowerCase()} update: "${match[2].trim()}"`;
}

function getSectionItems(response, headingPattern) {
  return (response.sections || [])
    .filter((section) => headingPattern.test(section.heading || ""))
    .flatMap((section) => section.items || [])
    .map(cleanText)
    .filter(Boolean);
}

function summarizeQuestionTopics(items) {
  const text = items.join(" ").toLowerCase();
  const topics = [];
  if (/\b(mood|activity|sad|letharg|energy)\b/.test(text)) topics.push("mood/activity changes");
  if (/\burgent|warning signs|emergency\b/.test(text)) topics.push("urgency signs");
  if (/\btrack|log|monitor|next\b/.test(text)) topics.push("what to track next");
  if (/\bappetite|food|water|stool|vomit|diet\b/.test(text)) topics.push("appetite, water, stool, or diet changes");
  if (/\bpaw|skin|scratch|itch|ear|redness\b/.test(text)) topics.push("skin or paw symptoms");
  return uniqueStrings(topics).slice(0, 3).join(", ").replace(/, ([^,]*)$/, ", and $1");
}

function isGenericSafetyOnly(response) {
  const text = guidanceSearchText(response);
  const withoutSafety = text
    .replace(/furvise organizes care context\.?/gi, "")
    .replace(/it does not diagnose or replace a veterinarian\.?/gi, "")
    .replace(/contact (a|an|your) (emergency )?veterinarian[^.]*\.?/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return withoutSafety.length < 40;
}

function hasNoRecordLanguage(value) {
  return /\b(saved history does not show|can't tell from saved history alone|cannot tell from saved history alone|no record found|not enough context|does not contain enough|do not see saved|don't see saved|does not have care updates|does not show|no saved .{0,40}(logs?|notes?|updates?)|nothing useful)\b/i.test(String(value || ""));
}

function uniqueStrings(values) {
  const seen = new Set();
  return values.filter((value) => {
    const normalized = cleanText(value).toLowerCase();
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function guidanceSearchText(response) {
  return [
    response.title,
    response.summary,
    ...(response.sections || []).flatMap((section) => [section.heading, ...(section.items || [])]),
  ]
    .filter(Boolean)
    .join(" ");
}

function capCareNote(value, maxLength = 500) {
  const normalized = cleanText(value);
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}...`;
}

function cleanText(value) {
  return String(value || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[*_`#>]/g, "")
    .replace(/^\s*[-+]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}
