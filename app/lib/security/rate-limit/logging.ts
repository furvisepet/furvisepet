import type { RateLimitMetric, RateLimitMetrics } from "./types";
import { emitOperationalEvent } from "../../operations/events";

export const noopRateLimitMetrics: RateLimitMetrics = { record() {} };

export function logRateLimitDecision(input: {
  allowed: boolean;
  dimension: RateLimitMetric["dimension"];
  elapsedMs: number;
  hashedIpPrefix?: string;
  policy: RateLimitMetric["policy"];
  requestId: string;
  retryAfterSeconds: number;
  route: string;
  userPresent: boolean;
}) {
  if (!input.allowed) emitOperationalEvent({
    errorCode: input.dimension === "backend_unavailable" ? "RATE_STORE_UNAVAILABLE" : "RATE_LIMITED",
    eventType: input.dimension === "backend_unavailable" ? "rate_store_unavailable" : input.dimension === "concurrency" ? "concurrency_denied" : "rate_limited",
    metadata: { allowed: false, dimension: input.dimension, policy: input.policy, retryAfterSeconds: input.retryAfterSeconds },
    requestId: input.requestId, route: input.route, severity: input.dimension === "backend_unavailable" ? "high" : "warning",
  });
  const payload = {
    allowed: input.allowed,
    dimension: input.dimension,
    elapsedMs: input.elapsedMs,
    ...(input.hashedIpPrefix ? { hashedIpPrefix: input.hashedIpPrefix } : {}),
    policy: input.policy,
    requestId: input.requestId,
    retryAfterSeconds: input.retryAfterSeconds,
    route: input.route,
    userPresent: input.userPresent,
  };
  if (input.allowed) console.info("[Furvise rate limit] decision", payload);
  else console.warn("[Furvise rate limit] decision", payload);
}
