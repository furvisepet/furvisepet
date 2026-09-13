import type Stripe from "stripe";
import { revalidatePath } from "next/cache";
import {
  applyStripeSubscriptionProjection,
  getBillingAccountForUser,
  hasBillingDeletionTombstone,
} from "../../../lib/billing/billing-admin";
import {
  buildStripeSubscriptionProjection,
  stripeObjectId,
  stripeSubscriptionSnapshotFromEvent,
} from "../../../lib/billing/stripe-projection";
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
    const admin = createOperationsAdminClient();

    // Checkout proves that the server-created Session completed and still maps
    // to the canonical Furvise billing account. It is deliberately NOT an
    // entitlement/lifecycle event: the corresponding customer.subscription.*
    // webhook owns subscription state so its timestamp and object snapshot stay
    // temporally coherent even when Stripe delivers webhooks out of order.
    if (event.type === "checkout.session.completed") {
      return await verifyCompletedCheckout(event, admin);
    }

    const subscription = stripeSubscriptionSnapshotFromEvent(event);
    if (!subscription) return Response.json({ received: true });

    const projection = buildStripeSubscriptionProjection({ env: process.env, event, subscription });
    if (await hasBillingDeletionTombstone(admin, {
      customerId: projection.customerId,
      subscriptionId: projection.subscriptionId,
      userId: projection.userId,
    })) {
      return Response.json({ outcome: "deleted_account_reconciled", received: true });
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

async function verifyCompletedCheckout(event: Stripe.Event, admin: ReturnType<typeof createOperationsAdminClient>) {
  const session = event.data.object as Stripe.Checkout.Session;
  const clientUserId = session.client_reference_id?.trim() || "";
  const metadataUserId = session.metadata?.furvise_user_id?.trim() || "";
  if (!isUuid(clientUserId) || metadataUserId !== clientUserId || session.mode !== "subscription") {
    throw new Error("STRIPE_CHECKOUT_USER_ASSOCIATION_INVALID");
  }

  const customerId = stripeObjectId(session.customer);
  const subscriptionId = stripeObjectId(session.subscription);
  if (!customerId || !subscriptionId) throw new Error("STRIPE_CHECKOUT_ASSOCIATION_MISSING");

  if (await hasBillingDeletionTombstone(admin, {
    customerId,
    subscriptionId,
    userId: clientUserId,
  })) {
    return Response.json({ outcome: "deleted_account_reconciled", received: true });
  }

  const account = await getBillingAccountForUser(admin, clientUserId);
  if (!account || account.stripe_customer_id !== customerId) {
    throw new Error("STRIPE_CHECKOUT_CUSTOMER_ASSOCIATION_INVALID");
  }

  return Response.json({ outcome: "checkout_verified", received: true });
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
