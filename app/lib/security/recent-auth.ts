import "server-only";

export const RECENT_AUTH_MAX_AGE_MS = 15 * 60_000;

export function hasRecentAuthentication(lastSignInAt: string | null | undefined, nowMs = Date.now()) {
  if (!lastSignInAt) return false;
  const value = Date.parse(lastSignInAt);
  return Number.isFinite(value) && value <= nowMs && nowMs - value <= RECENT_AUTH_MAX_AGE_MS;
}
