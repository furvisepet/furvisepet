import { createServerSupabase } from "../../../lib/supabase/server";
import { API_BODY_LIMITS, RequestBoundaryError, hasOnlyKeys, readBoundedJson } from "../../../lib/security/request";
import { resolveIdempotencyKey } from "../../../lib/security/idempotency/request-key";
import {
  RESEND_NEUTRAL_MESSAGE, authJson, authLimitResponse, authUnavailableResponse, captchaRequiredResponse,
  claimPublicAuthOperation, enforceAuthInitiationLimit, isCaptchaAuthError, normalizeAuthAbuseEmail,
  requireCaptchaToken, validatePublicAuthOrigin,
  releasePublicAuthOperation,
} from "../../../lib/security/auth-abuse";

export async function POST(request: Request) {
  const origin = validatePublicAuthOrigin(request); if (origin) return origin; const requestId = crypto.randomUUID(); let body: unknown;
  try { body = await readBoundedJson(request, API_BODY_LIMITS.standard); } catch (error) { return authJson({ code: error instanceof RequestBoundaryError && error.code === "PAYLOAD_TOO_LARGE" ? "PAYLOAD_TOO_LARGE" : "INVALID_REQUEST", error: "Enter a valid email address.", requestId }, error instanceof RequestBoundaryError && error.code === "PAYLOAD_TOO_LARGE" ? 413 : 400); }
  if (!hasOnlyKeys(body, ["email", "captchaToken"])) return authJson({ code: "INVALID_REQUEST", error: "Enter a valid email address.", requestId }, 400);
  const input = body as Record<string, unknown>; const email = normalizeAuthAbuseEmail(input.email); const captcha = requireCaptchaToken(input.captchaToken);
  if (!email) return authJson({ code: "INVALID_EMAIL", error: "Enter a valid email address.", requestId }, 400); if (!captcha.allowed) return captchaRequiredResponse(requestId);
  const key = resolveIdempotencyKey(request); if ("error" in key) return authJson({ code: "IDEMPOTENCY_KEY_REQUIRED", error: "Refresh the page and try again.", requestId }, 400);
  let claim; try { claim = await claimPublicAuthOperation({ email, flow: "confirmation_resend", idempotencyKey: key.key }); } catch { return authUnavailableResponse(requestId); }
  if (claim === "conflict") return authJson({ code: "IDEMPOTENCY_CONFLICT", error: "Refresh the page and try again.", requestId }, 409); if (claim === "replay") return authJson({ message: RESEND_NEUTRAL_MESSAGE, requestId });
  const limit = await enforceAuthInitiationLimit({ captchaPresent: Boolean(captcha.token), email, flow: "confirmation_resend", policy: "AUTH_CONFIRMATION_RESEND", request, requestId });
  if (!limit.allowed) { await releasePublicAuthOperation({ email, flow: "confirmation_resend", idempotencyKey: key.key }).catch(() => null); return limit.code === "AUTH_RATE_LIMITED" ? authLimitResponse(requestId, limit.retryAfterSeconds) : authUnavailableResponse(requestId); }
  const supabase = await createServerSupabase();
  if (!supabase) {
    await releasePublicAuthOperation({ email, flow: "confirmation_resend", idempotencyKey: key.key }).catch(() => null);
    return authUnavailableResponse(requestId);
  }
  const redirectTo = new URL("/auth/callback?flow=confirmation&next=/onboarding", request.url).toString();
  let result;
  try {
    result = await supabase.auth.resend({ type: "signup", email, options: { captchaToken: captcha.token, emailRedirectTo: redirectTo } });
  } catch {
    await releasePublicAuthOperation({ email, flow: "confirmation_resend", idempotencyKey: key.key }).catch(() => null);
    return authUnavailableResponse(requestId);
  }
  const { error } = result;
  if (error && isCaptchaAuthError(error)) { await releasePublicAuthOperation({ email, flow: "confirmation_resend", idempotencyKey: key.key }).catch(() => null); return captchaRequiredResponse(requestId); } if (error && (error.status || 0) >= 500) { await releasePublicAuthOperation({ email, flow: "confirmation_resend", idempotencyKey: key.key }).catch(() => null); return authUnavailableResponse(requestId); }
  return authJson({ message: RESEND_NEUTRAL_MESSAGE, requestId });
}
