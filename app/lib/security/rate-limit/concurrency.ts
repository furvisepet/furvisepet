import { randomUUID } from "node:crypto";
import { getRateLimitBackendConfig, getRateLimitPolicy, isRateLimitEnabled } from "./config";
import { createRateLimitKeys } from "./keys";
import { logRateLimitDecision } from "./logging";
import { getConfiguredRateLimitAdapter } from "./rate-limit";
import type { ConcurrencyLease, ConcurrencyLeaseResult, RateLimitAdapter, RateLimitPolicyName } from "./types";

export async function acquireConcurrencyLease(input: {
  adapter?: RateLimitAdapter;
  enabled?: boolean;
  feature: RateLimitPolicyName;
  requestId: string;
  route: string;
  ttlMs?: number;
  userId: string;
}): Promise<ConcurrencyLeaseResult> {
  const enabled = input.enabled ?? isRateLimitEnabled();
  if (!enabled) return { acquired: true, lease: noOpLease(input) };
  const backend = getRateLimitBackendConfig();
  const adapter = input.adapter || getConfiguredRateLimitAdapter();
  if (!adapter || (!input.adapter && !backend.configured)) {
    logRateLimitDecision({ allowed: false, dimension: "backend_unavailable", elapsedMs: 0, policy: input.feature, requestId: input.requestId, retryAfterSeconds: 1, route: input.route, userPresent: true });
    return { acquired: false, code: "RATE_LIMIT_UNAVAILABLE", retryAfterSeconds: 1 };
  }

  const policy = getRateLimitPolicy(input.feature);
  const ttlMs = input.ttlMs || policy.concurrencyTtlMs || 65_000;
  const keys = createRateLimitKeys({ hashSecret: backend.hashSecret || "test-rate-limit-secret-at-least-32-characters", ipAddress: null, policy: input.feature, userId: input.userId });
  const ownerToken = randomUUID();
  try {
    const result = await adapter.acquireLease({ key: keys.leaseKey, ownerToken, ttlMs });
    if (!result.acquired) {
      const retryAfterSeconds = Math.max(1, Math.ceil(result.retryAfterMs / 1_000));
      logRateLimitDecision({ allowed: false, dimension: "concurrency", elapsedMs: 0, policy: input.feature, requestId: input.requestId, retryAfterSeconds, route: input.route, userPresent: true });
      return { acquired: false, code: "AI_REQUEST_ALREADY_ACTIVE", retryAfterSeconds };
    }
    logRateLimitDecision({ allowed: true, dimension: "concurrency", elapsedMs: 0, policy: input.feature, requestId: input.requestId, retryAfterSeconds: Math.ceil(ttlMs / 1_000), route: input.route, userPresent: true });
    return { acquired: true, lease: { feature: input.feature, key: keys.leaseKey, ownerToken, requestId: input.requestId, retryAfterSeconds: Math.ceil(ttlMs / 1_000) } };
  } catch {
    return { acquired: false, code: "RATE_LIMIT_UNAVAILABLE", retryAfterSeconds: 1 };
  }
}

export async function releaseConcurrencyLease(input: {
  adapter?: RateLimitAdapter;
  lease: ConcurrencyLease;
  route: string;
}) {
  if (!input.lease.key) return true;
  const adapter = input.adapter || getConfiguredRateLimitAdapter();
  if (!adapter) return false;
  try {
    const released = await adapter.releaseLease({ key: input.lease.key, ownerToken: input.lease.ownerToken });
    logRateLimitDecision({ allowed: released, dimension: "concurrency", elapsedMs: 0, policy: input.lease.feature, requestId: input.lease.requestId, retryAfterSeconds: 0, route: input.route, userPresent: true });
    return released;
  } catch {
    logRateLimitDecision({ allowed: false, dimension: "backend_unavailable", elapsedMs: 0, policy: input.lease.feature, requestId: input.lease.requestId, retryAfterSeconds: 0, route: input.route, userPresent: true });
    return false;
  }
}

function noOpLease(input: { feature: RateLimitPolicyName; requestId: string }) {
  return { feature: input.feature, key: "", ownerToken: "", requestId: input.requestId, retryAfterSeconds: 0 };
}
