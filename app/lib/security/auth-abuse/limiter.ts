import "server-only";

import { randomUUID } from "node:crypto";
import { getRateLimitPolicy, resolveClientIp } from "../rate-limit";
import { getAuthAbuseConfig } from "./config";
import { createAuthAbuseKeys, createAuthOperationIdentity } from "./keys";
import { logAuthAbuseEvent } from "./logging";
import { RedisAuthAbuseStore } from "./redis-store";
import type { AuthAbuseStore, AuthFlow, AuthLimitPolicyName } from "./types";

let productionStore: AuthAbuseStore | null = null;
let productionIdentity = "";

export async function enforceAuthInitiationLimit(input: {
  captchaPresent: boolean;
  email: string | null;
  flow: AuthFlow;
  nowMs?: number;
  policy: AuthLimitPolicyName;
  request: Request;
  requestId: string;
  store?: AuthAbuseStore;
}) {
  const started = Date.now();
  const config = getAuthAbuseConfig();
  if (!config.enabled && !input.store) return { allowed: true as const, backendBypassed: true };
  const store = input.store || getProductionStore(config);
  if (!store || (!input.store && !config.configured)) {
    logAuthAbuseEvent({ captchaPresent: input.captchaPresent, elapsedMs: Date.now() - started, flow: input.flow, ipDecision: "unavailable", outcome: "backend_unavailable", requestId: input.requestId });
    return { allowed: false as const, code: "AUTH_PROTECTION_UNAVAILABLE" as const, retryAfterSeconds: 1 };
  }
  const policy = getRateLimitPolicy(input.policy);
  const nowMs = input.nowMs ?? Date.now();
  const keys = createAuthAbuseKeys({ email: input.email, hashSecret: config.hashSecret || "test-auth-rate-limit-secret-at-least-32-characters", ipAddress: resolveClientIp(input.request), policy: input.policy });
  try {
    const ip = await store.check({ key: keys.ipKey, limit: policy.ip.limit, member: `${keys.member}:ip`, nowMs, windowMs: policy.ip.windowMs });
    if (!ip.allowed) return denied("ip", ip.retryAfterMs);
    if (policy.dailyIp) {
      const daily = await store.check({ key: keys.dailyIpKey, limit: policy.dailyIp.limit, member: `${keys.member}:day`, nowMs, windowMs: policy.dailyIp.windowMs });
      if (!daily.allowed) return denied("ip", daily.retryAfterMs);
    }
    if (input.policy !== "AUTH_LOGIN" && input.email && policy.email && keys.emailKey) {
      const email = await store.check({ key: keys.emailKey, limit: policy.email.limit, member: `${keys.member}:email`, nowMs, windowMs: policy.email.windowMs });
      if (!email.allowed) return denied("email", email.retryAfterMs);
    }
    logAuthAbuseEvent({ captchaPresent: input.captchaPresent, elapsedMs: Date.now() - started, emailDecision: input.email ? "allowed" : "not_applicable", flow: input.flow, outcome: "allowed", requestId: input.requestId });
    return { allowed: true as const, backendBypassed: false };
  } catch {
    logAuthAbuseEvent({ captchaPresent: input.captchaPresent, elapsedMs: Date.now() - started, flow: input.flow, ipDecision: "unavailable", outcome: "backend_unavailable", requestId: input.requestId });
    return { allowed: false as const, code: "AUTH_PROTECTION_UNAVAILABLE" as const, retryAfterSeconds: 1 };
  }

  function denied(dimension: "email" | "ip", retryAfterMs: number) {
    const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
    logAuthAbuseEvent({ captchaPresent: input.captchaPresent, elapsedMs: Date.now() - started, emailDecision: dimension === "email" ? "denied" : undefined, flow: input.flow, ipDecision: dimension === "ip" ? "denied" : undefined, outcome: "rate_limited", requestId: input.requestId });
    return { allowed: false as const, code: "AUTH_RATE_LIMITED" as const, retryAfterSeconds };
  }
}

export async function getLoginFailureState(input: { email: string; nowMs?: number; request: Request; store?: AuthAbuseStore }) {
  const config = getAuthAbuseConfig();
  if (!config.enabled && !input.store) return { blocked: false, challengeRequired: false, count: 0, retryAfterSeconds: 0 };
  const store = input.store || getProductionStore(config);
  if (!store || (!input.store && !config.configured)) throw new Error("AUTH_PROTECTION_UNAVAILABLE");
  const policy = getRateLimitPolicy("AUTH_LOGIN");
  const keys = createAuthAbuseKeys({ email: input.email, hashSecret: config.hashSecret || "test-auth-rate-limit-secret-at-least-32-characters", ipAddress: resolveClientIp(input.request), policy: "AUTH_LOGIN" });
  const state = await store.state({ key: keys.emailFailureKey!, nowMs: input.nowMs ?? Date.now(), windowMs: policy.email!.windowMs });
  return { blocked: state.count >= policy.email!.limit, challengeRequired: state.count >= 3, count: state.count, retryAfterSeconds: Math.max(1, Math.ceil(state.retryAfterMs / 1000)) };
}

export async function recordLoginCredentialFailure(input: { email: string; nowMs?: number; request: Request; store?: AuthAbuseStore }) {
  const config = getAuthAbuseConfig(); if (!config.enabled && !input.store) return { allowed: true, count: 0, retryAfterMs: 0 }; const store = input.store || getProductionStore(config); if (!store) throw new Error("AUTH_PROTECTION_UNAVAILABLE");
  const policy = getRateLimitPolicy("AUTH_LOGIN"); const keys = createAuthAbuseKeys({ email: input.email, hashSecret: config.hashSecret || "test-auth-rate-limit-secret-at-least-32-characters", ipAddress: resolveClientIp(input.request), policy: "AUTH_LOGIN" });
  return store.check({ key: keys.emailFailureKey!, limit: policy.email!.limit, member: `${Date.now()}:${randomUUID()}`, nowMs: input.nowMs ?? Date.now(), windowMs: policy.email!.windowMs });
}

export async function clearLoginCredentialFailures(input: { email: string; request: Request; store?: AuthAbuseStore }) {
  const config = getAuthAbuseConfig(); if (!config.enabled && !input.store) return; const store = input.store || getProductionStore(config); if (!store) return;
  const keys = createAuthAbuseKeys({ email: input.email, hashSecret: config.hashSecret || "test-auth-rate-limit-secret-at-least-32-characters", ipAddress: resolveClientIp(input.request), policy: "AUTH_LOGIN" });
  await store.clear(keys.emailFailureKey!);
}

export async function claimPublicAuthOperation(input: { email: string; flow: AuthFlow; idempotencyKey: string; semanticSecret?: string; store?: AuthAbuseStore; ttlMs?: number }) {
  const config = getAuthAbuseConfig();
  if (!config.enabled && !input.store) return "new" as const;
  const store = input.store || getProductionStore(config);
  if (!store || (!input.store && !config.configured)) throw new Error("AUTH_PROTECTION_UNAVAILABLE");
  const identity = createAuthOperationIdentity({ email: input.email, flow: input.flow, hashSecret: config.hashSecret || "test-auth-rate-limit-secret-at-least-32-characters", idempotencyKey: input.idempotencyKey, semanticSecret: input.semanticSecret });
  return store.claim({ fingerprint: identity.fingerprint, key: identity.key, ttlMs: input.ttlMs || 60 * 60 * 1000 });
}

export async function releasePublicAuthOperation(input: { email: string; flow: AuthFlow; idempotencyKey: string; semanticSecret?: string; store?: AuthAbuseStore }) {
  const config = getAuthAbuseConfig(); if (!config.enabled && !input.store) return;
  const store = input.store || getProductionStore(config); if (!store) return;
  const identity = createAuthOperationIdentity({ email: input.email, flow: input.flow, hashSecret: config.hashSecret || "test-auth-rate-limit-secret-at-least-32-characters", idempotencyKey: input.idempotencyKey, semanticSecret: input.semanticSecret });
  await store.clear(identity.key);
}

function getProductionStore(config: ReturnType<typeof getAuthAbuseConfig>) {
  if (!config.configured) return null;
  const identity = `${config.url}:${config.token.slice(-8)}:${config.timeoutMs}`;
  if (!productionStore || productionIdentity !== identity) { productionStore = new RedisAuthAbuseStore(config); productionIdentity = identity; }
  return productionStore;
}
