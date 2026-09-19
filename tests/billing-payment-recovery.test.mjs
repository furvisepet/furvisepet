import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { REQUIRED_SECURITY_MIGRATION_NAMES } from "../app/lib/operations/readiness.ts";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = source("supabase/migrations/20260824101500_add_billing_payment_recovery_grace.sql");
const fixture = source("supabase/tests/billing_payment_recovery_grace.sql");

test("payment recovery grace is bounded, transition-based, and Stripe-projected", () => {
  assert.match(migration, /add column past_due_since timestamptz/);
  assert.match(migration, /v_account\.subscription_status = 'past_due'[\s\S]*v_account\.past_due_since/);
  assert.match(migration, /else p_stripe_event_created_at/);
  assert.match(migration, /when p_subscription_status = 'past_due'/);
  assert.match(migration, /else null/);
  assert.match(migration, /past_due_since \+ interval '7 days' > statement_timestamp\(\)/);
  assert.match(migration, /account\.stripe_price_id = account\.checkout_price_id/);
  assert.match(migration, /account\.current_period_end > statement_timestamp\(\)/);
});

test("Stripe projection remains truthful while effective entitlement can grace past_due", () => {
  assert.match(migration, /p_subscription_status = 'active'[\s\S]*then 'plus'[\s\S]*else 'free'/);
  assert.match(migration, /account\.subscription_status = 'past_due'[\s\S]*then true/);
  assert.match(migration, /case when account\.has_plus_access then 'plus' else 'free' end/);
  assert.match(migration, /'stripe:' \|\| account\.stripe_subscription_id/);
});

test("payment recovery authority is deployment-gated and browser cannot own grace state", () => {
  assert.ok(REQUIRED_SECURITY_MIGRATION_NAMES.includes("add_billing_payment_recovery_grace"));
  assert.match(migration, /billing_payment_recovery_authority/);
  assert.match(migration, /not pg_catalog\.has_column_privilege\('authenticated', v_relation, 'past_due_since', 'UPDATE'\)/);
  assert.match(migration, /apply_stripe_subscription_projection/);
  assert.match(migration, /private\.resolve_active_billing_plan/);
  assert.match(migration, /grant execute on function public\.furvise_security_compatibility_snapshot_v2\(text\[\]\)[\s\S]*to service_role/);
});

test("executable fixture covers grace, expiry, recovery, terminal loss, and readiness drift", () => {
  assert.match(fixture, /fresh past_due subscription lost Plus during recovery grace/);
  assert.match(fixture, /repeated past_due event extended the grace window/);
  assert.match(fixture, /expired recovery grace did not fail closed/);
  assert.match(fixture, /payment recovery did not restore Plus/);
  assert.match(fixture, /unpaid subscription retained Plus/);
  assert.match(fixture, /authenticated role unexpectedly wrote past_due_since/);
  assert.match(fixture, /grant update \(past_due_since\) on public\.billing_accounts to authenticated/);
  assert.match(fixture, /security invoker/);
});
