import { createAnswerAssessment } from "../intelligence/answer-assessment.ts";
import { isReadOnlyResult } from "./core.mjs";
/** Server-validated read-only output, not model-authored completion flags. */
export function assessReadOnlyPublication(result: unknown, publication: {
 limited: boolean; response: { citationProof?: string; readOnlyEvidence?: boolean };
}) {
 if (!isReadOnlyResult(result)) throw new Error("ASK_READ_RESULT_INVALID");
 const reviewed = result as {
  answer: { replyType: string; limited: boolean; calculations: Array<{ available?: boolean }> };
  sources: Array<{ kind: string }>;
  coverage: Array<{ scope: { kind: string }; unmet: string[]; hasMore: boolean; hasPrevious: boolean; truncated: boolean }>;
  requestedPetContext?: boolean;
 };
 const historyRequested = reviewed.coverage.some(row => row.scope.kind === "history");
 const historySupported = !historyRequested || reviewed.sources.some(row => row.kind === "history");
 const contextSupported = !reviewed.requestedPetContext || reviewed.sources.some(row => row.kind === "profile" || row.kind === "history");
 const evidenceBound = reviewed.sources.length === 0 || Boolean(publication.response.citationProof && publication.response.readOnlyEvidence);
 const evidenceSupported = historySupported && contextSupported && evidenceBound;
 const coverageBounded = reviewed.coverage.every(row => !row.unmet.length && !row.hasMore && !row.hasPrevious && !row.truncated);
 const calculationsAvailable = reviewed.answer.calculations.every(row => row.available !== false);
 const complete = reviewed.answer.replyType === "answer" && !reviewed.answer.limited && !publication.limited
  && evidenceSupported && coverageBounded && calculationsAvailable;
 return createAnswerAssessment({
  body: publication.response,
  evidence: reviewed.sources.map(source => ({ kind: source.kind })),
  checks: {
   structuralValidity: "passed",
   evidenceSupport: evidenceSupported ? (reviewed.sources.length ? "passed" : "not_applicable") : "not_evaluated",
   subjectDateCorrectness: reviewed.sources.length ? "passed" : "not_applicable",
   calculationCorrectness: reviewed.answer.calculations.length ? (calculationsAvailable ? "passed" : "not_evaluated") : "not_applicable",
   taskCompletion: complete ? "passed" : "not_evaluated",
  },
  reasons: complete ? [] : ["read_only_answer_incomplete"],
 });
}