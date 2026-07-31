import { NextResponse, type NextRequest } from "next/server";
import { applyPrivateCacheHeaders } from "../../lib/security/private-routes";
import {
  ensureCanonicalApplicationUser,
  resolvePostGoogleAuthDestination,
} from "../../lib/auth-identity";
import { createServerSupabase } from "../../lib/supabase/server";

export async function GET(request: NextRequest) {
  const flow = request.nextUrl.searchParams.get("flow");
  const code = request.nextUrl.searchParams.get("code");
  const providerError = request.nextUrl.searchParams.get("error_description")
    || request.nextUrl.searchParams.get("error");
  if (!code || providerError) return callbackFailure(request, flow);

  const supabase = await createServerSupabase();
  if (!supabase) return callbackFailure(request, flow);

  try {
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) return callbackFailure(request, flow);

    const { data, error: userError } = await supabase.auth.getUser();
    if (userError || !data.user) return callbackFailure(request, flow);

    if (flow === "recovery") return noStoreRedirect(new URL("/update-password", request.nextUrl.origin));

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

function callbackFailure(request: NextRequest, flow: string | null) {
  if (flow === "recovery") return noStoreRedirect(new URL("/forgot-password?error=recovery_link_failed", request.nextUrl.origin));
  if (flow === "confirmation") return noStoreRedirect(new URL("/login?error=confirmation_failed", request.nextUrl.origin));
  return noStoreRedirect(new URL("/login?error=google_auth_failed", request.nextUrl.origin));
}

function noStoreRedirect(url: URL) {
  const response = NextResponse.redirect(url);
  applyPrivateCacheHeaders(response.headers);
  return response;
}
