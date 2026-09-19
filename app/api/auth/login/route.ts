import { ensureCanonicalApplicationUser } from "../../../lib/auth-identity";
import { createServerSupabase } from "../../../lib/supabase/server";
import { API_BODY_LIMITS, RequestBoundaryError, hasOnlyKeys, readBoundedJson } from "../../../lib/security/request";
import {
  authJson, authLimitResponse, authUnavailableResponse, captchaRequiredResponse, clearLoginCredentialFailures,
  enforceAuthInitiationLimit, getLoginCaptchaMode, getLoginFailureState, isCaptchaAuthError, logAuthAbuseEvent,
  normalizeAuthAbuseEmail, recordLoginCredentialFailure, resolveLoginCaptcha, validatePublicAuthOrigin,
} from "../../../lib/security/auth-abuse";

export async function POST(request: Request) {
  const origin = validatePublicAuthOrigin(request); if (origin) return origin;
  const requestId = crypto.randomUUID(); let body: unknown;
  try { body = await readBoundedJson(request, API_BODY_LIMITS.standard); }
  catch (error) { return authJson({ code: error instanceof RequestBoundaryError && error.code === "PAYLOAD_TOO_LARGE" ? "PAYLOAD_TOO_LARGE" : "INVALID_REQUEST", error: "Email or password is incorrect.", requestId }, error instanceof RequestBoundaryError && error.code === "PAYLOAD_TOO_LARGE" ? 413 : 400); }
  if (!hasOnlyKeys(body, ["email", "password", "captchaToken"])) return authJson({ code: "INVALID_REQUEST", error: "Email or password is incorrect.", requestId }, 400);
  const input = body as Record<string, unknown>; const email = normalizeAuthAbuseEmail(input.email); const password = typeof input.password === "string" && input.password.length <= 128 ? input.password : null;
  if (!email || password === null) return authJson({ code: "INVALID_CREDENTIALS", error: "Email or password is incorrect.", requestId }, 401);
  const limit = await enforceAuthInitiationLimit({ captchaPresent: typeof input.captchaToken === "string", email, flow: "login", policy: "AUTH_LOGIN", request, requestId });
  if (!limit.allowed) return limit.code === "AUTH_RATE_LIMITED" ? authLimitResponse(requestId, limit.retryAfterSeconds) : authUnavailableResponse(requestId);
  let failures;
  try { failures = await getLoginFailureState({ email, request }); } catch { return authUnavailableResponse(requestId); }
  if (failures.blocked) return authLimitResponse(requestId, failures.retryAfterSeconds);
  const challengeRequired = getLoginCaptchaMode() === "always" || failures.challengeRequired;
  const captcha = resolveLoginCaptcha(input, challengeRequired);
  if (!captcha.allowed) return captchaRequiredResponse(requestId);
  const supabase = await createServerSupabase(); if (!supabase) return authUnavailableResponse(requestId);
  const started = Date.now();
  let result;
  try {
    result = await supabase.auth.signInWithPassword({ email, password, options: { captchaToken: captcha.token } });
  } catch {
    return authUnavailableResponse(requestId);
  }
  const { data, error } = result;
  if (error) {
    if (isCaptchaAuthError(error)) return captchaRequiredResponse(requestId);
    if (isCredentialFailure(error)) await recordLoginCredentialFailure({ email, request }).catch(() => null);
    if ((error.status || 0) >= 500) return authUnavailableResponse(requestId);
    logAuthAbuseEvent({ captchaPresent: Boolean(captcha.token), elapsedMs: Date.now() - started, flow: "login", outcome: "credentials_rejected", requestId });
    return authJson({ code: "INVALID_CREDENTIALS", error: "Email or password is incorrect.", requestId }, 401);
  }
  if (!data.user || !data.session) return authUnavailableResponse(requestId);
  await clearLoginCredentialFailures({ email, request }).catch(() => null);
  await ensureCanonicalApplicationUser(supabase, data.user).catch(() => null);
  logAuthAbuseEvent({ captchaPresent: Boolean(captcha.token), elapsedMs: Date.now() - started, flow: "login", outcome: "authenticated", requestId });
  return authJson({ ok: true, requestId });
}

function isCredentialFailure(error: { code?: string }) {
  return error.code === "invalid_credentials" || error.code === "invalid_login_credentials";
}
