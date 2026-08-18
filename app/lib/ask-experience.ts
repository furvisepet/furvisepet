export type AskPresentationMode = "casual" | "normal" | "complex" | "resolved" | "serious";

type AskPresentationResponse = {
  answerType: string;
  sections: Array<{ items: string[] }>;
  safetyNote?: string | null;
  urgency: "routine" | "resolved" | "monitor" | "urgent";
};

const seriousTonePattern = /\b(can(?:not|'t) breathe|unable to breathe|trouble breathing|open[- ]mouth breathing|collapse(?:d)?|unconscious|seizure|severe (?:pain|bleeding|injury)|hit by (?:a )?car|broken bone|large wound|poison(?:ed|ing)?|suspected toxin|gums? (?:are |look )?(?:blue|pale)|dying|died|dead|death|grief|grieving|devastated|heartbroken|distressed|terrified|panicking|can(?:not|'t) stop crying)\b/i;
const careSignalPattern = /\b(vomit(?:ed|ing)?|diarrhea|bleed(?:ing)?|injur(?:y|ed)|pain|limp(?:ing)?|letharg(?:y|ic)|not eating|won't eat|cannot urinate|can't urinate|medicine|medication|dose|toxin|poison|breath(?:e|ing)?|symptom|vet(?:erinarian)?)\b/i;
const casualSignalPattern = /\b(lol|lmao|bro|omg|dumb|silly|goofy|chaos|chaotic|insane|unhinged|dramatic|menace|gremlin)\b|\blook what\b.+\bdid\b|\bknocked\b.+\bover again\b/i;
const greetingPattern = /^(?:hi|hello|hey|yo|good (?:morning|afternoon|evening)|thanks|thank you)[!.\s]*$/i;

export function isSeriousAskTone(message: string) {
  return seriousTonePattern.test(normalize(message));
}

export function isCasualAskTone(message: string) {
  const normalized = normalize(message);
  if (!normalized || normalized.length > 240 || isSeriousAskTone(normalized) || careSignalPattern.test(normalized)) return false;
  return greetingPattern.test(normalized) || casualSignalPattern.test(normalized);
}

export function getAskPresentationMode(response: AskPresentationResponse, userMessage = ""): AskPresentationMode {
  if (response.urgency === "urgent" || isSeriousAskTone(userMessage)) return "serious";
  if (response.urgency === "resolved") return "resolved";
  const sectionItemCount = response.sections.reduce((count, section) => count + section.items.length, 0);
  const structurallyComplex = response.sections.length >= 2
    || sectionItemCount >= 4
    || ["care_plan", "tracking_plan", "vet_prep", "history_summary"].includes(response.answerType);
  if (structurallyComplex) return "complex";
  if (response.answerType === "direct_answer" && !response.safetyNote && !response.sections.length && isCasualAskTone(userMessage)) return "casual";
  return "normal";
}

export function shouldShowSuggestedQuestions(response: AskPresentationResponse, userMessage = "") {
  const mode = getAskPresentationMode(response, userMessage);
  return mode !== "serious" && mode !== "casual" && response.answerType !== "clarification";
}

export function applySuggestedQuestionDraft(
  suggestion: string,
  controls: { focusComposer: () => void; setQuestion: (value: string) => void },
) {
  controls.setQuestion(suggestion);
  controls.focusComposer();
}

function normalize(value: string) {
  return value.trim().replace(/\s+/g, " ");
}
