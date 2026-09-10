import type { AiOperationAdmission } from "./usage-guard/admission.ts";
type ErrorLogger = (stage: string, error: unknown, context: Record<string, unknown>, status: number) => void;
/** Admission bookkeeping follows durable persistence. It must never erase a saved answer. */
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
  requestId,
  response,
}: {
  admission: AiOperationAdmission | null;
  alreadyFinalized: boolean;
  requestId: string;
  response: Response;
}) {
  if (!admission || alreadyFinalized) return;
  if (!response.ok) {
    await failAiAdmission(admission, new Error("ASK_ANSWER_NOT_PERSISTED"), false, requestId);
    return;
  }
  try {
    await admission.complete();
  } catch (error) {
    // The answer is already durable. A guard bookkeeping failure must not replace it.
    logAskServerError("ai_operation_completion", error, { requestId }, 200);
  }
}

return { failAiAdmission, finalizeAiAdmissionAfterPersistence };
}
