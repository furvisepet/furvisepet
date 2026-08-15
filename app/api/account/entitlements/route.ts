import { getAuthenticatedApiContext } from "../../../lib/authenticated-api-server";
import { EntitlementResolutionError, resolveEffectiveEntitlements } from "../../../lib/billing/entitlements";
import { PRIVATE_CACHE_HEADERS } from "../../../lib/security/private-routes";
import { AiCreditLedgerError, getAskAllowanceStatus } from "../../../lib/ai/usage-ledger";
import { resolveBillingPresentation } from "../../../lib/billing/billing-market";
import { BillingProjectionError, getProjectedBillingCurrencyForUser } from "../../../lib/billing/billing-admin";
import { createOperationsAdminClient } from "../../../lib/operations/admin-client";

export async function GET(request: Request) {
  const context = await getAuthenticatedApiContext(request);
  if ("response" in context) return context.response;
  try {
    const [entitlements, askUsage] = await Promise.all([
      resolveEffectiveEntitlements(context.supabase),
      getAskAllowanceStatus({ supabase: context.supabase }),
    ]);
    const projectedCurrency = entitlements.billingPlan === "plus"
      ? await getProjectedBillingCurrencyForUser(createOperationsAdminClient(), context.userId)
      : null;
    const billingPresentation = resolveBillingPresentation({ headers: request.headers, projectedCurrency });
    return Response.json({ askUsage, billingPresentation, entitlements }, { headers: PRIVATE_CACHE_HEADERS });
  } catch (error) {
    if (error instanceof EntitlementResolutionError || error instanceof AiCreditLedgerError || error instanceof BillingProjectionError) {
      return Response.json({ error: "Furvise could not verify account access." }, { headers: PRIVATE_CACHE_HEADERS, status: 503 });
    }
    throw error;
  }
}
