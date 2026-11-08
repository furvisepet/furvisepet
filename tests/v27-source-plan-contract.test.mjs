import test from "node:test";
import {directFixturePlan} from "./helpers/recursive-wire-fixture.mjs";
import assert from "node:assert/strict";
import {prepareAskInterpretationRequest,recoverAskInterpretation,interpretAskQuestion} from "../app/lib/intelligence/interpret-ask.ts";
import {askRequestSchema,askRequestProviderSchema} from "../app/lib/intelligence/ask-request-contract.ts";
import {proposedSemanticFrameJsonSchema} from "../app/lib/intelligence/semantic-frame/schema.ts";
import {makeValidator,expand} from "../app/lib/intelligence/ask-wire-codec.mjs";
import {admitAiOperation} from "../app/lib/ai/usage-guard/admission.ts";
import {MemoryAiGuardTestStore} from "../app/lib/ai/usage-guard/memory-test-store.ts";
const pet={id:"owned-subject",user_id:"owner",name:"Sample",species:"dog"};
function context(text="Quote the original entry about the maintenance event on March 10, 2024."){
 return {owner:{userId:"owner"},pet,eligiblePets:[pet],currentMessage:text,currentTurn:{id:"user-turn",role:"user",text},conversationTurns:[],timeZone:"America/New_York",conversationId:"fixture-conversation"};
}
function request(extra={}){
 return {calculatePlan:null,storedRead:null,removeJob:null,stateTransitionJob:null,fieldMutationJob:null,lifecyclePlan:null,appendJob:null,readTicket:null,writeJob:null,task:null,temporalScope:null,mutationIntent:null,recordSelection:null,profileFields:[],projection:null,version:"ask-request.v2",mode:"read",question:"Quote the original entry about the maintenance event on March 10, 2024.",requirements:[],evidenceNeeds:[],outputFormat:null,evidenceBasis:"saved_history",premiseQuotes:[],excludedPetNames:[],referenceTurnIds:[],scope:"selected",petNames:[],operation:"recall",selection:"summary",quantity:"records",topic:"history",terms:[],from:null,to:null,episodeTopic:null,ordinal:null,frame:null,draftAnswer:null,...extra};
}
function ticket(extra={}){
 return {authority:"stored_report",operation:"read",subjectScope:"selected",
 temporal:{from:"2024-03-10T00:00:00-05:00",to:"2024-03-11T00:00:00-04:00",anchor:null,calendar:null},
 predicates:[{kind:"text_any",terms:["maintenance"]}],outputs:{strategy:null,completeness:"sufficient",ordering:"asc",limit:null},
 searchHints:null,episode:null,selection:null,probes:[],...extra};
}
function prepared(c=context()){const p=prepareAskInterpretationRequest(c,"gpt-5.4-mini");const schema=expand(p.request.text.format.schema);return {...p,schema,valid:makeValidator(schema)};}
test("individually legal stored and history fields cannot form a cross-domain provider proposal",()=>{
 const c=context(),p=prepared(c),plan=request({readTicket:ticket()});
 const stored={operation:"read",domain:"memory",scope:"subjects",reference:null,projection:"records"};
 const generic=askRequestSchema(proposedSemanticFrameJsonSchema,c),canonical=askRequestProviderSchema(proposedSemanticFrameJsonSchema,c);
 const genericValid=makeValidator(generic),canonicalValid=makeValidator(canonical);
 assert.equal(genericValid(generic.properties.storedRead,stored),true);
 assert.equal(canonicalValid(canonical,{request:{...plan,storedRead:stored}}),false);
 const wire=p.transport.encode({request:plan},()=>{});
 assert.equal(p.valid(p.schema,wire),true);
 const malformed=structuredClone(wire);malformed.request.evidenceContext.storedRead=stored;
 assert.equal(p.valid(p.schema,malformed),false);
 assert.throws(()=>p.transport.decode(malformed,()=>{}),/ASK_WIRE_CANONICAL_SCHEMA/);
 assert.deepEqual(p.transport.decode(wire,()=>{}).request,plan);
});
test("dated stored-report and effective event-relative reads retain their exact independent authority",()=>{
 const c=context(),p=prepared(c);
 for(const readTicket of [ticket(),ticket({authority:"effective_fact",operation:"read_since_event",
  temporal:{from:null,to:null,calendar:null,anchor:{concept:"appointment",relation:"after"}}})]){
  const plan=request({readTicket}),wire=p.transport.encode({request:plan},()=>{});
  assert.equal(p.valid(p.schema,wire),true);
  const restored=p.transport.decode(wire,()=>{}).request;
  assert.deepEqual(restored,plan);
  const bound=recoverAskInterpretation(restored,c);
  assert.equal(bound.request.readTicket.authority,readTicket.authority);
  assert.deepEqual(bound.request.readTicket.temporal,readTicket.temporal);
  assert.deepEqual(bound.request.readTicket.subjects.petIds,[pet.id]);
  assert.equal(bound.request.writeJob,null);
 }
});
test("stored Memory and saved-profile branches stay distinct and have no history ticket",()=>{
 const c=context("Show saved memory records.");
 for(const plan of [
  request({question:c.currentMessage,evidenceBasis:"stored",quantity:null,storedRead:{operation:"read",domain:"memory",scope:"subjects",reference:null,projection:"records"}}),
  request({question:"Which species is in the selected profile?",evidenceBasis:"saved_profile",quantity:null,profileFields:["species"]})
 ]){
  const actual=context(plan.question),p=prepared(actual);
  const wire=p.transport.encode({request:plan},()=>{});
  assert.equal(p.valid(p.schema,wire),true);
  assert.deepEqual(p.transport.decode(wire,()=>{}).request,plan);
  assert.equal(recoverAskInterpretation(plan,actual).request.readTicket??null,null);
  const bad=structuredClone(wire);bad.request.evidenceContext.readTicket=p.transport.encode({request:request({readTicket:ticket()})},()=>{}).request.evidenceContext.readTicket;
  assert.equal(p.valid(p.schema,bad),false);
 }
});
test("genuine USER quotations survive byte-for-byte and foreign references do not become authority",()=>{
 const text='In a fictional example the sign reads "Left \u2014 keep clear". Explain the wording.';
 const c=context(text),p=prepared(c),quote='the sign reads "Left \u2014 keep clear"';
 const plan=request({mode:"conversation",scope:"none",operation:"general",evidenceBasis:"supplied_context",
  question:text,quantity:null,premiseQuotes:[quote],draftAnswer:"The fictional sign gives a direction and asks people to leave space."});
 const wire=p.transport.encode({request:plan},()=>{});
 assert.equal(p.valid(p.schema,wire),true);
 assert.deepEqual(p.transport.decode(wire,()=>{}).request.premiseQuotes,[quote]);
 assert.equal(recoverAskInterpretation(plan,c).request.evidenceBasis,"supplied_context");
 const forbidden=structuredClone(wire);forbidden.request.evidenceContext.mode="update";
 assert.equal(p.valid(p.schema,forbidden),false);
 const memory=request({evidenceBasis:"stored",quantity:null,storedRead:{operation:"read",domain:"operation_receipt",scope:"subjects",reference:"foreign-capability",projection:"records"}});
 assert.throws(()=>p.transport.encode({request:memory},()=>{}));
 assert.throws(()=>recoverAskInterpretation(request({scope:"named",petNames:["Foreign"],readTicket:ticket()}),{...c,eligiblePets:[pet,{id:"foreign",user_id:"other-owner",name:"Foreign",species:"cat"}]}));
});
test("HTTP 500 on the one bounded repair stays a transport failure, with exactly two physical attempts",async t=>{
 t.mock.method(console,"info",()=>{});t.mock.method(console,"warn",()=>{});
 const c=context(),p=prepared(c),good=p.transport.encode({request:request({readTicket:ticket()})},()=>{}),bad=structuredClone(good);
 bad.request.evidenceContext.storedRead={operation:"read",domain:"memory",scope:"subjects",reference:null,projection:"records"};
 const store=new MemoryAiGuardTestStore();
 const env={NODE_ENV:"test",FURVISE_AI_DAILY_CALL_LIMIT:"20",FURVISE_AI_DAILY_COST_LIMIT_USD:"10",FURVISE_RATE_LIMIT_HASH_SECRET:"fixture-only-not-a-runtime-secret"};
 const admission=await admitAiOperation({env,store,feature:"ask",intendedModel:"gpt-5.4-mini",userId:"owner",requestId:"synthetic-upstream-failure",payload:{case:"source-domain-repair"},now:new Date("2039-01-01T00:00:00Z")});
 let calls=0;
 try{
  await assert.rejects(admission.run(()=>interpretAskQuestion({context:c,model:"gpt-5.4-mini",client:{responses:{create:async req=>{
   calls++;
   if(calls===1)return {status:"completed",output_text:JSON.stringify(bad),usage:{input_tokens:1,output_tokens:1}};
   assert.equal(calls,2);
   const input=JSON.parse(req.input);
   assert.equal(input.transportRepair.validationCode,"ASK_WIRE_CANONICAL_SCHEMA");
   assert.ok(input.transportRepair.fieldHints.includes("storedRead"));
   throw Object.assign(new Error("upstream unavailable"),{status:500,code:"server_error",type:"server_error",request_id:"synthetic-upstream-receipt"});
  }}}})),error=>error.diagnostics?.providerErrorCode==="ASK_INTERPRETATION_TRANSPORT");
 }finally{await admission.release();}
 assert.equal(calls,2);assert.equal(store.getSnapshot("2039-01-01").calls,2);
});

test("legacy read fixture default adds no answer and does not weaken production wire validation",()=>{
 const p=prepared(),legacy=request({readTicket:ticket()});delete legacy.draftAnswer;
 assert.throws(()=>p.transport.encode({request:legacy},()=>{}),/CANONICAL_KEYS/);
 const wire=directFixturePlan(p.transport).encode({request:legacy});
 const restored=p.transport.decode(wire,()=>{}).request;
 assert.deepEqual(restored,{...legacy,draftAnswer:null});
 assert.equal(restored.mode,"read");assert.equal(restored.evidenceBasis,"saved_history");
});
