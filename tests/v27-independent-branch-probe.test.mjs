import test from "node:test";
import assert from "node:assert/strict";
import {prepareAskInterpretationRequest,recoverAskInterpretation} from "../app/lib/intelligence/interpret-ask.ts";
import {makeValidator,expand} from "../app/lib/intelligence/ask-wire-codec.mjs";
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
 assert.equal(JSON.stringify(p.schema).includes('"description":'),false);
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


test("conversation cannot carry any declared stored-read obligation in provider grammar or Binder",()=>{
 const c=context("Explain a general concept."),p=prepared(c);
 const canonical=request({question:c.currentMessage,mode:"conversation",evidenceBasis:"general",scope:"none",
 operation:"general",quantity:null,draftAnswer:"A concise general explanation."});
 const valid=p.transport.encode({request:canonical},()=>{});
 assert.equal(p.valid(p.schema,valid),true);
 for(const [field,value] of [["profileFields",["name"]],["evidenceNeeds",[{}]],["terms",["maintenance"]],
 ["from","2024-03-10"],["quantity","records"],["temporalScope","historical"]]){
  const invalid={...canonical,[field]:value};
  assert.throws(()=>p.transport.encode({request:invalid},()=>{}),undefined,field);
  assert.throws(()=>recoverAskInterpretation(invalid,c),undefined,field);
 }
 assert.equal(recoverAskInterpretation(canonical,c).conversationOnly,true);
});

test("non-null history tickets cannot cross evidence domains in provider grammar or Binder",()=>{
 const c=context(),p=prepared(c),canonical=request({readTicket:ticket()});
 assert.equal(p.valid(p.schema,p.transport.encode({request:canonical},()=>{})),true);
 for(const evidenceBasis of ["general",null,"saved_profile","supplied_context"]){
  const invalid={...canonical,evidenceBasis};
  assert.throws(()=>p.transport.encode({request:invalid},()=>{}),undefined,String(evidenceBasis));
  assert.throws(()=>recoverAskInterpretation(invalid,c),undefined,String(evidenceBasis));
 }
});

test("saved-history reads and mixed reads require tickets in the provider grammar",()=>{
 const p=prepared();
 for(const mode of ["read","mixed"]){
  assert.throws(()=>p.transport.encode({request:request({mode,readTicket:null})},()=>{}),undefined,mode);
 }
});
test("readonly history cannot carry a correction intent in grammar or Binder",()=>{
 const c=context(),p=prepared(c),invalid=request({readTicket:ticket(),mutationIntent:"correct_record"});
 assert.throws(()=>p.transport.encode({request:invalid},()=>{}));
 assert.throws(()=>recoverAskInterpretation(invalid,c));
});
