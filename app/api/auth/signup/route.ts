import { ensureCanonicalApplicationUser } from "../../../lib/auth-identity";
import { createServerSupabase } from "../../../lib/supabase/server";
import { API_BODY_LIMITS, RequestBoundaryError, hasOnlyKeys, readBoundedJson } from "../../../lib/security/request";
import { resolveIdempotencyKey } from "../../../lib/security/idempotency/request-key";
import {
  SIGNUP_NEUTRAL_MESSAGE, authJson, authLimitResponse, authUnavailableResponse, captchaRequiredResponse,
  claimPublicAuthOperation, enforceAuthInitiationLimit, isCaptchaAuthError, logAuthAbuseEvent,
  normalizeAuthAbuseEmail, requireCaptchaToken, validateAuthPassword, validatePublicAuthOrigin,
  releasePublicAuthOperation,
} from "../../../lib/security/auth-abuse";

export async function POST(request: Request) {
  const origin = validatePublicAuthOrigin(request); if (origin) return origin;
  const requestId = crypto.randomUUID();
  let body: unknown;
  try { body = await readBoundedJson(request, API_BODY_LIMITS.standard); }
  catch (error) { return authJson({ code: error instanceof RequestBoundaryError && error.code === "PAYLOAD_TOO_LARGE" ? "PAYLOAD_TOO_LARGE" : "INVALID_REQUEST", error: "Review your account details and try again.", requestId }, error instanceof RequestBoundaryError && error.code === "PAYLOAD_TOO_LARGE" ? 413 : 400); }
  if (!hasOnlyKeys(body, ["email", "password", "captchaToken"])) return authJson({ code: "INVALID_REQUEST", error: "Review your account details and try again.", requestId }, 400);
  const input = body as Record<string, unknown>;
  const email = normalizeAuthAbuseEmail(input.email); const password = validateAuthPassword(input.password); const captcha = requireCaptchaToken(input.captchaToken);
  if (!email || !password.ok) return authJson({ code: "INVALID_ACCOUNT_DETAILS", error: "Use a valid email and a password between 12 and 128 characters.", requestId }, 400);
  if (!captcha.allowed) return captchaRequiredResponse(requestId);
  const key = resolveIdempotencyKey(request); if ("error" in key) return authJson({ code: "IDEMPOTENCY_KEY_REQUIRED", error: "Refresh the page and try again.", requestId }, 400);
  let claim;
  try { claim = await claimPublicAuthOperation({ email, flow: "signup", idempotencyKey: key.key, semanticSecret: password.password }); }
  catch { return authUnavailableResponse(requestId); }
  if (claim === "conflict") return authJson({ code: "IDEMPOTENCY_CONFLICT", error: "Refresh the page before changing account details.", requestId }, 409);
  if (claim === "replay") return authJson({ message: SIGNUP_NEUTRAL_MESSAGE, pendingConfirmation: true, requestId });
  const limit = await enforceAuthInitiationLimit({ captchaPresent: Boolean(captcha.token), email, flow: "signup", policy: "AUTH_SIGNUP", request, requestId });
  if (!limit.allowed) { await releasePublicAuthOperation({ email, flow: "signup", idempotencyKey: key.key, semanticSecret: password.password }).catch(() => null); return limit.code === "AUTH_RATE_LIMITED" ? authLimitResponse(requestId, limit.retryAfterSeconds) : authUnavailableResponse(requestId); }
  const supabase = await createServerSupabase();
  if (!supabase) {
    await releasePublicAuthOperation({ email, flow: "signup", idempotencyKey: key.key, semanticSecret: password.password }).catch(() => null);
    return authUnavailableResponse(requestId);
  }
  const redirectTo = new URL("/auth/callback?flow=confirmation&next=/onboarding", request.url).toString();
  const started = Date.now();
  let result;
  try {
    result = await supabase.auth.signUp({ email, password: password.password, options: { captchaToken: captcha.token, emailRedirectTo: redirectTo } });
  } catch {
    await releasePublicAuthOperation({ email, flow: "signup", idempotencyKey: key.key, semanticSecret: password.password }).catch(() => null);
    return authUnavailableResponse(requestId);
  }
  const { data, error } = result;
  if (error && isCaptchaAuthError(error)) { await releasePublicAuthOperation({ email, flow: "signup", idempotencyKey: key.key, semanticSecret: password.password }).catch(() => null); return captchaRequiredResponse(requestId); }
  if (error && (error.status || 0) >= 500) { await releasePublicAuthOperation({ email, flow: "signup", idempotencyKey: key.key, semanticSecret: password.password }).catch(() => null); return authUnavailableResponse(requestId); }
  if (data.session && data.user) await ensureCanonicalApplicationUser(supabase, data.user).catch(() => null);
  logAuthAbuseEvent({ captchaPresent: Boolean(captcha.token), elapsedMs: Date.now() - started, flow: "signup", outcome: error ? "auth_rejected_neutral" : "submitted", requestId });
  return authJson({ message: SIGNUP_NEUTRAL_MESSAGE, pendingConfirmation: true, requestId });
}
