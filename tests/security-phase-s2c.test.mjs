import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { estimateInputTokens, estimateProviderCostMicrodollars, getModelPrice } from "../app/lib/ai/usage-guard/cost-estimator.ts";
import { MemoryAiGuardTestStore } from "../app/lib/ai/usage-guard/memory-test-store.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

function reservation(overrides = {}) {
  return {
    callId: "operation-a:call-a", callLimit: 3, costLimitMicrodollars: 10_000, day: "2026-07-29",
    feature: "ask", maximumOperationCalls: 2, operationId: "operation-a", reservedCostMicrodollars: 1_000,
    ttlSeconds: 3_600, ...overrides,
  };
}

test("daily provider-call ceiling is atomic at the exact boundary and shared across users and features", async () => {
  const store = new MemoryAiGuardTestStore();
  assert.equal((await store.reserveCall(reservation({ callId: "a:1", operationId: "a" }))).allowed, true);
  assert.equal((await store.reserveCall(reservation({ callId: "b:1", feature: "product_query", operationId: "b" }))).allowed, true);
  assert.equal((await store.reserveCall(reservation({ callId: "c:1", feature: "vet_brief", operationId: "c" }))).allowed, true);
  const denied = await store.reserveCall(reservation({ callId: "d:1", operationId: "d" }));
  assert.equal(denied.allowed, false);
  assert.equal(denied.reason, "daily_call_limit");
  assert.deepEqual(store.getSnapshot("2026-07-29"), { calls: 3, costMicrodollars: 3_000 });
});

test("UTC buckets are independent and unstarted crash-safe reservations can be released", async () => {
  const store = new MemoryAiGuardTestStore();
  await store.reserveCall(reservation({ callId: "a:one", operationId: "a" }));
  await store.reserveCall(reservation({ callId: "b:next", day: "2026-07-30", operationId: "b" }));
  assert.equal(store.getSnapshot("2026-07-29").calls, 1);
  assert.equal(store.getSnapshot("2026-07-30").calls, 1);
  await store.releaseUnstartedCall({ callId: "a:one" });
  assert.deepEqual(store.getSnapshot("2026-07-29"), { calls: 0, costMicrodollars: 0 });
});

test("daily cost reservations deny above ceiling and reconcile with integer microdollars", async () => {
  const store = new MemoryAiGuardTestStore();
  assert.equal((await store.reserveCall(reservation({ callId: "a:1", costLimitMicrodollars: 1_500, operationId: "a" }))).allowed, true);
  const denied = await store.reserveCall(reservation({ callId: "b:1", costLimitMicrodollars: 1_500, operationId: "b" }));
  assert.equal(denied.allowed, false);
  assert.equal(denied.reason, "daily_cost_limit");
  await store.markCallStarted({ callId: "a:1" });
  await store.reconcileCall({ actualCostMicrodollars: 400, callId: "a:1" });
  assert.equal(store.getSnapshot("2026-07-29").costMicrodollars, 400);
  assert.equal(Number.isInteger(store.getSnapshot("2026-07-29").costMicrodollars), true);
});

test("actual provider cost remains recorded after a call starts and may reconcile above its estimate", async () => {
  const store = new MemoryAiGuardTestStore();
  await store.reserveCall(reservation({ callId: "a:started", operationId: "a" }));
  await store.markCallStarted({ callId: "a:started" });
  await store.releaseUnstartedCall({ callId: "a:started" });
  assert.equal(store.getSnapshot("2026-07-29").calls, 1);
  await store.reconcileCall({ actualCostMicrodollars: 1_400, callId: "a:started" });
  assert.deepEqual(store.getSnapshot("2026-07-29"), { calls: 1, costMicrodollars: 1_400 });
});

test("provider-call budget is enforced across retries for one logical operation", async () => {
  const store = new MemoryAiGuardTestStore();
  assert.equal((await store.reserveCall(reservation({ callId: "a:1" }))).allowed, true);
  assert.equal((await store.reserveCall(reservation({ callId: "a:2" }))).allowed, true);
  const third = await store.reserveCall(reservation({ callId: "a:3" }));
  assert.equal(third.allowed, false);
  assert.equal(third.reason, "operation_call_limit");
});

test("operation admission is idempotent, conflicts on changed payload, and remembers completion", async () => {
  const store = new MemoryAiGuardTestStore();
  assert.equal(await store.admitOperation({ fingerprint: "payload-a", key: "request-a", ttlSeconds: 1 }), "created");
  assert.equal(await store.admitOperation({ fingerprint: "payload-a", key: "request-a", ttlSeconds: 1 }), "reused");
  assert.equal(await store.admitOperation({ fingerprint: "payload-b", key: "request-a", ttlSeconds: 1 }), "conflict");
  await store.completeOperation({ key: "request-a", ttlSeconds: 1 });
  assert.equal(await store.admitOperation({ fingerprint: "payload-a", key: "request-a", ttlSeconds: 1 }), "completed");
});

test("Redis-backed emergency state is represented independently from environment flags", async () => {
  const store = new MemoryAiGuardTestStore();
  assert.equal((await store.emergencyStatus()).disabled, false);
  store.setEmergency(true, "incident");
  assert.deepEqual(await store.emergencyStatus(), { disabled: true, reason: "incident", updatedAt: (await store.emergencyStatus()).updatedAt });
});

test("pricing is centralized, fixed-point, and unknown models never imply zero cost", () => {
  const price = getModelPrice("gpt-5.4-mini");
  assert.equal(price.inputMicrodollarsPerMillionTokens, 750_000);
  assert.equal(price.cachedInputMicrodollarsPerMillionTokens, 75_000);
  assert.equal(price.outputMicrodollarsPerMillionTokens, 4_500_000);
  assert.equal(estimateProviderCostMicrodollars("gpt-5.4-mini", { inputTokens: 1_000_000, outputTokens: 1_000_000 }), 5_250_000);
  assert.equal(estimateProviderCostMicrodollars("unknown-model", { inputTokens: 1, outputTokens: 1 }), null);
  assert.equal(estimateInputTokens("x".repeat(3_001)), 1_001);
});

test("global, feature, daily, emergency, and model checks precede any provider reservation", () => {
  const source = read("app/lib/ai/usage-guard/admission.ts");
  const ordered = ["!config.enabled", "!isAiFeatureEnabled", "!config.configured", "!getModelPrice", "emergencyStatus", "emergency.disabled", "admitOperation", "reserveNextCall"];
  let prior = -1;
  for (const marker of ordered) { const next = source.indexOf(marker); assert.ok(next > prior, marker); prior = next; }
  assert.match(source, /AI_DAILY_CAP_REACHED/);
  assert.match(source, /daily_guard_store_unavailable/);
});

test("feature registry has bounded call, input, context, and output budgets", () => {
  const source = read("app/lib/ai/usage-guard/features.ts");
  for (const feature of ["ask", "care_plan", "product_explanation", "product_query", "product_question", "safety_followup", "vet_brief"]) assert.match(source, new RegExp(`${feature}: policy`));
  assert.match(source, /ask: policy\([^\n]+4096|ASK_MAX_OUTPUT_TOKENS/);
  assert.match(source, /product_query: policy\([^\n]+520, 1\)/);
  assert.match(source, /vet_brief: policy\([^\n]+1_800, 1\)/);
});

test("all paid feature routes admit centrally after S2B and before user-credit reservation", () => {
  const routes = [
    "app/api/analyze/route.ts", "app/api/ask/route.ts", "app/api/safety-followup/route.ts",
    "app/api/shop/explain-product-fit/route.ts", "app/api/shop/interpret-query/route.ts",
    "app/api/shop/product-question/route.ts", "app/api/vet-briefs/draft/route.ts",
  ];
  for (const route of routes) {
    const source = read(route);
    const admission = Math.max(source.lastIndexOf("runAdmittedAiOperation"), source.lastIndexOf("aiAdmission = await admitAiOperation"));
    assert.ok(source.indexOf("requireRateLimitedRequest") < admission, route);
    assert.ok(admission < source.lastIndexOf("runWithAiCredit") || source.includes("reserveAiCredit"), route);
  }
});

test("no paid Responses invocation bypasses the approved provider executor", () => {
  for (const path of ["app/lib/ai/ask-furvise.ts", "app/lib/ai/ask-reasoning.ts", "app/lib/ai/providers/openai.ts"]) {
    const source = read(path);
    assert.match(source, /executeAdmittedProviderCall/);
    for (const match of source.matchAll(/responses\.create/g)) {
      const nearby = source.slice(Math.max(0, match.index - 250), match.index + 100);
      assert.match(nearby, /invoke:\s*\(\)\s*=>/, `${path}:${match.index}`);
    }
  }
});

test("provider retries and fallback calls cannot escape the same AsyncLocalStorage operation budget", () => {
  const provider = read("app/lib/ai/usage-guard/provider-call-budget.ts");
  const admission = read("app/lib/ai/usage-guard/admission.ts");
  const context = read("app/lib/ai/usage-guard/context.ts");
  assert.match(provider, /getActiveAiAdmission\(\)/);
  assert.match(provider, /beginProviderCall/);
  assert.match(context, /AsyncLocalStorage<AiOperationAdmission>/);
  assert.match(admission, /maximumProviderCalls/);
  assert.match(admission, /provider_call_budget_exhausted/);
});

test("global shutdown is server-only and memory extraction can be disabled without disabling manual memory management", () => {
  const env = read(".env.example");
  const config = read("app/lib/ai/usage-guard/config.ts");
  assert.doesNotMatch(env, /NEXT_PUBLIC_FURVISE_AI|NEXT_PUBLIC_UPSTASH/);
  assert.match(config, /FURVISE_AI_ENABLED/);
  assert.match(config, /FURVISE_AI_MEMORY_EXTRACTION_ENABLED/);
  assert.match(read("app/lib/intelligence/run-intelligence.ts"), /isAiMemoryExtractionEnabled/);
  assert.match(read("app/lib/intelligence/run-feature-intelligence.ts"), /isAiMemoryExtractionEnabled/);
});

test("pre-provider admission wraps credit reservation while post-provider failures retain platform usage", () => {
  const ask = read("app/api/ask/route.ts");
  const admission = read("app/lib/ai/usage-guard/admission.ts");
  const ledger = read("app/lib/ai/usage-ledger.ts");
  assert.ok(ask.lastIndexOf("runAdmittedAiOperation") < ask.lastIndexOf("reserveAiCredit"));
  assert.match(admission, /markCallStarted/);
  assert.match(admission, /provider call failed after start/);
  assert.match(admission, /releaseUnstartedCall/);
  assert.match(ledger, /recordActiveAiUserCreditState/);
  assert.match(admission, /user credit state/);
});

test("Product admission denial degrades to deterministic output instead of blocking browsing", () => {
  for (const route of ["app/api/shop/explain-product-fit/route.ts", "app/api/shop/interpret-query/route.ts", "app/api/shop/product-question/route.ts"]) {
    const source = read(route);
    assert.match(source, /AiAdmissionError/);
    assert.match(source, /fallback: true/);
    assert.match(source, /aiUnavailable/);
  }
  assert.doesNotMatch(read("app/api/shop/catalog/route.ts"), /runAdmittedAiOperation|AI_DAILY_CAP_REACHED/);
});

test("emergency operator script has no public route, requires explicit enable confirmation, and reveals no credentials", () => {
  const script = read("scripts/ai-emergency-control.mjs");
  assert.match(script, /--confirm-enable/);
  assert.match(script, /disable --reason/);
  assert.doesNotMatch(script, /console\.(?:log|error)\([^\n]*(?:token|url)/i);
  const result = spawnSync(process.execPath, ["scripts/ai-emergency-control.mjs", "status"], { cwd: new URL("..", import.meta.url), encoding: "utf8", env: {} });
  assert.equal(result.status, 2);
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, /upstash\.io|bearer|token=/i);
});

test("production Redis accounting is atomic, bounded, and preserves started reservations", () => {
  const source = read("app/lib/ai/usage-guard/daily-usage-store.ts");
  assert.match(source, /redis\.call\('INCR'/);
  assert.match(source, /redis\.call\('INCRBY'/);
  assert.match(source, /state'\) ~= 'reserved'/);
  assert.match(source, /retry: \{ retries: 0 \}/);
  assert.match(source, /AbortSignal\.timeout/);
  assert.match(source, /furvise:ai:v1/);
});

test("safe error responses and logs do not expose prompts, Redis keys, user IDs, or provider internals", () => {
  const errors = read("app/lib/ai/usage-guard/errors.ts");
  const logging = read("app/lib/ai/usage-guard/logging.ts");
  assert.match(errors, /AI_TEMPORARILY_UNAVAILABLE/);
  assert.match(errors, /AI_DAILY_CAP_REACHED/);
  assert.match(errors, /AI_FEATURE_UNAVAILABLE/);
  assert.match(errors, /PRIVATE_CACHE_HEADERS/);
  assert.doesNotMatch(logging, /prompt|response|rawUser|redisToken|redisUrl/i);
});
