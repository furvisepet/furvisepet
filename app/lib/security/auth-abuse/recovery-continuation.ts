import "server-only";

import { getAuthAbuseConfig } from "./config";
import { RedisAuthAbuseStore } from "./redis-store";
import { RECOVERY_CONFIRMATION_LIMITS, claimRecoveryContinuationInStore } from "./recovery-confirmation.mjs";
import { createRecoveryContinuationIdentity } from "./recovery-secrets.mjs";
import type { AuthAbuseStore } from "./types";

let productionStore: AuthAbuseStore | null = null;
let productionIdentity = "";
const developmentClaims = new Map<string, number>();

export async function claimRecoveryContinuationToken(token: string, store?: AuthAbuseStore) {
  const config = getAuthAbuseConfig();
  const identity = createRecoveryContinuationIdentity(
    token,
    config.hashSecret || "test-auth-rate-limit-secret-at-least-32-characters",
  );
  if (!identity) throw new Error("AUTH_PROTECTION_UNAVAILABLE");
  if (!store && (!config.enabled || !config.configured)) {
    if (process.env.NODE_ENV === "production") throw new Error("AUTH_PROTECTION_UNAVAILABLE");
    const now = Date.now();
    const existing = developmentClaims.get(identity) || 0;
    if (existing > now) return "already_used" as const;
    developmentClaims.set(identity, now + RECOVERY_CONFIRMATION_LIMITS.claimTtlMs);
    return "claimed" as const;
  }
  const resolvedStore = store || getProductionStore(config);
  if (!resolvedStore) throw new Error("AUTH_PROTECTION_UNAVAILABLE");
  return claimRecoveryContinuationInStore({
    secret: config.hashSecret || "test-auth-rate-limit-secret-at-least-32-characters",
    store: resolvedStore,
    token,
    ttlMs: RECOVERY_CONFIRMATION_LIMITS.claimTtlMs,
  }) as Promise<"claimed" | "already_used">;
}

function getProductionStore(config: ReturnType<typeof getAuthAbuseConfig>) {
  if (!config.configured) return null;
  const identity = `${config.url}:${config.token.slice(-8)}:${config.timeoutMs}`;
  if (!productionStore || productionIdentity !== identity) {
    productionStore = new RedisAuthAbuseStore(config);
    productionIdentity = identity;
  }
  return productionStore;
}
