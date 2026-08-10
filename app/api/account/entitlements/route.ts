import { getAuthenticatedApiContext } from "../../../lib/authenticated-api-server";
import { EntitlementResolutionError, resolveEffectiveEntitlements } from "../../../lib/billing/entitlements";
import { PRIVATE_CACHE_HEADERS } from "../../../lib/security/private-routes";

export async function GET(request: Request) {
  const context = await getAuthenticatedApiContext(request);
  if ("response" in context) return context.response;
  try {
    return Response.json({ entitlements: await resolveEffectiveEntitlements(context.supabase) }, { headers: PRIVATE_CACHE_HEADERS });
  } catch (error) {
    if (error instanceof EntitlementResolutionError) {
      return Response.json({ error: "Furvise could not verify account access." }, { headers: PRIVATE_CACHE_HEADERS, status: 503 });
    }
    throw error;
  }
}
