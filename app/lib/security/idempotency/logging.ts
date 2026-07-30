import "server-only";

export function logIdempotencyEvent(input: { operationType: string; outcome: string; requestId: string; elapsedMs?: number; errorCode?: string }) {
  console.info("[Furvise idempotency] operation", {
    operationType: input.operationType,
    outcome: input.outcome,
    requestId: input.requestId,
    ...(input.elapsedMs === undefined ? {} : { elapsedMs: input.elapsedMs }),
    ...(input.errorCode ? { errorCode: input.errorCode } : {}),
  });
}
