import { getAuthenticatedApiContext } from "../../../lib/authenticated-api-server";
import {
  abandonPlusCheckoutSingleFlight,
  claimPlusCheckoutSingleFlight,
  completePlusCheckoutSingleFlight,
  getBillingAccountForUser,
  registerBillingCustomer,
  resetPlusCheckoutSingleFlight,
} from "../../../lib/billing/billing-admin";
import { getPlusPriceId } from "../../../lib/billing/launch-plans";
import { resolveEffectiveEntitlements } from "../../../lib/billing/entitlements";
import { getStripeServerClient } from "../../../lib/billing/stripe-server";
import { createOperationsAdminClient } from "../../../lib/operations/admin-client";
import { claimIdempotentOperation } from "../../../lib/security/idempotency";
import { PRIVATE_CACHE_HEADERS } from "../../../lib/security/private-routes";
import { resolveTargetOrigin } from "../../../lib/security/headers/origin-policy";

const TERMINAL_SUBSCRIPTION_STATUSES = new Set(["canceled", "incomplete_expired"]);

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
        if (existing.data.some((subscription) => !TERMINAL_SUBSCRIPTION_STATUSES.has(subscription.status))) {
          return billingError("SUBSCRIPTION_ALREADY_EXISTS", "A Furvise subscription already exists. Manage it from billing settings.", 409);
        }
      }

      await registerBillingCustomer({ admin, customerId, priceId, userId: context.userId });
      const applicationOrigin = resolveTargetOrigin(request);
      if (!applicationOrigin) return billingError("BILLING_ORIGIN_INVALID", "Furvise could not open secure checkout.", 403);

      let singleFlight = await claimPlusCheckoutSingleFlight(admin, context.userId, applicationOrigin);
      for (let pass = 0; pass < 2; pass += 1) {
        if (singleFlight.claim_outcome === "in_progress") {
          return billingRetry(
            "CHECKOUT_IN_PROGRESS",
            "Secure checkout is already being prepared. Try again in a moment.",
            singleFlight.retry_after_seconds,
          );
        }

        if (singleFlight.claim_outcome === "existing") {
          if (!singleFlight.stripe_checkout_session_id) throw new Error("CHECKOUT_SINGLE_FLIGHT_SESSION_MISSING");
          let existingSession;
          try {
            existingSession = await stripe.checkout.sessions.retrieve(singleFlight.stripe_checkout_session_id);
          } catch {
            // Do not clear durable state on an ambiguous Stripe read failure. A
            // blind reset could create a second live Checkout Session.
            return billingRetry("CHECKOUT_RECONCILING", "Secure checkout is being reconciled. Try again in a moment.", 2);
          }
          if (existingSession.status === "open" && existingSession.url) {
            return Response.json({ url: existingSession.url }, { headers: PRIVATE_CACHE_HEADERS });
          }
          if (existingSession.status === "complete") {
            return billingRetry("CHECKOUT_PROCESSING", "Your payment is being processed. Furvise Plus will update shortly.", 2);
          }
          if (existingSession.status !== "expired") {
            return billingRetry("CHECKOUT_RECONCILING", "Secure checkout is being reconciled. Try again in a moment.", 2);
          }
          await resetPlusCheckoutSingleFlight({
            admin,
            sessionId: singleFlight.stripe_checkout_session_id,
            userId: context.userId,
          });
          singleFlight = await claimPlusCheckoutSingleFlight(admin, context.userId, applicationOrigin);
          continue;
        }

        if (!singleFlight.owner_token) throw new Error("CHECKOUT_SINGLE_FLIGHT_OWNER_MISSING");
        try {
          const session = await stripe.checkout.sessions.create({
            billing_address_collection: "required",
            cancel_url: `${singleFlight.return_origin}/membership?checkout=cancelled`,
            client_reference_id: context.userId,
            customer: customerId,
            integration_identifier: checkoutIntegrationIdentifier(singleFlight.attempt_id),
            line_items: [{ price: priceId, quantity: 1 }],
            metadata: { furvise_user_id: context.userId },
            mode: "subscription",
            subscription_data: { metadata: { furvise_user_id: context.userId } },
            success_url: `${singleFlight.return_origin}/membership?checkout=success`,
          }, { idempotencyKey: `furvise_plus_checkout_${singleFlight.attempt_id}` });
          if (!session.url) throw new Error("STRIPE_CHECKOUT_URL_MISSING");
          await completePlusCheckoutSingleFlight({
            admin,
            attemptId: singleFlight.attempt_id,
            ownerToken: singleFlight.owner_token,
            sessionExpiresAt: new Date(session.expires_at * 1000).toISOString(),
            sessionId: session.id,
            userId: context.userId,
          });
          return Response.json({ url: session.url }, { headers: PRIVATE_CACHE_HEADERS });
        } catch (error) {
          try {
            await abandonPlusCheckoutSingleFlight({
              admin,
              attemptId: singleFlight.attempt_id,
              ownerToken: singleFlight.owner_token,
              userId: context.userId,
            });
          } catch {
            // The lease still prevents immediate duplicate creation. On takeover,
            // the preserved attempt_id reuses the same Stripe idempotency key.
          }
          throw error;
        }
      }

      return billingRetry("CHECKOUT_RECONCILING", "Secure checkout is being reconciled. Try again in a moment.", 2);
    } catch (error) {
      console.error("[Furvise billing] checkout creation failed", { errorName: error instanceof Error ? error.name : "UnknownError" });
      return billingError("CHECKOUT_UNAVAILABLE", "Secure checkout is temporarily unavailable. Try again in a moment.", 503);
    }
  });
}

function checkoutIntegrationIdentifier(attemptId: string) {
  const letters = "abcdefghijklmnop";
  const hex = attemptId.replaceAll("-", "").slice(0, 8).toLowerCase();
  if (!/^[0-9a-f]{8}$/.test(hex)) throw new Error("CHECKOUT_ATTEMPT_ID_INVALID");
  return `furvise_${Array.from(hex, (value) => letters[Number.parseInt(value, 16)]).join("")}`;
}

function billingRetry(code: string, error: string, retryAfterSeconds: number) {
  const headers = new Headers(PRIVATE_CACHE_HEADERS);
  headers.set("Retry-After", String(Math.max(1, Math.min(120, Math.ceil(retryAfterSeconds)))));
  return Response.json({ code, error }, { headers, status: 503 });
}

function billingError(code: string, error: string, status: number) {
  return Response.json({ code, error }, { headers: PRIVATE_CACHE_HEADERS, status });
}
