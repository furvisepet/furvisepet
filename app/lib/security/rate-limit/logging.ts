import type { RateLimitMetric, RateLimitMetrics } from "./types";

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
