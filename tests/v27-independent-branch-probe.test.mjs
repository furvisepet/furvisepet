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
test("independent outer branch projection probe",()=>{
 const plan=request({evidenceBasis:"saved_profile",quantity:null,profileFields:["species"]});
 const p=prepared(context("Which species is in the selected profile?"));
 const good=p.transport.encode({request:plan},()=>{});
 assert.equal(p.valid(p.schema,good),true);
 assert.deepEqual(p.transport.decode(good,()=>{}).request,plan);
 const aliases=new Map(Object.entries(p.transport.fieldAliases));
 const cases={quantity:"records",scope:"none",temporalScope:"historical",profileFields:[],from:"2024-03-10"};
 for(const [field,value] of Object.entries(cases)){
  const wire=structuredClone(good),key=aliases.get(field)||field;
  const target=Object.hasOwn(wire.request,key)?wire.request:wire.request.evidenceContext;
  target[key]=value;
  assert.equal(p.valid(p.schema,wire),false,field+" must be rejected by provider schema");
  assert.throws(()=>p.transport.decode(wire,()=>{}),undefined,field+" must fail closed");
 }

});

test("sparse native source branches preserve date, DST, event authority and exact source text",()=>{
 for(const readTicket of [ticket(),ticket({authority:"effective_fact",operation:"read_since_event",
 temporal:{from:null,to:null,calendar:null,anchor:{concept:"appointment",relation:"after"}}})]){
  const c=context(),p=prepared(c),canonical=request({readTicket});
  const wire=p.transport.encode({request:canonical},()=>{});
  assert.equal(p.valid(p.schema,wire),true);
  assert.deepEqual(p.transport.decode(wire,()=>{}).request,canonical);
  assert.equal(recoverAskInterpretation(canonical,c).request.readTicket.authority,readTicket.authority);
 }
});
test("unknown prototype keys cannot disappear during native field projection",()=>{
 const p=prepared(),wire=p.transport.encode({request:request({readTicket:ticket()})},()=>{});
 for(const key of ["__proto__","constructor","prototype"]){
  const bad=structuredClone(wire);
  Object.defineProperty(bad.request.evidenceContext,key,{value:{polluted:true},enumerable:true});
  assert.equal(p.valid(p.schema,bad),false);
  assert.throws(()=>p.transport.decode(bad,()=>{}));
 }
 assert.equal({}.polluted,undefined);
});
test("profile history ticket, quoted premise and mutation cross-branch proposals fail closed",()=>{
 const c=context("Which species is in the selected profile?"),p=prepared(c);
 const wire=p.transport.encode({request:request({evidenceBasis:"saved_profile",quantity:null,profileFields:["species"]})},()=>{});
 const history=p.transport.encode({request:request({readTicket:ticket()})},()=>{});
 const ticketKey=p.transport.fieldAliases.readTicket;
 for(const [field,value] of [["readTicket",history.request.evidenceContext[ticketKey]],["frame",'{"invented":true}'],["premiseQuotes",["fabricated"]]]){
  const bad=structuredClone(wire);bad.request.evidenceContext[p.transport.fieldAliases[field]||field]=value;
  assert.equal(p.valid(p.schema,bad),false);
  assert.throws(()=>p.transport.decode(bad,()=>{}));
 }
});
