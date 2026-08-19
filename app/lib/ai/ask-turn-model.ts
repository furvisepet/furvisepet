import { createHash } from "node:crypto";

export const ASK_TURN_STAGES = [
  "RECEIVED",
  "VALIDATED",
  "ROUTED",
  "CONTEXT_READY",
  "AI_ADMITTED",
  "GENERATING",
  "ANSWER_VALIDATED",
  "ANSWER_PERSISTED",
  "COMPLETED",
] as const;

export type AskTurnStage = (typeof ASK_TURN_STAGES)[number];
export type AskTurnFailureStage = "FAILED_RETRYABLE" | "FAILED_FINAL";
export type AskTurnState = AskTurnStage | AskTurnFailureStage;
export type AskExecutionMode = "deterministic" | "ai";
export type AskRouteType = "emergency" | "lifecycle" | "application_action" | "preference" | "acknowledgement" | "pet_care" | "clarification";
export type AskCreditState = "not_required" | "not_reserved" | "reserved" | "completed" | "completion_pending" | "released" | "release_pending" | "limit_reached";
export type AskCreditDisposition = "complete" | "release" | "missing";
export type AskSettlementState = "not_required" | "pending" | "reconciled" | "conflict";

export type AskSubsystem =
  | "authentication"
  | "request_validation"
  | "pet_ownership"
  | "conversation_ownership"
  | "answer_provider"
  | "assistant_persistence"
  | "credit_reservation"
  | "credit_disposition"
  | "context_care_history"
  | "context_memory"
  | "context_product_feedback"
  | "context_semantic_state"
  | "subject_extraction"
  | "suggested_questions"
  | "history_proposal"
  | "history_persistence"
  | "memory_persistence"
  | "semantic_persistence"
  | "application_action_preparation"
  | "conversation_metadata"
  | "title_improvement"
  | "credit_completion"
  | "credit_release";

export type AskFailureCriticality = "ANSWER_CRITICAL" | "OPTIONAL";

export const ASK_SUBSYSTEM_CRITICALITY: Readonly<Record<AskSubsystem, AskFailureCriticality>> = {
  authentication: "ANSWER_CRITICAL",
  request_validation: "ANSWER_CRITICAL",
  pet_ownership: "ANSWER_CRITICAL",
  conversation_ownership: "ANSWER_CRITICAL",
  answer_provider: "ANSWER_CRITICAL",
  assistant_persistence: "ANSWER_CRITICAL",
  credit_reservation: "ANSWER_CRITICAL",
  credit_disposition: "ANSWER_CRITICAL",
  context_care_history: "OPTIONAL",
  context_memory: "OPTIONAL",
  context_product_feedback: "OPTIONAL",
  context_semantic_state: "OPTIONAL",
  subject_extraction: "OPTIONAL",
  suggested_questions: "OPTIONAL",
  history_proposal: "OPTIONAL",
  history_persistence: "OPTIONAL",
  memory_persistence: "OPTIONAL",
  semantic_persistence: "OPTIONAL",
  application_action_preparation: "OPTIONAL",
  conversation_metadata: "OPTIONAL",
  title_improvement: "OPTIONAL",
  credit_completion: "OPTIONAL",
  credit_release: "OPTIONAL",
};

export type AskTurnTrace = {
  logicalTurnId: string;
  attemptId: string;
  finalStage: AskTurnState;
  routeType: AskRouteType | null;
  executionMode: AskExecutionMode | null;
  subjectResolutionStrategy: string | null;
  subjectCandidateCount: number;
  providerCallCount: number;
  providerFailureClass: string | null;
  creditState: AskCreditState;
  creditDisposition: AskCreditDisposition;
  settlementState: AskSettlementState;
  optionalFailures: AskSubsystem[];
  actionCount: number;
  finalErrorClass: string | null;
};

const stageOrder = new Map<AskTurnStage, number>(ASK_TURN_STAGES.map((stage, index) => [stage, index]));

export class AskTurnLifecycle {
  private stateValue: AskTurnState = "RECEIVED";
  private readonly traceValue: AskTurnTrace;

  constructor(logicalTurnId: string, attemptId: string) {
    this.traceValue = {
      logicalTurnId,
      attemptId,
      finalStage: "RECEIVED",
      routeType: null,
      executionMode: null,
      subjectResolutionStrategy: null,
      subjectCandidateCount: 0,
      providerCallCount: 0,
      providerFailureClass: null,
      creditState: "not_reserved",
      creditDisposition: "missing",
      settlementState: "not_required",
      optionalFailures: [],
      actionCount: 0,
      finalErrorClass: null,
    };
  }

  get state() { return this.stateValue; }

  transition(next: AskTurnStage) {
    if (this.isTerminal()) throw new Error("ASK_TURN_TERMINAL_STATE");
    const currentOrder = stageOrder.get(this.stateValue as AskTurnStage) ?? -1;
    const nextOrder = stageOrder.get(next) ?? -1;
    if (nextOrder <= currentOrder) throw new Error("ASK_TURN_NON_MONOTONIC_TRANSITION");
    this.stateValue = next;
    this.traceValue.finalStage = next;
    return this;
  }

  fail(errorClass: string, retryable: boolean) {
    if (this.stateValue === "COMPLETED") throw new Error("ASK_TURN_COMPLETED_CANNOT_FAIL");
    if (this.isTerminal()) return this;
    this.stateValue = retryable ? "FAILED_RETRYABLE" : "FAILED_FINAL";
    this.traceValue.finalStage = this.stateValue;
    this.traceValue.finalErrorClass = safeOperationalValue(errorClass);
    return this;
  }

  route(routeType: AskRouteType, executionMode: AskExecutionMode) {
    this.traceValue.routeType = routeType;
    this.traceValue.executionMode = executionMode;
    return this;
  }

  subject(strategy: string, candidateCount: number) {
    this.traceValue.subjectResolutionStrategy = safeOperationalValue(strategy);
    this.traceValue.subjectCandidateCount = Math.max(0, Math.min(20, Math.floor(candidateCount)));
    return this;
  }

  providerCall() { this.traceValue.providerCallCount += 1; return this; }
  providerFailure(value: string) { this.traceValue.providerFailureClass = safeOperationalValue(value); return this; }
  credit(state: AskCreditState) { this.traceValue.creditState = state; return this; }
  settlement(disposition: AskCreditDisposition, state: AskSettlementState) {
    this.traceValue.creditDisposition = disposition;
    this.traceValue.settlementState = state;
    return this;
  }
  actions(count: number) { this.traceValue.actionCount = Math.max(0, Math.min(20, Math.floor(count))); return this; }

  optionalFailure(component: AskSubsystem) {
    if (ASK_SUBSYSTEM_CRITICALITY[component] !== "OPTIONAL") throw new Error("ASK_CRITICAL_COMPONENT_CANNOT_DEGRADE");
    if (!this.traceValue.optionalFailures.includes(component)) this.traceValue.optionalFailures.push(component);
    return this;
  }

  snapshot(): AskTurnTrace {
    return { ...this.traceValue, optionalFailures: [...this.traceValue.optionalFailures] };
  }

  private isTerminal() {
    return this.stateValue === "COMPLETED" || this.stateValue === "FAILED_RETRYABLE" || this.stateValue === "FAILED_FINAL";
  }
}

export function deriveAskAttemptId(logicalTurnId: string, executionNonce: string) {
  const hex = createHash("sha256").update(`furvise:ask-attempt:v1:${logicalTurnId}:${executionNonce}`).digest("hex").slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

export async function runOptionalAskSubsystem<T>(input: {
  component: AskSubsystem;
  fallback: T;
  operation: () => Promise<T>;
  onFailure?: (component: AskSubsystem, error: unknown) => void;
}) {
  if (ASK_SUBSYSTEM_CRITICALITY[input.component] !== "OPTIONAL") throw new Error("ASK_OPTIONAL_BOUNDARY_REQUIRES_OPTIONAL_COMPONENT");
  try {
    return await input.operation();
  } catch (error) {
    input.onFailure?.(input.component, error);
    return input.fallback;
  }
}

function safeOperationalValue(value: string) {
  return String(value || "unknown").replace(/[^A-Za-z0-9_.:-]+/g, "_").slice(0, 100);
}
