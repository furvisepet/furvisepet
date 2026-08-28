import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getSafeNextPath } from "./auth-routing.ts";

export function isGoogleAuthEnabled(value = process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED) {
  return value === "true";
}

export const GOOGLE_AUTH_ENABLED = isGoogleAuthEnabled();

export function normalizeAuthEmail(value: string) {
  return value.normalize("NFKC").trim().toLowerCase();
}

export function isConfirmedAuthUser(user: Pick<User, "email_confirmed_at" | "is_anonymous"> | null | undefined) {
  return Boolean(user?.email_confirmed_at && !user.is_anonymous);
}

export function buildOAuthCallbackUrl(origin: string, nextPath: string) {
  const safeOrigin = origin.replace(/\/$/, "");
  const safeNext = getSafeNextPath(nextPath, "/today");
  const params = new URLSearchParams({ next: safeNext });
  return `${safeOrigin}/auth/callback?${params.toString()}`;
}

export function getConnectedAuthProviders(user: Pick<User, "app_metadata"> | null | undefined) {
  const metadata = user?.app_metadata || {};
  const values = Array.isArray(metadata.providers) ? metadata.providers : [metadata.provider];
  return [...new Set(values.filter((value): value is string => typeof value === "string" && Boolean(value)))];
}

export function friendlyOAuthError(value: string | null | undefined) {
  const normalized = value?.replace(/\+/g, " ").trim();
  if (!normalized) return "Sign-in was cancelled or could not be completed. Please try again.";
  if (/cancel|denied|closed/i.test(normalized)) return "Sign-in was cancelled. You can try again whenever you are ready.";
  if (/identity.*already|linked.*another/i.test(normalized)) return "That sign-in method is already connected to another account. Sign in with that method first.";
  return "That sign-in method could not be completed. Please try again.";
}

export async function ensureCanonicalApplicationUser(supabase: SupabaseClient, user: Pick<User, "id">) {
  const { error: profileError } = await supabase.from("user_profiles")
    .upsert({ user_id: user.id }, { ignoreDuplicates: true, onConflict: "user_id" });
  if (profileError) throw profileError;
  const { count, error: petError } = await supabase.from("dog_profiles")
    .select("id", { count: "exact", head: true }).eq("user_id", user.id);
  if (petError) throw petError;
  return { hasPet: (count || 0) > 0 };
}

export function resolvePostGoogleAuthDestination(hasPet: boolean, requestedNext: string | null | undefined) {
  return resolvePostAuthDestination(hasPet, requestedNext);
}

export function resolvePostAuthDestination(hasPet: boolean, requestedNext: string | null | undefined) {
  if (!hasPet) return "/onboarding";
  return getSafeNextPath(requestedNext, "/today");
}
