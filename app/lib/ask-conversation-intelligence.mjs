export const ASK_CONVERSATION_INTENTS = [
  "general_care",
  "symptom_or_change",
  "food_or_diet",
  "grooming",
  "routine",
  "behavior",
  "product_question",
  "tracking",
  "care_history_summary",
  "vet_preparation",
  "medication_or_supplement",
  "clarification",
  "conversational_follow_up",
  "unrelated",
];

const TOPICS = {
  food: /\b(food|diet|kibble|meal|chicken|beef|salmon|treat|appetite|eat(?:ing)?)\b/i,
  grooming: /\b(shampoo|groom|brush|coat|nail|bath)\b/i,
  dental: /\b(dental|teeth|tooth|gum|brush(?:ing)?)\b/i,
  medication: /\b(medication|medicine|dose|dosage|pill|prescription|supplement|missed dose|human medication)\b/i,
  product: /\b(product|brand|label|ingredient|cleaner|spray|toy)\b/i,
  symptom: /\b(scratch\w*|itch\w*|vomit\w*|diarrhea|cough\w*|pain\w*|swelling|hives|letharg\w*|stool|skin|paw|ear|breath\w*)\b/i,
};

const VAGUE_REFERENCE = /\b(it|that|this|same (?:problem|thing)|what you said|should i stop)\b/i;
const UNRELATED = /\b(code|javascript|politics|stock price|homework|write (?:an|a) essay|weather forecast)\b/i;

/**
 * @param {{
 *   memory: Record<string, any>,
 *   messages?: Array<{id?: string, role: string, text?: string, response?: {directAnswer?: string, summary?: string, clarificationQuestion?: string, trackingPlan?: {observations?: string[]}} | null}>,
 *   now?: Date,
 *   question: string,
 *   urgent?: boolean
 * }} input
 */
export function buildConversationDecision({ memory, messages = [], now = new Date(), question, urgent = false }) {
  const cleanQuestion = cleanText(question).slice(0, 1200);
  const recentMessages = normalizeMessages(messages).slice(-12);
  const intent = classifyConversationIntent(cleanQuestion);
  const references = resolveConversationReferences(cleanQuestion, recentMessages);
  const relevantContextKeys = relevantKeysForIntent(intent, cleanQuestion);
  const selected = selectRelevantContext(memory, { intent, question: cleanQuestion, relevantContextKeys });
  const ownerReportedFacts = collectOwnerReports(selected, [...recentMessages, { role: "user", text: cleanQuestion }]);
  const confirmedSavedFacts = collectConfirmedFacts(memory, relevantContextKeys);
  const clarificationQuestion = urgent
    ? null
    : buildClarificationQuestion(cleanQuestion, intent, references, memory?.pet?.name || "your pet");
  const trackingPlan = buildTrackingPlan(intent, cleanQuestion, memory?.pet?.name || "your pet", now);
  const memoryCandidates = buildMemoryCandidates(cleanQuestion, recentMessages, memory?.savedDetails || []);

  return {
    intent,
    answerMode: urgent ? "urgent" : clarificationQuestion ? "clarify_after_first_step" : trackingPlan ? "practical_guidance" : "direct",
    urgency: urgent ? "urgent" : "routine",
    canAnswerNow: urgent || intent !== "unrelated" || Boolean(clarificationQuestion),
    clarificationNeeded: Boolean(clarificationQuestion),
    clarificationQuestion,
    relevantContextKeys,
    ownerReportedFacts,
    confirmedSavedFacts,
    unresolvedReferences: references.unresolved,
    resolvedReferences: references.resolved,
    recommendedNextAction: recommendedNextAction(intent, cleanQuestion, references, memory?.pet?.name || "your pet"),
    trackingOpportunity: Boolean(trackingPlan),
    trackingPlan,
    memoryCandidates,
    vetBriefRelevant: intent === "vet_preparation" || (intent === "symptom_or_change" && /\b(vet|visit|appointment|bring|prepare)\b/i.test(cleanQuestion)),
    selectedContext: selected,
  };
}

export function classifyConversationIntent(question) {
  const value = cleanText(question);
  if (UNRELATED.test(value)) return "unrelated";
  if (TOPICS.medication.test(value)) return "medication_or_supplement";
  if (/\b(vet|veterinarian|appointment|visit brief|prepare for.*visit|what should i (?:bring|tell))\b/i.test(value)) return "vet_preparation";
  if (/\b(track|monitor|log|watch each day|care history)\b/i.test(value)) return "tracking";
  if (/\b(summary|summarize|history|what changed|last week|recent updates?)\b/i.test(value)) return "care_history_summary";
  if (TOPICS.food.test(value)) return "food_or_diet";
  if (TOPICS.dental.test(value)) return "routine";
  if (TOPICS.grooming.test(value)) return "grooming";
  if (/\b(behavior|anxious|bark|fear|aggress|chew|training)\b/i.test(value)) return "behavior";
  if (/\b(routine|schedule|habit|daily care)\b/i.test(value)) return "routine";
  if (TOPICS.symptom.test(value) || /\b(got worse|improved|changed|not normal)\b/i.test(value)) return "symptom_or_change";
  if (TOPICS.product.test(value)) return "product_question";
  if (/^(?:yes|no|okay|ok|actually|also|and|but)\b/i.test(value) || VAGUE_REFERENCE.test(value)) return "conversational_follow_up";
  if (/\b(what do you mean|which one|clarify)\b/i.test(value)) return "clarification";
  return "general_care";
}

export function resolveConversationReferences(question, messages = []) {
  if (!VAGUE_REFERENCE.test(question)) return { resolved: [], unresolved: [] };
  const candidates = [];
  for (const message of [...normalizeMessages(messages)].reverse()) {
    const text = message.text;
    const concrete = ["food", "grooming", "dental", "medication", "product"].filter((topic) => TOPICS[topic].test(text));
    for (const [topic, pattern] of Object.entries(TOPICS)) {
      if (topic === "symptom" && concrete.length) continue;
      if (pattern.test(text) && !candidates.includes(topic)) candidates.push(topic);
    }
    if (candidates.length >= 3) break;
  }
  if (candidates.length === 1) return { resolved: [candidates[0]], unresolved: [] };
  return { resolved: [], unresolved: candidates.length ? candidates.slice(0, 2) : ["it"] };
}

export function selectRelevantContext(memory, plan) {
  if (!memory) return { careEntries: [], savedDetails: [], productFeedback: [], profileFacts: [] };
  const terms = queryTerms(plan.question, plan.relevantContextKeys);
  const matches = (value) => terms.some((term) => cleanText(value).toLowerCase().includes(term));
  const careEntries = memory.timeline.recallEntries
    .filter((entry) => matches(`${entry.category} ${entry.title} ${entry.detail || ""}`))
    .slice(0, 8);
  const savedDetails = memory.savedDetails
    .filter((detail) => matches(`${detail.label} ${detail.value}`))
    .slice(0, 6);
  const productFeedback = plan.intent === "product_question"
    ? memory.productFeedback.filter((item) => matches(`${item.status} ${item.note || ""}`)).slice(0, 4)
    : [];
  return {
    careEntries,
    savedDetails,
    productFeedback,
    profileFacts: collectConfirmedFacts(memory, plan.relevantContextKeys),
  };
}

export function buildContextLabels(memory, decision, hasConversation = false) {
  const labels = [];
  if (decision.confirmedSavedFacts.length) labels.push(`${memory.pet.name}'s profile`);
  if (decision.selectedContext.careEntries.length) labels.push("Recent care updates");
  if (decision.selectedContext.savedDetails.length) labels.push("Saved care details");
  if (hasConversation) labels.push("This conversation");
  return labels.slice(0, 4);
}

function buildClarificationQuestion(question, intent, references, petName) {
  if (references.unresolved.length > 1) {
    const [first, second] = references.unresolved;
    return `When you say “it,” do you mean the ${friendlyTopic(first)} or the ${friendlyTopic(second)}?`;
  }
  if (references.unresolved.length === 1) return `What does “it” refer to here?`;
  if (intent === "medication_or_supplement" && /\b(dose|dosage|how much|missed)\b/i.test(question) && !/\b\d+(?:\.\d+)?\s*(?:mg|ml|tablet|pill|drop)/i.test(question)) {
    return `What does the label or ${petName}'s veterinary instruction say for the dose?`;
  }
  if (intent === "symptom_or_change" && /\b(started|worse|vomit|diarrhea|swelling|hives)\b/i.test(question) && !/\b(today|yesterday|hour|day|week|since|after|before)\b/i.test(question)) {
    return `When did this start?`;
  }
  return null;
}

function recommendedNextAction(intent, question, references, petName) {
  if (references.unresolved.length) return "Clarify the item being discussed, then continue from the existing thread.";
  if (intent === "medication_or_supplement") return "Check the prescription or label and confirm any dosing decision with the prescribing veterinarian.";
  if (intent === "vet_preparation") return `Write down the main change, when it started, and what has changed from ${petName}'s normal routine.`;
  if (intent === "symptom_or_change") return `Keep ${petName}'s routine steady and note whether the change improves, stays the same, or worsens.`;
  if (intent === "food_or_diet") return "Avoid adding another new food or treat while you watch the current change.";
  if (intent === "grooming" && /shampoo/i.test(question)) return "Stop the new shampoo for now and rinse with plain lukewarm water.";
  if (intent === "unrelated") return "Ask about your pet's care, routine, products, history, or an upcoming veterinary visit.";
  return `Start with one small, repeatable step for ${petName}.`;
}

function buildTrackingPlan(intent, question, petName) {
  if (!["symptom_or_change", "food_or_diet", "tracking", "vet_preparation"].includes(intent)) return null;
  const observations = intent === "food_or_diet"
    ? ["appetite", "stool", "scratching or licking", "any new food or treats"]
    : intent === "vet_preparation"
      ? ["appetite", "energy", "stool", "sleep", "the main change from normal"]
      : topicObservations(question);
  return {
    observations: observations.slice(0, 5),
    frequency: "Once each day, and when the change happens",
    duration: "For the next 3 to 5 days, or until the veterinary visit",
    comparison: `Compare with ${petName}'s usual routine`,
    seekCareSoonerIf: ["The change worsens quickly", "Eating, drinking, breathing, or normal movement is affected"],
  };
}

function buildMemoryCandidates(question, messages, existing) {
  if (!/\b(seemed|appeared|started|became|got|does better|does worse|prefers|usually|every day|vet(?:erinarian)? (?:said|recommended|instructed))\b/i.test(question)) return [];
  const statement = cleanText(question).replace(/^(actually|also)\s*,?\s*/i, "").slice(0, 240);
  if (statement.length < 12) return [];
  const normalized = normalizeForDedupe(statement);
  if (existing.some((item) => normalizeForDedupe(item.value).includes(normalized) || normalized.includes(normalizeForDedupe(item.value)))) return [];
  const veterinarian = /\bvet(?:erinarian)? (?:said|recommended|instructed)\b/i.test(statement);
  const foodResponse = /\b(food|diet|chicken|kibble|meal)\b/i.test(statement) && /\b(after|worse|better|response)\b/i.test(statement);
  return [{
    type: veterinarian ? "veterinarian_instruction" : foodResponse ? "food_response" : "recurring_pattern",
    statement,
    attribution: veterinarian ? "Owner reported a veterinary instruction" : "Owner reported",
    confidence: "reported",
    permanence: veterinarian ? "important" : "reviewable",
    sourceMessageId: [...normalizeMessages(messages)].reverse().find((item) => item.role === "user")?.id || null,
    suggestedLabel: veterinarian ? "Veterinary instruction" : foodResponse ? "Food response" : "Care pattern",
    requiresConfirmation: true,
  }];
}

function collectOwnerReports(selected, messages) {
  const fromCare = selected.careEntries.filter((entry) => entry.source === "owner").map((entry) => entry.detail || entry.title);
  const corrections = normalizeMessages(messages)
    .filter((message) => message.role === "user" && /\b(actually|correction|i meant|not .+,|rather than)\b/i.test(message.text))
    .slice(-2)
    .map((message) => message.text);
  return unique([...corrections, ...fromCare]).slice(0, 6);
}

function collectConfirmedFacts(memory, keys) {
  if (!memory?.pet) return [];
  const facts = [];
  if (keys.includes("identity") && memory.pet.species) facts.push(`${memory.pet.name} is a ${memory.pet.species}.`);
  if (keys.includes("age") && memory.pet.ageLabel) facts.push(`Age: ${memory.pet.ageLabel}.`);
  if (keys.includes("weight") && memory.pet.weightLabel) facts.push(`Weight: ${memory.pet.weightLabel}.`);
  if (keys.includes("food") && memory.pet.currentFood) facts.push(`Current food: ${memory.pet.currentFood}.`);
  if (keys.includes("food") && memory.pet.avoidIngredients?.length) facts.push(`Ingredients marked to avoid: ${memory.pet.avoidIngredients.join(", ")}.`);
  if (keys.includes("goal") && memory.pet.wellnessGoal) facts.push(`Care goal: ${memory.pet.wellnessGoal}.`);
  return facts.slice(0, 6);
}

function relevantKeysForIntent(intent, question) {
  const map = {
    general_care: ["identity", "age", "goal"], symptom_or_change: ["identity", "age", "weight", "care_history"],
    food_or_diet: ["identity", "age", "weight", "food", "care_history"], grooming: ["identity", "care_history"],
    routine: ["identity", "age", "goal", "care_history"], behavior: ["identity", "age", "care_history"],
    product_question: ["identity", "product", "food", "care_history"], tracking: ["identity", "care_history"],
    care_history_summary: ["identity", "care_history"], vet_preparation: ["identity", "age", "weight", "food", "care_history"],
    medication_or_supplement: ["identity", "age", "weight", "veterinary_guidance", "care_history"],
    clarification: ["identity", "conversation"], conversational_follow_up: ["identity", "conversation", "care_history"], unrelated: [],
  };
  const keys = [...(map[intent] || ["identity"])];
  if (TOPICS.food.test(question) && !keys.includes("food")) keys.push("food");
  return keys;
}

function queryTerms(question, keys) {
  const stop = new Set(["about", "after", "again", "could", "does", "have", "rocky", "should", "their", "there", "these", "thing", "what", "when", "where", "which", "would", "your"]);
  const words = cleanText(question).toLowerCase().match(/[a-z]{4,}/g) || [];
  const keyTerms = keys.flatMap((key) => ({ food: ["food", "diet", "appetite", "meal"], product: ["product", "label", "ingredient"], care_history: ["care", "change"], veterinary_guidance: ["vet", "veterinarian", "medication", "dose"] }[key] || []));
  return unique([...words.filter((word) => !stop.has(word)), ...keyTerms]).slice(0, 18);
}

function topicObservations(question) {
  if (/scratch|itch|skin|paw|ear/i.test(question)) return ["scratching or licking", "redness on paws, ears, or belly", "sleep and comfort", "anything newly introduced"];
  if (/vomit|stool|diarrhea/i.test(question)) return ["vomiting or stool changes", "appetite", "water intake", "energy"];
  return ["the change from normal", "timing", "appetite and water", "energy and comfort"];
}

function friendlyTopic(topic) { return topic === "symptom" ? "change you noticed" : topic; }
function normalizeMessages(messages) {
  return (Array.isArray(messages) ? messages : []).flatMap((message) => {
    if (!message || typeof message !== "object") return [];
    if (message.role === "user" && typeof message.text === "string") return [{ id: message.id || null, role: "user", text: cleanText(message.text) }];
    const responseText = message.response
      ? [
          message.response.directAnswer || message.response.summary || "",
          message.response.clarificationQuestion ? `Unanswered question: ${message.response.clarificationQuestion}` : "",
          message.response.trackingPlan?.observations?.length ? `Current tracking plan: ${message.response.trackingPlan.observations.join(", ")}` : "",
        ].filter(Boolean).join(" ")
      : "";
    const text = typeof message.text === "string" ? message.text : responseText;
    return typeof text === "string" ? [{ id: message.id || null, role: "furvise", text: cleanText(text) }] : [];
  }).filter((message) => message.text);
}
function normalizeForDedupe(value) { return cleanText(value).toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " "); }
function unique(values) { return [...new Set(values.filter(Boolean))]; }
function cleanText(value) { return String(value || "").replace(/\s+/g, " ").trim(); }
