export const RECENT_INTERACTIVE_AUTH_MAX_AGE_SECONDS = 15 * 60;

export const ELIGIBLE_INTERACTIVE_AUTH_METHODS = Object.freeze([
  "password",
  "oauth",
  "otp",
  "magiclink",
  "sso/saml",
  "totp",
  "mfa/totp",
  "mfa/phone",
  "mfa/webauthn",
  "web3",
  "oauth_provider/authorization_code",
]);

const ELIGIBLE_METHODS = new Set(ELIGIBLE_INTERACTIVE_AUTH_METHODS);
const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Evaluates claims only after the caller has cryptographically verified them.
 * JWT iat is deliberately ignored: refreshes issue a new JWT without proving
 * that the user interacted with an authentication method again.
 */
export function assessRecentInteractiveAuthentication(claims, expectedUserId, nowMs = Date.now()) {
  if (!claims || typeof claims !== "object" || Array.isArray(claims)) return denied("claims_missing");
  if (typeof expectedUserId !== "string" || claims.sub !== expectedUserId) return denied("subject_mismatch");
  if (typeof claims.session_id !== "string" || !SESSION_ID_PATTERN.test(claims.session_id)) return denied("session_missing");
  if (claims.is_anonymous === true) return denied("method_ineligible");
  if (!Array.isArray(claims.amr) || claims.amr.length === 0) return denied("amr_missing");

  const nowSeconds = Math.floor(nowMs / 1_000);
  if (!Number.isSafeInteger(nowSeconds) || nowSeconds <= 0) return denied("amr_malformed");
  let newestEligible = null;
  for (const entry of claims.amr) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)
      || typeof entry.method !== "string" || !entry.method
      || !Number.isSafeInteger(entry.timestamp) || entry.timestamp <= 0) {
      return denied("amr_malformed");
    }
    if (entry.timestamp > nowSeconds) return denied("amr_malformed");
    // Recovery authenticates control of the recovery channel, not a normal
    // eligible login. It poisons the session even if another AMR is present.
    if (entry.method === "recovery") return denied("method_ineligible");
    if (ELIGIBLE_METHODS.has(entry.method)) {
      newestEligible = newestEligible === null ? entry.timestamp : Math.max(newestEligible, entry.timestamp);
    }
  }

  if (newestEligible === null) return denied("method_ineligible");
  if (nowSeconds - newestEligible > RECENT_INTERACTIVE_AUTH_MAX_AGE_SECONDS) return denied("authentication_stale");
  return { allowed: true, authenticatedAt: newestEligible, method: claims.amr.find((entry) => entry.timestamp === newestEligible && ELIGIBLE_METHODS.has(entry.method)).method, sessionId: claims.session_id };
}

function denied(reason) {
  return { allowed: false, code: "RECENT_AUTH_REQUIRED", reason };
}
