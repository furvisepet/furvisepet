import "server-only";

const AUTH_LOOKUP_TIMEOUT_MS = 5_000;
const AUTH_LOOKUP_PAGE_SIZE = 1_000;

export async function authUserExistsByEmail(
  email: string,
  options: { fetchImpl?: typeof fetch } = {},
  env: Record<string, string | undefined> = process.env,
) {
  const url = env.SUPABASE_URL?.trim() || env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const secret = env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !secret) throw new Error("ACCOUNT_ROUTE_ADMIN_CONFIGURATION_MISSING");

  const endpoint = new URL("/auth/v1/admin/users", url);
  endpoint.searchParams.set("filter", email);
  endpoint.searchParams.set("page", "1");
  endpoint.searchParams.set("per_page", String(AUTH_LOOKUP_PAGE_SIZE));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AUTH_LOOKUP_TIMEOUT_MS);
  try {
    const response = await (options.fetchImpl || fetch)(endpoint, {
      cache: "no-store",
      headers: { apikey: secret, Authorization: `Bearer ${secret}` },
      method: "GET",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("ACCOUNT_ROUTE_ADMIN_LOOKUP_FAILED");
    const payload = await response.json().catch(() => null) as { users?: Array<{ email?: unknown }> } | null;
    if (!payload || !Array.isArray(payload.users)) throw new Error("ACCOUNT_ROUTE_ADMIN_RESPONSE_INVALID");
    if (payload.users.some((user) => typeof user.email === "string" && user.email.normalize("NFKC").trim().toLowerCase() === email)) return true;
    if (payload.users.length >= AUTH_LOOKUP_PAGE_SIZE) throw new Error("ACCOUNT_ROUTE_ADMIN_LOOKUP_INCOMPLETE");
    return false;
  } finally {
    clearTimeout(timer);
  }
}
