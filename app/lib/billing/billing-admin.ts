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

export class BillingProjectionError extends Error {
  constructor(public code: string, public cause: unknown) {
    super(code);
    this.name = "BillingProjectionError";
  }
}
