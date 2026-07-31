import { getRateLimitBackendConfig, getRateLimitPolicy, isRateLimitEnabled } from "./config";
import { createRateLimitKeys, resolveClientIp } from "./keys";
import { logRateLimitDecision, noopRateLimitMetrics } from "./logging";
import { RedisRateLimitAdapter } from "./redis-adapter";
import type {
  RateLimitAdapter,
  RateLimitCheckResult,
  RateLimitMetrics,
  RateLimitPolicyName,
} from "./types";

let productionAdapter: RateLimitAdapter | null = null;
let productionAdapterIdentity = "";

export async function checkRateLimit(input: {
  adapter?: RateLimitAdapter;
  enabled?: boolean;
  fingerprint?: string;
  idempotencyKey?: string;
  ipAddress?: string | null;
  metrics?: RateLimitMetrics;
  nowMs?: number;
  policy: RateLimitPolicyName;
  request: Request;
  requestId: string;
  route: string;
  userId: string;
}): Promise<RateLimitCheckResult> {
  const startedAt = Date.now();
  const policy = getRateLimitPolicy(input.policy);
  const enabled = input.enabled ?? isRateLimitEnabled();
  const metrics = input.metrics || noopRateLimitMetrics;
  if (!enabled) {
    await record(metrics, { allowed: true, dimension: "disabled", elapsedMs: 0, policy: input.policy, retryAfterSeconds: 0 });
    return { allowed: true, backendBypassed: true, idempotencyReused: false };
  }

  const backend = getRateLimitBackendConfig();
  const adapter = input.adapter || getProductionAdapter(backend);
  if (!adapter || (!input.adapter && !backend.configured)) {
    return backendFailure(policy.failurePolicy, input, metrics, startedAt);
  }

  const ipAddress = input.ipAddress === undefined ? resolveClientIp(input.request) : input.ipAddress;
  const keys = createRateLimitKeys({
    hashSecret: backend.hashSecret || "test-rate-limit-secret-at-least-32-characters",
    idempotencyKey: input.idempotencyKey,
    ipAddress,
    policy: input.policy,
    userId: input.userId,
  });
  const nowMs = input.nowMs ?? Date.now();

  try {
    const user = await adapter.check({
      dedupeKey: keys.userDedupeKey,
      fingerprint: input.fingerprint,
      key: keys.userKey,
      limit: policy.user.limit,
      member: `${keys.member}:user`,
      nowMs,
      windowMs: policy.user.windowMs,
    });
    if (user.conflict) return deny("IDEMPOTENCY_CONFLICT", "user", 0, input, metrics, startedAt, keys.hashedIpPrefix);
    if (!user.allowed) return deny("RATE_LIMITED", "user", seconds(user.retryAfterMs), input, metrics, startedAt, keys.hashedIpPrefix);

    const ip = await adapter.check({
      dedupeKey: keys.ipDedupeKey,
      fingerprint: input.fingerprint,
      key: keys.ipKey,
      limit: policy.ip.limit,
      member: `${keys.member}:ip`,
      nowMs,
      windowMs: policy.ip.windowMs,
    });
    if (ip.conflict) return deny("IDEMPOTENCY_CONFLICT", "ip", 0, input, metrics, startedAt, keys.hashedIpPrefix);
    if (!ip.allowed) return deny("RATE_LIMITED", "ip", seconds(ip.retryAfterMs), input, metrics, startedAt, keys.hashedIpPrefix);

    const elapsedMs = Date.now() - startedAt;
    logRateLimitDecision({ allowed: true, dimension: "user", elapsedMs, hashedIpPrefix: keys.hashedIpPrefix, policy: input.policy, requestId: input.requestId, retryAfterSeconds: 0, route: input.route, userPresent: true });
    await record(metrics, { allowed: true, dimension: "user", elapsedMs, policy: input.policy, retryAfterSeconds: 0 });
    return { allowed: true, backendBypassed: false, idempotencyReused: user.reused || ip.reused };
  } catch {
    return backendFailure(policy.failurePolicy, input, metrics, startedAt, keys.hashedIpPrefix);
  }
}

export function getConfiguredRateLimitAdapter() {
  const backend = getRateLimitBackendConfig();
  return getProductionAdapter(backend);
}

function getProductionAdapter(backend: ReturnType<typeof getRateLimitBackendConfig>) {
  if (!backend.configured) return null;
  const identity = `${backend.url}:${backend.token.slice(-8)}:${backend.timeoutMs}`;
  if (!productionAdapter || productionAdapterIdentity !== identity) {
    productionAdapter = new RedisRateLimitAdapter(backend);
    productionAdapterIdentity = identity;
  }
  return productionAdapter;
}

function backendFailure(
  failurePolicy: "fail_closed" | "fail_open",
  input: Parameters<typeof checkRateLimit>[0],
  metrics: RateLimitMetrics,
  startedAt: number,
  hashedIpPrefix?: string,
): RateLimitCheckResult | Promise<RateLimitCheckResult> {
  const allowed = failurePolicy === "fail_open";
  const elapsedMs = Date.now() - startedAt;
  logRateLimitDecision({ allowed, dimension: "backend_unavailable", elapsedMs, hashedIpPrefix, policy: input.policy, requestId: input.requestId, retryAfterSeconds: allowed ? 0 : 1, route: input.route, userPresent: Boolean(input.userId) });
  void record(metrics, { allowed, dimension: "backend_unavailable", elapsedMs, policy: input.policy, retryAfterSeconds: allowed ? 0 : 1 });
  return allowed
    ? { allowed: true, backendBypassed: true, idempotencyReused: false }
    : { allowed: false, code: "RATE_LIMIT_UNAVAILABLE", dimension: "backend_unavailable", retryAfterSeconds: 1 };
}

function deny(
  code: "RATE_LIMITED" | "IDEMPOTENCY_CONFLICT",
  dimension: "user" | "ip",
  retryAfterSeconds: number,
  input: Parameters<typeof checkRateLimit>[0],
  metrics: RateLimitMetrics,
  startedAt: number,
  hashedIpPrefix: string,
): RateLimitCheckResult {
  const elapsedMs = Date.now() - startedAt;
  logRateLimitDecision({ allowed: false, dimension, elapsedMs, hashedIpPrefix, policy: input.policy, requestId: input.requestId, retryAfterSeconds, route: input.route, userPresent: true });
  void record(metrics, { allowed: false, dimension, elapsedMs, policy: input.policy, retryAfterSeconds });
  return { allowed: false, code, dimension, retryAfterSeconds };
}

function seconds(value: number) {
  return Math.max(1, Math.ceil(value / 1_000));
}

async function record(metrics: RateLimitMetrics, metric: Parameters<RateLimitMetrics["record"]>[0]) {
  try { await metrics.record(metric); } catch { /* Metrics must never affect request handling. */ }
}
