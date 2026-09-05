import { splitSentencesPreservingFacts } from "./text-segmentation.ts";

const leadingQuestion = /^(?:and\s+|but\s+)?(?:can|could|did|do|does|has|have|how|is|may|might|should|was|were|what|when|where|which|who|why|will|would)\b/i;
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
const uncertaintyMarker = /\b(?:could|i think|may|maybe|might|not sure|perhaps|possibly|seems?|suspect|uncertain|unsure)\b/i;
const correctionMarker = /\b(?:actually|correction|i meant|instead|not what i said|rather than|that (?:is|was) (?:incorrect|wrong))\b|^\s*no\s*[,;:]/i;
const explicitAssertionRequest = /\b(?:remember|save|note)\s+that\b/i;
const quotedText = /"[^"]*"|“[^”]*”|‘[^’]*’/g;
const clauseBoundary = /\s*[,;]\s+(?:(?:and|but)\s+)?|\s+[\u2013\u2014]\s+|\s+(?:and|but)\s+/gu;

export type OwnerAssertionAnalysis = {
  allClauses: string[];
  assertionClauses: string[];
  assertionText: string;
  hasOwnerAssertion: boolean;
  isPureQuestion: boolean;
  hasExplicitCorrection: boolean;
};

/** Server-owned source classification. Model discourse labels are not evidence. */
export function analyzeOwnerAssertions(message: string): OwnerAssertionAnalysis {
  const source = String(message || "").normalize("NFKC").trim();
  const clauses = splitSentencesPreservingFacts(source).flatMap(splitIndependentClauses);
  const assertionClauses = clauses.filter((clause) => {
    if ((isQuestionClause(clause) && !explicitAssertionRequest.test(clause))
      || attributedHistory.test(clause.trim())
      || hypotheticalClause.test(clause.trim())) return false;
    const unquoted = clause.replace(quotedText, " ");
    return looksLikeOwnerAssertion(unquoted);
  });
  const hasOwnerAssertion = assertionClauses.length > 0;
  return {
    allClauses: clauses,
    assertionClauses,
    assertionText: assertionClauses.join(" "),
    hasOwnerAssertion,
    isPureQuestion: clauses.length > 0 && !hasOwnerAssertion && clauses.every((clause) => isQuestionClause(clause) || attributedHistory.test(clause.trim())),
    hasExplicitCorrection: assertionClauses.some((clause) => correctionMarker.test(clause)),
  };
}

export function isOwnerAssertedEvidence(message: string, evidence: string) {
  return ownerEvidenceClauses(message, evidence).length > 0;
}

export function isOwnerCertainEvidence(message: string, evidence: string) {
  const clauses = ownerEvidenceClauses(message, evidence);
  return clauses.length > 0 && clauses.every((clause) => !uncertaintyMarker.test(clause));
}

function ownerEvidenceClauses(message: string, evidence: string) {
  const analysis = analyzeOwnerAssertions(message);
  if (!analysis.hasOwnerAssertion) return [];
  const part = normalize(evidence);
  if (!part) return [];
  const containingClause = analysis.assertionClauses.find((clause) => {
    const whole = normalize(clause);
    return whole.includes(part);
  });
  if (containingClause) return [containingClause];
  const evidenceAnalysis = analyzeOwnerAssertions(evidence);
  const whollyAsserted = evidenceAnalysis.allClauses.length > 0
    && evidenceAnalysis.allClauses.length === evidenceAnalysis.assertionClauses.length
    && evidenceAnalysis.assertionClauses.every((evidenceClause) => analysis.assertionClauses.some((sourceClause) =>
      normalize(sourceClause).includes(normalize(evidenceClause))));
  if (!whollyAsserted) return [];
  return analysis.assertionClauses.filter((sourceClause) => evidenceAnalysis.assertionClauses.some((evidenceClause) =>
    normalize(sourceClause).includes(normalize(evidenceClause))));
}

export function isQuestionClause(value: string) {
  const text = value.trim().replace(/^[\s"'“‘(\[{]+/u, "");
  return text.endsWith("?") || leadingQuestion.test(text);
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
    if (!startsIndependentClause(after, punctuationBoundary)) continue;
    if (!before || punctuationBoundary && !looksLikePotentialClause(before)) continue;
    clauses.push(before);
    start = (match.index || 0) + match[0].length;
  }
  const remaining = sentence.slice(start).trim();
  if (remaining) clauses.push(remaining);
  return clauses.length ? clauses : [sentence];
}

function startsIndependentClause(value: string, allowAuxiliaryQuestion: boolean) {
  const text = value.trim();
  if (/^(?:according\s+to|as\s+(?:you|furvise|the assistant)|you|furvise|the assistant|i|we|he|she|they|it|this|that|how|what|when|where|which|who|why)\b/i.test(text)) return true;
  if (allowAuxiliaryQuestion && /^(?:can|could|did|do|does|has|have|is|may|might|should|was|were|will|would)\b/i.test(text)) return true;
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
