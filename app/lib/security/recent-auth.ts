import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { RECENT_INTERACTIVE_AUTH_MAX_AGE_SECONDS, assessRecentInteractiveAuthentication } from "./recent-interactive-auth.mjs";

export const RECENT_AUTH_MAX_AGE_MS = RECENT_INTERACTIVE_AUTH_MAX_AGE_SECONDS * 1_000;

export function hasRecentAuthentication(lastSignInAt: string | null | undefined, nowMs = Date.now()) {
  if (!lastSignInAt) return false;
  const value = Date.parse(lastSignInAt);
  return Number.isFinite(value) && value <= nowMs && nowMs - value <= RECENT_AUTH_MAX_AGE_MS;
}

type RecentInteractiveAuthResult =
  | { allowed: true }
  | { allowed: false; code: "RECENT_AUTH_REQUIRED" };

export async function requireRecentInteractiveAuthentication(input: {
  accessToken: string | null;
  supabase: SupabaseClient;
  userId: string;
  nowMs?: number;
}): Promise<RecentInteractiveAuthResult> {
  try {
    const { data, error } = input.accessToken
      ? await input.supabase.auth.getClaims(input.accessToken)
      : await input.supabase.auth.getClaims();
    if (error || !data?.claims) return { allowed: false, code: "RECENT_AUTH_REQUIRED" };
    const result = assessRecentInteractiveAuthentication(data.claims, input.userId, input.nowMs);
    return result.allowed ? { allowed: true } : { allowed: false, code: "RECENT_AUTH_REQUIRED" };
  } catch {
    return { allowed: false, code: "RECENT_AUTH_REQUIRED" };
  }
}
