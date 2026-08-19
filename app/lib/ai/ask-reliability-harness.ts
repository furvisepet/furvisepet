import { AskTurnLifecycle, ASK_SUBSYSTEM_CRITICALITY, type AskCreditState, type AskSubsystem } from "./ask-turn-model.ts";

export const ASK_FAILURE_INJECTION_POINTS = [
  "optional_context_query",
  "critical_ownership_query",
  "subject_extraction",
  "provider_timeout",
  "provider_400",
  "malformed_provider_json",
  "invalid_auxiliary_field",
  "quality_normalization",
  "repair_timeout",
  "credit_reservation",
  "credit_disposition",
  "credit_completion",
  "credit_release",
  "assistant_persistence",
  "history_proposal",
  "history_persistence",
  "memory_persistence",
  "semantic_persistence",
  "application_action_preparation",
  "suggestion_generation",
] as const;

export type AskFailureInjectionPoint = (typeof ASK_FAILURE_INJECTION_POINTS)[number];
export type AskHarnessResult = {
  success: boolean;
  publicError: "PET_UNAVAILABLE" | "TEMPORARY_PROVIDER_FAILURE" | "TEMPORARY_DATABASE_FAILURE" | "ANSWER_RETRYABLE" | null;
  creditState: AskCreditState;
  userMessageCount: number;
  assistantMessageCount: number;
  providerCallCount: number;
  retryable: boolean;
  optionalFailures: AskSubsystem[];
  finalStage: ReturnType<AskTurnLifecycle["snapshot"]>["finalStage"];
};

const optionalPointComponent: Partial<Record<AskFailureInjectionPoint, AskSubsystem>> = {
  optional_context_query: "context_semantic_state",
  subject_extraction: "subject_extraction",
  invalid_auxiliary_field: "suggested_questions",
  credit_completion: "credit_completion",
  history_proposal: "history_proposal",
  history_persistence: "history_persistence",
  memory_persistence: "memory_persistence",
  semantic_persistence: "semantic_persistence",
  application_action_preparation: "application_action_preparation",
  suggestion_generation: "suggested_questions",
};

export function runAskFailureInjection(point: AskFailureInjectionPoint): AskHarnessResult {
  const turn = new AskTurnLifecycle("10000000-0000-4000-8000-000000000001", `20000000-0000-4000-8000-${point.padEnd(12, "0").slice(0, 12)}`);
  turn.transition("VALIDATED").transition("ROUTED");
  if (point === "critical_ownership_query") return failed(turn, "PET_UNAVAILABLE", "pet_ownership", false, "not_reserved", 0, 0);
  turn.transition("CONTEXT_READY");
  if (point === "credit_reservation") return failed(turn, "TEMPORARY_DATABASE_FAILURE", "credit_reservation", true, "not_reserved", 0, 0);
  turn.transition("AI_ADMITTED").transition("GENERATING");

  if (["provider_timeout", "provider_400", "malformed_provider_json", "repair_timeout"].includes(point)) {
    const calls = point === "malformed_provider_json" || point === "repair_timeout" ? 2 : 1;
    for (let index = 0; index < calls; index += 1) turn.providerCall();
    const creditState: AskCreditState = point === "repair_timeout" ? "released" : "released";
    return failed(turn, "TEMPORARY_PROVIDER_FAILURE", point, true, creditState, 0, calls);
  }
  if (point === "credit_release") {
    turn.providerCall().credit("release_pending");
    return failed(turn, "TEMPORARY_PROVIDER_FAILURE", point, true, "release_pending", 0, 1);
  }

  turn.providerCall().credit("reserved").transition("ANSWER_VALIDATED");
  if (point === "assistant_persistence") return failed(turn, "TEMPORARY_DATABASE_FAILURE", "assistant_persistence", true, "released", 0, 1);
  turn.transition("ANSWER_PERSISTED");
  if (point === "credit_disposition") return failed(turn, "TEMPORARY_DATABASE_FAILURE", "credit_disposition", true, "reserved", 1, 1);
  turn.settlement("complete", "pending");
  const optional = optionalPointComponent[point];
  if (optional) turn.optionalFailure(optional);
  if (point === "credit_completion") turn.credit("completion_pending");
  else turn.credit("completed").settlement("complete", "reconciled");
  turn.transition("COMPLETED");
  const trace = turn.snapshot();
  return {
    success: true,
    publicError: null,
    creditState: trace.creditState,
    userMessageCount: 1,
    assistantMessageCount: 1,
    providerCallCount: trace.providerCallCount,
    retryable: false,
    optionalFailures: trace.optionalFailures,
    finalStage: trace.finalStage,
  };
}

export function assertAskCriticalityRegistry() {
  return Object.entries(ASK_SUBSYSTEM_CRITICALITY).every(([component, criticality]) =>
    component.length > 0 && (criticality === "ANSWER_CRITICAL" || criticality === "OPTIONAL"));
}

function failed(
  turn: AskTurnLifecycle,
  publicError: NonNullable<AskHarnessResult["publicError"]>,
  internal: string,
  retryable: boolean,
  creditState: AskCreditState,
  assistantMessageCount: number,
  providerCallCount: number,
): AskHarnessResult {
  turn.credit(creditState).fail(internal, retryable);
  const trace = turn.snapshot();
  return {
    success: false,
    publicError,
    creditState,
    userMessageCount: 1,
    assistantMessageCount,
    providerCallCount,
    retryable,
    optionalFailures: trace.optionalFailures,
    finalStage: trace.finalStage,
  };
}
