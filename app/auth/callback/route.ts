import { NextResponse, type NextRequest } from "next/server";
import { applyPrivateCacheHeaders } from "../../lib/security/private-routes";
import {
  ensureCanonicalApplicationUser,
  resolvePostGoogleAuthDestination,
} from "../../lib/auth-identity";
import { createServerSupabase } from "../../lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const providerError = request.nextUrl.searchParams.get("error_description")
    || request.nextUrl.searchParams.get("error");
  if (!code || providerError) return loginFailure(request);

  const supabase = await createServerSupabase();
  if (!supabase) return loginFailure(request);

  try {
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) return loginFailure(request);

    const { data, error: userError } = await supabase.auth.getUser();
    if (userError || !data.user) return loginFailure(request);

    const { hasPet } = await ensureCanonicalApplicationUser(supabase, data.user);
    const destination = resolvePostGoogleAuthDestination(
      hasPet,
      request.nextUrl.searchParams.get("next"),
    );
    return noStoreRedirect(new URL(destination, request.nextUrl.origin));
  } catch {
    return loginFailure(request);
  }
}

function loginFailure(request: NextRequest) {
  return noStoreRedirect(new URL("/login?error=google_auth_failed", request.nextUrl.origin));
}

function noStoreRedirect(url: URL) {
  const response = NextResponse.redirect(url);
  applyPrivateCacheHeaders(response.headers);
  return response;
}
