import { buildOAuthCallbackUrl, isGoogleAuthEnabled } from "../../../lib/auth-identity";
import { getSafeNextPath } from "../../../lib/auth-routing";
import { createServerSupabase } from "../../../lib/supabase/server";
import { API_BODY_LIMITS, hasOnlyKeys, readBoundedJson } from "../../../lib/security/request";
import { authJson, authLimitResponse, authUnavailableResponse, enforceAuthInitiationLimit, validatePublicAuthOrigin } from "../../../lib/security/auth-abuse";

export async function POST(request: Request) {
  const origin = validatePublicAuthOrigin(request); if (origin) return origin; const requestId = crypto.randomUUID();
  if (!isGoogleAuthEnabled()) return authJson({ code: "OAUTH_UNAVAILABLE", error: "This sign-in option is unavailable.", requestId }, 404);
  let body: unknown; try { body = await readBoundedJson(request, API_BODY_LIMITS.standard); } catch { return authJson({ code: "INVALID_REQUEST", error: "This sign-in option could not start.", requestId }, 400); }
  if (!hasOnlyKeys(body, ["next"])) return authJson({ code: "INVALID_REQUEST", error: "This sign-in option could not start.", requestId }, 400);
  const next = getSafeNextPath(typeof (body as { next?: unknown }).next === "string" ? (body as { next: string }).next : null, "/today");
  const limit = await enforceAuthInitiationLimit({ captchaPresent: false, email: null, flow: "oauth_initiation", policy: "AUTH_OAUTH_INITIATION", request, requestId });
  if (!limit.allowed) return limit.code === "AUTH_RATE_LIMITED" ? authLimitResponse(requestId, limit.retryAfterSeconds) : authUnavailableResponse(requestId);
  const supabase = await createServerSupabase(); if (!supabase) return authUnavailableResponse(requestId);
  let result;
  try {
    result = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: buildOAuthCallbackUrl(new URL(request.url).origin, next), skipBrowserRedirect: true } });
  } catch {
    return authUnavailableResponse(requestId);
  }
  const { data, error } = result;
  if (error || !data.url) return authUnavailableResponse(requestId);
  return authJson({ redirectTo: data.url, requestId });
}
