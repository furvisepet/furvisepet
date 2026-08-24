import type Stripe from "stripe";
import {
  recognizePlusPriceId,
  resolvesToPlus,
  type BillingSubscriptionStatus,
} from "./launch-plans.ts";

const SUPPORTED_STATUSES = new Set<BillingSubscriptionStatus>([
  "incomplete",
  "incomplete_expired",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
  "paused",
]);

const SUBSCRIPTION_LIFECYCLE_EVENT_TYPES = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

export type StripeSubscriptionProjection = {
  cancelAtPeriodEnd: boolean;
  currency: string;
  customerId: string;
  eventCreatedAt: string;
  eventId: string;
  eventType: string;
  periodEnd: string;
  periodStart: string;
  plan: "free" | "plus";
  priceId: string;
  priceRecognized: boolean;
  status: BillingSubscriptionStatus;
  subscriptionId: string;
  userId: string;
};

/**
 * Return the immutable subscription snapshot carried by a Stripe lifecycle
 * event. The event timestamp and subscription state must describe the same
 * moment; fetching the current Subscription while processing an older webhook
 * would break ordering and can corrupt transition-derived state such as
 * `past_due_since`.
 */
export function stripeSubscriptionSnapshotFromEvent(event: Stripe.Event): Stripe.Subscription | null {
  if (!SUBSCRIPTION_LIFECYCLE_EVENT_TYPES.has(event.type)) return null;
  return event.data.object as Stripe.Subscription;
}

export function buildStripeSubscriptionProjection({
  env,
  event,
  subscription,
}: {
  env: Record<string, string | undefined>;
  event: Pick<Stripe.Event, "created" | "id" | "type">;
  subscription: Stripe.Subscription;
}): StripeSubscriptionProjection {
  const userId = subscription.metadata.furvise_user_id?.trim() || "";
  if (!isUuid(userId)) throw new Error("STRIPE_SUBSCRIPTION_USER_METADATA_INVALID");
  const customerId = stripeObjectId(subscription.customer);
  if (!customerId) throw new Error("STRIPE_SUBSCRIPTION_CUSTOMER_INVALID");
  if (subscription.items.data.length !== 1) throw new Error("STRIPE_SUBSCRIPTION_ITEMS_INVALID");
  const item = subscription.items.data[0];
  const priceId = stripeObjectId(item.price);
  if (!priceId) throw new Error("STRIPE_SUBSCRIPTION_PRICE_INVALID");
  const status = normalizeStatus(subscription.status);
  const periodStart = unixDate(item.current_period_start, "STRIPE_SUBSCRIPTION_PERIOD_INVALID");
  const periodEnd = unixDate(item.current_period_end, "STRIPE_SUBSCRIPTION_PERIOD_INVALID");
  const currency = normalizeCurrency(subscription.currency);
  const priceRecognized = recognizePlusPriceId(priceId, env);
  const plan = resolvesToPlus({ periodEnd, periodStart, priceRecognized, status }) ? "plus" : "free";
  return {
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    customerId,
    currency,
    eventCreatedAt: unixDate(event.created, "STRIPE_EVENT_CREATED_INVALID").toISOString(),
    eventId: event.id,
    eventType: event.type,
    periodEnd: periodEnd.toISOString(),
    periodStart: periodStart.toISOString(),
    plan,
    priceId,
    priceRecognized,
    status,
    subscriptionId: subscription.id,
    userId,
  };
}

export function stripeObjectId(value: string | { id: string } | null | undefined) {
  return typeof value === "string" ? value : typeof value?.id === "string" ? value.id : "";
}

function normalizeStatus(status: Stripe.Subscription.Status): BillingSubscriptionStatus {
  if (!SUPPORTED_STATUSES.has(status as BillingSubscriptionStatus)) throw new Error("STRIPE_SUBSCRIPTION_STATUS_UNSUPPORTED");
  return status as BillingSubscriptionStatus;
}

function normalizeCurrency(currency: string) {
  const normalized = currency.trim().toLowerCase();
  if (!/^[a-z]{3}$/.test(normalized)) throw new Error("STRIPE_SUBSCRIPTION_CURRENCY_INVALID");
  return normalized;
}

function unixDate(value: number, code: string) {
  const date = new Date(value * 1000);
  if (!Number.isFinite(value) || Number.isNaN(date.getTime())) throw new Error(code);
  return date;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
