import { NextResponse, type NextRequest } from "next/server";
import { applyPrivateCacheHeaders } from "../../lib/security/private-routes";
import {
  ensureCanonicalApplicationUser,
  resolvePostGoogleAuthDestination,
} from "../../lib/auth-identity";
import { createServerSupabase } from "../../lib/supabase/server";
import { emitOperationalEvent } from "../../lib/operations/events/logger";
import {
  issueRecoveryAuthorization,
  RECOVERY_AUTH_COOKIE,
  recoveryAuthorizationCookieOptions,
} from "../../lib/security/auth-abuse/recovery-authorization";
import {
  consumeRecoveryHandoff,
  RECOVERY_HANDOFF_COOKIE,
  RECOVERY_HANDOFF_QUERY,
  recoveryHandoffCookieOptions,
} from "../../lib/security/auth-abuse/recovery-handoff";
import { classifyRecoveryCallback } from "../../lib/security/auth-abuse/recovery-callback.mjs";

export async function GET(request: NextRequest) {
  const flowValues = request.nextUrl.searchParams.getAll("flow");
  const handoffValues = request.nextUrl.searchParams.getAll(RECOVERY_HANDOFF_QUERY);
  const flow = flowValues.length === 1 ? flowValues[0] : null;
  const code = request.nextUrl.searchParams.get("code");
  const providerError = request.nextUrl.searchParams.get("error_description")
    || request.nextUrl.searchParams.get("error");
  if (!code || providerError) return callbackFailure(request, flow);

  const supabase = await createServerSupabase();
  if (!supabase) return callbackFailure(request, flow);

  try {
    const { data: exchangeData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) return callbackFailure(request, flow);

    const redirectType = (exchangeData as typeof exchangeData & { redirectType?: unknown }).redirectType;
    const recoveryClassification = classifyRecoveryCallback({ redirectType, flowValues, handoffValues });
    const { data, error: userError } = await supabase.auth.getUser();
    if (userError || !data.user) {
      return recoveryClassification.recoveryCandidate
        ? recoverySessionFailure(supabase, request)
        : callbackFailure(request, flow);
    }

    if (recoveryClassification.recoveryCandidate) {
      const handoffMarker = request.cookies.get(RECOVERY_HANDOFF_COOKIE)?.value || "";
      let verifiedHandoff = false;
      try {
        verifiedHandoff = recoveryClassification.handoffEligible
          && await consumeRecoveryHandoff(handoffMarker, recoveryClassification.handoffId);
      } catch { /* Fail closed below. */ }
      if (!verifiedHandoff) return recoverySessionFailure(supabase, request);
      let marker = null;
      try {
        marker = await issueRecoveryAuthorization(data.user.id, exchangeData.session.access_token);
      } catch { /* Fail closed below. */ }
      if (!marker) return recoverySessionFailure(supabase, request);
      const response = noStoreRedirect(new URL("/update-password", request.nextUrl.origin));
      response.cookies.set(RECOVERY_AUTH_COOKIE, marker, recoveryAuthorizationCookieOptions());
      clearRecoveryHandoffCookie(response);
      emitOperationalEvent({ actorId: data.user.id, eventType: "password_recovery_authorized", feature: "password_recovery", requestId: crypto.randomUUID(), route: "/auth/callback", severity: "info" });
      return response;
    }
    // A query parameter may select friendlier failure copy, but it cannot turn a
    // normal OAuth/login exchange into an authorized recovery callback.
    if (flow === "recovery") return callbackFailure(request, flow);

    const { hasPet } = await ensureCanonicalApplicationUser(supabase, data.user);
    const destination = resolvePostGoogleAuthDestination(
      hasPet,
      request.nextUrl.searchParams.get("next"),
    );
    return noStoreRedirect(new URL(destination, request.nextUrl.origin));
  } catch {
    return callbackFailure(request, flow);
  }
}

async function recoverySessionFailure(supabase: NonNullable<Awaited<ReturnType<typeof createServerSupabase>>>, request: NextRequest) {
  await supabase.auth.signOut({ scope: "local" }).catch(() => null);
  const response = callbackFailure(request, "recovery");
  clearRecoveryHandoffCookie(response);
  return response;
}

function clearRecoveryHandoffCookie(response: NextResponse) {
  response.cookies.set(RECOVERY_HANDOFF_COOKIE, "", { ...recoveryHandoffCookieOptions(), maxAge: 0 });
}

function callbackFailure(request: NextRequest, flow: string | null) {
  if (flow === "recovery") return noStoreRedirect(new URL("/reset-password/confirm?error=invalid", request.nextUrl.origin));
  if (flow === "confirmation") return noStoreRedirect(new URL("/login?error=confirmation_failed", request.nextUrl.origin));
  return noStoreRedirect(new URL("/login?error=google_auth_failed", request.nextUrl.origin));
}

function noStoreRedirect(url: URL) {
  const response = NextResponse.redirect(url);
  applyPrivateCacheHeaders(response.headers);
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
