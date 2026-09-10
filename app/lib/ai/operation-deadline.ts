/** One monotonic budget shared by stages. Never publish an unreviewed draft
 * because a later stage cannot fit. A budget cannot be reset by a repair. */
export type PipelineStage = "interpretation" | "subject_resolution" | "context_loading" | "evidence_retrieval" | "answer_generation" | "verification" | "repair" | "persistence";
export class StageDeadlineError extends Error {
  readonly code = "ASK_STAGE_DEADLINE";
  readonly stage: PipelineStage;
  readonly remainingMs: number;
  constructor(stage: PipelineStage, remainingMs: number) {
    super("Ask stage deadline exhausted"); this.name = "StageDeadlineError";
    this.stage = stage; this.remainingMs = remainingMs;
  }
}
export class OperationDeadline {
  readonly expiresAt: number;
  private readonly clock: () => number;
  constructor(durationMs: number, clock: () => number = () => performance.now()) {
    this.clock = clock;
    if (!Number.isFinite(durationMs) || durationMs <= 0) throw new Error("INVALID_OPERATION_DEADLINE");
    this.expiresAt = clock() + durationMs;
  }
  remainingMs() { return Math.max(0, Math.floor(this.expiresAt - this.clock())); }
  allocate(stage: PipelineStage, maximumMs: number, reserveMs = 0, minimumMs = 1) {
    if (![maximumMs, reserveMs, minimumMs].every(Number.isFinite) || maximumMs <= 0 || reserveMs < 0 || minimumMs < 1)
      throw new Error("INVALID_STAGE_BUDGET");
    const remaining = this.remainingMs() - reserveMs;
    if (remaining < minimumMs) throw new StageDeadlineError(stage, Math.max(0, remaining));
    return Math.min(maximumMs, remaining);
  }
}
