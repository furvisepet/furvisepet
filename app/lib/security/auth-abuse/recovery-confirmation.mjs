const VERIFY_PATH = "/auth/v1/verify";
const RECOVERY_CALLBACK_PATH = "/auth/callback?flow=recovery";
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,512}$/;

export function buildRecoveryVerificationUrl({ tokenHash, type }, supabaseUrl, applicationOrigin) {
  let configured;
  let appOrigin;
  try {
    configured = new URL(supabaseUrl);
    appOrigin = new URL(applicationOrigin).origin;
  } catch {
    return null;
  }

  if (!isAllowedConfiguredOrigin(configured) || !TOKEN_PATTERN.test(tokenHash) || type !== "recovery") return null;
  const expectedRedirect = new URL(RECOVERY_CALLBACK_PATH, appOrigin).toString();

  // Construct rather than forwarding template input. This fixes the provider
  // origin, path, parameter set, recovery type, and Furvise callback.
  const verified = new URL(VERIFY_PATH, configured.origin);
  verified.searchParams.set("token", tokenHash);
  verified.searchParams.set("type", "recovery");
  verified.searchParams.set("redirect_to", expectedRedirect);
  return { tokenHash, url: verified };
}

export async function claimRecoveryContinuationInStore({ store, token, secret, ttlMs = 24 * 60 * 60 * 1000 }) {
  const identity = createRecoveryContinuationIdentity(token, secret);
  if (!identity) throw new Error("AUTH_PROTECTION_UNAVAILABLE");
  const result = await store.claim({
    // A fresh fingerprint deliberately turns both sequential replay and a
    // concurrent duplicate into a conflict after the first atomic claim.
    fingerprint: randomUUID(),
    key: `furvise:v1:auth:recovery-continuation:${identity}`,
    ttlMs,
  });
  return result === "new" ? "claimed" : "already_used";
}

function isAllowedConfiguredOrigin(url) {
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) return false;
  if (url.protocol === "https:") return true;
  return url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname);
}

export const RECOVERY_CONFIRMATION_LIMITS = {
  bodyBytes: 8 * 1024,
  claimTtlMs: 24 * 60 * 60 * 1000,
};
import { randomUUID } from "node:crypto";
import { createRecoveryContinuationIdentity } from "./recovery-secrets.mjs";
