import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const route = source("app/api/billing/checkout/route.ts");
const billingAdmin = source("app/lib/billing/billing-admin.ts");
const migration = source("supabase/migrations/20260824060000_add_billing_checkout_single_flight.sql");
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
  assert.match(route, /expires_at: expiresAt/);
});

test("Stripe retries reuse stable parameters for the same financial attempt", () => {
  assert.match(route, /cancel_url: `\$\{singleFlight\.return_origin\}/);
  assert.match(route, /success_url: `\$\{singleFlight\.return_origin\}/);
  assert.match(route, /checkoutIntegrationIdentifier\(singleFlight\.attempt_id\)/);
  assert.match(route, /function checkoutIntegrationIdentifier\(attemptId: string\)/);
  assert.match(migration, /A stale creating attempt keeps both attempt_id and return_origin/);
  assert.match(migration, /v_next_attempt := v_row\.attempt_id/);
  assert.match(migration, /v_next_origin := v_row\.return_origin/);
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
});

test("database fixture proves serialization, retry recovery, reuse, and reset", () => {
  assert.match(sqlFixture, /claim_outcome <> 'in_progress'/);
  assert.match(sqlFixture, /v_reclaimed\.attempt_id <> v_first\.attempt_id/);
  assert.match(sqlFixture, /v_existing\.claim_outcome <> 'existing'/);
  assert.match(sqlFixture, /v_new\.attempt_id = v_first\.attempt_id/);
  assert.match(sqlFixture, /authenticated role unexpectedly claimed checkout authority/);
});
