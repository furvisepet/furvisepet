import { isCasualAskTone } from "../ask-experience.ts";
import { analyzeOwnerAssertions } from "./owner-assertion.ts";

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

const resolvedPattern = /\b(fine now|normal again|back to normal|returned to normal|breathing normally(?: now| again)?|breathing is normal|it stopped|has stopped|resolved|gone away|no more deep breaths?|no longer breathing (?:hard|deeply)|doing better now|settled now|stopped (?:bleeding|coughing|hiding|itching|limping|pacing|scratching|sneezing|vomiting))\b/i;
const explicitCessationPattern = /\b(?:has(?:\s+not|n't)\s+[\p{L}\p{N}'-]+\s+again|no\s+(?:more|further)\s+[\p{L}\p{N}'-]+|(?:stopped|ceased)\s+[\p{L}\p{N}'-]+)\b/iu;
const restoredBaselinePattern = /\b(?:seems?|appears?|is|are|acting|behaving)\s+(?:completely\s+|fully\s+)?(?:normal|usual|fine|well|okay|ok)(?:\s+(?:again|now))?\b/i;
const improvedPattern = /\b(she is good|he is good|they are good|is good now|seems good|appears well|doing well|feels better|seems better|resting normally|calm now)\b/i;
const returnPattern = /\b(came back|is back|started(?:\s+[\p{L}\p{N}'â€™-]+){0,3}\s+again|returned|happening again|worse again|recurred)\b/iu;
const worseningPattern = /\b(getting worse|worsening|much worse|open[- ]mouth breathing|collapsed?|gums? (?:look |are )?(?:blue|pale)|cannot breathe|can't breathe|unable to breathe|unconscious)\b/i;
const immediateEmergencyPattern = /\b(collapsed?|gums? (?:look |are )?(?:blue|pale)|open[- ]mouth breathing|cannot breathe|can't breathe|unable to breathe|unconscious)\b/i;
const stillActivePattern = /\b(still (?:breathing (?:hard|deeply|fast)|tired|happening)|same issue|not better|hasn't improved|has not improved|continues?|still there)\b/i;
const concernLanguagePattern = /\b(breath(?:e|ing)?|deep breaths?|symptoms?|issue|tired|weak|gums?|collapse|seizure|vomit|bleed|urinate|toxin|pain)\b/i;
const acknowledgementPattern = /^(thanks|thank you|okay|ok|yes|no|got it|sounds good|understood)[.!\s]*$/i;
const negatedRecoveryPattern = /\b(?:(?:has|have|had|did|does|is|are|was|were)\s+not|hasn't|haven't|hadn't|didn't|doesn't|isn't|aren't|wasn't|weren't|never)\s+(?:[\p{L}\p{N}'’-]+\s+){0,3}(?:better|ceased|gone|improved|normal|resolved|stopped)\b/iu;
const uncertainRecoveryPattern = /\b(?:could|if|may|maybe|might|not sure|perhaps|possibly|suppose|uncertain|unless|wish|would)\b/i;
const symptomStoppedPattern = /\b(?:bleeding|coughing|diarrhea|hiding|itching|limping|pacing|scratching|sneezing|symptoms?|vomiting)\s+(?:has\s+)?(?:ceased|resolved|stopped)\b/i;

export function classifyUserTurn(message: string, options: { hasActiveConcern?: boolean } = {}): ClassifiedTurn {
  const normalizedMessage = message.trim().replace(/\s+/g, " ");
  const assertion = analyzeOwnerAssertions(normalizedMessage);
  const concernState = classifyActiveConcernMessage(normalizedMessage, Boolean(options.hasActiveConcern));
  const indicatesResolution = concernState === "improved" || concernState === "resolved";
  const assertedMessage = assertion.assertionText;
  const indicatesReturn = assertedConcernTransitions(normalizedMessage).some((transition) => transition.state === "recurrence")
    || returnPattern.test(assertedMessage);
  const immediateEmergency = immediateEmergencyPattern.test(normalizedMessage);
  const isLowValueAcknowledgement = acknowledgementPattern.test(normalizedMessage);
  let intent: TurnIntent = "unknown";

  if (!normalizedMessage) intent = "unknown";
  else if (assertion.isPureQuestion) intent = "question";
  else if (indicatesResolution && options.hasActiveConcern) intent = "resolution";
  else if (indicatesReturn) intent = "new_observation";
  else if (assertion.hasExplicitCorrection) intent = "correction";
  else if (assertion.hasOwnerAssertion && isPreferenceStatement(assertedMessage)) intent = "preference";
  else if (/\b(vet brief|prepare for (the )?vet|appointment notes?|questions for (the )?vet)\b/i.test(normalizedMessage)) intent = "vet_preparation";
  else if (/\b(product|food brand|buy|shopping|shampoo|treat|supplement|toy)\b/i.test(normalizedMessage) && /\?|\b(which|should|can|is|are|recommend)\b/i.test(normalizedMessage)) intent = "product_question";
  else if (isLowValueAcknowledgement) intent = options.hasActiveConcern ? "status_update" : "casual";
  else if (isCasualAskTone(normalizedMessage)) intent = "casual";
  else if (assertion.hasOwnerAssertion && /\b(new|started|stopped|changed|vomit|hiding|hide|itch|limp|breath|tired|pain|symptom|ate|drank|stool|medication|treatment)\b/i.test(assertedMessage)) intent = "new_observation";
  else if (/\?$|\b(what|when|where|why|how|should|could|can|is|are|do|does|will)\b/i.test(normalizedMessage)) intent = "question";
  else if (/^(hi|hello|hey|good morning|good afternoon|good evening|how are you)\b/i.test(normalizedMessage)) intent = "casual";

  return { concernState, immediateEmergency, intent, normalizedMessage, isLowValueAcknowledgement, indicatesResolution, indicatesReturn };
}

function isPreferenceStatement(message: string) {
  return /\b(?:i|we)\s+(?:prefer|dislike|like|want)\b/i.test(message)
    || /\b(?:she|he|they|my (?:cat|dog|pet))\s+(?:prefers?|likes?|dislikes?)\b/i.test(message)
    || /\b[A-Z][a-z]+\s+(?:prefers?|likes?|dislikes?)\b/.test(message)
    || /\b(?:favorite|favourite)\b/i.test(message)
    || /\b(?:will not|won't)\s+eat\b/i.test(message);
}

export function classifyActiveConcernMessage(message: string, hasActiveConcern = true): ActiveConcernMessageState {
  const normalized = message.trim().replace(/\s+/g, " ");
  if (!hasActiveConcern || !normalized) return "unrelated";
  if (worseningPattern.test(normalized)) return "worsening";
  const assertion = analyzeOwnerAssertions(normalized);
  if (assertion.isPureQuestion) return "unrelated";
  const assertedMessage = assertion.assertionText;
  const transitions = assertedConcernTransitions(normalized);
  const lastCertain = transitions.findLast((transition) => transition.isCertain);
  if (lastCertain) {
    const laterAmbiguousConflict = transitions.some((transition) => transition.start > lastCertain.start
      && !transition.isCertain && transition.state !== lastCertain.state);
    if (laterAmbiguousConflict) return "unclear";
    return lastCertain.state;
  }
  if (transitions.length > 0) return "unclear";
  if (stillActivePattern.test(assertedMessage)) return "still_active";
  if (isCasualAskTone(normalized)) return "unrelated";
  if (/^(?:hi|hello|hey|yo|thanks|thank you|okay|ok)[!.\s]*$/i.test(normalized)) return "unrelated";
  if (/\?|\b(what|when|where|why|how|should|could|can|is|are|do|does|will)\b/i.test(normalized) && !concernLanguagePattern.test(normalized)) return "unrelated";
  return "unclear";
}

export function assertedRecoveryClauses(message: string) {
  const analysis = analyzeOwnerAssertions(message);
  return analysis.assertionSpans
    .filter((clause) => clause.isCertain && Boolean(supportedRecoveryState(clause.text)))
    .map((clause) => clause.text);
}

export type ConcernTransitionEvidence = {
  evidence: string;
  start: number;
  end: number;
  isCertain: boolean;
  state: Extract<ActiveConcernMessageState, "improved" | "recurrence" | "resolved" | "still_active">;
};

export function assertedConcernTransitions(message: string): ConcernTransitionEvidence[] {
  const transitions: ConcernTransitionEvidence[] = [];
  for (const clause of analyzeOwnerAssertions(message).assertionSpans) {
    if (negatedRecoveryPattern.test(clause.text)) {
      transitions.push({ evidence: clause.text, start: clause.start, end: clause.end, isCertain: clause.isCertain, state: "still_active" });
      continue;
    }
    const candidates: Array<{ index: number; state: ConcernTransitionEvidence["state"] }> = [];
    const recurrenceIndex = firstPatternIndex(returnPattern, clause.text);
    if (recurrenceIndex >= 0) candidates.push({ index: recurrenceIndex, state: "recurrence" });
    const recoveryState = supportedRecoveryState(clause.text, false);
    if (recoveryState) {
      const recoveryIndex = firstRecoveryIndex(clause.text, recoveryState);
      candidates.push({ index: recoveryIndex, state: recoveryState });
    }
    for (const candidate of candidates.sort((left, right) => left.index - right.index)) {
      transitions.push({
        evidence: clause.text,
        start: clause.start + candidate.index,
        end: clause.end,
        isCertain: clause.isCertain,
        state: candidate.state,
      });
    }
  }
  return transitions.sort((left, right) => left.start - right.start);
}

function supportedRecoveryState(message: string, requireCertaintyMarker = true): "improved" | "resolved" | null {
  if (negatedRecoveryPattern.test(message) || requireCertaintyMarker && uncertainRecoveryPattern.test(message)) return null;
  if (resolvedPattern.test(message) || symptomStoppedPattern.test(message) || explicitTerminalRecovery(message)) return "resolved";
  if (improvedPattern.test(message)) return "improved";
  return null;
}

function firstRecoveryIndex(message: string, state: "improved" | "resolved") {
  const patterns = state === "improved"
    ? [improvedPattern]
    : [resolvedPattern, symptomStoppedPattern, explicitCessationPattern, restoredBaselinePattern];
  const indexes = patterns.map((pattern) => firstPatternIndex(pattern, message)).filter((index) => index >= 0);
  return indexes.length ? Math.min(...indexes) : 0;
}

function firstPatternIndex(pattern: RegExp, message: string) {
  const flags = pattern.flags.replace("g", "");
  return new RegExp(pattern.source, flags).exec(message)?.index ?? -1;
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
