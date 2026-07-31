import "server-only";
import { allowlistedMetadata, safeOperationalIdentifier } from "./redaction";
import { noopOperationalMetrics, type OperationalMetrics } from "./metrics";
import type { OperationalEvent, OperationalEventAdapter } from "./types";

export const localOperationalLogger: OperationalEventAdapter = {
  emit(event) {
    const severity = event.severity;
    if (severity === "critical" || severity === "high") console.error("[Furvise operations]", event);
    else if (severity === "warning") console.warn("[Furvise operations]", event);
    else console.info("[Furvise operations]", event);
  },
};

export function emitOperationalEvent(input: OperationalEvent, adapter: OperationalEventAdapter = localOperationalLogger, metrics: OperationalMetrics = noopOperationalMetrics) {
  const event = {
    actor: safeOperationalIdentifier(input.actorId), durationMs: boundedDuration(input.durationMs),
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "unknown", errorCode: safeText(input.errorCode),
    eventType: input.eventType, feature: safeText(input.feature), metadata: allowlistedMetadata(input.metadata),
    operationId: safeText(input.operationId), requestId: safeText(input.requestId) || "missing",
    resource: safeOperationalIdentifier(input.resourceId), route: safeText(input.route), severity: input.severity,
    timestamp: input.timestamp || new Date().toISOString(),
  };
  try { void Promise.resolve(adapter.emit(event)).catch(() => undefined); } catch { /* Observability never breaks a user request. */ }
  try { void Promise.resolve(metrics.record({ eventType: input.eventType, severity: input.severity })).catch(() => undefined); } catch { /* Metrics never break a user request. */ }
  return event;
}

function safeText(value?: string) { return value ? value.replace(/[\r\n\t]/g, " ").slice(0, 160) : undefined; }
function boundedDuration(value?: number) { return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(value, 86_400_000)) : undefined; }
