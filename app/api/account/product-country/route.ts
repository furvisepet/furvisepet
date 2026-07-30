import { buildManualAccountCountryUpdate, normalizeAccountProductCountry } from "../../../lib/account-country";
import { getAuthenticatedApiContext } from "../../../lib/authenticated-api-server";
import { API_BODY_LIMITS, RequestBoundaryError, hasOnlyKeys, readBoundedJson } from "../../../lib/security/request";
import { beginRateLimitedRequest, getRateLimitRequestId } from "../../../lib/security/rate-limit";
import type { UserProfileRow } from "../../../lib/supabase";

export async function POST(request: Request) {
  const context = await getAuthenticatedApiContext(request);
  if ("response" in context) return context.response;
  let raw: unknown;
  try { raw = await readBoundedJson(request, API_BODY_LIMITS.standard); }
  catch (error) {
    const tooLarge = error instanceof RequestBoundaryError && error.code === "PAYLOAD_TOO_LARGE";
    return Response.json({ error: tooLarge ? "That account update is too large." : "Send a valid account update." }, { status: tooLarge ? 413 : 400 });
  }
  if (!hasOnlyKeys(raw, ["country"])) return Response.json({ error: "The account update contains unsupported fields." }, { status: 400 });
  const rawCountry = (raw as { country?: unknown }).country;
  const country = normalizeAccountProductCountry(typeof rawCountry === "string" ? rawCountry : null);
  if (!country) return Response.json({ error: "Choose a supported Product country." }, { status: 400 });
  const requestId = getRateLimitRequestId(request);
  const rate = await beginRateLimitedRequest({ payload: { country }, policy: "PROFILE_WRITE", request, requestId, route: "/api/account/product-country", userId: context.userId });
  if (!rate.allowed) return rate.response;
  const { data, error } = await context.supabase.from("user_profiles")
    .upsert(buildManualAccountCountryUpdate({ country, userId: context.userId }), { onConflict: "user_id" })
    .select().single<UserProfileRow>();
  if (error || !data) return Response.json({ error: "The account profile could not be saved." }, { status: 503 });
  return Response.json({ profile: data });
}
