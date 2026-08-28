import {
  ensureCanonicalApplicationUser,
  isConfirmedAuthUser,
  resolvePostAuthDestination,
} from "../../../lib/auth-identity";
import { createServerSupabase } from "../../../lib/supabase/server";
import { API_BODY_LIMITS, RequestBoundaryError, hasOnlyKeys, readBoundedJson } from "../../../lib/security/request";
import {
  authJson,
  authLimitResponse,
  authUnavailableResponse,
  enforceAuthInitiationLimit,
  normalizeAuthAbuseEmail,
  validatePublicAuthOrigin,
} from "../../../lib/security/auth-abuse";

const INVALID_OTP_MESSAGE = "That code is invalid or expired. Try again or send a new one.";

export async function POST(request: Request) {
  const origin = validatePublicAuthOrigin(request);
  if (origin) return origin;

  const requestId = crypto.randomUUID();
  let body: unknown;
  try {
    body = await readBoundedJson(request, API_BODY_LIMITS.authOtp);
  } catch (error) {
    const oversized = error instanceof RequestBoundaryError && error.code === "PAYLOAD_TOO_LARGE";
    return otpFailure(oversized ? "PAYLOAD_TOO_LARGE" : "INVALID_REQUEST", requestId, oversized ? 413 : 400);
  }

  if (!hasOnlyKeys(body, ["email", "token"])) return otpFailure("INVALID_REQUEST", requestId, 400);
  const input = body as Record<string, unknown>;
  const email = normalizeAuthAbuseEmail(input.email);
  const token = typeof input.token === "string" && /^[0-9]{6}$/.test(input.token) ? input.token : null;
  if (!email || !token) return otpFailure("INVALID_REQUEST", requestId, 400);

  const limit = await enforceAuthInitiationLimit({
    captchaPresent: false,
    email,
    flow: "confirmation_verify",
    policy: "AUTH_CONFIRMATION_VERIFY",
    request,
    requestId,
  });
  if (!limit.allowed) {
    return limit.code === "AUTH_RATE_LIMITED"
      ? authLimitResponse(requestId, limit.retryAfterSeconds)
      : authUnavailableResponse(requestId);
  }

  const supabase = await createServerSupabase();
  if (!supabase) return authUnavailableResponse(requestId);

  let verification;
  try {
    verification = await supabase.auth.verifyOtp({ email, token, type: "email" });
  } catch {
    return authUnavailableResponse(requestId);
  }
  if (verification.error) {
    return (verification.error.status || 0) >= 500
      ? authUnavailableResponse(requestId)
      : otpFailure("INVALID_OR_EXPIRED_CODE", requestId, 400);
  }
  if (!verification.data.session || !verification.data.user) return authUnavailableResponse(requestId);

  const { data, error: userError } = await supabase.auth.getUser();
  if (userError || !isConfirmedAuthUser(data.user)) {
    await supabase.auth.signOut({ scope: "local" }).catch(() => null);
    return otpFailure("INVALID_OR_EXPIRED_CODE", requestId, 400);
  }

  try {
    const { hasPet } = await ensureCanonicalApplicationUser(supabase, data.user);
    return authJson({
      destination: resolvePostAuthDestination(hasPet, null),
      verified: true,
    });
  } catch {
    return authUnavailableResponse(requestId);
  }
}

function otpFailure(code: "INVALID_OR_EXPIRED_CODE" | "INVALID_REQUEST" | "PAYLOAD_TOO_LARGE", requestId: string, status: number) {
  return authJson({ code, error: INVALID_OTP_MESSAGE, requestId, verified: false }, status);
}
