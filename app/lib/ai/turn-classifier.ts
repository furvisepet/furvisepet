import { isCasualAskTone } from "../ask-experience.ts";

export type TurnIntent =
  | "question"
  | "new_observation"
  | "status_update"
  | "resolution"
  | "correction"
  | "preference"
  | "product_question"
  | "vet_preparation"
  | "casual"
  | "unknown";

export type ActiveConcernMessageState =
  | "worsening"
  | "still_active"
  | "improved"
  | "resolved"
  | "recurrence"
  | "unclear"
  | "unrelated";

export type ClassifiedTurn = {
  intent: TurnIntent;
  normalizedMessage: string;
  isLowValueAcknowledgement: boolean;
  indicatesResolution: boolean;
  indicatesReturn: boolean;
  concernState: ActiveConcernMessageState;
  immediateEmergency: boolean;
};

const resolvedPattern = /\b(fine now|normal again|back to normal|returned to normal|breathing normally(?: now| again)?|breathing is normal|it stopped|has stopped|resolved|gone away|no more deep breaths?|no longer breathing (?:hard|deeply)|doing better now|settled now)\b/i;
const explicitCessationPattern = /\b(?:has(?:\s+not|n't)\s+[\p{L}\p{N}'-]+\s+again|no\s+(?:more|further)\s+[\p{L}\p{N}'-]+|(?:stopped|ceased)\s+[\p{L}\p{N}'-]+)\b/iu;
const restoredBaselinePattern = /\b(?:seems?|appears?|is|are|acting|behaving)\s+(?:completely\s+|fully\s+)?(?:normal|usual|fine|well|okay|ok)(?:\s+(?:again|now))?\b/i;
const improvedPattern = /\b(she is good|he is good|they are good|is good now|seems good|appears well|doing well|feels better|seems better|resting normally|calm now)\b/i;
const returnPattern = /\b(came back|is back|started again|returned|happening again|worse again|recurred)\b/i;
const worseningPattern = /\b(getting worse|worsening|much worse|open[- ]mouth breathing|collapsed?|gums? (?:look |are )?(?:blue|pale)|cannot breathe|can't breathe|unable to breathe|unconscious)\b/i;
const immediateEmergencyPattern = /\b(collapsed?|gums? (?:look |are )?(?:blue|pale)|open[- ]mouth breathing|cannot breathe|can't breathe|unable to breathe|unconscious)\b/i;
const stillActivePattern = /\b(still (?:breathing (?:hard|deeply|fast)|tired|happening)|same issue|not better|hasn't improved|has not improved|continues?|still there)\b/i;
const concernLanguagePattern = /\b(breath(?:e|ing)?|deep breaths?|symptoms?|issue|tired|weak|gums?|collapse|seizure|vomit|bleed|urinate|toxin|pain)\b/i;
const acknowledgementPattern = /^(thanks|thank you|okay|ok|yes|no|got it|sounds good|understood)[.!\s]*$/i;

export function classifyUserTurn(message: string, options: { hasActiveConcern?: boolean } = {}): ClassifiedTurn {
  const normalizedMessage = message.trim().replace(/\s+/g, " ");
  const concernState = classifyActiveConcernMessage(normalizedMessage, Boolean(options.hasActiveConcern));
  const indicatesResolution = concernState === "improved" || concernState === "resolved";
  const indicatesReturn = returnPattern.test(normalizedMessage);
  const immediateEmergency = immediateEmergencyPattern.test(normalizedMessage);
  const isLowValueAcknowledgement = acknowledgementPattern.test(normalizedMessage);
  let intent: TurnIntent = "unknown";

  if (!normalizedMessage) intent = "unknown";
  else if (indicatesResolution && options.hasActiveConcern) intent = "resolution";
  else if (indicatesReturn) intent = "new_observation";
  else if (/\b(actually|correction|i meant|not what i said|that is wrong)\b/i.test(normalizedMessage)) intent = "correction";
  else if (/\b(prefers?|likes?|dislikes?|favorite|favourite|will not eat|won't eat)\b/i.test(normalizedMessage)) intent = "preference";
  else if (/\b(vet brief|prepare for (the )?vet|appointment notes?|questions for (the )?vet)\b/i.test(normalizedMessage)) intent = "vet_preparation";
  else if (/\b(product|food brand|buy|shopping|shampoo|treat|supplement|toy)\b/i.test(normalizedMessage) && /\?|\b(which|should|can|is|are|recommend)\b/i.test(normalizedMessage)) intent = "product_question";
  else if (isLowValueAcknowledgement) intent = options.hasActiveConcern ? "status_update" : "casual";
  else if (isCasualAskTone(normalizedMessage)) intent = "casual";
  else if (/\?$|\b(what|when|where|why|how|should|could|can|is|are|do|does|will)\b/i.test(normalizedMessage)) intent = "question";
  else if (/\b(new|started|changed|vomit|itch|limp|breath|tired|pain|symptom|ate|drank|stool|medication|treatment)\b/i.test(normalizedMessage)) intent = "new_observation";
  else if (/^(hi|hello|hey|good morning|good afternoon|good evening|how are you)\b/i.test(normalizedMessage)) intent = "casual";

  return { concernState, immediateEmergency, intent, normalizedMessage, isLowValueAcknowledgement, indicatesResolution, indicatesReturn };
}

export function classifyActiveConcernMessage(message: string, hasActiveConcern = true): ActiveConcernMessageState {
  const normalized = message.trim().replace(/\s+/g, " ");
  if (!hasActiveConcern || !normalized) return "unrelated";
  if (worseningPattern.test(normalized)) return "worsening";
  if (resolvedPattern.test(normalized) || explicitTerminalRecovery(normalized)) return "resolved";
  if (improvedPattern.test(normalized)) return "improved";
  if (returnPattern.test(normalized)) return "recurrence";
  if (stillActivePattern.test(normalized)) return "still_active";
  if (isCasualAskTone(normalized)) return "unrelated";
  if (/^(?:hi|hello|hey|yo|thanks|thank you|okay|ok)[!.\s]*$/i.test(normalized)) return "unrelated";
  if (/\?|\b(what|when|where|why|how|should|could|can|is|are|do|does|will)\b/i.test(normalized) && !concernLanguagePattern.test(normalized)) return "unrelated";
  return "unclear";
}

function explicitTerminalRecovery(message: string) {
  if (!explicitCessationPattern.test(message)) return false;
  const noRecurrenceMatch = /\bhas(?:\s+not|n't)\s+([\p{L}\p{N}'-]+)\s+again\b/iu.exec(message);
  const noRecurrence = Boolean(noRecurrenceMatch && !/^(?:better|improved|recovered|resolved|stopped|normal)$/i.test(noRecurrenceMatch[1]));
  const boundedNoMore = /\bno\s+(?:more|further)\s+[\p{L}\p{N}'-]+(?:\s+(?:since|after|for)\b|[.!?]|$)/iu.test(message);
  return restoredBaselinePattern.test(message) || noRecurrence || boundedNoMore;
}

export function isDeterministicTurn(turn: ClassifiedTurn, hasActiveConcern: boolean) {
  if (turn.intent === "resolution" && hasActiveConcern) return true;
  if (turn.isLowValueAcknowledgement) return true;
  return false;
}
