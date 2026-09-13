"use client";

export async function signInWithGoogle(nextPath: string) {
  if (typeof window === "undefined") return { error: new Error("GOOGLE_AUTH_UNAVAILABLE") };
  const response = await fetch("/api/auth/oauth", { body: JSON.stringify({ next: nextPath }), headers: { "Content-Type": "application/json" }, method: "POST" });
  const payload = await response.json().catch(() => null) as { redirectTo?: unknown } | null;
  if (!response.ok || typeof payload?.redirectTo !== "string") return { error: new Error("GOOGLE_AUTH_UNAVAILABLE") };
  window.location.assign(payload.redirectTo);
  return { error: null };
}
