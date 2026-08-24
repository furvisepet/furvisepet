import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { StripeSubscriptionProjection } from "./stripe-projection";

export type BillingAccountRow = {
  cancel_at_period_end: boolean;
  checkout_price_id: string;
  current_period_end: string | null;
  current_period_start: string | null;
  plan: "free" | "plus";
  stripe_customer_id: string;
  stripe_currency: string | null;
  stripe_subscription_id: string | null;
  subscription_status: string;
  user_id: string;
};

export type BillingCheckoutSingleFlightClaim = {
  attempt_id: string;
  claim_outcome: "claimed" | "existing" | "in_progress";
  owner_token: string | null;
  retry_after_seconds: number;
  session_expires_at: string | null;
  stripe_checkout_session_id: string | null;
};

const PLUS_CHECKOUT_PRODUCT_KEY = "furvise_plus_monthly";

export async function getBillingAccountForUser(admin: SupabaseClient, userId: string) {
  const { data, error } = await admin
    .from("billing_accounts")
    .select("user_id,stripe_customer_id,stripe_subscription_id,stripe_currency,checkout_price_id,plan,subscription_status,current_period_start,current_period_end,cancel_at_period_end")
    .eq("user_id", userId)
    .maybeSingle<BillingAccountRow>();
  if (error) throw new BillingProjectionError("BILLING_ACCOUNT_READ_FAILED", error);
  return data;
}

export async function getProjectedBillingCurrencyForUser(admin: SupabaseClient, userId: string) {
  const { data, error } = await admin
    .from("billing_accounts")
    .select("stripe_currency")
    .eq("user_id", userId)
    .maybeSingle<{ stripe_currency: string | null }>();
  if (error) throw new BillingProjectionError("BILLING_CURRENCY_READ_FAILED", error);
  return data?.stripe_currency || null;
}

export async function registerBillingCustomer({
  admin,
  customerId,
  priceId,
  userId,
}: {
  admin: SupabaseClient;
  customerId: string;
  priceId: string;
  userId: string;
}) {
  const { error } = await admin.rpc("register_stripe_billing_customer", {
    p_checkout_price_id: priceId,
    p_stripe_customer_id: customerId,
    p_user_id: userId,
  });
  if (error) throw new BillingProjectionError("BILLING_CUSTOMER_REGISTRATION_FAILED", error);
}

export async function claimPlusCheckoutSingleFlight(admin: SupabaseClient, userId: string) {
  const { data, error } = await admin.rpc("claim_billing_checkout_single_flight", {
    p_lease_seconds: 120,
    p_product_key: PLUS_CHECKOUT_PRODUCT_KEY,
    p_user_id: userId,
  });
  if (error) throw new BillingProjectionError("BILLING_CHECKOUT_SINGLE_FLIGHT_CLAIM_FAILED", error);
  const row = (Array.isArray(data) ? data[0] : data) as BillingCheckoutSingleFlightClaim | null;
  if (!row || !row.attempt_id || !["claimed", "existing", "in_progress"].includes(row.claim_outcome)) {
    throw new BillingProjectionError("BILLING_CHECKOUT_SINGLE_FLIGHT_CLAIM_INVALID", data);
  }
  return row;
}

export async function completePlusCheckoutSingleFlight({
  admin,
  attemptId,
  ownerToken,
  sessionExpiresAt,
  sessionId,
  userId,
}: {
  admin: SupabaseClient;
  attemptId: string;
  ownerToken: string;
  sessionExpiresAt: string;
  sessionId: string;
  userId: string;
}) {
  const { data, error } = await admin.rpc("complete_billing_checkout_single_flight", {
    p_attempt_id: attemptId,
    p_owner_token: ownerToken,
    p_product_key: PLUS_CHECKOUT_PRODUCT_KEY,
    p_session_expires_at: sessionExpiresAt,
    p_stripe_checkout_session_id: sessionId,
    p_user_id: userId,
  });
  if (error || data !== true) throw new BillingProjectionError("BILLING_CHECKOUT_SINGLE_FLIGHT_COMPLETION_FAILED", error || data);
}

export async function abandonPlusCheckoutSingleFlight({
  admin,
  attemptId,
  ownerToken,
  userId,
}: {
  admin: SupabaseClient;
  attemptId: string;
  ownerToken: string;
  userId: string;
}) {
  const { error } = await admin.rpc("abandon_billing_checkout_single_flight", {
    p_attempt_id: attemptId,
    p_owner_token: ownerToken,
    p_product_key: PLUS_CHECKOUT_PRODUCT_KEY,
    p_user_id: userId,
  });
  if (error) throw new BillingProjectionError("BILLING_CHECKOUT_SINGLE_FLIGHT_ABANDON_FAILED", error);
}

export async function resetPlusCheckoutSingleFlight({
  admin,
  sessionId,
  userId,
}: {
  admin: SupabaseClient;
  sessionId: string;
  userId: string;
}) {
  const { data, error } = await admin.rpc("reset_billing_checkout_single_flight", {
    p_product_key: PLUS_CHECKOUT_PRODUCT_KEY,
    p_stripe_checkout_session_id: sessionId,
    p_user_id: userId,
  });
  if (error || data !== true) throw new BillingProjectionError("BILLING_CHECKOUT_SINGLE_FLIGHT_RESET_FAILED", error || data);
}

export async function applyStripeSubscriptionProjection(admin: SupabaseClient, projection: StripeSubscriptionProjection) {
  const { data, error } = await admin.rpc("apply_stripe_subscription_projection", {
    p_cancel_at_period_end: projection.cancelAtPeriodEnd,
    p_current_period_end: projection.periodEnd,
    p_current_period_start: projection.periodStart,
    p_stripe_currency: projection.currency,
    p_price_recognized: projection.priceRecognized,
    p_stripe_customer_id: projection.customerId,
    p_stripe_event_created_at: projection.eventCreatedAt,
    p_stripe_event_id: projection.eventId,
    p_stripe_event_type: projection.eventType,
    p_stripe_price_id: projection.priceId,
    p_stripe_subscription_id: projection.subscriptionId,
    p_subscription_status: projection.status,
    p_user_id: projection.userId,
  });
  if (error) throw new BillingProjectionError("BILLING_SUBSCRIPTION_PROJECTION_FAILED", error);
  return typeof data === "string" ? data : "processed";
}

export async function recordBillingDeletionTombstones({
  admin,
  customerId,
  idempotencyKey,
  subscriptions,
  userId,
}: {
  admin: SupabaseClient;
  customerId: string;
  idempotencyKey: string;
  subscriptions: Array<{ status: "canceled" | "incomplete_expired"; subscriptionId: string }>;
  userId: string;
}) {
  if (!subscriptions.length) return;
  const { error } = await admin.rpc("record_billing_deletion_tombstones", {
    p_idempotency_key: idempotencyKey,
    p_stripe_customer_id: customerId,
    p_stripe_subscription_ids: subscriptions.map((subscription) => subscription.subscriptionId),
    p_terminal_statuses: subscriptions.map((subscription) => subscription.status),
    p_user_id: userId,
  });
  if (error) throw new BillingProjectionError("BILLING_DELETION_TOMBSTONE_WRITE_FAILED", error);
}

export async function hasBillingDeletionTombstone(admin: SupabaseClient, {
  customerId,
  subscriptionId,
  userId,
}: {
  customerId: string;
  subscriptionId: string;
  userId: string;
}) {
  const { data, error } = await admin.from("billing_deletion_tombstones").select("stripe_subscription_id")
    .eq("user_id", userId).eq("stripe_customer_id", customerId).eq("stripe_subscription_id", subscriptionId)
    .limit(1).maybeSingle<{ stripe_subscription_id: string }>();
  if (error) throw new BillingProjectionError("BILLING_DELETION_TOMBSTONE_READ_FAILED", error);
  return Boolean(data);
}

export class BillingProjectionError extends Error {
  constructor(public code: string, public cause: unknown) {
    super(code);
    this.name = "BillingProjectionError";
  }
}
