"use client";

import { buildOAuthCallbackUrl } from "./auth-identity";
import { getBrowserSupabase } from "./supabase";

export async function signInWithGoogle(nextPath: string) {
  const supabase = getBrowserSupabase(true);
  if (!supabase || typeof window === "undefined") return { error: new Error("GOOGLE_AUTH_UNAVAILABLE") };
  return supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: buildOAuthCallbackUrl(window.location.origin, nextPath) },
  });
}
