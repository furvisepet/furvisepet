import type { AnswerAssessment } from "../intelligence/answer-assessment.ts";
import type { AiOperationAdmission } from "./usage-guard/admission.ts";

type ErrorLogger = (stage: string, error: unknown, context: Record<string, unknown>, status: number) => void;

/** Clarification is part of completing the owner's request, not a paid answer. */
export function shouldReleaseAskCredit(input: { responseMode: string; readOnlyRecall: boolean; assessment: AnswerAssessment; sourceMessage?: string; petName?: string | null } | null): boolean {
  // A name-only subject selection is not a new chargeable question, even if
  // the provider incorrectly labels its acknowledgment a complete answer.
  const normalize = (value: string) => value.normalize("NFKC").trim().replace(/[.!?]+$/, "").trim().toLowerCase();
  const subjectSelectionOnly = Boolean(input?.petName?.trim() && input.sourceMessage
    && normalize(input.sourceMessage) === normalize(input.petName));
  return Boolean(input && (subjectSelectionOnly || input.responseMode === "clarification"
    || ((input.readOnlyRecall || input.assessment.checks.taskCompletion === "failed") && input.assessment.outcome !== "complete")));
}

/** Admission records assessed answer success, separately from delivery and billing. */
export function createAskAdmissionSettlement(logAskServerError: ErrorLogger) {
  async function failAiAdmission(
    admission: AiOperationAdmission | null,
    error: unknown,
    alreadyFinalized: boolean,
    requestId: string,
  ) {
    if (!admission || alreadyFinalized) return;
    try {
      await admission.fail(error);
    } catch (admissionError) {
      logAskServerError("ai_operation_failure_recording", admissionError, { requestId }, 200);
    }
  }

  async function finalizeAiAdmissionAfterPersistence({
    admission,
    alreadyFinalized,
    assessment,
    requestId,
    response,
  }: {
    admission: AiOperationAdmission | null;
    alreadyFinalized: boolean;
    // Only the live server-derived assessment belongs here, never response JSON.
    assessment: AnswerAssessment | null;
    requestId: string;
    response: Response;
  }) {
    if (!admission || alreadyFinalized) return;
    const failure = !response.ok ? "ASK_ANSWER_NOT_PERSISTED"
      : assessment?.outcome === "complete" ? null
      : assessment?.outcome === "limited" ? "ASK_ANSWER_LIMITED"
      : assessment?.outcome === "failed" ? "ASK_ANSWER_FAILED"
      : "ASK_ANSWER_UNASSESSED";
    if (failure) {
      await failAiAdmission(admission, new Error(failure), false, requestId);
      return;
    }
    try {
      await admission.complete();
    } catch (error) {
      // The answer is already durable. Bookkeeping must not replace it.
      logAskServerError("ai_operation_completion", error, { requestId }, 200);
    }
  }

  return { failAiAdmission, finalizeAiAdmissionAfterPersistence };
}
