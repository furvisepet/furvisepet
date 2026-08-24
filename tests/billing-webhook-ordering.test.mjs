import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildStripeSubscriptionProjection,
  stripeSubscriptionSnapshotFromEvent,
} from "../app/lib/billing/stripe-projection.ts";

const route = readFileSync(new URL("../app/api/billing/webhook/route.ts", import.meta.url), "utf8");
const prices = { STRIPE_PLUS_PRICE_ID: "price_plusmonthly" };

function subscription(status) {
  return {
    cancel_at_period_end: false,
    customer: "cus_furvise",
    currency: "usd",
    id: "sub_furvise",
    items: {
      data: [{
        current_period_end: 1788220800,
        current_period_start: 1785542400,
        price: { id: "price_plusmonthly" },
      }],
    },
    metadata: { furvise_user_id: "10000000-0000-4000-8000-000000000001" },
    status,
  };
}

function lifecycleEvent(type, created, snapshot) {
  return {
    created,
    data: { object: snapshot },
    id: `evt_${type.replaceAll(".", "_")}_${created}`,
    type,
  };
}

test("subscription lifecycle projection uses the immutable webhook snapshot", () => {
  const eventSnapshot = subscription("active");
  const newerStripeState = subscription("past_due");
  const event = lifecycleEvent("customer.subscription.updated", 1785542500, eventSnapshot);

  const selected = stripeSubscriptionSnapshotFromEvent(event);
  assert.equal(selected, eventSnapshot);
  assert.notEqual(selected, newerStripeState);

  const projection = buildStripeSubscriptionProjection({
    env: prices,
    event,
    subscription: selected,
  });
  assert.equal(projection.status, "active");
  assert.equal(projection.plan, "plus");
  assert.equal(projection.eventCreatedAt, "2026-08-01T00:01:40.000Z");
});

test("created updated and deleted use event snapshots while checkout is not lifecycle authority", () => {
  for (const type of [
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
  ]) {
    const snapshot = subscription(type.endsWith("deleted") ? "canceled" : "active");
    assert.equal(stripeSubscriptionSnapshotFromEvent(lifecycleEvent(type, 1785542500, snapshot)), snapshot, type);
  }

  assert.equal(stripeSubscriptionSnapshotFromEvent({
    created: 1785542500,
    data: { object: { id: "cs_test" } },
    id: "evt_checkout",
    type: "checkout.session.completed",
  }), null);
});

test("webhook handler never refreshes a historical subscription event into current Stripe state", () => {
  assert.match(route, /stripeSubscriptionSnapshotFromEvent\(event\)/);
  assert.doesNotMatch(route, /subscriptions\.retrieve\(/);
  assert.doesNotMatch(route, /async function subscriptionForEvent/);
  assert.match(route, /event\.type === "checkout\.session\.completed"[\s\S]*verifyCompletedCheckout/);
});

test("Checkout completion validates association but never projects subscription lifecycle state", () => {
  const checkoutBranchStart = route.indexOf('if (event.type === "checkout.session.completed")');
  const lifecycleStart = route.indexOf("const subscription = stripeSubscriptionSnapshotFromEvent(event)");
  assert.ok(checkoutBranchStart >= 0 && lifecycleStart > checkoutBranchStart);
  const checkoutBranch = route.slice(checkoutBranchStart, lifecycleStart);
  assert.match(checkoutBranch, /verifyCompletedCheckout/);
  assert.doesNotMatch(checkoutBranch, /applyStripeSubscriptionProjection|buildStripeSubscriptionProjection/);

  const verifierStart = route.indexOf("async function verifyCompletedCheckout");
  const verifier = route.slice(verifierStart);
  assert.match(verifier, /session\.client_reference_id/);
  assert.match(verifier, /session\.metadata\?\.furvise_user_id/);
  assert.match(verifier, /session\.mode !== "subscription"/);
  assert.match(verifier, /getBillingAccountForUser\(admin, clientUserId\)/);
  assert.match(verifier, /account\.stripe_customer_id !== customerId/);
  assert.match(verifier, /hasBillingDeletionTombstone/);
  assert.match(verifier, /checkout_verified/);
  assert.doesNotMatch(verifier, /applyStripeSubscriptionProjection/);
});
