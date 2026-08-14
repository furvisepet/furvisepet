import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  FREE_ASK_ALLOWANCE,
  PLUS_ASK_ALLOWANCE,
  getAskAllowance,
  getPlusPriceId,
  recognizePlusPriceId,
  resolvesToPlus,
} from "../app/lib/billing/launch-plans.ts";
import { buildStripeSubscriptionProjection } from "../app/lib/billing/stripe-projection.ts";
import { getAskAllowanceStatus, runWithAiCredit } from "../app/lib/ai/usage-ledger.ts";

const migrationPath = "supabase/migrations/20260814085052_add_launch_billing_and_ask_allowances.sql";
const read = (path) => readFileSync(path, "utf8");
const prices = { STRIPE_PLUS_PRICE_ID: "price_plusmonthly" };

test("launch plans expose exactly 8 Free Ask and 55 Plus Ask", () => {
  assert.equal(FREE_ASK_ALLOWANCE, 8);
  assert.equal(PLUS_ASK_ALLOWANCE, 55);
  assert.equal(getAskAllowance("free"), 8);
  assert.equal(getAskAllowance("plus"), 55);
});

test("the single multi-currency Plus price is server-configured and fails closed", () => {
  assert.equal(getPlusPriceId(prices), "price_plusmonthly");
  assert.throws(() => getPlusPriceId({}), /STRIPE_PRICE_CONFIGURATION_MISSING/);
  assert.throws(() => getPlusPriceId({ STRIPE_PLUS_PRICE_ID: "prod_not_a_price" }), /STRIPE_PRICE_CONFIGURATION_MISSING/);
  assert.equal(recognizePlusPriceId("price_attacker", prices), false);
  assert.equal(recognizePlusPriceId("price_plusmonthly", prices), true);
  assert.equal(recognizePlusPriceId("price_plusmonthly", {
    STRIPE_PLUS_PRICE_CAD: "price_plusmonthly",
    STRIPE_PLUS_PRICE_USD: "price_attacker",
  }), false);
});

test("only a known-price active subscription with a valid period resolves Plus", () => {
  const periodStart = new Date("2026-08-01T00:00:00Z");
  const periodEnd = new Date("2026-09-01T00:00:00Z");
  assert.equal(resolvesToPlus({ periodEnd, periodStart, priceRecognized: true, status: "active" }), true);
  for (const status of ["incomplete", "incomplete_expired", "trialing", "past_due", "canceled", "unpaid", "paused"]) {
    assert.equal(resolvesToPlus({ periodEnd, periodStart, priceRecognized: true, status }), false, status);
  }
  assert.equal(resolvesToPlus({ periodEnd, periodStart, priceRecognized: false, status: "active" }), false);
});

test("recognized Plus subscriptions grant Plus in CAD or USD while unknown prices fail closed", () => {
  for (const currency of ["cad", "usd"]) {
    const projection = buildStripeSubscriptionProjection({
      env: prices,
      event: { created: 1785542400, id: `evt_active_${currency}`, type: "customer.subscription.updated" },
      subscription: subscription({ currency, priceId: "price_plusmonthly", status: "active" }),
    });
    assert.equal(projection.plan, "plus");
    assert.equal(projection.priceRecognized, true);
    assert.equal(projection.currency, currency);
    assert.equal(projection.userId, "10000000-0000-4000-8000-000000000001");
  }

  const unknown = buildStripeSubscriptionProjection({
    env: prices,
    event: { created: 1785542401, id: "evt_unknown", type: "customer.subscription.updated" },
    subscription: subscription({ currency: "cad", priceId: "price_not_furvise", status: "active" }),
  });
  assert.equal(unknown.plan, "free");
  assert.equal(unknown.priceRecognized, false);
});

test("Ask status uses the caller-scoped database allowance projection", async () => {
  const supabase = rpcClient({
    allowance: 55,
    billing_plan: "plus",
    cancel_at_period_end: true,
    effective_plan: "plus",
    period_end: "2026-09-14T00:00:00Z",
    period_start: "2026-08-14",
    remaining: 12,
    subscription_status: "active",
    used: 43,
  });
  const status = await getAskAllowanceStatus({ supabase });
  assert.deepEqual(status, {
    allowed: true,
    billingPlan: "plus",
    cancelAtPeriodEnd: true,
    count: 43,
    ledgerMode: "database",
    limit: 55,
    monthKey: "2026-08-14",
    planId: "plus",
    remaining: 12,
    resetAt: "2026-09-14T00:00:00Z",
    subscriptionStatus: "active",
  });
  assert.deepEqual(supabase.calls, [{ args: undefined, name: "get_my_ask_allowance_status" }]);
});

test("multiple provider calls in one canonical Ask reserve and complete one allowance unit", async () => {
  const supabase = creditClient([reservation("reserved", 7), reservation("completed", 7), allowanceRow(1, 7)]);
  let providerCalls = 0;
  const result = await runWithAiCredit({
    feature: "ask",
    generate: async () => { providerCalls += 2; return "answer"; },
    requestId: "20000000-0000-4000-8000-000000000001",
    supabase,
    userId: "10000000-0000-4000-8000-000000000001",
  });
  assert.equal(providerCalls, 2);
  assert.equal(result.creditsUsed, 1);
  assert.deepEqual(supabase.calls.map((call) => call.name), ["reserve_ai_credit", "complete_ai_credit", "get_my_ask_allowance_status"]);
});

test("provider failure releases once and completed replay consumes no new Ask", async () => {
  const failed = creditClient([reservation("reserved", 7), reservation("released", 8)]);
  await assert.rejects(runWithAiCredit({
    feature: "ask",
    generate: async () => { throw new Error("provider failed"); },
    requestId: "20000000-0000-4000-8000-000000000002",
    supabase: failed,
    userId: "10000000-0000-4000-8000-000000000001",
  }), /provider failed/);
  assert.deepEqual(failed.calls.map((call) => call.name), ["reserve_ai_credit", "release_ai_credit"]);

  const replay = creditClient([reservation("completed", 4), allowanceRow(4, 4)]);
  const result = await runWithAiCredit({
    feature: "ask",
    generate: async () => "persisted answer",
    requestId: "20000000-0000-4000-8000-000000000003",
    supabase: replay,
    userId: "10000000-0000-4000-8000-000000000001",
  });
  assert.equal(result.creditsUsed, 0);
  assert.deepEqual(replay.calls.map((call) => call.name), ["reserve_ai_credit", "get_my_ask_allowance_status"]);
});

test("migration extends the canonical ledger and secures authoritative billing state", () => {
  const sql = read(migrationPath);
  assert.match(sql, /create table public\.billing_accounts/);
  assert.match(sql, /alter table public\.billing_accounts enable row level security/);
  assert.match(sql, /revoke all on table public\.billing_accounts from public, anon, authenticated/);
  assert.match(sql, /grant select, insert, update on table public\.billing_accounts to service_role/);
  assert.match(sql, /create table private\.stripe_webhook_events/);
  assert.match(sql, /stripe_event_id text primary key/);
  assert.match(sql, /p_stripe_event_created_at < v_account\.last_stripe_event_created_at/);
  assert.match(sql, /if exists \(select 1 from private\.stripe_webhook_events where stripe_event_id = p_stripe_event_id\)/);
  assert.match(sql, /when p_price_recognized[\s\S]*p_subscription_status = 'active'[\s\S]*then 'plus'/);
  assert.match(sql, /stripe_currency text check/);
  assert.doesNotMatch(sql, /checkout_country/);
  assert.doesNotMatch(sql.slice(sql.indexOf("create or replace function private.resolve_account_entitlements")), /raw_app_meta_data/);
  assert.match(sql, /when billing\.billing_plan = 'plus' then 55 else 8/);
  assert.match(sql, /'stripe:' \|\| account\.stripe_subscription_id \|\| ':' \|\| extract\(epoch from account\.current_period_start\)/);
  assert.match(sql, /event\.allowance_period_key = resolved\.period_key/);
  assert.match(sql, /monthly_usage\.feature = 'ask'/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /where usage_event\.user_id = v_user_id and usage_event\.request_id = p_request_id/);
});

test("billing endpoints keep price and currency selection server/Stripe-owned and verify raw signed webhooks", () => {
  const checkout = read("app/api/billing/checkout/route.ts");
  const portal = read("app/api/billing/portal/route.ts");
  const webhook = read("app/api/billing/webhook/route.ts");
  assert.match(checkout, /getAuthenticatedApiContext\(request\)/);
  assert.match(portal, /getAuthenticatedApiContext\(request\)/);
  assert.match(checkout, /getPlusPriceId\(process\.env\)/);
  assert.match(checkout, /line_items: \[\{ price: priceId, quantity: 1 \}\]/);
  assert.doesNotMatch(checkout, /request\.json\(|searchParams\.get\(/);
  assert.doesNotMatch(checkout, /user_profiles|account-country|profile\?\.country|currency\s*:/);
  assert.doesNotMatch(checkout, /STRIPE_PLUS_PRICE_CAD|STRIPE_PLUS_PRICE_USD/);
  assert.match(checkout, /resolveTargetOrigin\(request\)/);
  assert.match(checkout, /subscription_data: \{ metadata: \{ furvise_user_id: context\.userId \} \}/);
  assert.match(checkout, /integration_identifier:/);
  assert.doesNotMatch(checkout, /payment_method_types/);
  assert.match(portal, /account\.stripe_customer_id/);
  assert.match(webhook, /const rawBody = await request\.text\(\)/);
  assert.match(webhook, /constructEvent\(rawBody, signature, getStripeWebhookSecret\(\)\)/);
  assert.doesNotMatch(webhook, /request\.json\(/);
});

function subscription({ currency = "usd", priceId, status }) {
  return {
    cancel_at_period_end: false,
    customer: "cus_furvise",
    currency,
    id: "sub_furvise",
    items: { data: [{ current_period_end: 1788220800, current_period_start: 1785542400, price: { id: priceId } }] },
    metadata: { furvise_user_id: "10000000-0000-4000-8000-000000000001" },
    status,
  };
}

function rpcClient(row) {
  return {
    calls: [],
    async rpc(name, args) { this.calls.push({ args, name }); return { data: [row], error: null }; },
  };
}

function creditClient(rows) {
  return {
    calls: [],
    async rpc(name, args) { this.calls.push({ args, name }); return { data: [rows.shift()], error: null }; },
  };
}

function reservation(status, remaining) {
  return { credits_used: status === "released" ? 0 : 1, event_status: status, remaining, reservation_status: status };
}

function allowanceRow(used, remaining) {
  return { allowance: 8, billing_plan: "free", cancel_at_period_end: false, effective_plan: "free", period_end: "2026-09-01T00:00:00Z", period_start: "2026-08-01", remaining, subscription_status: "none", used };
}
