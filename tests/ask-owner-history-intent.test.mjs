import test from "node:test";
import assert from "node:assert/strict";
import { reconcileNamedProfileRead,runReadOnlyAsk } from "../app/lib/ask-read-only/core.mjs";
import { recoverOwnerHistoryIntent,historyOnlyInferenceQuestion } from "../app/lib/ask-read-only/owner-history-intent.mjs";
import { carryReadReferences,restoreReadReferences } from "../app/lib/ask-read-only/references.mjs";
import { normalizeReadTemporalScope } from "../app/lib/ask-read-only/temporal-scope.mjs";
import { fulfillReferenceReads } from "../app/lib/ask-read-only/task-components.mjs";

const pets=[{id:"one",handle:"p1",name:"Luna"},{id:"two",handle:"p2",name:"Pepper"}];
const context=question=>({question,selectedPet:"p1",dialogue:[]});
const first=(extra={})=>({calls:[],text:"Which pet?",
 safety:{referent:"essential_unknown",careContext:"none",medicationIntent:"none",missingContext:["pet"],eventAssessments:[]},
 taskPlan:[{id:"t1",kind:"clarification",needsHistory:false,needsOwnerFacts:false,includeSourceDates:false,workflow:"none",recordMode:"none",pets:[],reference:null,missing:["pet"]}],...extra});

test("ordinary profile questions bind explicitly named owned pets",()=>{
 for(const question of ["How old is Luna?","What kind of cat is Luna?"]){
  const out=reconcileNamedProfileRead(first(),context(question),pets);
  assert.equal(out.calls[0].name,"read_pet_profile");
  assert.deepEqual(out.taskPlan[0].pets,["p1"]);
  assert.deepEqual(out.taskPlan[0].missing,[]);
 }
 for(const question of ["How old was Luna in 2016?","Do we know how old Luna was when she first came home?","How old is Luna compared with Pepper?"])
  assert.equal(reconcileNamedProfileRead(first(),context(question),pets),null);
});

test("an arrival event without a year searches the owned journal in event order",()=>{
 const q=context("Do you remember what Pepper came home wearing after we adopted her?");
 const out=recoverOwnerHistoryIntent(first({calls:[{id:"profile",name:"read_pet_profile",arguments:'{"pet":"p2"}'}]}),q,pets,[]);
 assert.equal(out.calls[0].name,"search_saved_records");
 const args=JSON.parse(out.calls[0].arguments);
 assert.equal(args.pet,"p2");
 assert.equal(args.orderBy,"event");
 assert.equal(args.order,"asc");
 assert.equal(args.from,null);
 assert.deepEqual(out.taskPlan[0].missing,[]);
 assert.equal(recoverOwnerHistoryIntent(first(),context("When did someone get here?"),pets,[]),null);
 assert.equal(recoverOwnerHistoryIntent(first(),context("What did Luna and Pepper come home with?"),pets,[]),null);
});

test("an immediately referenced visit rereads the exact retained owned note",()=>{
 const q={...context("Was her appetite normal at that appointment?"),dialogue:[{role:"user",text:"What happened at the January appointment?"},{role:"assistant",text:"The note describes the January visit."}]};
 const ref={handle:"r1",usedInPreviousAnswer:true,request:{kind:"history",pet:pets[0],orderBy:"event",expectedSources:[{id:"stored-one"}]}};
 const plan=recoverOwnerHistoryIntent(first(),q,pets,[ref]);
 assert.deepEqual(plan.taskPlan[0].missing,[]);
 assert.equal(plan.taskPlan[0].reference,"r1");
 assert.equal(fulfillReferenceReads(plan,[ref]).calls[0].name,"read_referenced_sources");
 assert.equal(recoverOwnerHistoryIntent(first(),q,pets,[ref,{...ref,handle:"r2"}]),null);
 assert.equal(recoverOwnerHistoryIntent(first(),q,pets,[{...ref,usedInPreviousAnswer:false}]),null);
 assert.equal(recoverOwnerHistoryIntent(first(),{...q,question:"Was Pepper's appetite normal at that appointment?"},pets,[ref]),null);
 assert.equal(recoverOwnerHistoryIntent(first(),{...q,dialogue:[]},pets,[ref]),null);
});

test("past-only inference is distinguished from a current care request",()=>{
 assert.equal(historyOnlyInferenceQuestion("Based on those older reports, can we tell whether it still happens today?"),true);
 assert.equal(historyOnlyInferenceQuestion("Based only on the older notes, can you tell whether Luna is still limping today?"),true);
 assert.equal(historyOnlyInferenceQuestion("Luna fell today. Based only on the older notes, can you tell whether she is still limping today?"),false);
 assert.equal(historyOnlyInferenceQuestion("Do the old notes say what happened then?"),false);
 assert.equal(historyOnlyInferenceQuestion("From those old notes, can you tell what is happening now and what treatment should I use?"),false);
});

test("retained notes lose immediate-answer status after an unrelated reply",()=>{
 const row={id:"row-one",handle:"s1",petId:"one",kind:"history",body:"The activity log was unchanged.",
  eventAt:"2022-01-10T12:00:00Z",recordedAt:"2022-01-11T12:00:00Z"};
 const request={kind:"history",pet:pets[0],goal:"relevant_records"};
 const first=carryReadReferences([],[{request,sourceHandles:["s1"]}],[row],{sources:["s1"]},"UTC");
 const restored=restoreReadReferences(first,pets);
 assert.equal(restored[0].usedInPreviousAnswer,true);
 assert.equal(restoreReadReferences(first,pets,false)[0].usedInPreviousAnswer,false);
 const later=carryReadReferences(restored,[],[],{sources:[]},"UTC");
 const stillRetained=restoreReadReferences(later,pets);
 assert.equal(stillRetained.length,1);
 assert.equal(stillRetained[0].usedInPreviousAnswer,false);
});

test("an explicit place anchor recovers an event-date search without a proposed call",()=>{
 const initial=first();
 initial.taskPlan[0].missing=["date_meaning"];
 initial.safety.missingContext=["date_meaning"];
 initial.taskPlan.push({...initial.taskPlan[0],id:"t2"});
 const out=recoverOwnerHistoryIntent(initial,context("When did Luna stay at the orchard cottage?"),pets,[]);
 const args=JSON.parse(out.calls[0].arguments);
 assert.equal(args.query,"orchard cottage");
 assert.equal(args.orderBy,"event");
 assert.deepEqual(out.taskPlan[0].missing,[]);
});

test("a history-only current inference answers the limit without reading or generating care advice",async()=>{
 const result=await runReadOnlyAsk({ownerId:"owner",selectedPetId:"one",
  pets:pets.map(p=>({...p,ownerId:"owner",species:"cat"})),dialogue:[],timeZone:"UTC",
  question:"Based only on the older notes, can you tell whether Luna is still limping today?"},{
  provider:async(_request,phase)=>{
   assert.equal(phase,"read_selection");
   const initial=first();
   return {...initial,safety:{...initial.safety,careContext:"current_concern"}};
  },
  read:async()=>assert.fail("No records are needed to answer the evidence limitation.")
 });
 assert.equal(result.answer.replyType,"answer");
 assert.equal(result.providerCallCount,1);
 assert.match(result.answer.answer,/can’t tell you whether it’s still happening today/);
 assert.deepEqual(result.sources,[]);
});

test("a pet name in a place does not change the subject of an occurrence",()=>{
 const owned=[{id:"one",handle:"p1",name:"QA Luna Long History"},{id:"two",handle:"p2",name:"Maple"}];
 const initial=first({calls:[{id:"wrong-profile",name:"read_pet_profile",arguments:'{"pet":"p2"}'}]});
 initial.taskPlan[0].pets=["p2"];
 const plan=recoverOwnerHistoryIntent(initial,context("When did Luna stay at the maple lodge?"),owned,[]);
 const args=JSON.parse(plan.calls[0].arguments);
 assert.equal(args.pet,"p1");
 assert.equal(args.query,"maple lodge");
 assert.deepEqual(plan.taskPlan[0].pets,["p1"]);
});

test("an unbounded occurrence query has no competing recorded-time filter",()=>{
 const query={from:null,to:null};
 assert.deepEqual(normalizeReadTemporalScope("search_saved_records",query,"event"),{args:query,removedAxis:null});
 assert.throws(()=>normalizeReadTemporalScope("search_saved_records",{...query,recordedFrom:"2020-01-01"},"event"),/ASK_READ_TEMPORAL_CONTRACT/);
});

test("an ordinary saved-note topic restores a search when record choice was marked missing",()=>{
 const initial=first();
 const output=recoverOwnerHistoryIntent(initial,context("What did I write about Luna hiding under the bed?"),pets,[]);
 const args=JSON.parse(output.calls[0].arguments);
 assert.equal(args.pet,"p1");
 assert.equal(args.query,"hiding");
 assert.equal(output.taskPlan[0].needsHistory,true);
 assert.deepEqual(output.taskPlan[0].missing,[]);
});
