import { createServerSupabase } from "../../../lib/supabase/server";
import { API_BODY_LIMITS, hasOnlyKeys, readBoundedJson } from "../../../lib/security/request";
import { authJson, authUnavailableResponse, validateAuthPassword, validatePublicAuthOrigin } from "../../../lib/security/auth-abuse";

export async function POST(request: Request) {
  const origin = validatePublicAuthOrigin(request); if (origin) return origin; const requestId = crypto.randomUUID();
  let body: unknown; try { body = await readBoundedJson(request, API_BODY_LIMITS.standard); } catch { return authJson({ code: "INVALID_REQUEST", error: "Choose a valid new password.", requestId }, 400); }
  if (!hasOnlyKeys(body, ["password"])) return authJson({ code: "INVALID_REQUEST", error: "Choose a valid new password.", requestId }, 400);
  const password = validateAuthPassword((body as { password?: unknown }).password);
  if (!password.ok) return authJson({ code: "PASSWORD_INVALID", error: "Use a password between 12 and 128 characters.", requestId }, 400);
  const supabase = await createServerSupabase(); if (!supabase) return authUnavailableResponse(requestId);
  try {
    const { data, error: userError } = await supabase.auth.getUser();
    if (userError || !data.user) return authJson({ code: "RECOVERY_SESSION_REQUIRED", error: "This password reset link is missing or expired. Request a new reset email.", requestId }, 401);
    const { error } = await supabase.auth.updateUser({ password: password.password });
    if (error) return (error.status || 0) >= 500 ? authUnavailableResponse(requestId) : authJson({ code: "PASSWORD_UPDATE_FAILED", error: "Furvise could not update your password. Request a new reset link and try again.", requestId }, 400);
  } catch {
    return authUnavailableResponse(requestId);
  }
  return authJson({ message: "Your password was updated.", requestId });
}
