import { getAuthenticatedApiContext } from "../../../lib/authenticated-api-server";
import { EntitlementResolutionError, resolveEffectiveEntitlements } from "../../../lib/billing/entitlements";
import { PRIVATE_CACHE_HEADERS } from "../../../lib/security/private-routes";
import { AiCreditLedgerError, getAskAllowanceStatus } from "../../../lib/ai/usage-ledger";

export async function GET(request: Request) {
  const context = await getAuthenticatedApiContext(request);
  if ("response" in context) return context.response;
  try {
    const [entitlements, askUsage] = await Promise.all([
      resolveEffectiveEntitlements(context.supabase),
      getAskAllowanceStatus({ supabase: context.supabase }),
    ]);
    return Response.json({ askUsage, entitlements }, { headers: PRIVATE_CACHE_HEADERS });
  } catch (error) {
    if (error instanceof EntitlementResolutionError || error instanceof AiCreditLedgerError) {
      return Response.json({ error: "Furvise could not verify account access." }, { headers: PRIVATE_CACHE_HEADERS, status: 503 });
    }
    throw error;
  }
}
