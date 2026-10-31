import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync,writeFileSync,existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { createAskWirePlan } from "../app/lib/intelligence/ask-wire-policy.mjs";
import { createAskProviderWireSchema } from "../app/lib/intelligence/ask-wire-provider-schema.ts";
registerHooks({resolve(s,c,next){
 if(s==="server-only")return {url:"data:text/javascript,export {}",shortCircuit:true};
 if(s.startsWith(".") && c.parentURL?.startsWith("file:")) {
  for(const suffix of [".ts", "/index.ts"]) {
   const url=new URL(s+suffix,c.parentURL);
   if(existsSync(url))return next(url.href,c);
  }
 }
 return next(s,c);
}});
globalThis.fetch=async()=>{throw Error("OFFLINE_WIRE_INTEGRATION");};
const {ASK_REQUEST_INSTRUCTIONS,askRequestProviderSchema}=await import("../app/lib/intelligence/ask-request-contract.ts");
const {proposedSemanticFrameJsonSchema}=await import("../app/lib/intelligence/semantic-frame/schema.ts");
const {interpretAskQuestion,recoverAskInterpretation,projectAskInterpretationContext,prepareAskInterpretationRequest}=await import("../app/lib/intelligence/interpret-ask.ts");
const {admitAiOperation}=await import("../app/lib/ai/usage-guard/admission.ts");
const {MemoryAiGuardTestStore}=await import("../app/lib/ai/usage-guard/memory-test-store.ts");
const {AI_FEATURE_POLICIES}=await import("../app/lib/ai/usage-guard/features.ts");
const {factorProviderEnumSchemas}=await import("../app/lib/ai/provider-enum-schema.ts");
const {factorProviderCompoundSchemas}=await import("../app/lib/ai/provider-compound-schema.ts");
const projectedSchema=context=>factorProviderCompoundSchemas(factorProviderEnumSchemas(askRequestProviderSchema(proposedSemanticFrameJsonSchema,projectAskInterpretationContext(context))));
const corpus=JSON.parse(readFileSync(new URL("./fixtures/ask-wire-codec.json",import.meta.url),"utf8"));
const env={NODE_ENV:"test",FURVISE_AI_DAILY_CALL_LIMIT:"20",FURVISE_AI_DAILY_COST_LIMIT_USD:"1",FURVISE_RATE_LIMIT_HASH_SECRET:"offline-wire-identity-fixture-only-0000000000"};
async function admitted(name,context,wire,observe){
 const a=await admitAiOperation({env,store:new MemoryAiGuardTestStore(),feature:"ask",intendedModel:"gpt-5.4-mini",
  now:new Date("2039-03-17T12:00:00Z"),requestId:name,userId:context.owner.userId,payload:{fixture:name}});
 let snapshot,calls=0;const begin=a.beginProviderCall.bind(a);
 a.beginProviderCall=async x=>{snapshot=JSON.stringify(x.input);return begin(x);};
 try{
  const result=await a.run(()=>interpretAskQuestion({context,model:"gpt-5.4-mini",client:{responses:{create:async request=>{
   calls++;assert.equal(JSON.stringify(request),snapshot);observe?.(request);
   return {status:"completed",output_text:JSON.stringify(wire),usage:{input_tokens:0,output_tokens:0}};
  }}}}));
  assert.equal(calls,1);return result;
 }finally{await a.release();}
}
test("actual interpretation admits complete wire snapshots and gives Binder the same canonical plan",async t=>{
 t.mock.method(console,"info",()=>{});t.mock.method(console,"warn",()=>{});
 const legacy=process.env.NODE_TEST_CONTEXT;delete process.env.NODE_TEST_CONTEXT;
 const rows=[];
 try{
  assert.equal(AI_FEATURE_POLICIES.ask.maxInputTokens,45000);
  assert.equal(AI_FEATURE_POLICIES.ask.maxInputCharacters,135000);
  assert.equal(AI_FEATURE_POLICIES.ask.maxOutputTokens,100000);
  for(const [name,context] of Object.entries(corpus.contexts)){
   const prepared=prepareAskInterpretationRequest(context,"gpt-5.4-mini"),plan=prepared.transport;
   let chosen,expected;
   for(const f of corpus.fixtures.filter(f=>f.context===name)){
    try{const r=recoverAskInterpretation(f.canonical.request,prepared.context);if(r.planningRecovery)continue;chosen=f;expected={...r,...(prepared.context.planningSourceWindow.omittedPriorUserTurns?{sourceWindow:prepared.context.planningSourceWindow}:{})};break;}catch{ /* Try the next schema-valid Binder witness. */ }
   }
   assert.ok(chosen,"positive Binder fixture missing: "+name);
   const actual=await admitted(name,context,plan.encode(chosen.canonical,()=>{}),request=>{
    const total=JSON.stringify(request).length;
    assert.equal(JSON.stringify(request.text.format.schema),JSON.stringify(plan.schema));
    rows.push({name,schema:JSON.stringify(request.text.format.schema).length,instructions:request.instructions.length,input:request.input.length,total,margin:135000-total});
    console.log(JSON.stringify({kind:"request_size",...rows.at(-1)}));
    if(process.env.FURVISE_WIRE_REPORT)writeFileSync(process.env.FURVISE_WIRE_REPORT,JSON.stringify({status:"in_progress",rows},null,2));
    assert.ok(total<=135000,name+": "+total);
   });
   assert.deepEqual(actual,expected);
   await assert.rejects(admitted("unknown-"+name,context,{nodes:[{_:"UNKNOWN_TAG"}]}),e=>e.diagnostics?.providerErrorCode==="ASK_INTERPRETATION_JSON");
   await assert.rejects(admitted("canonical-"+name,context,chosen.canonical),e=>e.diagnostics?.providerErrorCode==="ASK_INTERPRETATION_JSON");
  }
  if(process.env.FURVISE_WIRE_REPORT)writeFileSync(process.env.FURVISE_WIRE_REPORT,JSON.stringify({status:"passed",rows,actualConstructionAndAdmission:true,binderEquality:true,productionParserExercised:true,providerCalls:0,providerCostUsd:0},null,2));
 }finally{if(legacy===undefined)delete process.env.NODE_TEST_CONTEXT;else process.env.NODE_TEST_CONTEXT=legacy;}
});

test("bounded saved_profile repair passes real admission and production wire decoding before Binder",async t=>{
 t.mock.method(console,"info",()=>{});t.mock.method(console,"warn",()=>{});
 const prior=process.env.NODE_TEST_CONTEXT;delete process.env.NODE_TEST_CONTEXT;
 let admission;
 try{
  const context=structuredClone(corpus.contexts.no_numeric);
  context.currentMessage="What name is saved for the selected pet?";
  context.currentTurn.text=context.currentMessage;
  const canonical=structuredClone(corpus.fixtures.find(f=>f.context==="no_numeric"&&f.canonical.request.evidenceBasis==="saved_profile").canonical);
  canonical.request.question=context.currentMessage;canonical.request.topic="profile";
  const invalid=structuredClone(canonical);invalid.request.scope="named";invalid.request.petNames=["Unowned subject"];
  const prepared=prepareAskInterpretationRequest(context,"gpt-5.4-mini"),plan=prepared.transport;
  const goodWire=plan.encode(canonical,()=>{}),badWire=plan.encode(invalid,()=>{});
  assert.deepEqual(plan.decode(goodWire,()=>{}),canonical);
  assert.deepEqual(plan.decode(badWire,()=>{}),invalid);
  assert.throws(()=>recoverAskInterpretation(invalid.request,context));
  const expected=recoverAskInterpretation(canonical.request,prepared.context);
  admission=await admitAiOperation({env,store:new MemoryAiGuardTestStore(),feature:"ask",intendedModel:"gpt-5.4-mini",
   now:new Date("2039-03-17T12:00:00Z"),requestId:"saved-profile-repair",userId:context.owner.userId,payload:{fixture:"saved-profile-repair"}});
  const begin=admission.beginProviderCall.bind(admission),snapshots=[],requests=[];
  admission.beginProviderCall=async value=>{snapshots.push(JSON.stringify(value.input));return begin(value);};
  const actual=await admission.run(()=>interpretAskQuestion({context,model:"gpt-5.4-mini",client:{responses:{create:async request=>{
   const index=requests.length;requests.push(request);
   assert.equal(JSON.stringify(request),snapshots[index]);
   assert.ok(JSON.stringify(request).length<=135000);
   assert.equal(JSON.stringify(request.text.format.schema),JSON.stringify(plan.schema));
   if(index===1){
    const payload=JSON.parse(request.input);
    assert.equal(payload.userSources.find(source=>source.id===payload.currentSourceId).text,context.currentMessage);
    assert.deepEqual(payload.contractRepair.rejectedProposal,invalid.request);
    assert.equal(payload.contractRepair.validationCode,"ASK_REQUEST_CONTRACT_OWNERSHIP");
   }
   assert.ok(index<2,"repair must remain bounded");
   return {status:"completed",output_text:JSON.stringify(index===0?badWire:goodWire),usage:{input_tokens:100,output_tokens:50,total_tokens:150}};
  }}}}));
  assert.equal(requests.length,2);assert.equal(snapshots.length,2);
  assert.deepEqual(actual,expected);assert.equal(actual.request.evidenceBasis,"saved_profile");
  assert.deepEqual(actual.request.profileFields,["name"]);assert.equal(Object.hasOwn(actual.request,"readTicket"),false);
  assert.deepEqual(actual.petIds,[context.pet.id]);assert.equal(actual.readOnly,true);
  if(process.env.FURVISE_WIRE_REPORT){
   const report=JSON.parse(readFileSync(process.env.FURVISE_WIRE_REPORT,"utf8"));
   report.savedProfileRepair={admitted:true,productionParser:true,binderEquality:true,mockedDispatches:2,
    requestSizes:requests.map(r=>JSON.stringify(r).length),providerCalls:0,providerCostUsd:0};
   writeFileSync(process.env.FURVISE_WIRE_REPORT,JSON.stringify(report,null,2));
  }
 }finally{
  if(admission)await admission.release();
  if(prior===undefined)delete process.env.NODE_TEST_CONTEXT;else process.env.NODE_TEST_CONTEXT=prior;
 }
});
