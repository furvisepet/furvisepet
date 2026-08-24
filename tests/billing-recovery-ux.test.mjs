import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  isTerminalStripeSubscriptionStatus,
  shouldManageExistingSubscription,
} from "../app/lib/billing/launch-plans.ts";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const checkout = source("app/api/billing/checkout/route.ts");
const entitlements = source("app/api/account/entitlements/route.ts");
const membership = source("app/membership/page.tsx");

test("one subscription lifecycle contract drives checkout and membership routing", () => {
  for (const status of ["canceled", "incomplete_expired"]) {
    assert.equal(isTerminalStripeSubscriptionStatus(status), true, status);
    assert.equal(shouldManageExistingSubscription(status), false, status);
  }
  for (const status of ["active", "past_due", "unpaid", "paused", "incomplete", "trialing"]) {
    assert.equal(isTerminalStripeSubscriptionStatus(status), false, status);
    assert.equal(shouldManageExistingSubscription(status), true, status);
  }
  assert.equal(shouldManageExistingSubscription("none"), false);
  assert.match(checkout, /!isTerminalStripeSubscriptionStatus\(subscription\.status\)/);
  assert.match(checkout, /!isTerminalStripeSubscriptionStatus\(completedSubscription\.status\)/);
  assert.match(membership, /shouldManageExistingSubscription\(subscriptionStatus\)/);
});

test("nonterminal recovery states keep the existing subscription currency and route to billing management", () => {
  assert.match(entitlements, /const hasExistingBillingRelationship = entitlements\.billingPlan === "plus"[\s\S]*shouldManageExistingSubscription\(askUsage\.subscriptionStatus\)/);
  assert.match(entitlements, /hasExistingBillingRelationship[\s\S]*getProjectedBillingCurrencyForUser/);
  assert.match(membership, /Your payment needs attention\./);
  assert.match(membership, /Your Plus payment is still overdue\./);
  assert.match(membership, /Your Plus payment could not be recovered\./);
  assert.match(membership, /Your Plus setup is not finished yet\./);
  assert.match(membership, /Your Furvise subscription is paused\./);
  assert.match(membership, /billingDestination === "portal" \? "Manage billing" : "Upgrade to Furvise Plus"/);
});
