import test from "node:test";
import assert from "node:assert/strict";
import {prepareAskInterpretationRequest,interpretAskQuestion} from "../app/lib/intelligence/interpret-ask.ts";
import {assertAskRequestInputBudget} from "../app/lib/intelligence/ask-interpretation-sources.ts";
import {nativeKey,nativeValue} from "./helpers/direct-protocol.mjs";
test("initial admission leaves room for a whole-ticket repair on the same near-limit USER window",async()=>{
 const pet={id:"owned",user_id:"owner",name:"Sample",species:"dog"};
 const text="Quote Sample's original saved maintenance note from March 10, 2024.";
 const context={owner:{userId:"owner"},pet,eligiblePets:[pet],currentMessage:text,
  currentTurn:{id:"current",role:"user",text,createdAt:"2026-11-08T00:00:00Z"},timeZone:"America/New_York",
  conversationTurns:Array.from({length:8},(_,i)=>({id:"prior-"+i,role:"user",text:"Earlier discussion "+i+" "+ "x".repeat(2500),createdAt:"2026-11-07T00:00:00Z"}))};
 const p=prepareAskInterpretationRequest(context,"gpt-5.4-mini");
 const canonical={request:{calculatePlan:null,storedRead:null,removeJob:null,stateTransitionJob:null,
 fieldMutationJob:null,lifecyclePlan:null,appendJob:null,writeJob:null,task:null,temporalScope:null,
 mutationIntent:null,recordSelection:null,profileFields:[],projection:null,version:"ask-request.v2",mode:"read",
 question:text,requirements:[],evidenceNeeds:[],outputFormat:null,evidenceBasis:"saved_history",premiseQuotes:[],
 excludedPetNames:[],referenceTurnIds:[],scope:"named",petNames:["Sample"],operation:"recall",selection:"summary",
 quantity:"records",topic:"history",terms:[],from:null,to:null,episodeTopic:null,ordinal:null,frame:null,draftAnswer:null,
 readTicket:{authority:"stored_report",operation:"read",subjectScope:"named",
 temporal:{from:"2024-03-10T00:00:00-05:00",to:"2024-03-11T00:00:00-04:00",anchor:null,calendar:null},
 predicates:[{kind:"text_any",terms:["maintenance"]}],outputs:{strategy:null,completeness:"sufficient",ordering:"asc",limit:null},
 searchHints:null,episode:null,selection:null,probes:[]}}};
 const good=p.transport.encode(canonical,()=>{}),bad=structuredClone(good),K=n=>nativeKey(p.transport,n);
 bad.request.evidenceContext[K("readTicket")][K("temporalContext")][K("temporal")][K("anchor")]=nativeValue(p.transport,{concept:"appointment",relation:"after"});
 const calls=[];
 const result=await interpretAskQuestion({context,model:"gpt-5.4-mini",client:{responses:{create:async request=>{
  assertAskRequestInputBudget(request);
  const input=JSON.parse(request.input);calls.push(input);
  if(calls.length===2){
   assert.equal(input.transportRepair.validationCode,"ASK_WIRE_CANONICAL_SCHEMA");
   const {transportRepair,...unchanged}=input;assert.deepEqual(unchanged,calls[0]);
   assert.equal(Object.hasOwn(input.transportRepair,"rejectedProposal"),false);
  }
  return {status:"completed",output_text:JSON.stringify(calls.length===1?bad:good)};
 }}}});
 assert.equal(calls.length,2);
 assert.equal(result.request.readTicket.authority,"stored_report");
 assert.deepEqual(result.request.readTicket.subjects.petIds,["owned"]);
 assert.deepEqual(result.request.readTicket.temporal,canonical.request.readTicket.temporal);
 assert.ok(calls[0].sourceWindow.omittedPriorUserTurns>0,"whole turns must be omitted before call one to reserve repair");
});