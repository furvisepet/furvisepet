import { getAuthenticatedApiContext } from "../../../lib/authenticated-api-server";
import { getBillingAccountForUser, registerBillingCustomer } from "../../../lib/billing/billing-admin";
import { getPlusPriceId } from "../../../lib/billing/launch-plans";
import { resolveEffectiveEntitlements } from "../../../lib/billing/entitlements";
import { getStripeServerClient } from "../../../lib/billing/stripe-server";
import { createOperationsAdminClient } from "../../../lib/operations/admin-client";
import { claimIdempotentOperation } from "../../../lib/security/idempotency";
import { PRIVATE_CACHE_HEADERS } from "../../../lib/security/private-routes";
import { resolveTargetOrigin } from "../../../lib/security/headers/origin-policy";

export async function POST(request: Request) {
  const context = await getAuthenticatedApiContext(request);
  if ("response" in context) return context.response;
  const gate = await claimIdempotentOperation({
    leaseSeconds: 120,
    operationType: "billing.checkout.create",
    payload: { product: "furvise_plus_monthly" },
    request,
    retention: "financial",
    supabase: context.supabase,
    userId: context.userId,
  });
  if ("response" in gate) return gate.response;

  return gate.operation.execute(async () => {
    try {
      const entitlements = await resolveEffectiveEntitlements(context.supabase);
      if (entitlements.billingPlan === "plus") return billingError("ALREADY_PLUS", "Furvise Plus is already active. Manage it from billing settings.", 409);

      const priceId = getPlusPriceId(process.env);
      const stripe = getStripeServerClient();
      const admin = createOperationsAdminClient();
      const account = await getBillingAccountForUser(admin, context.userId);
      let customerId = account?.stripe_customer_id || "";

      if (!customerId) {
        const customer = await stripe.customers.create({
          email: context.user.email || undefined,
          metadata: { furvise_user_id: context.userId },
        }, { idempotencyKey: `furvise_customer_${context.userId}` });
        customerId = customer.id;
      } else {
        const existing = await stripe.subscriptions.list({ customer: customerId, limit: 10, status: "all" });
        if (existing.data.some((subscription) => ["active", "incomplete", "past_due", "trialing"].includes(subscription.status))) {
          return billingError("SUBSCRIPTION_ALREADY_EXISTS", "A Furvise subscription already exists. Manage it from billing settings.", 409);
        }
      }

      await registerBillingCustomer({ admin, customerId, priceId, userId: context.userId });
      const applicationOrigin = resolveTargetOrigin(request);
      if (!applicationOrigin) return billingError("BILLING_ORIGIN_INVALID", "Furvise could not open secure checkout.", 403);
      const session = await stripe.checkout.sessions.create({
        billing_address_collection: "required",
        cancel_url: `${applicationOrigin}/account?checkout=cancelled#plans`,
        client_reference_id: context.userId,
        customer: customerId,
        integration_identifier: checkoutIntegrationIdentifier(),
        line_items: [{ price: priceId, quantity: 1 }],
        metadata: { furvise_user_id: context.userId },
        mode: "subscription",
        subscription_data: { metadata: { furvise_user_id: context.userId } },
        success_url: `${applicationOrigin}/account?checkout=success#plans`,
      }, { idempotencyKey: `furvise_checkout_${gate.operation.key}` });
      if (!session.url) throw new Error("STRIPE_CHECKOUT_URL_MISSING");
      return Response.json({ url: session.url }, { headers: PRIVATE_CACHE_HEADERS });
    } catch (error) {
      console.error("[Furvise billing] checkout creation failed", { errorName: error instanceof Error ? error.name : "UnknownError" });
      return billingError("CHECKOUT_UNAVAILABLE", "Secure checkout is temporarily unavailable. Try again in a moment.", 503);
    }
  });
}

function checkoutIntegrationIdentifier() {
  const letters = "abcdefghijklmnopqrstuvwxyz";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return `furvise_${Array.from(bytes, (value) => letters[value % letters.length]).join("")}`;
}

function billingError(code: string, error: string, status: number) {
  return Response.json({ code, error }, { headers: PRIVATE_CACHE_HEADERS, status });
}
