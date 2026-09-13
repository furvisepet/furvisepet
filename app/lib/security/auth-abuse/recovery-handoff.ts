import "server-only";

import { Redis } from "@upstash/redis";
import { getAuthAbuseConfig } from "./config";
import { consumeRecoveryHandoffInStore, issueRecoveryHandoffInStore } from "./recovery-handoff-core.mjs";
import type { RecoveryHandoffStore } from "./recovery-handoff-types";

export const RECOVERY_HANDOFF_COOKIE = "furvise-recovery-handoff";
export const RECOVERY_HANDOFF_QUERY = "recovery_handoff";
export const RECOVERY_HANDOFF_MAX_AGE_SECONDS = 5 * 60;
const VERSION = "furvise:v1:auth:recovery-handoff";
const CONSUME = `
if redis.call('GET', KEYS[1]) ~= 'ready' then return 0 end
redis.call('DEL', KEYS[1])
return 1
`;

let productionStore: RecoveryHandoffStore | null = null;
let productionStoreIdentity = "";

export async function issueRecoveryHandoff(store?: RecoveryHandoffStore) {
  const context = recoveryHandoffContext(store);
  if (!context) return null;
  return issueRecoveryHandoffInStore({
    secret: context.secret,
    store: prefixStore(context.store),
    ttlMs: RECOVERY_HANDOFF_MAX_AGE_SECONDS * 1_000,
  });
}

export async function consumeRecoveryHandoff(marker: string, id: string, store?: RecoveryHandoffStore) {
  const context = recoveryHandoffContext(store);
  if (!context) return false;
  return consumeRecoveryHandoffInStore({ id, marker, secret: context.secret, store: prefixStore(context.store) });
}

export function recoveryHandoffCookieOptions() {
  return {
    httpOnly: true,
    maxAge: RECOVERY_HANDOFF_MAX_AGE_SECONDS,
    path: "/auth/callback",
    priority: "high" as const,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
}

function recoveryHandoffContext(injected?: RecoveryHandoffStore) {
  const config = getAuthAbuseConfig();
  if (config.hashSecret.length < 32) return null;
  if (injected) return { secret: config.hashSecret, store: injected };
  if (!config.configured) return null;
  const identity = `${config.url}:${config.token.slice(-8)}:${config.timeoutMs}`;
  if (!productionStore || productionStoreIdentity !== identity) {
    productionStore = new RedisRecoveryHandoffStore({ timeoutMs: config.timeoutMs, token: config.token, url: config.url });
    productionStoreIdentity = identity;
  }
  return { secret: config.hashSecret, store: productionStore };
}

function handoffKey(id: string) { return `${VERSION}:${id}`; }

function prefixStore(store: RecoveryHandoffStore): RecoveryHandoffStore {
  return {
    consume: ({ key }) => store.consume({ key: handoffKey(key) }),
    issue: ({ key, ttlMs }) => store.issue({ key: handoffKey(key), ttlMs }),
  };
}

class RedisRecoveryHandoffStore implements RecoveryHandoffStore {
  private readonly redis: Redis;
  constructor(input: { timeoutMs: number; token: string; url: string }) {
    this.redis = new Redis({ retry: { retries: 0 }, signal: () => AbortSignal.timeout(input.timeoutMs), token: input.token, url: input.url });
  }
  async issue(input: { key: string; ttlMs: number }) {
    return (await this.redis.set(input.key, "ready", { nx: true, px: input.ttlMs })) === "OK";
  }
  async consume(input: { key: string }) {
    return (await this.redis.eval<string[], number>(CONSUME, [input.key], [])) === 1;
  }
}
