import type { ResolvedSafetyState } from "./safety-state.ts";
import { storedEmergencyApplies, replaceStoredPublicationWithEmergency } from "./stored-emergency-publication.ts";
import { clearHistoryReview } from "./history-review-state.ts";
import "server-only";
import type { AskProviderEvent, AskReasoningResult } from "../ai/ask-reasoning.ts";
import type { FurviseLiveContext } from "./types.ts";
import { assertGovernedAskExecutionPlan, type GovernedAskExecutionPlan } from "./ask-execution-plan.ts";
import { reviewHistoricalAnswer } from "./review-history-narrative.ts";
import { reviewTaskCompletion } from "./review-task-completion.ts";
import { validateGeneratedAnswer } from "./validation/validate-answer.ts";
import { reviewedTaskReadyForExecution } from "./answer-assessment.ts";
import { readReviewedHistoryAnswer, recordHistoryReview, historyReviewSignature } from "./history-review-state.ts";

/** Owns the ordered review/validation boundary, not persistence or charging.
 * Reviewers retain their existing eligibility, repair and provider budgets.
 * Only the unchanged governed plan may proceed to the execution stage.
 */
export async function finalizeAskAnswer(input: {
  reasoning: AskReasoningResult;
  safety: ResolvedSafetyState;
  context: FurviseLiveContext;
  requestId: string;
  authoritativePetIds: readonly string[];
  executionPlan: GovernedAskExecutionPlan;
  onProviderEvent?: (event: AskProviderEvent) => void;
}) {
  const { reasoning, safety, context, requestId, executionPlan, onProviderEvent, authoritativePetIds } = input;
  assertGovernedAskExecutionPlan(executionPlan);
  const emergency = storedEmergencyApplies(reasoning.evidenceContract, safety);
  if (emergency) {
    clearHistoryReview(reasoning);
    if (executionPlan.careActions.length || executionPlan.semanticEvents.length || executionPlan.learnings.length
      || !authoritativePetIds.includes(executionPlan.petId)) throw new Error("ASK_EMERGENCY_EXECUTION_PLAN_REJECTED");
  } else await reviewHistoricalAnswer({ result: reasoning, onProviderEvent, executionPlan });
  assertGovernedAskExecutionPlan(executionPlan);
  const validate = (candidate: AskReasoningResult) => validateGeneratedAnswer(
    candidate, context, reasoning.intelligenceSafety.level, authoritativePetIds, safety,
  );
  let validation = validate(reasoning);
  if (!validation.valid) throw Object.assign(
    new Error(`FURVISE_ANSWER_VALIDATION_FAILED:${validation.errors.join(",")}`),
    { code: `ASK_ANSWER_${validation.errors[0] || "VALIDATION_FAILED"}`.toUpperCase() },
  );
  validation = await reviewTaskCompletion({ validation, resolvedSafety: safety, context, requestId, onProviderEvent, validate,
    pendingCareEvents: executionPlan.semanticEvents,
    pendingCareActions: executionPlan.careActions,
  });
  assertGovernedAskExecutionPlan(executionPlan);
  // Safe partial prose is not permission to commit a failed mixed request.
  // A reviewed ready-to-execute task still needs actual persistence receipts.
  const historyReceipt = readReviewedHistoryAnswer(validation.response);
  const suppressWrites = validation.assessment?.checks.taskCompletion === "failed"
    && !historyReceipt
    && !reviewedTaskReadyForExecution(validation.completion || [], validation.assessment.checks);
  if (emergency) replaceStoredPublicationWithEmergency(reasoning, safety);
  Object.assign(reasoning, validation.response);
  if (historyReceipt) recordHistoryReview(reasoning, { ...historyReceipt, signature: historyReviewSignature(reasoning) });
  return { validation, suppressWrites };
}
