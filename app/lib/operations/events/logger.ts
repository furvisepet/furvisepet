import "server-only";
import * as Sentry from "@sentry/nextjs";
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

const DURABLE_FAILURE_EVENT_TYPES = new Set([
  "account_deletion_failed", "application_error", "cleanup_failed", "credit_reservation_stale",
  "email_delivery_failure", "idempotency_reconciliation_required", "migration_mismatch",
  "provider_failure", "provider_usage_reconciliation_failure", "rate_store_unavailable",
]);

export const durableOperationalLogger: OperationalEventAdapter = {
  emit(event) {
    localOperationalLogger.emit(event);
    if ((event.severity !== "high" && event.severity !== "critical") || !DURABLE_FAILURE_EVENT_TYPES.has(String(event.eventType))) return;
    const failure = new Error("Durable operational failure");
    failure.name = "FurviseOperationalFailure";
    Sentry.captureException(failure, {
      level: event.severity === "critical" ? "fatal" : "error",
      tags: {
        errorCode: captureTag(event.errorCode),
        eventType: captureTag(event.eventType),
        feature: captureTag(event.feature),
        operationId: captureTag(event.operationId),
        requestId: captureTag(event.requestId),
        route: captureTag(event.route),
        severity: event.severity,
      },
    });
  },
};

function captureTag(value: unknown) {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : undefined;
}

export function emitOperationalEvent(input: OperationalEvent, adapter: OperationalEventAdapter = durableOperationalLogger, metrics: OperationalMetrics = noopOperationalMetrics) {
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
