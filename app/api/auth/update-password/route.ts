import { createServerSupabase } from "../../../lib/supabase/server";
import { cookies } from "next/headers";
import { emitOperationalEvent } from "../../../lib/operations/events/logger";
import { API_BODY_LIMITS, RequestBoundaryError, hasOnlyKeys, readBoundedJson } from "../../../lib/security/request";
import { claimIdempotentOperation, resolveIdempotencyKey } from "../../../lib/security/idempotency";
import { beginRateLimitedRequest } from "../../../lib/security/rate-limit";
import {
  clearRecoveryAuthorizationCookie,
  createRecoveryPasswordCommitment,
  inspectRecoveryAuthorization,
  readRecoveryAuthorizationCookie,
} from "../../../lib/security/auth-abuse/recovery-authorization";
import { performRecoveryPasswordUpdate } from "../../../lib/security/auth-abuse/recovery-completion.mjs";
import { finalizeTemporaryRecoverySession } from "../../../lib/security/auth-abuse/recovery-session-cleanup.mjs";
import { reconcilePasswordAuthCapabilityAfterRecovery } from "../../../lib/password-capability";
import { recordPasswordAuthCapability } from "../../../lib/security/password-capability-admin";
import { claimRecoveryAuthorization, consumeRecoveryAuthorization, releaseRecoveryAuthorization } from "../../../lib/security/auth-abuse/recovery-authorization";
import {
  RECOVERY_HANDOFF_COOKIE,
  recoveryHandoffCookieOptions,
} from "../../../lib/security/auth-abuse/recovery-handoff";
import { authJson, authUnavailableResponse, validateAuthPassword, validatePublicAuthOrigin } from "../../../lib/security/auth-abuse";

const ROUTE = "/api/auth/update-password";
const SESSION_AUTH_COOKIE = "furvise-auth-session";

export async function POST(request: Request) {
  const startedAt = Date.now();
  const origin = validatePublicAuthOrigin(request);
  if (origin) return origin;
  const requestId = crypto.randomUUID();

  let body: unknown;
  try { body = await readBoundedJson(request, API_BODY_LIMITS.standard); }
  catch (error) {
    const oversized = error instanceof RequestBoundaryError && error.code === "PAYLOAD_TOO_LARGE";
    return authJson({ code: oversized ? "PAYLOAD_TOO_LARGE" : "INVALID_REQUEST", error: "Choose a valid new password.", requestId }, oversized ? 413 : 400);
  }
  if (!hasOnlyKeys(body, ["password"])) return authJson({ code: "INVALID_REQUEST", error: "Choose a valid new password.", requestId }, 400);
  const password = validateAuthPassword((body as { password?: unknown }).password);
  if (!password.ok) return authJson({ code: "PASSWORD_INVALID", error: "Use a password between 12 and 128 characters.", requestId }, 400);

  const supabase = await createServerSupabase();
  if (!supabase) return authUnavailableResponse(requestId);
  let userId = "";
  let sessionToken = "";
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return recoveryDenied("RECOVERY_AUTH_REQUIRED", requestId, startedAt, 401);
    userId = data.user.id;
    const { data: sessionData } = await supabase.auth.getSession();
    sessionToken = sessionData.session?.access_token || "";
    if (!sessionToken) return recoveryDenied("RECOVERY_AUTH_REQUIRED", requestId, startedAt, 401, userId);
  } catch { return authUnavailableResponse(requestId); }

  const marker = await readRecoveryAuthorizationCookie();
  if (!marker) return recoveryDenied("RECOVERY_AUTH_REQUIRED", requestId, startedAt, 401, userId);

  const passwordCommitment = createRecoveryPasswordCommitment(password.password);
  if (!passwordCommitment) return authUnavailableResponse(requestId);
  const canonicalKey = resolveIdempotencyKey(request);
  if ("error" in canonicalKey) {
    const code = canonicalKey.error === "required" ? "IDEMPOTENCY_KEY_REQUIRED" : canonicalKey.error === "invalid" ? "IDEMPOTENCY_KEY_INVALID" : "IDEMPOTENCY_CONFLICT";
    return authJson({ code, error: "This request needs a valid retry identifier.", requestId }, canonicalKey.error === "conflict" ? 409 : 400);
  }
  const rate = await beginRateLimitedRequest({
    enabled: process.env.NODE_ENV === "production" ? true : undefined,
    idempotencyKey: canonicalKey.key,
    payload: { passwordCommitment },
    policy: "AUTH_PASSWORD_UPDATE",
    request,
    requestId: canonicalKey.key,
    route: ROUTE,
    userId,
  });
  if (!rate.allowed) return rate.response;

  let markerState;
  try { markerState = await inspectRecoveryAuthorization(marker, userId, sessionToken); }
  catch { return authUnavailableResponse(requestId); }
  if (markerState === "expired") return recoveryDenied("RECOVERY_AUTH_EXPIRED", requestId, startedAt, 401, userId);
  if (markerState === "invalid") return recoveryDenied("RECOVERY_AUTH_INVALID", requestId, startedAt, 401, userId);

  const gate = await claimIdempotentOperation({
    candidateKey: canonicalKey.key,
    leaseSeconds: 90,
    operationType: "auth.password-recovery-completion",
    // Never send the password to rate-limit or idempotency storage. The keyed
    // commitment is stable for retries but is not useful for offline guessing.
    payload: { passwordCommitment },
    request,
    retention: "destructive",
    supabase,
    userId,
  });
  if ("response" in gate) return gate.response;

  return gate.operation.execute(async () => {
    const result = await performRecoveryPasswordUpdate({
      claimAuthorization: () => claimRecoveryAuthorization(marker, userId, sessionToken, gate.operation.key),
      consumeAuthorization: () => consumeRecoveryAuthorization(marker, userId, sessionToken, gate.operation.key),
      releaseAuthorization: () => releaseRecoveryAuthorization(marker, userId, sessionToken, gate.operation.key),
      updatePassword: async () => {
        try {
          const { error } = await supabase.auth.updateUser({ password: password.password });
          return !error;
        } catch { return false; }
      },
    });
    if (result.outcome === "completed" || result.outcome === "reconciliation_required") {
      const capabilityReconciliation = await reconcilePasswordAuthCapabilityAfterRecovery({
        outcome: result.outcome,
        recordCapability: (enabledAt) => recordPasswordAuthCapability(userId, enabledAt),
      });
      await closeTemporaryRecoverySession(supabase);
      const reconciliationRequired = result.outcome === "reconciliation_required"
        || capabilityReconciliation === "reconciliation_required";
      const resultCode = capabilityReconciliation === "reconciliation_required"
        ? "PASSWORD_CAPABILITY_RECONCILIATION_REQUIRED"
        : result.outcome === "completed" ? "PASSWORD_UPDATED" : "PASSWORD_UPDATED_RECONCILED";
      emitResult(
        "password_recovery_completed",
        resultCode,
        requestId,
        startedAt,
        userId,
        reconciliationRequired ? "high" : "info",
      );
      return authJson({ code: "PASSWORD_UPDATED", message: "Your password was updated.", requestId });
    }
    if (result.outcome === "provider_failure") {
      emitResult("password_recovery_denied", "PASSWORD_PROVIDER_FAILURE", requestId, startedAt, userId, "warning");
      return authJson({ code: "PASSWORD_PROVIDER_FAILURE", error: "Furvise could not update your password. Please try again.", requestId }, 503);
    }
    const code = result.outcome === "in_progress" ? "RECOVERY_UPDATE_IN_PROGRESS"
      : result.outcome === "authorization_consumed" ? "RECOVERY_AUTH_CONSUMED"
        : result.outcome === "authorization_expired" ? "RECOVERY_AUTH_EXPIRED" : "RECOVERY_AUTH_INVALID";
    return recoveryDenied(code, requestId, startedAt, result.outcome === "in_progress" || result.outcome === "authorization_consumed" ? 409 : 401, userId);
  });
}

async function closeTemporaryRecoverySession(
  supabase: NonNullable<Awaited<ReturnType<typeof createServerSupabase>>>,
) {
  // Recovery must end every provider session, including the temporary session
  // used for updateUser. Cookie cleanup below still runs if provider sign-out
  // is unavailable so the browser cannot enter the authenticated application.
  await finalizeTemporaryRecoverySession({
    clearLocalState: clearTemporaryRecoveryCookies,
    signOutGlobally: async () => {
      const { error } = await supabase.auth.signOut({ scope: "global" });
      if (error) throw error;
    },
  });
}

async function clearTemporaryRecoveryCookies() {
  try { await clearRecoveryAuthorizationCookie(); }
  catch { /* Continue clearing the remaining recovery and auth cookies. */ }

  try {
    const cookieStore = await cookies();
    cookieStore.set(RECOVERY_HANDOFF_COOKIE, "", { ...recoveryHandoffCookieOptions(), maxAge: 0 });
    cookieStore.set(SESSION_AUTH_COOKIE, "", { maxAge: 0, path: "/", sameSite: "lax", secure: process.env.NODE_ENV === "production" });

    const authCookiePrefix = getSupabaseAuthCookiePrefix();
    if (authCookiePrefix) {
      cookieStore.getAll()
        .filter(({ name }) => name === authCookiePrefix || name.startsWith(`${authCookiePrefix}.`))
        .forEach(({ name }) => cookieStore.set(name, "", { maxAge: 0, path: "/", sameSite: "lax", secure: process.env.NODE_ENV === "production" }));
    }
  } catch { /* The fixed browser cleanup and login redirect remain mandatory. */ }
}

function getSupabaseAuthCookiePrefix() {
  try {
    const projectRef = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "").hostname.split(".")[0] || "";
    return projectRef ? `sb-${projectRef}-auth-token` : "";
  } catch { return ""; }
}

function recoveryDenied(code: string, requestId: string, startedAt: number, status: number, userId?: string) {
  emitResult("password_recovery_denied", code, requestId, startedAt, userId, "warning");
  const error = code === "RECOVERY_UPDATE_IN_PROGRESS" ? "This password update is already being processed."
    : code === "RECOVERY_AUTH_CONSUMED" ? "This password reset has already been used. Request a new reset email."
      : "This password reset link is missing or expired. Request a new reset email.";
  return authJson({ code, error, requestId }, status);
}

function emitResult(eventType: "password_recovery_completed" | "password_recovery_denied", errorCode: string, requestId: string, startedAt: number, actorId?: string, severity: "info" | "warning" | "high" = "info") {
  emitOperationalEvent({ actorId, durationMs: Date.now() - startedAt, errorCode, eventType, feature: "password_recovery", requestId, route: ROUTE, severity });
}
