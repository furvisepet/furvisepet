import type Stripe from "stripe";
import { revalidatePath } from "next/cache";
import { applyStripeSubscriptionProjection, hasBillingDeletionTombstone } from "../../../lib/billing/billing-admin";
import { buildStripeSubscriptionProjection, stripeObjectId } from "../../../lib/billing/stripe-projection";
import { getStripeServerClient, getStripeWebhookSecret } from "../../../lib/billing/stripe-server";
import { createOperationsAdminClient } from "../../../lib/operations/admin-client";
import { emitOperationalEvent } from "../../../lib/operations/events";
import { readBoundedRawBody, RawBodyTooLargeError, STRIPE_WEBHOOK_BODY_LIMIT } from "../../../lib/security/bounded-raw-body";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const signature = request.headers.get("stripe-signature");
  if (!signature) return Response.json({ error: "Invalid webhook signature." }, { status: 400 });

  let event: Stripe.Event;
  try {
    const rawBody = await readBoundedRawBody(request, STRIPE_WEBHOOK_BODY_LIMIT);
    event = getStripeServerClient().webhooks.constructEvent(rawBody, signature, getStripeWebhookSecret());
  } catch (error) {
    if (error instanceof RawBodyTooLargeError) {
      return Response.json({ error: "Webhook payload is too large." }, { status: 413 });
    }
    return Response.json({ error: "Invalid webhook signature." }, { status: 400 });
  }

  try {
    const subscription = await subscriptionForEvent(event);
    if (!subscription) return Response.json({ received: true });
    const projection = buildStripeSubscriptionProjection({ env: process.env, event, subscription });
    const admin = createOperationsAdminClient();
    if (await hasBillingDeletionTombstone(admin, {
      customerId: projection.customerId,
      subscriptionId: projection.subscriptionId,
      userId: projection.userId,
    })) {
      return Response.json({ outcome: "deleted_account_reconciled", received: true });
    }
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.client_reference_id !== projection.userId || session.metadata?.furvise_user_id !== projection.userId) {
        throw new Error("STRIPE_CHECKOUT_USER_ASSOCIATION_INVALID");
      }
    }
    const outcome = await applyStripeSubscriptionProjection(admin, projection);
    revalidatePath("/account");
    revalidatePath("/ask");
    return Response.json({ outcome, received: true });
  } catch (error) {
    emitOperationalEvent({
      errorCode: safeWebhookErrorCode(error), eventType: "application_error", feature: "billing",
      operationId: event.id, requestId, route: "/api/billing/webhook", severity: "critical",
    });
    console.error("[Furvise billing] webhook projection failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
      eventType: event.type,
    });
    return Response.json({ error: "Webhook processing failed." }, { status: 500 });
  }
}

function safeWebhookErrorCode(error: unknown) {
  const candidate = error instanceof Error ? error.message : "WEBHOOK_PROCESSING_FAILED";
  return /^[A-Z][A-Z0-9_]{2,119}$/.test(candidate) ? candidate : "WEBHOOK_PROCESSING_FAILED";
}

async function subscriptionForEvent(event: Stripe.Event) {
  const stripe = getStripeServerClient();
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const subscriptionId = stripeObjectId(session.subscription);
    if (!subscriptionId) throw new Error("STRIPE_CHECKOUT_SUBSCRIPTION_MISSING");
    return stripe.subscriptions.retrieve(subscriptionId, { expand: ["items.data.price"] });
  }
  if (event.type === "customer.subscription.deleted") return event.data.object as Stripe.Subscription;
  if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated") {
    const subscription = event.data.object as Stripe.Subscription;
    return stripe.subscriptions.retrieve(subscription.id, { expand: ["items.data.price"] });
  }
  return null;
}
