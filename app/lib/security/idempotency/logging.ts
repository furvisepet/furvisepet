import "server-only";
import { emitOperationalEvent } from "../../operations/events";

export function logIdempotencyEvent(input: { operationType: string; outcome: string; requestId: string; elapsedMs?: number; errorCode?: string }) {
  if (input.outcome === "conflict" || input.errorCode?.includes("RECONCILIATION")) emitOperationalEvent({
    durationMs: input.elapsedMs, errorCode: input.errorCode || "IDEMPOTENCY_CONFLICT",
    eventType: input.outcome === "conflict" ? "idempotency_conflict" : "idempotency_reconciliation_required",
    feature: input.operationType, requestId: input.requestId, severity: input.outcome === "conflict" ? "warning" : "high",
  });
  console.info("[Furvise idempotency] operation", {
    operationType: input.operationType,
    outcome: input.outcome,
    requestId: input.requestId,
    ...(input.elapsedMs === undefined ? {} : { elapsedMs: input.elapsedMs }),
    ...(input.errorCode ? { errorCode: input.errorCode } : {}),
  });
}
