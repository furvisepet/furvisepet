import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { MemoryAiGuardTestStore } from "../app/lib/ai/usage-guard/memory-test-store.ts";
import { admitAiOperation } from "../app/lib/ai/usage-guard/admission.ts";
import { getAiGuardConfig } from "../app/lib/ai/usage-guard/config.ts";
import { RESERVE_WHOLE_ASK_LUA } from "../app/lib/ai/usage-guard/whole-ask-reservation.ts";
const env = {
 NODE_ENV: "test", VERCEL_ENV:"preview", VERCEL_GIT_COMMIT_REF:"release/journal-first-20261116",
 FURVISE_AI_ENABLED:"true", FURVISE_AI_ASK_ENABLED:"true", FURVISE_AI_WHOLE_ASK_RESERVATION_ENABLED:"true",
 FURVISE_AI_LAUNCH_PROTECTION_ENABLED:"true", FURVISE_AI_FUNDED_CEILING_USD:"20.00",
 FURVISE_AI_QUALIFICATION_MODE:"true", FURVISE_AI_QUALIFICATION_TOTAL_COST_LIMIT_USD:"4.00",
 FURVISE_AI_DAILY_CALL_LIMIT:"1", FURVISE_AI_DAILY_COST_LIMIT_USD:"0.01",
 FURVISE_RATE_LIMIT_HASH_SECRET:"local-only-test-secret-for-ai-launch-protection-111111",
};
const mk = (store,id=randomUUID(),e=env)=>admitAiOperation({
 feature:"ask",userId:"synthetic-user-"+id,requestId:id,payload:{question:"Synthetic pet journal question"},
 intendedModel:"gpt-5.4-mini",env:e,store,
});
test("launch protection ignores tiny shared daily quotas while preserving day counters",async()=>{
 const store=new MemoryAiGuardTestStore();store.seedFundedLedger(41880);
 const a=await mk(store);
 const day=new Date().toISOString().slice(0,10);
 assert.equal(store.getSnapshot(day).calls,6);
 assert.ok(store.getSnapshot(day).costMicrodollars>10000);
 assert.equal(store.getQualificationTotal(),null,"historic qualification ledger never touched");
 await a.release();
 assert.equal(store.getFundedTotal(),41880);
 assert.equal(store.getSnapshot(day).calls,0);
});
test("parallel distinct users use atomic funded ceiling, not an arbitrary global call limit",async()=>{
 const store=new MemoryAiGuardTestStore();store.seedFundedLedger(41880);
 const attempts=await Promise.allSettled(Array.from({length:32},()=>mk(store)));
 const admitted=attempts.filter(x=>x.status==="fulfilled").map(x=>x.value);
 assert.ok(admitted.length>=2,"legitimate independent requests should not stop after one global slot");
 assert.ok(admitted.length<32,"finite money must halt further charges");
 assert.ok(attempts.some(x=>x.status==="rejected"&&x.reason.reason==="funded_ceiling_reached"));
 assert.ok(store.getFundedTotal()<=20_000_000);
 await Promise.all(admitted.map(a=>a.release()));
 assert.equal(store.getFundedTotal(),41880);
});
test("funded settlement charges actual Mini tokens; unused stages release, started uncertain charges persist",async()=>{
 const store=new MemoryAiGuardTestStore();store.seedFundedLedger(41880);
 const a=await mk(store);
 const x=await a.beginProviderCall({input:{question:"synthetic"},model:"gpt-5.4-mini",stage:"interpretation",maxOutputTokens:1024});
 await a.recordProviderUsage(x.reservation,"gpt-5.4-mini",{inputTokens:2000,outputTokens:400});
 await a.complete();
 assert.ok(store.getFundedTotal()>41880&&store.getFundedTotal()<100000);
 const beforeSecond=store.getFundedTotal();
 const b=await mk(store);
 const started=await b.beginProviderCall({input:{question:"synthetic"},model:"gpt-5.4-mini",stage:"interpretation",maxOutputTokens:1024});
 await b.fail(new Error("provider timeout after start"));
 assert.equal(store.getFundedTotal(),beforeSecond+started.reservation.reservedCostMicrodollars,
   "uncertain started call remains charged; five unstarted slots return to funded pool");
});
test("funding loss or operator stop fails closed; production requires explicit separate launch approval",async()=>{
 const store=new MemoryAiGuardTestStore();
 await assert.rejects(mk(store),e=>e.reason==="funded_ceiling_reached");
 store.seedFundedLedger(41880);store.setEmergency(true,"operator_stop");
 await assert.rejects(mk(store),e=>e.reason==="emergency_disabled");
 const c=getAiGuardConfig({...env,VERCEL_ENV:"production",NODE_ENV:"production"},true);
 assert.equal(c.enabled,false);
 assert.equal(c.configured,false);
 const approved=getAiGuardConfig({...env,VERCEL_ENV:"production",NODE_ENV:"production",FURVISE_AI_PRODUCTION_LAUNCH_APPROVED:"true"},true);
 assert.equal(approved.wholeAskQualification,true);
});
test("funded Redis Lua preserves historical qualification ledger and only meters global daily call totals",()=>{
 assert.match(RESERVE_WHOLE_ASK_LUA,/local funded = fundedLimit > 0/);
 assert.match(RESERVE_WHOLE_ASK_LUA,/if not funded then/);
 assert.match(RESERVE_WHOLE_ASK_LUA,/redis.call\('INCRBY', ledgerKey, amount\)/);
 assert.match(RESERVE_WHOLE_ASK_LUA,/ledgerKey = funded and KEYS\[#KEYS\] or KEYS\[5\]/);
 assert.doesNotMatch(RESERVE_WHOLE_ASK_LUA,/EXPIRE[^\n]*ledgerKey/);
});
