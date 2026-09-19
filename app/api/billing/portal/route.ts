import { getAuthenticatedApiContext } from "../../../lib/authenticated-api-server";
import { getBillingAccountForUser } from "../../../lib/billing/billing-admin";
import { getStripeServerClient } from "../../../lib/billing/stripe-server";
import { createOperationsAdminClient } from "../../../lib/operations/admin-client";
import { claimIdempotentOperation } from "../../../lib/security/idempotency";
import { resolveTargetOrigin } from "../../../lib/security/headers/origin-policy";
import { PRIVATE_CACHE_HEADERS } from "../../../lib/security/private-routes";

export async function POST(request: Request) {
  const context = await getAuthenticatedApiContext(request);
  if ("response" in context) return context.response;
  const gate = await claimIdempotentOperation({
    leaseSeconds: 60,
    operationType: "billing.portal.create",
    payload: { destination: "membership" },
    request,
    retention: "financial",
    supabase: context.supabase,
    userId: context.userId,
  });
  if ("response" in gate) return gate.response;

  return gate.operation.execute(async () => {
    try {
      const account = await getBillingAccountForUser(createOperationsAdminClient(), context.userId);
      if (!account?.stripe_customer_id) return billingError("BILLING_CUSTOMER_NOT_FOUND", "No billing account is available yet.", 404);
      const applicationOrigin = resolveTargetOrigin(request);
      if (!applicationOrigin) return billingError("BILLING_ORIGIN_INVALID", "Furvise could not open billing settings.", 403);
      const session = await getStripeServerClient().billingPortal.sessions.create({
        customer: account.stripe_customer_id,
        return_url: `${applicationOrigin}/membership`,
      }, { idempotencyKey: `furvise_portal_${gate.operation.key}` });
      return Response.json({ url: session.url }, { headers: PRIVATE_CACHE_HEADERS });
    } catch (error) {
      console.error("[Furvise billing] portal creation failed", { errorName: error instanceof Error ? error.name : "UnknownError" });
      return billingError("BILLING_PORTAL_UNAVAILABLE", "Billing settings are temporarily unavailable. Try again in a moment.", 503);
    }
  });
}

function billingError(code: string, error: string, status: number) {
  return Response.json({ code, error }, { headers: PRIVATE_CACHE_HEADERS, status });
}
