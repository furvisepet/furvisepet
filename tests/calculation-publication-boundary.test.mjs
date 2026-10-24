import assert from "node:assert/strict";
import test from "node:test";
import * as C from "./helpers/calculation-public-fixture.mjs";
import { ownedPlanningFixture } from "./helpers/owned-planning-context.mjs";
import { interpretAskQuestion, prepareAskInterpretationRequest } from "../app/lib/intelligence/interpret-ask.ts";
import { admitAiOperation } from "../app/lib/ai/usage-guard/admission.ts";
import { MemoryAiGuardTestStore } from "../app/lib/ai/usage-guard/memory-test-store.ts";
import { readReviewedHistoryAnswer, readHistoryReviewDiagnostic } from "../app/lib/intelligence/history-review-state.ts";
import { CALCULATION_CAPABILITY_LIMITATION } from "../app/lib/intelligence/calculation-capability.ts";
globalThis.fetch = async () => { throw Error("OFFLINE_PUBLICATION_BOUNDARY_ONLY"); };
const recordedContext = () => ({scope:{userId:"owner"}, assertCurrent(){throw Error("UNTRUSTED_SNAPSHOT_MUST_NOT_REVALIDATE");}});
function corrupt(f, mutate) {
 const response={...f.response,answer:{...f.response.answer},evidenceContract:{...f.response.evidenceContract,
  interpretation:{...f.response.evidenceContract.interpretation,request:{...f.response.evidenceContract.interpretation.request}}}};mutate(response);return response;
}
async function finalize(f, response, context) {
 return C.finalizeAskAnswer({reasoning:response,context:f.context,requestId:"controlled-boundary",
  authoritativePetIds:f.subjects.map(p=>p.id),executionPlan:C.buildGovernedAskExecutionPlan({
   sourceMessageId:"source",petId:f.subjects[0].id,careActions:[],semanticEvents:[],learnings:[]}),
  safety:C.resolveSafetyState(f.context),recordedCalculation:context});
}
async function denied(f,response,context) {
 assert.equal(await C.reviewHistoricalAnswer({result:response,recordedCalculation:context}),false);
 assert.ok(readHistoryReviewDiagnostic(response)?.reason);
 assert.equal(readReviewedHistoryAnswer(response),null);
 const validation=C.validateGeneratedAnswer(response,f.context,"normal",f.subjects.map(p=>p.id));
 assert.equal(validation.valid,false);assert.ok(validation.errors.length);
 await assert.rejects(finalize(f,response,context),e=>e.code?.startsWith("ASK_ANSWER_")&&!String(e).includes("TypeError"));
 assert.equal(readReviewedHistoryAnswer(response),null);assert.equal(f.calls(),0);
}
test("partial calculation snapshots fail at ordinary and recorded-context review/finalize without TypeError",async()=>{
 const f=await C.fixture();
 for(const labs of [{},{execution:null},{execution:{}},{execution:{authority:"recorded_contents"}},
  {execution:{authority:"effective_fact",results:[]}},[], "forged"]) {
  for(const context of [undefined,recordedContext()]) {
   const response=corrupt(f,r=>{r.calculationLabs=labs;});
   assert.ok(C.calculationPublicationFailure(response));
   if(context)assert.equal(await C.calculationPublicationFailure(response,context),"recorded_snapshot_changed");
   await denied(f,response,context);
  }
 }
});
test("absence is legal only for exact capability limitation, never a claimed calculated result",async()=>{
 const f=await C.fixture();assert.equal(f.response.answer.summary,CALCULATION_CAPABILITY_LIMITATION);
 await C.finish(f);
 for(const labs of [undefined,null]) await denied(f,corrupt(f,r=>{r.model="server-calculation-labs";r.calculationLabs=labs;}));
 assert.equal(C.calculationPublicationFailure(f.response),null);
});
test("capability limitation cannot acquire facts, evidence, actions or an evidence-only limitation",async()=>{
 const f=await C.fixture();
 for(const mutate of [
  r=>{r.answer.summary="A stored value proves a clinical fact.";},
  r=>{r.answer.summary="No measurements exist.";},
  r=>{r.relevantContextIds=["care:invented"];},
  r=>{r.applicationActions=[{kind:"save"}];},
  r=>{r.evidenceContract.answerContent=["invented evidence"];},
 ]) await denied(f,corrupt(f,mutate));
 assert.equal(f.calls(),0);
});
test("malformed plans and operands reject at original canonical request boundary",async()=>{
 const f=await C.fixture();
 for(const plan of [{}, {operation:"calculate",calculations:null},
  {operation:"calculate",calculations:[{}]},
  {operation:"calculate",calculations:[{id:"x",operator:"difference",operands:null,resultUnit:"kg",precision:null}]}]) {
  const p=C.envelope(plan,C.rawTicket());
  assert.throws(()=>C.validateAskRequest(p,f.context),/ASK_CALCULATE_INVALID|ASK_REQUEST_INVALID/);
 }
 for(const plan of [undefined,null]) {
  const response=corrupt(f,r=>{r.evidenceContract.interpretation.request.calculatePlan=plan;});
  assert.equal(C.calculationPublicationFailure(response),"calculation_contract");
  assert.equal(await C.reviewHistoricalAnswer({result:response}),false);
  assert.equal(readReviewedHistoryAnswer(response),null);
 }
 assert.equal(f.calls(),0);
});
test("foreign authoritative scope cannot authorize a capability limitation",async()=>{
 const f=await C.fixture();
 await assert.rejects(C.finalizeAskAnswer({reasoning:f.response,context:f.context,requestId:"foreign",
  authoritativePetIds:["foreign"],executionPlan:C.buildGovernedAskExecutionPlan({
   sourceMessageId:"source",petId:f.subjects[0].id,careActions:[],semanticEvents:[],learnings:[]}),
  safety:C.resolveSafetyState(f.context)}),e=>e.code==="ASK_ANSWER_CALCULATION_SCOPE");
 assert.equal(f.calls(),0);
});
function raw(c) {
 const p=C.envelope({operation:"calculate",resultSelection:null,calculations:[C.calculation()]},
  {...C.rawTicket(),authority:"effective_fact",subjectScope:"named",probes:[],episode:null,searchHints:null});
 Object.assign(p,{question:c.currentMessage,storedRead:null,removeJob:null,stateTransitionJob:null,fieldMutationJob:null,
  lifecyclePlan:null,appendJob:null,writeJob:null,task:null,temporalScope:"historical",mutationIntent:null,
  recordSelection:null,profileFields:[],projection:null,evidenceNeeds:[],outputFormat:"prose",excludedPetNames:[]});
 p.readTicket.temporal.calendar=null;
 for(const node of p.calculatePlan.calculations)for(const operand of node.operands)operand.measurementSelector=null;
 return p;
}
test("normal owned loader -> provider wire -> original decoder/Binder preserves unsupported plan and prevents fabricated result carrier",async()=>{
 const f=await C.fixture(),q="Calculate from saved observations for Subject One.";
 const c={...f.context,currentMessage:q,currentTurn:{id:"current-user",role:"user",text:q},conversationId:"owned-conversation"};
 const loaded=await ownedPlanningFixture(c),prepared=prepareAskInterpretationRequest(loaded.context,"gpt-5.4-mini");
 const p=raw(loaded.context),wire=prepared.transport.encode({request:p},()=>{});
 assert.deepEqual(prepared.transport.decode(JSON.parse(JSON.stringify(wire)),()=>{}),{request:p});
 let calls=0;const old=process.env.NODE_TEST_CONTEXT;delete process.env.NODE_TEST_CONTEXT;
 const admission=await admitAiOperation({env:{NODE_ENV:"test",FURVISE_AI_DAILY_CALL_LIMIT:"20",
  FURVISE_AI_DAILY_COST_LIMIT_USD:"10",FURVISE_RATE_LIMIT_HASH_SECRET:"offline-only-publication-boundary"},
  store:new MemoryAiGuardTestStore(),feature:"ask",intendedModel:"gpt-5.4-mini",userId:"owner",
  requestId:crypto.randomUUID(),payload:{fixture:"publication-boundary"},now:new Date("2039-01-01T00:00:00Z")});
 let result;
 try { result=await admission.run(()=>interpretAskQuestion({context:loaded.context,model:"gpt-5.4-mini",
  client:{responses:{create:async request=>{calls++;assert.deepEqual(request,prepared.request);
   return {status:"completed",output_text:JSON.stringify(wire),usage:{input_tokens:1,output_tokens:1}};}}}}));
 } finally {await admission.release();if(old===undefined)delete process.env.NODE_TEST_CONTEXT;else process.env.NODE_TEST_CONTEXT=old;}
 assert.equal(calls,1);assert.deepEqual(result.petIds,[C.pets[0].id]);
 assert.ok(result.request.calculatePlan);assert.equal(result.request.readTicket.authority,"effective_fact");
 assert.equal("calculationLabs" in result.request,false);
 const evidence={...f.evidence,interpretation:result};
 const response=await C.generateContextAwareAskResponse({...f.input,evidenceContract:evidence,question:q});
 assert.equal(response.model,"server-calculation-unavailable");assert.equal(response.calculationLabs,undefined);
 assert.equal(response.answer.summary,CALCULATION_CAPABILITY_LIMITATION);
 await finalize({...f,context:{...f.context,currentMessage:q,askInterpretation:result}},response);
 for(const mutate of [p=>{p.calculatePlan={};},p=>{p.calculatePlan.calculations[0].operands=null;},
  p=>{p.readTicket.authority="invented";},p=>{p.calculationLabs={};}]) {
  const malformed=structuredClone(p);mutate(malformed);
  assert.throws(()=>prepared.transport.encode({request:malformed},()=>{}),/ASK_OPERATION_CANONICAL_SCHEMA/);
 }
 assert.equal(f.calls(),0);
});
