import "server-only";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const SITEVERIFY_TIMEOUT_MS = 5_000;

type SiteverifyResult = "invalid" | "unavailable" | "valid";

export async function verifyTurnstileToken(input: {
  action: string;
  expectedHostname: string;
  fetchImpl?: typeof fetch;
  remoteIp?: string | null;
  requestId: string;
  token: string;
}, env: Record<string, string | undefined> = process.env): Promise<SiteverifyResult> {
  const secret = env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret || input.token.length > 2_048) return "unavailable";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SITEVERIFY_TIMEOUT_MS);
  const body = new URLSearchParams({
    idempotency_key: input.requestId,
    response: input.token,
    secret,
  });
  if (input.remoteIp) body.set("remoteip", input.remoteIp);

  try {
    const response = await (input.fetchImpl || fetch)(SITEVERIFY_URL, {
      body,
      cache: "no-store",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      method: "POST",
      signal: controller.signal,
    });
    if (!response.ok) return "unavailable";
    const payload = await response.json().catch(() => null) as { action?: unknown; hostname?: unknown; success?: unknown } | null;
    if (!payload || payload.success !== true) return "invalid";
    if (payload.action !== input.action) return "invalid";
    if (env.NODE_ENV === "production" && payload.hostname !== input.expectedHostname) return "invalid";
    return "valid";
  } catch {
    return "unavailable";
  } finally {
    clearTimeout(timer);
  }
}
