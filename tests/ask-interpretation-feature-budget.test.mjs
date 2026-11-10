import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {prepareAskInterpretationRequest,ASK_INTERPRETATION_LIMITS} from "../app/lib/intelligence/interpret-ask.ts";
import {AI_FEATURE_POLICIES} from "../app/lib/ai/usage-guard/features.ts";
import {admitAiOperation} from "../app/lib/ai/usage-guard/admission.ts";
import {estimateInputTokens} from "../app/lib/ai/usage-guard/cost-estimator.ts";
import {featureOutputLimit} from "../app/lib/ai/usage-guard/provider-call-budget.ts";
import {buildAskProviderRequest} from "../app/lib/ai/ask-reasoning.ts";
import {MemoryAiGuardTestStore} from "../app/lib/ai/usage-guard/memory-test-store.ts";
const context=JSON.parse(readFileSync(new URL("./fixtures/ask-wire-codec.json",import.meta.url),"utf8")).contexts.no_numeric;
const model="gpt-5.4-mini",day="2039-03-17";
const env={NODE_ENV:"test",FURVISE_AI_DAILY_CALL_LIMIT:"20",FURVISE_AI_DAILY_COST_LIMIT_USD:"10",FURVISE_RATE_LIMIT_HASH_SECRET:"offline-feature-budget-only".repeat(3)};
async function admitted(feature,fn){
 const store=new MemoryAiGuardTestStore();
 const a=await admitAiOperation({env,store,feature,intendedModel:model,userId:context.owner.userId,
  requestId:crypto.randomUUID(),payload:{fixture:"feature-budget"},now:new Date(day+"T12:00:00Z")});
 try{return await a.run(()=>fn(a,store));}finally{await a.release();}
}
test("unadmitted preparation defaults to the read-only Ask ceiling, without changing the legacy upper bound",()=>{
 assert.equal(AI_FEATURE_POLICIES.ask.maxOutputTokens,2400);
 assert.equal(AI_FEATURE_POLICIES.ask.maximumProviderCalls,2);
 assert.equal(ASK_INTERPRETATION_LIMITS.outputTokens,8192);
 assert.equal(prepareAskInterpretationRequest(context,model).request.max_output_tokens,2400);
});
for(const [feature,expected] of [["ask",2400],["product_explanation",360],["vet_brief",8192]]){
 test(feature==="product_explanation"?"a retained Ask schema cannot borrow a smaller product input budget":"request and real admission agree on the output ceiling for "+feature,async t=>{
  t.mock.method(console,"info",()=>{});
  const checkedStore=await admitted(feature,async(a,store)=>{
   const {request}=prepareAskInterpretationRequest(context,model);
   assert.equal(request.max_output_tokens,expected);
   assert.equal(buildAskProviderRequest({currentMessage:"Explain a shadow."}).max_output_tokens,expected);
   assert.ok(request.max_output_tokens<=AI_FEATURE_POLICIES[feature].maxOutputTokens);
   // A product feature has a smaller input allowance too: the guard must retain it.
   if(feature==="product_explanation"){
    const policy=AI_FEATURE_POLICIES[feature];
    assert.ok(JSON.stringify(request).length>policy.maxInputCharacters||estimateInputTokens(request)>policy.maxInputTokens);
    await assert.rejects(a.beginProviderCall({model,input:request,maxOutputTokens:request.max_output_tokens}),
     e=>e.reason==="feature_token_budget_exceeded");
    return store;
   }
   // Use the complete provider input, including its schema, in the real admission guard.
   const call=await a.beginProviderCall({model,input:request,maxOutputTokens:request.max_output_tokens});
   await a.recordProviderUsage(call.reservation,model,{inputTokens:1,outputTokens:1,cachedInputTokens:0});
   assert.equal(store.getSnapshot(day).calls,1);
   assert.ok(store.getSnapshot(day).costMicrodollars>0);return store;
  });
  if(feature==="product_explanation")assert.deepEqual(checkedStore.getSnapshot(day),{calls:0,costMicrodollars:0});
 });
 test("the independent guard still rejects an oversized request for "+feature,async t=>{
  t.mock.method(console,"info",()=>{});
  let store;
  await admitted(feature,async(a,s)=>{
   store=s;
   await assert.rejects(a.beginProviderCall({model,input:{question:"offline"},maxOutputTokens:AI_FEATURE_POLICIES[feature].maxOutputTokens+1}),
    e=>e.reason==="feature_token_budget_exceeded");
  });
  assert.deepEqual(store.getSnapshot(day),{calls:0,costMicrodollars:0});
 });
}

test("producer budget selection fails closed for malformed configured maxima",()=>{
 for(const maximum of [0,-1,1.5,NaN,Infinity])assert.throws(()=>featureOutputLimit(maximum),
  error=>error.reason==="provider_request_contract_mismatch");
});
