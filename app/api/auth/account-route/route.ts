import { authUserExistsByEmail } from "../../../lib/supabase/account-route-admin";
import { API_BODY_LIMITS, RequestBoundaryError, hasOnlyKeys, readBoundedJson } from "../../../lib/security/request";
import { resolveClientIp } from "../../../lib/security/rate-limit";
import {
  authJson,
  authLimitResponse,
  authUnavailableResponse,
  captchaRequiredResponse,
  enforceAuthInitiationLimit,
  logAuthAbuseEvent,
  normalizeAuthAbuseEmail,
  requireCaptchaToken,
  validatePublicAuthOrigin,
  verifyTurnstileToken,
} from "../../../lib/security/auth-abuse";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const origin = validatePublicAuthOrigin(request);
  if (origin) return origin;
  const requestId = crypto.randomUUID();

  let body: unknown;
  try {
    body = await readBoundedJson(request, API_BODY_LIMITS.standard);
  } catch (error) {
    const oversized = error instanceof RequestBoundaryError && error.code === "PAYLOAD_TOO_LARGE";
    return authJson({ code: oversized ? "PAYLOAD_TOO_LARGE" : "INVALID_REQUEST", error: "Enter a valid email address." }, oversized ? 413 : 400);
  }
  if (!hasOnlyKeys(body, ["email", "captchaToken"])) {
    return authJson({ code: "INVALID_REQUEST", error: "Enter a valid email address." }, 400);
  }

  const input = body as Record<string, unknown>;
  const email = normalizeAuthAbuseEmail(input.email);
  const captcha = requireCaptchaToken(input.captchaToken);
  if (!email) return authJson({ code: "INVALID_EMAIL", error: "Enter a valid email address." }, 400);
  if (!captcha.allowed) return captchaRequiredResponse(requestId);

  if (!captcha.bypassed) {
    if (!captcha.token) return captchaRequiredResponse(requestId);
    const captchaResult = await verifyTurnstileToken({
      action: "account_route",
      expectedHostname: new URL(request.url).hostname,
      remoteIp: resolveClientIp(request),
      requestId,
      token: captcha.token,
    });
    if (captchaResult !== "valid") {
      logAuthAbuseEvent({ captchaPresent: true, elapsedMs: 0, flow: "account_route", outcome: captchaResult === "invalid" ? "captcha_rejected" : "captcha_unavailable", requestId });
      return captchaResult === "invalid" ? captchaRequiredResponse(requestId) : authUnavailableResponse(requestId);
    }
  }

  const limit = await enforceAuthInitiationLimit({
    captchaPresent: Boolean(captcha.token),
    email,
    flow: "account_route",
    policy: "AUTH_ACCOUNT_ROUTE",
    request,
    requestId,
  });
  if (!limit.allowed) {
    return limit.code === "AUTH_RATE_LIMITED"
      ? authLimitResponse(requestId, limit.retryAfterSeconds)
      : authUnavailableResponse(requestId);
  }

  try {
    const exists = await authUserExistsByEmail(email);
    return authJson({ flow: exists ? "signin" : "signup" });
  } catch {
    return authUnavailableResponse(requestId);
  }
}
