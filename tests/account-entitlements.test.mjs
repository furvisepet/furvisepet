import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  parseEffectiveEntitlements,
} from "../app/lib/billing/entitlement-types.ts";
import { getMonthlyAiAllowance } from "../app/lib/ai/usage-ledger.ts";
import { getRateLimitPolicy } from "../app/lib/security/rate-limit/config.ts";

const migrationPath = "supabase/migrations/20260810010000_add_centralized_account_entitlements.sql";
const read = (path) => fs.readFileSync(path, "utf8");

const freeRow = {
  access_role: "consumer",
  billing_plan: "free",
  effective_plan: "free",
  live_product_research: false,
  long_history_pattern_detection: false,
  products_paid_functionality: false,
  vet_prep_exports: false,
  max_pets: 1,
  monthly_ai_credits: 50,
};

test("sanitized entitlement rows parse into the centralized application model", () => {
  assert.deepEqual(parseEffectiveEntitlements(freeRow), {
    accessRole: "consumer",
    billingPlan: "free",
    effectivePlan: "free",
    capabilities: {
      liveProductResearch: false,
      longHistoryPatternDetection: false,
      productsPaidFunctionality: false,
      vetPrepExports: false,
    },
    limits: { maxPets: 1, monthlyAiCredits: 50 },
  });
  assert.equal(parseEffectiveEntitlements({ ...freeRow, access_role: "admin" }), null);
  assert.equal(parseEffectiveEntitlements({ ...freeRow, monthly_ai_credits: Number.POSITIVE_INFINITY }), null);
});

test("application resolver invokes only the caller-scoped zero-argument RPC", () => {
  const source = read("app/lib/billing/entitlements.ts");
  assert.match(source, /supabase\.rpc\("get_my_entitlements"\)/);
  assert.doesNotMatch(source, /get_my_entitlements",\s*\{/);
  assert.match(source, /import "server-only"/);
});

test("effective monthly allowance supports QA quota without changing billing plan identity", () => {
  assert.equal(getMonthlyAiAllowance("free-user", "free"), 50);
  assert.equal(getMonthlyAiAllowance("plus-user", "plus"), 500);
  assert.equal(getMonthlyAiAllowance("qa-user", "plus", 100000), 100000);
  assert.equal(getMonthlyAiAllowance("qa-user", "plus", -1), 500);
});

test("migration makes grants private, caller-scoped, auditable, revocable, and finite", () => {
  const sql = read(migrationPath);
  assert.match(sql, /access_role text not null check \(access_role = 'internal_qa'\)/);
  assert.match(sql, /account_access_audit/);
  assert.match(sql, /ACCOUNT_ACCESS_AUDIT_APPEND_ONLY/);
  assert.match(sql, /after insert or update or delete on public\.account_access_grants/);
  assert.match(sql, /revoke all on table public\.account_access_grants, public\.account_access_audit from public, anon, authenticated/);
  assert.match(sql, /create or replace function public\.get_my_entitlements\(\)/);
  assert.match(sql, /v_user_id uuid := auth\.uid\(\)/);
  assert.doesNotMatch(sql, /function public\.get_my_entitlements\([^)]*uuid/i);
  assert.match(sql, /revoke all on function private\.resolve_account_entitlements\(uuid\) from public, anon, authenticated/);
  assert.match(sql, /then 1000/);
  assert.match(sql, /then 100000/);
});

test("AI RPC ignores caller allowance and pet trigger uses the DB resolver", () => {
  const sql = read(migrationPath);
  const reserve = sql.slice(sql.indexOf("create or replace function public.reserve_ai_credit"));
  assert.match(reserve, /private\.resolve_account_entitlements\(v_user_id\)/);
  assert.match(reserve, /v_reserved >= v_allowance/);
  assert.doesNotMatch(reserve, /v_reserved >= p_allowance/);
  assert.doesNotMatch(read("app/lib/ai/usage-ledger.ts"), /p_allowance/);
  assert.match(sql, /private\.resolve_account_entitlements\(auth\.uid\(\)\)/);
  assert.match(sql, /new\.user_id <> auth\.uid\(\)/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /email_confirmed_at is not null/);
});

test("internal QA does not alter infrastructure or provider-cost policies", () => {
  assert.deepEqual(getRateLimitPolicy("ASK_AI").user, { limit: 10, windowMs: 60_000 });
  assert.deepEqual(getRateLimitPolicy("ASK_AI").ip, { limit: 30, windowMs: 60_000 });
  assert.match(read("app/lib/ai/usage-guard/features.ts"), /ask: policy\("ask", "FURVISE_AI_ASK_ENABLED", 20_000, 80_000, ASK_MAX_OUTPUT_TOKENS, 3\)/);
  assert.doesNotMatch(read("app/lib/security/rate-limit/config.ts"), /internal_qa|entitlement/i);
  assert.doesNotMatch(read("app/lib/ai/usage-guard/admission.ts"), /internal_qa|entitlement/i);
});

test("all current paid-feature server contexts use centralized entitlements", () => {
  const files = [
    "app/api/ask/route.ts",
    "app/api/analyze/route.ts",
    "app/api/safety-followup/route.ts",
    "app/api/shop/interpret-query/route.ts",
    "app/api/shop/product-question/route.ts",
    "app/api/shop/explain-product-fit/route.ts",
    "app/lib/vet-brief/server.ts",
  ];
  for (const file of files) {
    const source = read(file);
    assert.match(source, /resolveEffectiveEntitlements/);
    assert.doesNotMatch(source, /getUserPlan/);
  }
  assert.match(read("app/lib/pet-limit.ts"), /\/api\/account\/entitlements/);
  assert.match(read("app/lib/pet-profile-api-server.ts"), /PET_LIMIT_REACHED/);
});
