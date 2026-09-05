import { splitSentencesPreservingFacts } from "./text-segmentation.ts";

const leadingQuestion = /^(?:and\s+|but\s+)?(?:can|could|did|do|does|has|have|how|is|may|might|should|was|were|what|when|where|which|who|why|will|would)\b/i;
const attributedHistory = /^(?:(?:earlier|previously)\s*,?\s*)?(?:according to\b|in\s+(?:his|her|the)\s+(?:care log|history|memory|note|record|timeline)\b|(?:you|furvise|the assistant)\s+(?:also\s+|previously\s+)?(?:said|mentioned|noted|recorded|remembered|summari[sz]ed|told me)\b|(?:his|her|the)\s+(?:care log|history|memory|note|record|timeline)\s+(?:indicates|lists|mentions|notes|records|says|shows)\b|(?:i|we)\s+(?:asked|mentioned|reported|said|told you)\b)/i;
const subjectAssertion = /\b(?:(?:i|we|he|she|they|it|this|that)\b|(?:my|our)\s+(?:animal|cat|dog|pet)\b|[A-Z][\p{L}'’-]{1,40}\b)\s+(?:(?:always|currently|never|now|often|sometimes|still|usually)\s+|['’](?:d|ll|re|s|ve)\s+)*(?:acting|am|are|ate|back|became|began|better|can|cannot|changed|continued|coughed|did|dislikes?|does|drank|felt|flinched|found|gave|getting|got|had|has|hates?|have|hides?|is|keeps?|likes?|limped|made|may|might|needs?|normal|noticed|observed|okay|prefers?|ran|refuses?|saw|seems?|shops?|started|stopped|switched|takes?|thinks?|threw|uses?|vomited|was|weighs?|went|were|will|won't|worse)\b/iu;
const issueAssertion = /\b(?:the\s+)?(?:appetite|bleeding|breathing|coughing|diarrhea|dose|hiding|itching|limp|limping|medication|pain|pacing|rash|scratching|stool|swelling|symptoms?|urination|vomiting|weight)\b[\s\S]{0,60}\b(?:began|came back|changed|continued|improved|increased|is|resolved|returned|started|stopped|was|worsened)\b/i;
const statusFragment = /^(?:(?:a little|much|somewhat)\s+)?(?:better|worse)|^(?:still\s+)?(?:tired|vomiting)(?:\s+(?:less|more))?|^(?:breathing\s+normally|seems?\s+(?:somewhat\s+)?better)\b/i;
const preferenceDirective = /^(?:please\s+)?(?:answer|don't recommend|do not recommend|keep (?:answers?|product suggestions)|remember|reply|respond|use)\b/i;
const ownerPurchaseHabit = /\b(?:i|we)\s+(?:(?:always|normally|often|usually)\s+)?(?:buy|order|shop)\b/i;
const negativeObservation = /\b(?:he|she|they|it|(?:my|our)\s+(?:animal|cat|dog|pet)|[A-Z][\p{L}'’-]{1,40})\s+(?:did(?:n't| not)|does(?:n't| not)|has(?:n't| not)|have(?:n't| not))\s+[\p{L}\p{N}'’-]+\b/iu;
const correctionMarker = /\b(?:actually|correction|i meant|instead|not what i said|rather than|that (?:is|was) (?:incorrect|wrong))\b|^\s*no\s*[,;:]/i;
const explicitAssertionRequest = /\b(?:remember|save|note)\s+that\b/i;
const quotedText = /"[^"]*"|“[^”]*”|‘[^’]*’/g;

export type OwnerAssertionAnalysis = {
  assertionClauses: string[];
  assertionText: string;
  hasOwnerAssertion: boolean;
  isPureQuestion: boolean;
  hasExplicitCorrection: boolean;
};

/** Server-owned source classification. Model discourse labels are not evidence. */
export function analyzeOwnerAssertions(message: string): OwnerAssertionAnalysis {
  const source = String(message || "").normalize("NFKC").trim();
  const clauses = splitSentencesPreservingFacts(source);
  const assertionClauses = clauses.filter((clause) => {
    if ((isQuestionClause(clause) && !explicitAssertionRequest.test(clause)) || attributedHistory.test(clause.trim())) return false;
    const unquoted = clause.replace(quotedText, " ");
    return subjectAssertion.test(unquoted)
      || issueAssertion.test(unquoted)
      || statusFragment.test(unquoted.trim())
      || preferenceDirective.test(unquoted.trim())
      || ownerPurchaseHabit.test(unquoted)
      || negativeObservation.test(unquoted)
      || correctionMarker.test(unquoted) && /\b(?:not|no longer)\b|\d+(?:\.\d+)?/i.test(unquoted);
  });
  const hasOwnerAssertion = assertionClauses.length > 0;
  return {
    assertionClauses,
    assertionText: assertionClauses.join(" "),
    hasOwnerAssertion,
    isPureQuestion: clauses.length > 0 && !hasOwnerAssertion && clauses.every((clause) => isQuestionClause(clause) || attributedHistory.test(clause.trim())),
    hasExplicitCorrection: assertionClauses.some((clause) => correctionMarker.test(clause)),
  };
}

export function isOwnerAssertedEvidence(message: string, evidence: string) {
  const analysis = analyzeOwnerAssertions(message);
  if (!analysis.hasOwnerAssertion) return false;
  const part = normalize(evidence);
  if (!part) return false;
  return analysis.assertionClauses.some((clause) => {
    const whole = normalize(clause);
    return whole.includes(part) || part.includes(whole);
  });
}

export function isQuestionClause(value: string) {
  const text = value.trim().replace(/^[\s"'“‘(\[{]+/u, "");
  return text.endsWith("?") || leadingQuestion.test(text);
}

function normalize(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
