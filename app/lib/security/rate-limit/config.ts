import type { RateLimitPolicy, RateLimitPolicyName } from "./types";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const AI_LEASE_TTL_MS = 65_000;
const VET_BRIEF_LEASE_TTL_MS = 90_000;

const DEFAULT_POLICIES: Record<RateLimitPolicyName, RateLimitPolicy> = {
  ASK_AI: aiPolicy("ASK_AI", 10, 30, AI_LEASE_TTL_MS),
  PRODUCT_GUIDANCE_AI: aiPolicy("PRODUCT_GUIDANCE_AI", 10, 30, AI_LEASE_TTL_MS),
  SAFETY_FOLLOWUP_AI: aiPolicy("SAFETY_FOLLOWUP_AI", 10, 30, AI_LEASE_TTL_MS),
  VET_BRIEF_AI: aiPolicy("VET_BRIEF_AI", 4, 12, VET_BRIEF_LEASE_TTL_MS),
  MEMORY_WRITE: writePolicy("MEMORY_WRITE", 30, 60),
  PROFILE_WRITE: writePolicy("PROFILE_WRITE", 30, 60),
  CARE_WRITE: writePolicy("CARE_WRITE", 30, 60),
  CONVERSATION_WRITE: writePolicy("CONVERSATION_WRITE", 30, 60),
  DESTRUCTIVE_WRITE: {
    failurePolicy: "fail_closed",
    ip: { limit: 20, windowMs: MINUTE },
    modelBacked: false,
    name: "DESTRUCTIVE_WRITE",
    user: { limit: 10, windowMs: MINUTE },
  },
  CATALOG_READ: {
    failurePolicy: "fail_open",
    ip: { limit: 240, windowMs: MINUTE },
    modelBacked: false,
    name: "CATALOG_READ",
    user: { limit: 120, windowMs: MINUTE },
  },
  DATA_EXPORT: {
    failurePolicy: "fail_closed",
    ip: { limit: 6, windowMs: HOUR },
    modelBacked: false,
    name: "DATA_EXPORT",
    user: { limit: 3, windowMs: HOUR },
  },
  AUTH_SIGNUP: authPolicy("AUTH_SIGNUP", 5, 15 * MINUTE, 3, HOUR, 20),
  AUTH_LOGIN: authPolicy("AUTH_LOGIN", 20, 15 * MINUTE, 10, 15 * MINUTE, 80),
  AUTH_PASSWORD_RECOVERY: authPolicy("AUTH_PASSWORD_RECOVERY", 5, HOUR, 3, HOUR, 20),
  AUTH_PASSWORD_UPDATE: authPolicy("AUTH_PASSWORD_UPDATE", 20, 15 * MINUTE, 5, 15 * MINUTE, 80),
  AUTH_CONFIRMATION_RESEND: authPolicy("AUTH_CONFIRMATION_RESEND", 5, HOUR, 3, HOUR, 20),
  AUTH_OAUTH_INITIATION: authPolicy("AUTH_OAUTH_INITIATION", 20, 15 * MINUTE, 20, 15 * MINUTE, 80),
};

export function getRateLimitPolicy(name: RateLimitPolicyName, env = process.env): RateLimitPolicy {
  const base = DEFAULT_POLICIES[name];
  if (name.startsWith("AUTH_")) {
    return {
      ...base,
      dailyIp: base.dailyIp ? { ...base.dailyIp, limit: boundedLimit(env[`FURVISE_RATE_LIMIT_${name}_DAILY_IP_LIMIT`], base.dailyIp.limit) } : undefined,
      email: base.email ? { ...base.email, limit: boundedLimit(env[`FURVISE_RATE_LIMIT_${name}_EMAIL_LIMIT`], base.email.limit) } : undefined,
      ip: { ...base.ip, limit: boundedLimit(env[`FURVISE_RATE_LIMIT_${name}_IP_LIMIT`], base.ip.limit) },
      user: { ...base.user, limit: boundedLimit(env[`FURVISE_RATE_LIMIT_${name}_EMAIL_LIMIT`], base.user.limit) },
    };
  }
  return {
    ...base,
    ip: {
      ...base.ip,
      limit: boundedLimit(env[`FURVISE_RATE_LIMIT_${name}_IP_PER_MINUTE`], base.ip.limit),
    },
    user: {
      ...base.user,
      limit: boundedLimit(env[`FURVISE_RATE_LIMIT_${name}_USER_PER_MINUTE`], base.user.limit),
    },
  };
}

function authPolicy(name: RateLimitPolicyName, ipLimit: number, ipWindowMs: number, emailLimit: number, emailWindowMs: number, dailyIpLimit: number): RateLimitPolicy {
  return {
    dailyIp: { limit: dailyIpLimit, windowMs: DAY },
    email: { limit: emailLimit, windowMs: emailWindowMs },
    failurePolicy: "fail_closed",
    ip: { limit: ipLimit, windowMs: ipWindowMs },
    modelBacked: false,
    name,
    user: { limit: emailLimit, windowMs: emailWindowMs },
  };
}

export function isRateLimitEnabled(env = process.env) {
  const configured = env.FURVISE_RATE_LIMIT_ENABLED;
  if (configured === "false") return false;
  if (configured === "true") return true;
  return env.NODE_ENV === "production";
}

export function getRateLimitBackendConfig(env = process.env) {
  const url = env.UPSTASH_REDIS_REST_URL?.trim() || "";
  const token = env.UPSTASH_REDIS_REST_TOKEN?.trim() || "";
  const hashSecret = env.FURVISE_RATE_LIMIT_HASH_SECRET?.trim() || "";
  const timeoutMs = boundedInteger(env.FURVISE_RATE_LIMIT_TIMEOUT_MS, 800, 200, 2_000);
  return { configured: Boolean(url && token && hashSecret.length >= 32), hashSecret, timeoutMs, token, url };
}

function aiPolicy(name: RateLimitPolicyName, userLimit: number, ipLimit: number, concurrencyTtlMs: number): RateLimitPolicy {
  return {
    concurrencyTtlMs,
    failurePolicy: "fail_closed",
    ip: { limit: ipLimit, windowMs: MINUTE },
    modelBacked: true,
    name,
    user: { limit: userLimit, windowMs: MINUTE },
  };
}

function writePolicy(name: RateLimitPolicyName, userLimit: number, ipLimit: number): RateLimitPolicy {
  return {
    failurePolicy: "fail_open",
    ip: { limit: ipLimit, windowMs: MINUTE },
    modelBacked: false,
    name,
    user: { limit: userLimit, windowMs: MINUTE },
  };
}

function boundedLimit(value: string | undefined, fallback: number) {
  return boundedInteger(value, fallback, 1, fallback * 5);
}

function boundedInteger(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

export { DEFAULT_POLICIES };
