import {nativeKey,nativeValue,nativeSlot} from "./helpers/direct-protocol.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import {prepareAskInterpretationRequest,recoverAskInterpretation} from "../app/lib/intelligence/interpret-ask.ts";
import {makeValidator,expand} from "../app/lib/intelligence/ask-wire-codec.mjs";
function context(text="Explain a general idea.",turns=[]){
 const pet={id:"owned",user_id:"owner",name:"Pet",species:"dog"};
 return {owner:{userId:"owner"},pet,eligiblePets:[pet],currentMessage:text,
  currentTurn:{id:"current",role:"user",text},conversationTurns:turns,timeZone:"UTC"};
}
function proposal(extra={}){
 return {calculatePlan:null,storedRead:null,removeJob:null,stateTransitionJob:null,
 fieldMutationJob:null,lifecyclePlan:null,appendJob:null,readTicket:null,writeJob:null,task:null,
 temporalScope:null,mutationIntent:null,recordSelection:null,projection:null,profileFields:[],
 evidenceNeeds:[],terms:[],petNames:[],excludedPetNames:[],referenceTurnIds:[],requirements:[],
 premiseQuotes:[],outputFormat:null,from:null,to:null,ordinal:null,episodeTopic:null,quantity:null,
 frame:null,draftAnswer:"A clear provisional explanation.",version:"ask-request.v2",
 mode:"conversation",scope:"none",operation:"general",selection:"summary",
 question:"Explain a general idea.",topic:"general",evidenceBasis:"general",...extra};
}
test("conversation cannot borrow an update-only null premise/domain branch or omit its independent-review draft",()=>{
 const prepared=prepareAskInterpretationRequest(context(),"fixture");
 const wire=prepared.transport.encode({request:proposal()},()=>{});
 const schema=expand(prepared.request.text.format.schema),valid=makeValidator(schema);
 assert.equal(valid(schema,wire),true);
 for(const change of [
  {evidenceBasis:null,premiseQuotes:null},{evidenceBasis:null,premiseQuotes:[]},
  {evidenceBasis:"general",premiseQuotes:null},{draftAnswer:null},{draftAnswer:""},
  {mode:"update",evidenceBasis:"general",premiseQuotes:["Invented"]}
 ]){
  const bad=structuredClone(wire);Object.assign(bad.request.evidenceContext,nativeValue(prepared.transport,change));
  assert.equal(valid(schema,bad),false,JSON.stringify(change));
  assert.throws(()=>prepared.transport.decode(bad,()=>{}));
 }
 assert.throws(()=>recoverAskInterpretation(proposal({evidenceBasis:null}),context()),
  /CONVERSATION_EVIDENCE_BASIS/);
});
test("owned profile lookup stays a read, with no provisional dialogue or added source authority",()=>{
 const c=context("Which species is recorded in the selected profile?");
 const p=prepareAskInterpretationRequest(c,"fixture");
 const request=proposal({mode:"read",scope:"selected",evidenceBasis:"saved_profile",
  draftAnswer:null,question:c.currentMessage,profileFields:["species"]});
 const wire=p.transport.encode({request},()=>{});
 assert.deepEqual(p.transport.decode(wire,()=>{}).request,request);
 const bound=recoverAskInterpretation(request,c);
 assert.deepEqual(bound.petIds,["owned"]);assert.equal(bound.request.evidenceBasis,"saved_profile");
 assert.equal(bound.provisionalAnswer,undefined);
});
test("genuine supplied quotations keep literal text, and missing or fabricated premises cannot become general",()=>{
 const text='In a fictional example, the sign reads "North — keep left". Explain its wording.';
 const c=context(text),p=prepareAskInterpretationRequest(c,"fixture");
 const quote='the sign reads "North — keep left"';
 const request=proposal({question:text,evidenceBasis:"supplied_context",premiseQuotes:[quote],
  draftAnswer:"The sign gives a direction within your fictional example."});
 const wire=p.transport.encode({request},()=>{});
 assert.deepEqual(p.transport.decode(wire,()=>{}).request.premiseQuotes,[quote]);
 assert.equal(recoverAskInterpretation(request,c).request.evidenceBasis,"supplied_context");
 assert.throws(()=>recoverAskInterpretation({...request,premiseQuotes:[]},c),/MISSING_SUPPLIED_PREMISE/);
 assert.throws(()=>recoverAskInterpretation({...request,premiseQuotes:["A fabricated personal fact."]},c),/PREMISE_SOURCE/);
 assert.throws(()=>recoverAskInterpretation({...request,mode:"update"},c),/BASIS_UPDATE/);
});

test("temporal transport binds operation to anchor while preserving exact source-window instants",()=>{
 const c=context("Quote the original entry from the requested day.");
 const p=prepareAskInterpretationRequest(c,"fixture"),schema=expand(p.request.text.format.schema),valid=makeValidator(schema);
 const temporal={from:"2024-11-03T00:00:00-04:00",to:"2024-11-04T00:00:00-05:00",anchor:null,calendar:null};
 const ticket={authority:"stored_report",operation:"read",subjectScope:"selected",temporal,
  predicates:[],outputs:{strategy:null,completeness:"sufficient",ordering:"asc",limit:null},
  searchHints:null,episode:null,selection:null,probes:[]};
 const request=proposal({mode:"read",scope:"selected",evidenceBasis:"saved_history",
  draftAnswer:null,question:c.currentMessage,readTicket:ticket});
 const good=p.transport.encode({request},()=>{});
 assert.equal(valid(schema,good),true);
 assert.deepEqual(p.transport.decode(good,()=>{}).request,request);
 assert.deepEqual(recoverAskInterpretation(request,c).request.readTicket.temporal,temporal);
 for(const change of [{operation:"read_since_event"},
  {temporal:{...temporal,anchor:{concept:"appointment",relation:"after"}}},
  {authority:"effective_fact",operation:"read_since_event"},
  {temporal:{...temporal,calendar:"oldest_year"}}]){
  const bad=structuredClone(good);Object.assign(bad.request.evidenceContext[nativeKey(p.transport,'readTicket')][nativeKey(p.transport,'temporalContext')],nativeValue(p.transport,change));
  assert.equal(valid(schema,bad),false,JSON.stringify(change));
 }
 const event={...ticket,authority:"effective_fact",operation:"read_since_event",
  temporal:{from:null,to:null,calendar:null,anchor:{concept:"appointment",relation:"after"}}};
 const eventRequest={...request,readTicket:event};
 const eventWire=p.transport.encode({request:eventRequest},()=>{});
 assert.equal(valid(schema,eventWire),true);
 assert.deepEqual(p.transport.decode(eventWire,()=>{}).request,eventRequest);
 assert.deepEqual(recoverAskInterpretation(eventRequest,c).request.readTicket.temporal.anchor,event.temporal.anchor);
 const badFrame=structuredClone(good);nativeSlot(p.transport,badFrame,"frame").target[nativeKey(p.transport,"frame")]="{}";
 assert.equal(valid(schema,badFrame),false);
});
