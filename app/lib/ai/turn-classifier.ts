import { isCasualAskTone } from "../ask-experience.ts";
import { analyzeOwnerAssertions, type OwnerAssertionSpan } from "./owner-assertion.ts";
import { decideConcernTransitionState } from "./concern-event-order.ts";

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
  if (transitions.length > 0) return decideConcernTransitionState(transitions);
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
  inheritedTopicEvidence?: string;
  start: number;
  end: number;
  isCertain: boolean;
  state: Extract<ActiveConcernMessageState, "improved" | "recurrence" | "resolved" | "still_active">;
};

export function assertedConcernTransitions(message: string): ConcernTransitionEvidence[] {
  const transitions: ConcernTransitionEvidence[] = [];
  for (const clause of analyzeOwnerAssertions(message).assertionSpans.flatMap(concernPredicateSpans)) {
    if (clause.inheritedNegation || negatedRecoveryPattern.test(clause.text)) {
      transitions.push({ evidence: clause.text, inheritedTopicEvidence: clause.inheritedTopicEvidence, start: clause.start, end: clause.end, isCertain: clause.isCertain, state: "still_active" });
      continue;
    }
    const candidates: Array<{ index: number; state: ConcernTransitionEvidence["state"] }> = [];
    const recurrenceSurface = clause.text.replace(/\b(?:is back|returned|came back)\s+to\s+(?:normal|baseline)\b/gi, (text) => " ".repeat(text.length));
    const recurrenceIndex = firstPatternIndex(returnPattern, recurrenceSurface);
    if (recurrenceIndex >= 0) candidates.push({ index: recurrenceIndex, state: "recurrence" });
    const recoveryState = supportedRecoveryState(clause.text, false)
      || (clause.inheritedTopicEvidence && /^(?:has\s+)?(?:stopped|ceased|resolved)(?:\s+(?:now|today|yesterday|this|last|after|on|in)\b|[.!]|$)/i.test(clause.text) ? "resolved" : null);
    if (recoveryState) {
      const recoveryIndex = firstRecoveryIndex(clause.text, recoveryState);
      candidates.push({ index: recoveryIndex, state: recoveryState });
    }
    // Symptom presence competes with cessation even without "still"/"again".
    if (!recoveryState && recurrenceIndex < 0 && /\b(?:vomit(?:ed|ing|s)?|threw up|throwing up|hid(?:e|es|ing)?|bleed(?:ing|s)?|bled|cough(?:ed|ing|s)?|limp(?:ed|ing|s)?|itch(?:ed|ing|es)?|scratch(?:ed|ing|es)?|diarrhea|breathing (?:hard|fast|deeply))\b/i.test(clause.text)) {
      candidates.push({ index: 0, state: "still_active" });
    }
    if (recoveryState && /\b(?:is|are|was|were|keeps?)\s+(?:still\s+)?(?:vomiting|throwing up|hiding|bleeding|coughing|limping|itching|breathing (?:hard|fast|deeply))\b/i.test(clause.text)) {
      candidates.push({ index: 0, state: "still_active" });
    }
    for (const candidate of candidates.sort((left, right) => left.index - right.index)) {
      transitions.push({
        evidence: clause.text,
        inheritedTopicEvidence: clause.inheritedTopicEvidence,
        start: clause.start,
        end: clause.end,
        isCertain: clause.isCertain,
        state: candidate.state,
      });
    }
  }
  return transitions.sort((left, right) => left.start - right.start);
}

/** Coordinated predicates inherit the parent's subject and evidence scope, not
 * its temporal modifiers. Keep extractive offsets; do not manufacture sentences
 * by prepending the animal's name to a model-selected substring. */
function concernPredicateSpans(parent: OwnerAssertionSpan): Array<OwnerAssertionSpan & { inheritedTopicEvidence?: string; inheritedNegation?: boolean }> {
  const boundaries = /\s*(?:[,;]\s*(?:(?:and|but|then)\s+)?|\b(?:and|but|then)\s+)/gi;
  const predicateStart = /^(?:(?:still|also|then|today|yesterday)\s+)*(?:am|are|is|was|were|has|have|had|did|does|keeps?|started|stopped|ceased|resolved|returned|came|threw|vomit(?:ed|ing|s)?|cough(?:ed|ing|s)?|bleed(?:ing|s)?|bled|limp(?:ed|ing|s)?|hid|hiding|itch(?:ed|ing|es)?|scratch(?:ed|ing|es)?)\b/i;
  const ranges: Array<[number, number]> = [];
  let start = 0;
  for (const match of parent.text.matchAll(boundaries)) {
    const next = match.index + match[0].length;
    if (!predicateStart.test(parent.text.slice(next))) continue;
    ranges.push([start, match.index]);
    start = next;
  }
  ranges.push([start, parent.text.length]);
  let inheritedTopicEvidence: string | undefined;
  let inheritedNegation = false;
  let priorEnd = 0;
  return ranges.flatMap(([from, to]) => {
    const raw = parent.text.slice(from, to);
    const text = raw.trim();
    if (!text) return [];
    const connective = parent.text.slice(priorEnd, from);
    inheritedNegation = /\band\b/i.test(connective)
      && !/^(?:is|are|was|were|has|have|had|do|does|did)\b/i.test(text)
      && (inheritedNegation || /\b(?:not|never)\b|n['’]t\b/i.test(inheritedTopicEvidence || ""));
    const result = { ...parent, text, start: parent.start + from + raw.indexOf(text), end: parent.start + to - (raw.length - raw.trimEnd().length), inheritedTopicEvidence, inheritedNegation };
    inheritedTopicEvidence = text;
    priorEnd = to;
    return [result];
  });
}

function supportedRecoveryState(message: string, requireCertaintyMarker = true): "improved" | "resolved" | null {
  if (negatedRecoveryPattern.test(message) || requireCertaintyMarker && uncertainRecoveryPattern.test(message)) return null;
  if (resolvedPattern.test(message) || symptomStoppedPattern.test(message) || explicitTerminalRecovery(message)) return "resolved";
  if (/\b(?:is|are|acting)\s+(?:fully\s+|completely\s+)?(?:normal|fine|well|okay|ok)(?:\s+(?:again|now))?\b/i.test(message)) return "resolved";
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
