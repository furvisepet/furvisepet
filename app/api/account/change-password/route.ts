import { createServerSupabase } from "../../../lib/supabase/server";
import { emitOperationalEvent } from "../../../lib/operations/events/logger";
import { resolveIdempotencyKey } from "../../../lib/security/idempotency";
import { beginRateLimitedRequest } from "../../../lib/security/rate-limit";
import { API_BODY_LIMITS, RequestBoundaryError, hasOnlyKeys, readBoundedJson } from "../../../lib/security/request";
import { claimPublicAuthOperation, getAuthAbuseConfig, releasePublicAuthOperation, requireCaptchaToken, validateAuthPassword, validatePublicAuthOrigin } from "../../../lib/security/auth-abuse";
import {
  createAccountPasswordCommitment,
  hasEmailPasswordProvider,
  passwordsMatch,
  performAccountPasswordChange,
} from "../../../lib/security/account-password-change.mjs";
import { hasPasswordAuthCapability } from "../../../lib/password-capability";

const ROUTE = "/api/account/change-password";

export async function POST(request: Request) {
  const origin = validatePublicAuthOrigin(request);
  if (origin) return origin;
  const requestId = crypto.randomUUID();
  let body: unknown;
  try {
    body = await readBoundedJson(request, Math.min(API_BODY_LIMITS.standard, 4 * 1024));
  } catch (error) {
    const oversized = error instanceof RequestBoundaryError && error.code === "PAYLOAD_TOO_LARGE";
    return passwordResponse(oversized ? "PAYLOAD_TOO_LARGE" : "INVALID_REQUEST", "Check the password fields and try again.", requestId, oversized ? 413 : 400);
  }
  if (!hasOnlyKeys(body, ["currentPassword", "newPassword", "confirmPassword", "captchaToken"])) {
    return passwordResponse("INVALID_REQUEST", "Check the password fields and try again.", requestId, 400);
  }
  const input = body as Record<string, unknown>;
  const currentPassword = typeof input.currentPassword === "string" && input.currentPassword.length >= 1 && input.currentPassword.length <= 128
    ? { ok: true as const, password: input.currentPassword }
    : { ok: false as const };
  const newPassword = validateAuthPassword(input.newPassword);
  const confirmation = validateAuthPassword(input.confirmPassword);
  const captcha = input.captchaToken === undefined && process.env.NODE_ENV !== "production"
    ? { allowed: true as const, token: undefined }
    : requireCaptchaToken(input.captchaToken);
  if (!captcha.allowed) return passwordResponse("CAPTCHA_REQUIRED", "Complete the security check and try again.", requestId, 403);
  if (!currentPassword.ok || !newPassword.ok || !confirmation.ok) {
    return passwordResponse("PASSWORD_INVALID", "Use your current password and choose a new password between 12 and 128 characters.", requestId, 400);
  }
  if (!passwordsMatch(newPassword.password, confirmation.password)) {
    return passwordResponse("PASSWORD_MISMATCH", "The new passwords do not match.", requestId, 400);
  }
  if (passwordsMatch(currentPassword.password, newPassword.password)) {
    return passwordResponse("PASSWORD_REUSED", "Choose a password different from your current password.", requestId, 400);
  }

  const supabase = await createServerSupabase();
  if (!supabase) return passwordResponse("AUTH_UNAVAILABLE", "Account security is temporarily unavailable.", requestId, 503);
  let user;
  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
    if (result.error || !user || user.is_anonymous || !user.email_confirmed_at) {
      return passwordResponse("AUTH_REQUIRED", "Sign in again to change your password.", requestId, 401);
    }
  } catch {
    return passwordResponse("AUTH_UNAVAILABLE", "Account security is temporarily unavailable.", requestId, 503);
  }
  let passwordAuthEnabledAt: string | null = null;
  if (!hasEmailPasswordProvider(user)) {
    const { data: capability, error: capabilityError } = await supabase.from("user_profiles")
      .select("password_auth_enabled_at")
      .maybeSingle<{ password_auth_enabled_at: string | null }>();
    if (capabilityError) {
      return passwordResponse("AUTH_UNAVAILABLE", "Account security is temporarily unavailable.", requestId, 503);
    }
    passwordAuthEnabledAt = capability?.password_auth_enabled_at || null;
  }
  if (!hasPasswordAuthCapability(user, passwordAuthEnabledAt)) {
    return passwordResponse("PASSWORD_RESET_REQUIRED", "Use a verified password-reset email to set a password for this account.", requestId, 409);
  }
  if (!user.email) return passwordResponse("AUTH_UNAVAILABLE", "Account security is temporarily unavailable.", requestId, 503);

  const secret = getAuthAbuseConfig().hashSecret;
  const currentCommitment = createAccountPasswordCommitment(currentPassword.password, secret);
  const newCommitment = createAccountPasswordCommitment(newPassword.password, secret);
  if (!currentCommitment || !newCommitment) return passwordResponse("AUTH_UNAVAILABLE", "Account security is temporarily unavailable.", requestId, 503);

  const canonicalKey = resolveIdempotencyKey(request);
  if ("error" in canonicalKey) {
    const code = canonicalKey.error === "required" ? "IDEMPOTENCY_KEY_REQUIRED" : canonicalKey.error === "conflict" ? "IDEMPOTENCY_CONFLICT" : "IDEMPOTENCY_KEY_INVALID";
    return passwordResponse(code, "This request needs a valid retry identifier.", requestId, canonicalKey.error === "conflict" ? 409 : 400);
  }
  const rate = await beginRateLimitedRequest({
    enabled: process.env.NODE_ENV === "production" ? true : undefined,
    idempotencyKey: canonicalKey.key,
    payload: { currentCommitment, newCommitment },
    policy: "ACCOUNT_PASSWORD_CHANGE",
    request,
    requestId: canonicalKey.key,
    route: ROUTE,
    userId: user.id,
  });
  if (!rate.allowed) return rate.response;
  let claim;
  try {
    claim = await claimPublicAuthOperation({
      email: user.id,
      flow: "account_password_change",
      idempotencyKey: canonicalKey.key,
      semanticSecret: `${currentCommitment}:${newCommitment}`,
      ttlMs: 10 * 60_000,
    });
  } catch {
    return passwordResponse("IDEMPOTENCY_UNAVAILABLE", "Account security is temporarily unavailable.", requestId, 503);
  }
  if (claim === "conflict") return passwordResponse("IDEMPOTENCY_CONFLICT", "This retry identifier was already used for different details.", requestId, 409);
  if (claim === "replay") return passwordResponse("REQUEST_IN_PROGRESS", "This password change was already submitted.", requestId, 409);

  const activeClaim = {
    email: user.id,
    flow: "account_password_change" as const,
    idempotencyKey: "active-password-change",
    semanticSecret: `${currentCommitment}:${newCommitment}`,
  };
  let active;
  try {
    active = await claimPublicAuthOperation({ ...activeClaim, ttlMs: 90_000 });
  } catch {
    return passwordResponse("IDEMPOTENCY_UNAVAILABLE", "Account security is temporarily unavailable.", requestId, 503);
  }
  if (active !== "new") return passwordResponse("REQUEST_IN_PROGRESS", "Another password change is already being processed.", requestId, 409);

  return (async () => {
    try {
      const startedAt = Date.now();
      const result = await performAccountPasswordChange({
        auth: {
          email: user.email!,
          signInWithPassword: (credentials: { email: string; options?: { captchaToken: string }; password: string }) => supabase.auth.signInWithPassword(credentials),
          signOut: (options: { scope: "local" | "others" }) => supabase.auth.signOut(options),
          updateUser: (attributes: { password: string }) => supabase.auth.updateUser(attributes),
        },
        captchaToken: captcha.token,
        currentPassword: currentPassword.password,
        expectedUserId: user.id,
        newPassword: newPassword.password,
      });
      if (result.outcome === "current_password_invalid") {
        emitResult("CURRENT_PASSWORD_INVALID", requestId, startedAt, user.id, "warning");
        return passwordResponse("CURRENT_PASSWORD_INVALID", "The current password could not be verified.", requestId, 401);
      }
      if (result.outcome === "identity_mismatch") {
        emitResult("REAUTHENTICATION_MISMATCH", requestId, startedAt, user.id, "high");
        return passwordResponse("AUTH_REQUIRED", "Sign in again to change your password.", requestId, 401);
      }
      if (result.outcome !== "completed") {
        emitResult("PASSWORD_CHANGE_FAILED", requestId, startedAt, user.id, "warning");
        return passwordResponse("PASSWORD_CHANGE_FAILED", "Furvise could not change your password. Please try again.", requestId, 503);
      }
      emitResult(result.otherSessionsSignedOut ? "PASSWORD_CHANGED" : "PASSWORD_CHANGED_SESSION_WARNING", requestId, startedAt, user.id, result.otherSessionsSignedOut ? "info" : "warning");
      return passwordResponse(
        result.otherSessionsSignedOut ? "PASSWORD_CHANGED" : "PASSWORD_CHANGED_SESSION_WARNING",
        result.otherSessionsSignedOut
          ? "Password changed. Your current session remains active and other sessions were signed out."
          : "Password changed, but Furvise could not confirm that other sessions were signed out.",
        requestId,
        200,
        { otherSessionsSignedOut: result.otherSessionsSignedOut },
      );
    } finally {
      await releasePublicAuthOperation(activeClaim).catch(() => null);
    }
  })();
}

function passwordResponse(code: string, message: string, requestId: string, status: number, extra: Record<string, unknown> = {}) {
  return Response.json({ code, message, requestId, ...extra }, { headers: { "Cache-Control": "private, no-store, max-age=0" }, status });
}

function emitResult(errorCode: string, requestId: string, startedAt: number, actorId: string, severity: "info" | "warning" | "high") {
  emitOperationalEvent({ actorId, durationMs: Date.now() - startedAt, errorCode, eventType: "account_password_change", feature: "account_security", requestId, route: ROUTE, severity });
}
