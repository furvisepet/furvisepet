import { splitSentencesPreservingFacts } from "./text-segmentation.ts";

const noteReference = /^(?:it|this|that) is [\p{L}][\p{L} '-]{0,80}['\u2019]s (?:note|entry|report)[.!?]*$/iu;
const leadingQuestion = /^(?:and\s+|but\s+)?(?:can|could|did|do|does|has|have|how|is|may|might|should|was|were|what|when|where|which|who|whose|why|will|would)\b/i;
const attributedHistory = /^(?:(?:and|but)\s+)?(?:(?:earlier|previously)\s*,?\s*)?(?:according to\b|in\s+(?:his|her|the)\s+(?:care log|history|memory|note|record|timeline)\b|(?:you|furvise|the assistant)\s+(?:also\s+|previously\s+)?(?:said|mentioned|noted|recorded|remembered|summari[sz]ed|told me)\b|(?:his|her|the)\s+(?:care log|history|memory|note|record|timeline)\s+(?:indicates|lists|mentions|notes|records|says|shows)\b|(?:i|we)\s+(?:asked|mentioned|reported|said|told you)\b)/i;
const subjectAssertion = /\b(?:(?:i|we|he|she|they|it|this|that)\b|(?:my|our)\s+(?:animal|cat|dog|pet)\b|[A-Z][\p{L}'’-]{1,40}\b)\s+(?:(?:always|currently|never|now|often|sometimes|still|usually)\s+|['’](?:d|ll|re|s|ve)\s+)*(?:acting|am|are|ate|back|became|began|better|came|can|cannot|changed|continued|coughed|did|dislikes?|does|drank|felt|flinched|found|gave|getting|got|had|has|hates?|have|hides?|is|keeps?|likes?|limped|made|may|might|needs?|normal|noticed|observed|okay|prefers?|ran|refuses?|returned|saw|seems?|shops?|started|stopped|switched|takes?|thinks?|threw|uses?|vomited|was|weighs?|went|were|will|won't|worse)\b/iu;
const contractedSubjectAssertion = /\b(?:he|she|it|they|we|i)['’](?:d|ll|re|s|ve)\s+(?:acting|back|better|fine|good|normal|okay|stopped|worse)\b/iu;
const issueAssertion = /\b(?:the\s+)?(?:appetite|bleeding|breathing|coughing|diarrhea|dose|hiding|itching|limp|limping|medication|pain|pacing|rash|scratching|stool|swelling|symptoms?|urination|vomiting|weight)\b[\s\S]{0,60}\b(?:began|came back|changed|continued|improved|increased|is|resolved|returned|started|stopped|was|worsened)\b/i;
const statusFragment = /^(?:(?:a little|much|somewhat)\s+)?(?:better|worse)|^(?:still\s+)?(?:breathing\s+(?:deeply|fast|hard)|tired|vomiting)(?:\s+(?:less|more))?|^(?:breathing\s+normally|no\s+(?:further|more)\s+[\p{L}\p{N}'’-]+|seems?\s+(?:somewhat\s+)?better)\b/iu;
const preferenceDirective = /^(?:please\s+)?(?:answer|don't recommend|do not recommend|keep (?:answers?|product suggestions)|remember|reply|respond|use)\b/i;
const ownerPurchaseHabit = /\b(?:i|we)\s+(?:(?:always|normally|often|usually)\s+)?(?:buy|order|shop)\b/i;
const negativeObservation = /\b(?:he|she|they|it|(?:my|our)\s+(?:animal|cat|dog|pet)|[A-Z][\p{L}'’-]{1,40})\s+(?:did(?:n't| not)|does(?:n't| not)|has(?:n't| not)|have(?:n't| not))\s+[\p{L}\p{N}'’-]+\b/iu;
const safetyObservation = /\b(?:collapsed?|cannot breathe|can't breathe|unable to breathe|unconscious|gums? (?:are|look) (?:blue|pale))\b/i;
const hypotheticalClause = /^(?:if|unless|suppose|supposing|assuming|imagine|even if)\b|\b(?:i|we)\s+(?:would|wish)\b/i;
const uncertaintyMarker = /\b(?:apparently|appears?|as far as i can tell|could|i (?:believe|guess|suspect|think)|looks? like|may|maybe|might|not sure|perhaps|possibly|probably|seems?|suspect|uncertain|unsure)\b/i;
const correctionMarker = /\b(?:actually|correction|i meant|instead|not what i said|rather than|that (?:is|was) (?:incorrect|wrong))\b|^\s*no\s*[,;:]/i;
const explicitAssertionRequest = /\b(?:remember|save|note)\s+that\b/i;
const quotedText = /"[^"]*"|“[^”]*”|‘[^’]*’/g;
const clauseBoundary = /\s*[,;]\s+(?:(?:and|but)\s+)?|\s+[\u2013\u2014]\s+|\s+(?:and|but)\s+/gu;

export type OwnerAssertionAnalysis = {
  allClauses: string[];
  clauseSpans: OwnerAssertionSpan[];
  assertionClauses: string[];
  assertionSpans: OwnerAssertionSpan[];
  assertionText: string;
  hasOwnerAssertion: boolean;
  isPureQuestion: boolean;
  hasExplicitCorrection: boolean;
};

export type OwnerAssertionSpan = {
  text: string;
  start: number;
  end: number;
  isAttributed: boolean;
  isCertain: boolean;
  isConditional: boolean;
  isNegated: boolean;
  isQuestion: boolean;
  isUncertain: boolean;
};

/** Server-owned source classification. Model discourse labels are not evidence. */
export function analyzeOwnerAssertions(message: string): OwnerAssertionAnalysis {
  const source = String(message || "").normalize("NFKC").trim();
  let searchFrom = 0;
  const scopedClauses = splitSentencesPreservingFacts(source).flatMap((sentence) => {
    const sentenceStart = source.indexOf(sentence, searchFrom);
    searchFrom = Math.max(searchFrom, sentenceStart + sentence.length);
    return scopeIndependentClauses(sentence, Math.max(0, sentenceStart));
  });
  const assertionSpans = scopedClauses.filter((clause) => {
    if ((clause.isQuestion && !explicitAssertionRequest.test(clause.text))
      || clause.isAttributed
      || clause.isConditional) return false;
    const unquoted = clause.text.replace(quotedText, " ");
    return looksLikeOwnerAssertion(unquoted);
  });
  const clauses = scopedClauses.map((clause) => clause.text);
  const assertionClauses = assertionSpans.map((clause) => clause.text);
  const hasOwnerAssertion = assertionClauses.length > 0;
  return {
    allClauses: clauses,
    clauseSpans: scopedClauses,
    assertionClauses,
    assertionSpans,
    assertionText: assertionClauses.join(" "),
    hasOwnerAssertion,
    isPureQuestion: scopedClauses.length > 0 && !hasOwnerAssertion
      && scopedClauses.every((clause) => clause.isQuestion || clause.isAttributed),
    hasExplicitCorrection: assertionClauses.some((clause) => correctionMarker.test(clause)),
  };
}

export function isOwnerAssertedEvidence(message: string, evidence: string) {
  return ownerEvidenceClauses(message, evidence).length > 0;
}

export function isOwnerCertainEvidence(message: string, evidence: string) {
  const clauses = ownerEvidenceSpans(message, evidence);
  return clauses.length > 0 && clauses.every((clause) => clause.isCertain);
}

function ownerEvidenceClauses(message: string, evidence: string) {
  return ownerEvidenceSpans(message, evidence).map((clause) => clause.text);
}

function ownerEvidenceSpans(message: string, evidence: string) {
  const analysis = analyzeOwnerAssertions(message);
  if (!analysis.hasOwnerAssertion) return [];
  const part = normalize(evidence);
  if (!part) return [];
  const containingClause = analysis.assertionSpans.find((clause) => {
    const whole = normalize(clause.text);
    return whole.includes(part);
  });
  if (containingClause) return [containingClause];
  const evidenceAnalysis = analyzeOwnerAssertions(evidence);
  const whollyAsserted = evidenceAnalysis.allClauses.length > 0
    && evidenceAnalysis.allClauses.length === evidenceAnalysis.assertionClauses.length
    && evidenceAnalysis.assertionClauses.every((evidenceClause) => analysis.assertionClauses.some((sourceClause) =>
      normalize(sourceClause).includes(normalize(evidenceClause))));
  if (!whollyAsserted) return [];
  return analysis.assertionSpans.filter((sourceClause) => evidenceAnalysis.assertionClauses.some((evidenceClause) =>
    normalize(sourceClause.text).includes(normalize(evidenceClause))));
}

/** A statement about existing notes is reference context, not a new event.
 * Keep independent observations and explicit save/correction commands eligible. */
function isHistoricalRecordPremise(value: string): boolean {
  const text = value.trim();
  if (/\b(?:save|log|remember|correction|actually|incorrect|wrong)\b/i.test(text)) return false;
  return /^[\p{L}][\p{L}'\u2019 -]{0,60}\s+(?:had|has|have)\s+(?:(?:a|an|the|some|two|three|several|recorded|saved|care|history|stool|vomiting|weight|food|litter|medication|June|July|August|September|October|November|December|January|February|March|April|May|and|in|from|\d{1,4})\s+){0,12}(?:notes|records|entries|reports)\s*[.!]?$/iu.test(text);
}

export function isQuestionClause(value: string) {
  const text = value.trim().replace(/^[\s"'“‘(\[{]+/u, "");
  const question = text.replace(/^(?:in|from|according to)\s+[^,;.!?\n]{1,80}\b(?:notes?|records?|history|timeline|care log)\s*,\s*/i, "");
  return text.endsWith("?") || leadingQuestion.test(question);
}

function normalize(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function splitIndependentClauses(sentence: string) {
  const clauses: string[] = [];
  let start = 0;
  for (const match of sentence.matchAll(clauseBoundary)) {
    const before = sentence.slice(start, match.index).trim();
    const after = sentence.slice((match.index || 0) + match[0].length);
    const punctuationBoundary = /[,;\u2013\u2014]/u.test(match[0]);
    // An auxiliary followed by a participle can continue the existing subject.
    // Keep it in the parent assertion for predicate-level extraction; treating
    // "has vomited" as an auxiliary-led question would erase competing evidence.
    const inheritedPredicate = /^(?:(?:has|have|had)\s+(?:(?:not|never|already|still)\s+)*(?:[\p{L}]+(?:ed|en)|thrown)\b|(?:is|are|was|were)\s+(?:(?:not|still|currently)\s+)*[\p{L}]+ing\b)/iu.test(after);
    if (inheritedPredicate && !after.trimEnd().endsWith("?") && looksLikeOwnerAssertion(before)) continue;
    if (!startsIndependentClause(after, punctuationBoundary)) continue;
    if (!before || punctuationBoundary && !looksLikePotentialClause(before)) continue;
    clauses.push(before);
    start = (match.index || 0) + match[0].length;
  }
  const remaining = sentence.slice(start).trim();
  if (remaining) clauses.push(remaining);
  return clauses.length ? clauses : [sentence];
}

function scopeIndependentClauses(sentence: string, sentenceStart: number): OwnerAssertionSpan[] {
  const rawClauses = splitIndependentClauses(sentence);
  let localSearchFrom = 0;
  const clauses = rawClauses.map((text) => {
    const localStart = sentence.indexOf(text, localSearchFrom);
    localSearchFrom = Math.max(localSearchFrom, localStart + text.length);
    const isUncertain = uncertaintyMarker.test(text);
    return {
      text,
      start: sentenceStart + Math.max(0, localStart),
      end: sentenceStart + Math.max(0, localStart) + text.length,
      isAttributed: isHistoricalRecordPremise(text)
        || attributedHistory.test(text.trim())
        || noteReference.test(text.trim()),
      isConditional: hypotheticalClause.test(text.trim()),
      isNegated: /\b(?:never|no\s+(?:further|more)|not)\b|n['â€™]t\b/i.test(text),
      isQuestion: isQuestionClause(text),
      isCertain: !isUncertain,
      isUncertain,
    };
  });

  const firstConditional = clauses.findIndex((clause) => /^(?:if|unless|suppose|supposing|assuming|imagine|even if)\b/i.test(clause.text.trim()));
  if (firstConditional >= 0) {
    const consequent = clauses.findIndex((clause, index) => index > firstConditional
      && /^(?:(?:then|but|and)\s+)?(?:(?:i|we|that|this)\s+)?(?:would|will|could)\b/i.test(clause.text.trim()));
    const conditionalEnd = consequent >= 0 ? consequent : clauses.length;
    for (let index = firstConditional; index < conditionalEnd; index += 1) clauses[index].isConditional = true;
  }

  for (let index = 1; index < clauses.length; index += 1) {
    const prior = clauses[index - 1];
    const clause = clauses[index];
    const separator = sentence.slice(prior.end - sentenceStart, clause.start - sentenceStart);
    if (prior.isAttributed && !noteReference.test(prior.text.trim()) && /\band\b/i.test(separator) && !correctionMarker.test(clause.text)) clause.isAttributed = true;
    if (prior.isUncertain && /\band\b/i.test(separator)) {
      clause.isCertain = false;
      clause.isUncertain = true;
    }
  }

  const trailingQualifier = clauses.findLastIndex((clause) => isStandaloneUncertaintyQualifier(clause.text));
  if (trailingQualifier > 0) {
    for (let index = 0; index < trailingQualifier; index += 1) {
      clauses[index].isCertain = false;
      clauses[index].isUncertain = true;
    }
  }
  return clauses;
}

function isStandaloneUncertaintyQualifier(value: string) {
  const text = value.trim().replace(/[.!?]+$/g, "");
  return /^(?:i (?:believe|guess|suspect|think)|maybe|perhaps|possibly|probably|i(?:['â€™]m| am) not (?:completely )?sure|i(?:['â€™]m| am) uncertain)$/i.test(text);
}

function startsIndependentClause(value: string, allowAuxiliaryQuestion: boolean) {
  const text = value.trim().replace(/^(?:then|maybe|perhaps|possibly)\s+/i, "");
  if (/^(?:according\s+to|as\s+(?:you|furvise|the assistant)|you|furvise|the assistant|i|we|he|she|they|it|this|that|how|what|when|where|which|who|whose|why)\b/i.test(text)) return true;
  if (allowAuxiliaryQuestion && /^(?:can|could|did|do|does|has|have|is|may|might|should|was|were|will|would)\b/i.test(text)) return true;
  if (/^(?:appears?|seems?)\b/i.test(text)) return true;
  return /^[A-Z][\p{L}'’-]{1,40}\s+(?:(?:always|currently|never|now|often|sometimes|still|usually)\s+)?(?:acting|are|ate|became|began|changed|continued|did|does|drank|gave|had|has(?:n't)?|hides?|is|likes?|limped|prefers?|started|stopped|takes?|vomited|was|weighs?|were)\b/u.test(text);
}

function looksLikePotentialClause(value: string) {
  const text = value.replace(quotedText, " ").trim();
  return looksLikeOwnerAssertion(text) || hypotheticalClause.test(text) || attributedHistory.test(text);
}

function looksLikeOwnerAssertion(value: string) {
  return subjectAssertion.test(value)
    || contractedSubjectAssertion.test(value)
    || issueAssertion.test(value)
    || statusFragment.test(value.trim())
    || preferenceDirective.test(value.trim())
    || ownerPurchaseHabit.test(value)
    || negativeObservation.test(value)
    || safetyObservation.test(value)
    || correctionMarker.test(value) && /\b(?:not|no longer)\b|\d+(?:\.\d+)?/i.test(value);
}
