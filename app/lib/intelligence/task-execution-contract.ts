import type { AskRequestContract } from "./ask-request-contract.ts";
import { reviewedTaskReadyForExecution, type AnswerAssessment } from "./answer-assessment.ts";
import { deriveAskTaskOutcome } from "../ai/ask-turn-model.ts";

type Completion = { index: number; status: string };
type ActionReceipt = { mutationClass: string; explicitIntent: boolean; status: string };
type CareReceipt = { status: string; careEntryIds: readonly string[] };

/** Only the already bound Brain request establishes a requested effect.
 * Text, receipt inquiries and presentation examples have no input here. */
export function typedTaskRequirements(request: AskRequestContract | null | undefined) {
  const minimumCareEntries = request?.appendJob?.items.length || 0;
  const mutationRequested = Boolean(request && (request.appendJob || request.writeJob
    || request.removeJob || request.fieldMutationJob || request.stateTransitionJob
    || request.lifecyclePlan?.transition || request.lifecyclePlan?.pendingDisposition === "cancel"));
  return { mutationRequested, careWriteRequired: minimumCareEntries > 0, minimumCareEntries };
}

/** Inputs are live server review and execution results, never model-authored
 * success flags or persisted presentation JSON. This contract has no vocabulary
 * for particular questions, symptoms, pets, or ways of phrasing a request. */
export function assessTaskExecution(input: {
  assessment: AnswerAssessment | null;
  completion: readonly Completion[];
  responseMode: string | null;
  actions: readonly ActionReceipt[];
  careWriteRequired: boolean;
  mutationRequested?: boolean;
  minimumCareEntries?: number;
  careReceipt: CareReceipt;
  careExecutionFailed?: boolean;
}) {
  const requested = input.actions.filter(action => action.mutationClass === "mutation" && action.explicitIntent);
  const minimum = input.minimumCareEntries ?? 1;
  const careComplete = input.careReceipt.status === "persisted"
    && Number.isInteger(minimum) && minimum > 0
    && new Set(input.careReceipt.careEntryIds.filter(id => id.trim())).size >= minimum;
  const careFailed = input.careWriteRequired && (input.careExecutionFailed || input.careReceipt.status === "failed");
  const mutationOutcome = requested.some(action => action.status === "failed") || careFailed ? "failed"
    : requested.some(action => action.status !== "succeeded") || input.careWriteRequired && !careComplete
      || input.mutationRequested && !requested.length && !careComplete ? "pending"
    : requested.length || input.careWriteRequired ? "applied" : "not_requested";
  const answerOutcome = input.assessment?.outcome || "not_assessed";
  const readyForExecution = reviewedTaskReadyForExecution(input.completion, input.assessment?.checks);
  const taskOutcome = deriveAskTaskOutcome(answerOutcome, mutationOutcome, readyForExecution);
  const clarification = input.responseMode === "clarification"
    || input.completion.some(item => item.status === "needs_information");
  // Completion is necessary but is not alone a pricing policy. Clarification
  // remains free even if another layer incorrectly marks it as answered.
  const creditDisposition = taskOutcome === "complete" && !clarification ? "complete" : "release";
  return { version: "ask-task-execution.v1" as const, answerOutcome, mutationOutcome, taskOutcome,
    readyForExecution, creditDisposition,
    reason: clarification ? "clarification" : mutationOutcome === "failed" ? "execution_failed"
      : mutationOutcome === "pending" ? "execution_pending" : taskOutcome !== "complete" ? "answer_incomplete" : "task_fulfilled" } as const;
}
