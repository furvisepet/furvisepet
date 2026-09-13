import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { isTerminalStripeSubscriptionStatus } from "../app/lib/billing/launch-plans.ts";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const route = source("app/api/billing/checkout/route.ts");
const billingAdmin = source("app/lib/billing/billing-admin.ts");
const readiness = source("app/lib/operations/readiness.ts");
const migration = source("supabase/migrations/20260824060000_add_billing_checkout_single_flight.sql");
const readinessMigration = source("supabase/migrations/20260824062000_harden_billing_checkout_single_flight_readiness.sql");
const sqlFixture = source("supabase/tests/billing_checkout_single_flight.sql");

test("checkout creation uses durable user/product single-flight authority", () => {
  assert.match(route, /claimPlusCheckoutSingleFlight/);
  assert.match(route, /completePlusCheckoutSingleFlight/);
  assert.match(route, /abandonPlusCheckoutSingleFlight/);
  assert.match(route, /resetPlusCheckoutSingleFlight/);
  assert.match(route, /furvise_plus_checkout_\$\{singleFlight\.attempt_id\}/);
  assert.doesNotMatch(route, /furvise_checkout_\$\{gate\.operation\.key\}/);
  assert.match(route, /CHECKOUT_IN_PROGRESS/);
  assert.match(route, /CHECKOUT_PROCESSING/);
  assert.match(route, /checkout\.sessions\.retrieve\(singleFlight\.stripe_checkout_session_id\)/);
  assert.doesNotMatch(route, /\bexpires_at\s*:/);
});

test("Stripe retries reuse stable parameters for the same financial attempt", () => {
  assert.match(route, /cancel_url: `\$\{singleFlight\.return_origin\}/);
  assert.match(route, /success_url: `\$\{singleFlight\.return_origin\}/);
  assert.match(route, /checkoutIntegrationIdentifier\(singleFlight\.attempt_id\)/);
  assert.match(route, /function checkoutIntegrationIdentifier\(attemptId: string\)/);
  assert.match(migration, /Only a stale or explicitly abandoned creating attempt reaches here/);
  assert.match(migration, /attempt_id and return_origin[\s\S]*same[\s\S]*idempotency key/);
  assert.match(migration, /if v_row\.state = 'open' then/);
  assert.doesNotMatch(migration, /if v_row\.state = 'open' and v_row\.session_expires_at > v_now then/);
});

test("new checkout is blocked while any Stripe subscription is nonterminal", () => {
  assert.equal(isTerminalStripeSubscriptionStatus("canceled"), true);
  assert.equal(isTerminalStripeSubscriptionStatus("incomplete_expired"), true);
  for (const status of ["active", "past_due", "unpaid", "paused", "incomplete", "trialing"]) {
    assert.equal(isTerminalStripeSubscriptionStatus(status), false, status);
  }
  assert.match(route, /subscriptions\.list\(\{ customer: customerId, limit: 100, status: "all" \}\)/);
  assert.match(route, /if \(existing\.has_more\)/);
  assert.match(route, /SUBSCRIPTION_HISTORY_RECONCILING/);
  assert.match(route, /!isTerminalStripeSubscriptionStatus\(subscription\.status\)/);
  assert.match(route, /SUBSCRIPTION_ALREADY_EXISTS/);
});

test("completed Checkout sessions only reset after their Stripe subscription is terminal", () => {
  assert.match(route, /existingSession\.status === "complete"/);
  assert.match(route, /stripe\.subscriptions\.retrieve\(subscriptionId\)/);
  assert.match(route, /!isTerminalStripeSubscriptionStatus\(completedSubscription\.status\)/);
  assert.match(route, /CHECKOUT_PROCESSING/);
  assert.match(route, /await resetPlusCheckoutSingleFlight\(/);
});

test("single-flight state is private and callable only through service RPCs", () => {
  assert.match(migration, /create table private\.billing_checkout_single_flights/);
  assert.match(migration, /primary key \(user_id, product_key\)/);
  assert.match(migration, /revoke all on table private\.billing_checkout_single_flights[\s\S]*from public, anon, authenticated, service_role/);
  assert.match(migration, /grant execute on function public\.claim_billing_checkout_single_flight\(uuid,text,integer,text\) to service_role/);
  assert.match(migration, /SERVICE_ROLE_REQUIRED/);
  assert.match(billingAdmin, /claim_billing_checkout_single_flight/);
  assert.match(billingAdmin, /complete_billing_checkout_single_flight/);
  assert.match(billingAdmin, /abandon_billing_checkout_single_flight/);
  assert.match(billingAdmin, /reset_billing_checkout_single_flight/);
  assert.match(readiness, /"add_billing_checkout_single_flight"/);
  assert.match(readiness, /"harden_billing_checkout_single_flight_readiness"/);
  assert.match(readinessMigration, /billing_checkout_authority/);
});

test("database fixture proves serialization, retry recovery, reuse, Stripe expiry authority, and reset", () => {
  assert.match(sqlFixture, /claim_outcome <> 'in_progress'/);
  assert.match(sqlFixture, /v_reclaimed\.attempt_id <> v_first\.attempt_id/);
  assert.match(sqlFixture, /v_existing\.claim_outcome <> 'existing'/);
  assert.match(sqlFixture, /database clock incorrectly replaced Stripe expiry authority/);
  assert.match(sqlFixture, /v_expired_existing\.claim_outcome <> 'existing'/);
  assert.match(sqlFixture, /v_new\.attempt_id = v_first\.attempt_id/);
  assert.match(sqlFixture, /authenticated role unexpectedly claimed checkout authority/);
});
