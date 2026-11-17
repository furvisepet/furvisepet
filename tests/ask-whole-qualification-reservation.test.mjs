import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { MemoryAiGuardTestStore } from "../app/lib/ai/usage-guard/memory-test-store.ts";
import { admitAiOperation } from "../app/lib/ai/usage-guard/admission.ts";
import { estimateProviderCostMicrodollars } from "../app/lib/ai/usage-guard/cost-estimator.ts";
import { executeAdmittedResponsesRequest } from "../app/lib/ai/usage-guard/provider-call-budget.ts";
import { ASK_BUNDLE_SLOTS,ASK_BUNDLE_OUTPUT_CEILING,RESERVE_WHOLE_ASK_LUA } from "../app/lib/ai/usage-guard/whole-ask-reservation.ts";
const model="gpt-5.4-mini";
const env={
 NODE_ENV:"test",VERCEL_ENV:"preview",VERCEL_GIT_COMMIT_REF:"release/journal-first-20261116",
 FURVISE_AI_ENABLED:"true",FURVISE_AI_ASK_ENABLED:"true",FURVISE_AI_WHOLE_ASK_RESERVATION_ENABLED:"true",
 FURVISE_AI_QUALIFICATION_MODE:"true",FURVISE_AI_QUALIFICATION_TOTAL_COST_LIMIT_USD:"4.00",
 FURVISE_AI_DAILY_CALL_LIMIT:"6",FURVISE_AI_DAILY_COST_LIMIT_USD:"2.25",
 FURVISE_RATE_LIMIT_HASH_SECRET:"test-only-identity-hash-secret-for-whole-ask-stage3-123",
};
const mk=(store,id=randomUUID(),e=env)=>admitAiOperation({
 feature:"ask",userId:"synthetic-test-user",requestId:id,payload:{question:"Synthetic pet history"},
 intendedModel:model,env:e,store,
});
test("entire six-call allowance fits inside the original $4 lifetime sandbox and daily dollar cap",async()=>{
 const store=new MemoryAiGuardTestStore();store.seedQualificationLedger(33_098);
 const a=await mk(store);assert.equal(a.wholeAskPrepaid,true);
 const now=store.getSnapshot(new Date().toISOString().slice(0,10));
 assert.equal(now.calls,ASK_BUNDLE_SLOTS);
 assert.ok(now.costMicrodollars>0 && now.costMicrodollars<2_250_000);
 assert.equal(store.getQualificationTotal(),now.costMicrodollars+33_098);
 await a.release();
 assert.equal(store.getQualificationTotal(),33_098);
 assert.equal(store.getSnapshot(new Date().toISOString().slice(0,10)).calls,0);
});
test("three-call preview test cap rejects whole Ask before the first paid call",async()=>{
 const store=new MemoryAiGuardTestStore();store.seedQualificationLedger(33_098);
 await assert.rejects(mk(store,randomUUID(),{...env,FURVISE_AI_DAILY_CALL_LIMIT:"3"}),
  error=>error.code==="AI_DAILY_CAP_REACHED" || error.reason==="daily_call_limit");
 assert.equal(store.getQualificationTotal(),33_098);
});
test("parallel six-call admissions do not overcommit the same day or lifetime ledger",async()=>{
 const store=new MemoryAiGuardTestStore();store.seedQualificationLedger(33_098);
 const attempts=await Promise.allSettled(Array.from({length:20},()=>mk(store)));
 assert.equal(attempts.filter(x=>x.status==="fulfilled").length,1);
 const a=attempts.find(x=>x.status==="fulfilled").value;
 assert.equal(store.getSnapshot(new Date().toISOString().slice(0,10)).calls,6);
 await a.release();assert.equal(store.getQualificationTotal(),33_098);
});
test("completed provider usage is charged and unstarted stages are released, never started uncertain calls",async()=>{
 const store=new MemoryAiGuardTestStore();store.seedQualificationLedger(33_098);
 const a=await mk(store);
 const first=await a.beginProviderCall({input:{question:"synthetic"},model,stage:"interpretation",maxOutputTokens:1024});
 const actual=estimateProviderCostMicrodollars(model,{inputTokens:1000,outputTokens:100});
 await a.recordProviderUsage(first.reservation,model,{inputTokens:1000,outputTokens:100});
 await a.complete();
 assert.equal(store.getQualificationTotal(),33_098+actual);
 assert.equal(store.getSnapshot(new Date().toISOString().slice(0,10)).calls,1);
});
test("uncertain started call retains its reserved worst case, even after operation failure",async()=>{
 const store=new MemoryAiGuardTestStore();store.seedQualificationLedger();
 const a=await mk(store);
 await a.beginProviderCall({input:{question:"synthetic"},model,stage:"interpretation",maxOutputTokens:1024});
 await a.fail(Error("timeout after provider start"));
 assert.equal(store.getSnapshot(new Date().toISOString().slice(0,10)).calls,1);
 assert.ok(store.getQualificationTotal()>0);
});
test("duplicate request identity cannot reserve another paid bundle",async()=>{
 const store=new MemoryAiGuardTestStore();store.seedQualificationLedger(33_098);
 const id=randomUUID();const first=await mk(store,id);
 await assert.rejects(mk(store,id),error=>error.reason==="whole_ask_duplicate_operation");
 await first.release();
 assert.equal(store.getQualificationTotal(),33_098);
});
test("emergency stop rejects whole-question admission without reserving anything",async()=>{
 const store=new MemoryAiGuardTestStore();store.seedQualificationLedger(33_098);
 store.setEmergency(true,"admin_test_stop");
 await assert.rejects(mk(store),error=>error.reason==="emergency_disabled");
 assert.equal(store.getQualificationTotal(),33_098);
});
test("provider SDK receives the same bounded request that prepayment funded",async()=>{
 const store=new MemoryAiGuardTestStore();store.seedQualificationLedger();
 const a=await mk(store);
 let observed;
 await a.run(async()=>executeAdmittedResponsesRequest({
  model,maxOutputTokens:100000,stage:"interpretation",
  request:{model,max_output_tokens:100000,input:"synthetic pet history"},
  invoke:async request=>{
   observed=request;
   return {status:"completed",output_text:"{}",usage:{input_tokens:1000,output_tokens:100}};
  },
 }));
 assert.equal(observed.max_output_tokens,ASK_BUNDLE_OUTPUT_CEILING);
 await a.complete();
});
test("preview-only mode cannot be inherited by production, and a missing ledger fails closed",async()=>{
 const store=new MemoryAiGuardTestStore();
 await assert.rejects(mk(store));
 const fromProd=await import("../app/lib/ai/usage-guard/config.ts");
 assert.equal(fromProd.getAiGuardConfig({...env,VERCEL_ENV:"production"},true).wholeAskQualification,false);
 assert.equal(fromProd.getAiGuardConfig({...env,FURVISE_AI_WHOLE_ASK_RESERVATION_ENABLED:"false"},true).wholeAskQualification,false);
});
test("Redis admission verifies every slot, ledger, emergency stop, and never expires lifetime key",()=>{
 assert.match(RESERVE_WHOLE_ASK_LUA,/for i=7,#KEYS-1 do/);
 assert.match(RESERVE_WHOLE_ASK_LUA,/lifetime \+ amount >/);
 assert.match(RESERVE_WHOLE_ASK_LUA,/calls \+ count >/);
 assert.match(RESERVE_WHOLE_ASK_LUA,/spent \+ amount >/);
 assert.match(RESERVE_WHOLE_ASK_LUA,/data\.disabled == true/);
 assert.doesNotMatch(RESERVE_WHOLE_ASK_LUA,/EXPIRE.*,? KEYS\[5\]/);
 const admission=readFileSync(new URL("../app/lib/ai/usage-guard/admission.ts",import.meta.url),"utf8");
 assert.match(admission,/reserveWholeAsk/);
});
