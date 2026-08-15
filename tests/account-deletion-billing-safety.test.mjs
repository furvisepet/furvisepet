import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { terminateStripeBillingForAccountDeletion } from "../app/lib/billing/account-deletion.ts";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const deletionRoute = source("app/api/account/delete/route.ts");
const migration = source("supabase/migrations/20260815075551_safe_account_deletion_billing_reconciliation.sql");
const webhook = source("app/api/billing/webhook/route.ts");

const userId = "11111111-1111-4111-8111-111111111111";
const account = {
  cancel_at_period_end: false,
  checkout_price_id: "price_plus",
  current_period_end: "2026-09-15T00:00:00.000Z",
  current_period_start: "2026-08-15T00:00:00.000Z",
  plan: "plus",
  stripe_customer_id: "cus_owner",
  stripe_currency: "cad",
  stripe_subscription_id: "sub_owner",
  subscription_status: "active",
  user_id: userId,
};

function subscription(overrides = {}) {
  return { customer: "cus_owner", id: "sub_owner", metadata: { furvise_user_id: userId }, status: "active", ...overrides };
}

function stripeState(initial, { cancelError = null } = {}) {
  let current = initial.map((item) => ({ ...item }));
  const canceled = [];
  return {
    canceled,
    client: {
      subscriptions: {
        async cancel(id) {
          if (cancelError) throw cancelError;
          canceled.push(id);
          current = current.map((item) => item.id === id ? { ...item, status: "canceled" } : item);
          return current.find((item) => item.id === id);
        },
        async list() { return { data: current, has_more: false }; },
      },
    },
  };
}

test("Free account deletion needs no Stripe call", async () => {
  const result = await terminateStripeBillingForAccountDeletion({ account: null, idempotencyKey: crypto.randomUUID(), stripe: null, userId });
  assert.deepEqual(result, { customerId: null, subscriptions: [] });
});

test("active Plus is canceled immediately and verified terminal", async () => {
  const stripe = stripeState([subscription()]);
  const result = await terminateStripeBillingForAccountDeletion({ account, idempotencyKey: crypto.randomUUID(), stripe: stripe.client, userId });
  assert.deepEqual(stripe.canceled, ["sub_owner"]);
  assert.deepEqual(result.subscriptions, [{ status: "canceled", subscriptionId: "sub_owner" }]);
});

test("cancel-at-period-end Plus is still terminated before deletion", async () => {
  const stripe = stripeState([subscription({ cancel_at_period_end: true })]);
  await terminateStripeBillingForAccountDeletion({ account: { ...account, cancel_at_period_end: true }, idempotencyKey: crypto.randomUUID(), stripe: stripe.client, userId });
  assert.deepEqual(stripe.canceled, ["sub_owner"]);
});

test("Stripe failure occurs before application or Auth deletion", async () => {
  const stripe = stripeState([subscription()], { cancelError: new Error("stripe unavailable") });
  await assert.rejects(terminateStripeBillingForAccountDeletion({ account, idempotencyKey: crypto.randomUUID(), stripe: stripe.client, userId }), /stripe unavailable/);
  assert.ok(deletionRoute.indexOf("terminateStripeBillingForAccountDeletion") < deletionRoute.indexOf("prepare_account_deletion"));
  assert.ok(deletionRoute.indexOf("prepare_account_deletion") < deletionRoute.indexOf("deleteUser"));
  assert.match(deletionRoute, /Your account was not deleted/);
});

test("repeated deletion is idempotent after Stripe termination", async () => {
  const stripe = stripeState([subscription()]);
  await terminateStripeBillingForAccountDeletion({ account, idempotencyKey: crypto.randomUUID(), stripe: stripe.client, userId });
  await terminateStripeBillingForAccountDeletion({ account, idempotencyKey: crypto.randomUUID(), stripe: stripe.client, userId });
  assert.deepEqual(stripe.canceled, ["sub_owner"]);
  assert.match(migration, /on conflict \(stripe_subscription_id\) do update/);
});

test("Stripe success plus local cleanup failure remains retryable with mapping retained", () => {
  assert.match(deletionRoute, /recoverableDeletionFailure/);
  const recoverable = deletionRoute.slice(deletionRoute.indexOf("function recoverableDeletionFailure"), deletionRoute.indexOf("async function irreversibleDeletionFailure"));
  assert.doesNotMatch(recoverable, /ban_duration|deleteUser|mark_account_deletion_result/);
  assert.match(migration, /user_id uuid not null/);
  assert.doesNotMatch(migration, /user_id uuid[^\n]+references auth\.users/);
});

test("wrong-user and cross-customer subscriptions fail closed", async () => {
  for (const unsafe of [
    subscription({ metadata: { furvise_user_id: "22222222-2222-4222-8222-222222222222" } }),
    subscription({ customer: "cus_other" }),
  ]) {
    const stripe = stripeState([unsafe]);
    await assert.rejects(terminateStripeBillingForAccountDeletion({ account, idempotencyKey: crypto.randomUUID(), stripe: stripe.client, userId }), /ASSOCIATION_INVALID/);
    assert.deepEqual(stripe.canceled, []);
  }
  assert.doesNotMatch(deletionRoute, /body[^\n]*(?:stripe|customer|subscription)|p_stripe_[a-z_]+:\s*(?:body|input)/i);
});

test("delayed webhooks use the retained exact owner mapping instead of recreating billing", () => {
  assert.match(migration, /billing_deletion_tombstones/);
  assert.match(migration, /tombstone\.user_id <> p_user_id or tombstone\.stripe_customer_id <> p_stripe_customer_id/);
  const tombstoneCheck = webhook.indexOf("hasBillingDeletionTombstone");
  assert.ok(tombstoneCheck > -1 && tombstoneCheck < webhook.indexOf("applyStripeSubscriptionProjection(admin"));
  assert.match(webhook, /deleted_account_reconciled/);
});
