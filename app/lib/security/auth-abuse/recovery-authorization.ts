import "server-only";

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { Redis } from "@upstash/redis";
import { getAuthAbuseConfig } from "./config";
import type { RecoveryAuthorizationState, RecoveryAuthorizationStore } from "./recovery-authorization-types";
import { createRecoveryMarkerIdentity, createRecoveryPasswordCommitment as createPasswordCommitment } from "./recovery-secrets.mjs";

export const RECOVERY_AUTH_COOKIE = "furvise-recovery-authorization";
export const RECOVERY_AUTH_MAX_AGE_SECONDS = 10 * 60;
const VERSION = "furvise:v1:auth:recovery-completion";
const MARKER_PATTERN = /^[A-Za-z0-9_-]{43}$/;

const CLAIM = `
local value = redis.call('GET', KEYS[1])
if not value then return 4 end
local ready = 'ready:' .. ARGV[1]
local processing = 'processing:' .. ARGV[1] .. ':' .. ARGV[2]
local consumed = 'consumed:' .. ARGV[1] .. ':' .. ARGV[2]
if value == consumed then return 3 end
local processing_prefix = 'processing:' .. ARGV[1] .. ':'
local consumed_prefix = 'consumed:' .. ARGV[1] .. ':'
if string.sub(value, 1, string.len(processing_prefix)) == processing_prefix then return 2 end
if string.sub(value, 1, string.len(consumed_prefix)) == consumed_prefix then return 3 end
if value ~= ready then return 5 end
local ttl = redis.call('PTTL', KEYS[1])
if ttl <= 0 then return 4 end
redis.call('SET', KEYS[1], processing, 'PX', ttl)
return 1
`;
const CONSUME = `
local expected = 'processing:' .. ARGV[1] .. ':' .. ARGV[2]
if redis.call('GET', KEYS[1]) ~= expected then return 0 end
local ttl = redis.call('PTTL', KEYS[1])
if ttl <= 0 then return 0 end
redis.call('SET', KEYS[1], 'consumed:' .. ARGV[1] .. ':' .. ARGV[2], 'PX', ttl)
return 1
`;
const RELEASE = `
local expected = 'processing:' .. ARGV[1] .. ':' .. ARGV[2]
if redis.call('GET', KEYS[1]) ~= expected then return 0 end
local ttl = redis.call('PTTL', KEYS[1])
if ttl <= 0 then return 0 end
redis.call('SET', KEYS[1], 'ready:' .. ARGV[1], 'PX', ttl)
return 1
`;

let productionStore: RecoveryAuthorizationStore | null = null;
let productionStoreIdentity = "";

export async function issueRecoveryAuthorization(userId: string, sessionToken: string, store?: RecoveryAuthorizationStore) {
  const context = recoveryContext(store);
  if (!context) return null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const marker = randomBytes(32).toString("base64url");
    const identity = markerIdentity(marker, userId, sessionToken, context.secret);
    if (await context.store.issue({ key: identity.key, ttlMs: RECOVERY_AUTH_MAX_AGE_SECONDS * 1_000, userHash: identity.userHash })) {
      return marker;
    }
  }
  return null;
}

export async function inspectRecoveryAuthorization(marker: string, userId: string, sessionToken: string, store?: RecoveryAuthorizationStore) {
  const context = recoveryContext(store);
  if (!context || !MARKER_PATTERN.test(marker)) return "invalid" as const;
  const identity = markerIdentity(marker, userId, sessionToken, context.secret);
  return context.store.inspect({ key: identity.key, userHash: identity.userHash });
}

export async function claimRecoveryAuthorization(marker: string, userId: string, sessionToken: string, operationKey: string, store?: RecoveryAuthorizationStore) {
  const context = recoveryContext(store);
  if (!context || !MARKER_PATTERN.test(marker)) return "invalid" as const;
  const identity = markerIdentity(marker, userId, sessionToken, context.secret, operationKey);
  return context.store.claim(identity);
}

export async function consumeRecoveryAuthorization(marker: string, userId: string, sessionToken: string, operationKey: string, store?: RecoveryAuthorizationStore) {
  const context = recoveryContext(store);
  if (!context || !MARKER_PATTERN.test(marker)) return false;
  return context.store.consume(markerIdentity(marker, userId, sessionToken, context.secret, operationKey));
}

export async function releaseRecoveryAuthorization(marker: string, userId: string, sessionToken: string, operationKey: string, store?: RecoveryAuthorizationStore) {
  const context = recoveryContext(store);
  if (!context || !MARKER_PATTERN.test(marker)) return false;
  return context.store.release(markerIdentity(marker, userId, sessionToken, context.secret, operationKey));
}

export function createRecoveryPasswordCommitment(password: string, secret = getAuthAbuseConfig().hashSecret) {
  return createPasswordCommitment(password, secret);
}

export function recoveryAuthorizationCookieOptions() {
  return {
    httpOnly: true,
    maxAge: RECOVERY_AUTH_MAX_AGE_SECONDS,
    path: "/api/auth/update-password",
    priority: "high" as const,
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production",
  };
}

export async function readRecoveryAuthorizationCookie() {
  return (await cookies()).get(RECOVERY_AUTH_COOKIE)?.value || "";
}

export async function clearRecoveryAuthorizationCookie() {
  (await cookies()).set(RECOVERY_AUTH_COOKIE, "", { ...recoveryAuthorizationCookieOptions(), maxAge: 0 });
}

function recoveryContext(injected?: RecoveryAuthorizationStore) {
  const config = getAuthAbuseConfig();
  if (config.hashSecret.length < 32) return null;
  if (injected) return { secret: config.hashSecret, store: injected };
  if (!config.configured) return null;
  const identity = `${config.url}:${config.token.slice(-8)}:${config.timeoutMs}`;
  if (!productionStore || productionStoreIdentity !== identity) {
    productionStore = new RedisRecoveryAuthorizationStore({ timeoutMs: config.timeoutMs, token: config.token, url: config.url });
    productionStoreIdentity = identity;
  }
  return { secret: config.hashSecret, store: productionStore };
}

function markerIdentity(marker: string, userId: string, sessionToken: string, secret: string, operationKey = "") {
  const identity = createRecoveryMarkerIdentity(marker, userId, sessionToken, secret, operationKey);
  return {
    key: `${VERSION}:marker:${identity.markerHash}`,
    operationHash: identity.operationHash,
    userHash: identity.userHash,
  };
}

class RedisRecoveryAuthorizationStore implements RecoveryAuthorizationStore {
  private readonly redis: Redis;
  constructor(input: { timeoutMs: number; token: string; url: string }) {
    this.redis = new Redis({ retry: { retries: 0 }, signal: () => AbortSignal.timeout(input.timeoutMs), token: input.token, url: input.url });
  }
  async issue(input: { key: string; ttlMs: number; userHash: string }) {
    return (await this.redis.set(input.key, `ready:${input.userHash}`, { nx: true, px: input.ttlMs })) === "OK";
  }
  async inspect(input: { key: string; userHash: string }): Promise<RecoveryAuthorizationState> {
    const value = await this.redis.get<string>(input.key);
    if (!value) return "expired";
    if (value === `ready:${input.userHash}`) return "ready";
    if (value.startsWith(`processing:${input.userHash}:`)) return "processing";
    if (value.startsWith(`consumed:${input.userHash}:`)) return "consumed";
    return "invalid";
  }
  async claim(input: { key: string; operationHash: string; userHash: string }) {
    const result = await this.redis.eval<string[], number>(CLAIM, [input.key], [input.userHash, input.operationHash]);
    return result === 1 ? "claimed" as const : result === 2 ? "processing" as const : result === 3 ? "consumed" as const : result === 4 ? "expired" as const : "invalid" as const;
  }
  async consume(input: { key: string; operationHash: string; userHash: string }) {
    return (await this.redis.eval<string[], number>(CONSUME, [input.key], [input.userHash, input.operationHash])) === 1;
  }
  async release(input: { key: string; operationHash: string; userHash: string }) {
    return (await this.redis.eval<string[], number>(RELEASE, [input.key], [input.userHash, input.operationHash])) === 1;
  }
}
