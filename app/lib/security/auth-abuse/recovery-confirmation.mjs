const VERIFY_PATH = "/auth/v1/verify";
const RECOVERY_CALLBACK_PATH = "/auth/callback?flow=recovery";
const MAX_CONFIRMATION_URL_LENGTH = 4096;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,512}$/;

export function parseRecoveryConfirmationUrl(rawUrl, supabaseUrl, applicationOrigin) {
  if (typeof rawUrl !== "string" || rawUrl.length === 0 || rawUrl.length > MAX_CONFIRMATION_URL_LENGTH) return null;

  let configured;
  let candidate;
  let appOrigin;
  try {
    configured = new URL(supabaseUrl);
    candidate = new URL(rawUrl);
    appOrigin = new URL(applicationOrigin).origin;
  } catch {
    return null;
  }

  if (!isAllowedConfiguredOrigin(configured) || candidate.origin !== configured.origin) return null;
  if (candidate.username || candidate.password || candidate.hash || candidate.pathname !== VERIFY_PATH) return null;
  if (!hasExactlyOnce(candidate.searchParams, ["redirect_to", "token", "type"])) return null;

  const token = candidate.searchParams.get("token") || "";
  const type = candidate.searchParams.get("type");
  const redirectTo = candidate.searchParams.get("redirect_to");
  const expectedRedirect = new URL(RECOVERY_CALLBACK_PATH, appOrigin).toString();
  if (!TOKEN_PATTERN.test(token) || type !== "recovery" || redirectTo !== expectedRedirect) return null;

  // Reconstruct rather than forwarding arbitrary input. This fixes the origin,
  // path, parameter set, recovery type, and Furvise callback destination.
  const verified = new URL(VERIFY_PATH, configured.origin);
  verified.searchParams.set("token", token);
  verified.searchParams.set("type", "recovery");
  verified.searchParams.set("redirect_to", expectedRedirect);
  return { token, url: verified };
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

function hasExactlyOnce(parameters, expectedKeys) {
  const keys = [...parameters.keys()];
  if (keys.length !== expectedKeys.length) return false;
  return expectedKeys.every((key) => parameters.getAll(key).length === 1)
    && keys.every((key) => expectedKeys.includes(key));
}

function isAllowedConfiguredOrigin(url) {
  if (url.username || url.password || url.search || url.hash) return false;
  if (url.protocol === "https:") return true;
  return url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname);
}

export const RECOVERY_CONFIRMATION_LIMITS = {
  bodyBytes: 8 * 1024,
  claimTtlMs: 24 * 60 * 60 * 1000,
};
import { randomUUID } from "node:crypto";
import { createRecoveryContinuationIdentity } from "./recovery-secrets.mjs";
