import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MemoryAiGuardTestStore } from "../app/lib/ai/usage-guard/memory-test-store.ts";
import { requireApprovedAiModel } from "../app/lib/ai/model-policy.ts";

const base = {
  callLimit: 100, costLimitMicrodollars: 10_000_000,
  day: "2026-11-17", feature: "ask", maximumOperationCalls: 6,
  operationCallTtlSeconds: 100_000, operationId: "op",
  reservedCostMicrodollars: 200_000, ttlSeconds: 100_000,
  qualificationLimitMicrodollars: 1_000_000,
};
const request = (id, overrides={}) => ({...base, callId: id, operationId: id.split(":")[0], ...overrides});
const source = path => readFileSync(new URL("../"+path, import.meta.url), "utf8");

test("a missing lifetime ledger fails closed even though daily budget is available", async () => {
  const store = new MemoryAiGuardTestStore();
  const result = await store.reserveCall(request("missing:1"));
  assert.equal(result.allowed,false);
  assert.equal(result.reason,"qualification_total_limit");
});
test("parallel independent requests atomically share a strict lifetime ceiling", async () => {
  const store = new MemoryAiGuardTestStore();
  store.seedQualificationLedger();
  const results = await Promise.all(Array.from({length:30},(_,i)=>store.reserveCall(request("op"+i+":1"))));
  assert.equal(results.filter(x=>x.allowed).length,5);
  assert.equal(results.filter(x=>!x.allowed && x.reason==="qualification_total_limit").length,25);
  assert.equal(store.getQualificationTotal(),1_000_000);
});
test("multi-day requests, interpretation, answer, repairs and reviews share the same lifetime pool", async () => {
  const store = new MemoryAiGuardTestStore();store.seedQualificationLedger();
  for (const [i,day] of ["2026-11-17","2026-11-17","2026-11-18","2026-11-19","2026-11-20"].entries()) {
    assert.equal((await store.reserveCall(request("journey:"+i,{day,operationId:"journey"}))).allowed,true);
  }
  assert.equal((await store.reserveCall(request("journey:6",{day:"2026-11-22",operationId:"journey"}))).allowed,false);
  assert.equal(store.getQualificationTotal(),1_000_000);
});
test("started but uncertain calls are never released, including after timeouts", async () => {
  const store=new MemoryAiGuardTestStore();store.seedQualificationLedger();
  await store.reserveCall(request("started:1"));
  await store.markCallStarted({callId:"started:1"});
  await store.releaseUnstartedCall({callId:"started:1"});
  assert.equal(store.getQualificationTotal(),200_000);
});
test("only definitely unstarted calls refund the lifetime and daily counters", async () => {
  const store=new MemoryAiGuardTestStore();store.seedQualificationLedger();
  await store.reserveCall(request("unstarted:1"));
  await store.releaseUnstartedCall({callId:"unstarted:1"});
  assert.equal(store.getQualificationTotal(),0);
  assert.equal(store.getSnapshot(base.day).calls,0);
});
test("delayed reconciliation reduces reserved spend and is idempotent in Redis script", async () => {
  const store=new MemoryAiGuardTestStore();store.seedQualificationLedger();
  await store.reserveCall(request("late:1"));
  await store.markCallStarted({callId:"late:1"});
  await store.reserveCall(request("other:1",{day:"2026-11-18"}));
  await store.reconcileCall({callId:"late:1",actualCostMicrodollars:75_000});
  assert.equal(store.getQualificationTotal(),275_000);
  const code=source("app/lib/ai/usage-guard/daily-usage-store.ts");
  assert.match(code,/if state == 'completed' then return/);
  assert.match(code,/redis.call\('INCRBY', KEYS\[4\], actual - reserved\)/);
});
test("idempotent reservation and reconciliation never charge twice", async () => {
  const store=new MemoryAiGuardTestStore();store.seedQualificationLedger();
  const a=await store.reserveCall(request("repeat:1"));
  const b=await store.reserveCall(request("repeat:1"));
  assert.equal(a.allowed,true);assert.equal(b.allowed,true);assert.equal(b.reused,true);
  assert.equal(store.getQualificationTotal(),200_000);
  await store.markCallStarted({callId:"repeat:1"});
  await store.reconcileCall({callId:"repeat:1",actualCostMicrodollars:100_000});
  await store.reconcileCall({callId:"repeat:1",actualCostMicrodollars:120_000});
  assert.equal(store.getQualificationTotal(),100_000);
});
test("preview guard is limited to the reviewed release branch", () => {
  const c=source("app/lib/ai/usage-guard/config.ts");
  assert.match(c,/env.VERCEL_GIT_COMMIT_REF === "release\/journal-first-20261116"/);
  assert.match(c,/env.FURVISE_AI_QUALIFICATION_MODE === "true"/);
});
test("actual charge above reserved amount persists actual usage and disables further calls", async () => {
  const store=new MemoryAiGuardTestStore();store.seedQualificationLedger();
  await store.reserveCall(request("overshoot:1"));
  await store.markCallStarted({callId:"overshoot:1"});
  await assert.rejects(store.reconcileCall({callId:"overshoot:1",actualCostMicrodollars:250_000}));
  assert.equal(store.getQualificationTotal(),250_000);
  assert.equal((await store.emergencyStatus()).disabled,true);
});
test("disappearing persistent counter fails closed instead of resetting to zero", async () => {
  const store=new MemoryAiGuardTestStore();store.seedQualificationLedger();
  await store.reserveCall(request("before:1"));
  store.simulateQualificationLedgerLoss();
  assert.equal((await store.reserveCall(request("after:1"))).allowed,false);
});
test("preview requires explicitly bounded aggregate cap before AI admission", () => {
  const config=source("app/lib/ai/usage-guard/config.ts");
  const admission=source("app/lib/ai/usage-guard/admission.ts");
  assert.match(config,/env.VERCEL_ENV === "preview"/);
  assert.match(config,/requestedQualificationLimit <= 5_000_000/);
  assert.match(admission,/qualification_total_budget_unconfigured/);
});
test("full-sized and unreviewed models cannot be dispatched", () => {
  requireApprovedAiModel("gpt-5.4-mini");
  for (const model of ["gpt-5.4","gpt-5.4-terra","gpt-5.4-mini-snapshot","gpt-5.5",""]) {
    assert.throws(()=>requireApprovedAiModel(model));
  }
});
test("Redis Lua uses single atomic reservation, no expiry on lifetime key, and safe release/settlement", () => {
  const code=source("app/lib/ai/usage-guard/daily-usage-store.ts");
  assert.match(code,/qualification:v1-mini-20261117:reserved_total/);
  assert.match(code,/if redis.call\('EXISTS', KEYS\[6\]\) ~= 1/);
  assert.match(code,/redis.call\('INCRBY', KEYS\[6\], ARGV\[3\]\)/);
  assert.match(code,/redis.call\('DECRBY', KEYS\[6\], cost\)/);
  assert.match(code,/redis.call\('INCRBY', KEYS\[4\], actual - reserved\)/);
  assert.doesNotMatch(code,/redis.call\('EXPIRE', KEYS\[6\]/);
  assert.match(code,/qualification_cost_underreserved/);
  assert.match(code,/qualification_ledger_missing/);
});
test("provider admission reserves worst-case feature ceilings for all routed phases", () => {
  const admission=source("app/lib/ai/usage-guard/admission.ts");
  const executor=source("app/lib/ai/usage-guard/provider-call-budget.ts");
  assert.match(admission,/maxInputCharacters \* 4 \+ 2_048/);
  assert.match(admission,/this.policy.maxOutputTokens/);
  assert.match(admission,/qualificationLimitMicrodollars: this.config.qualificationLimitMicrodollars/);
  assert.match(executor,/requireApprovedAiModel\(input.model\)/);
  assert.match(executor,/admission.beginProviderCall/);
});
