import test from "node:test";
import assert from "node:assert/strict";
import { reconcileNamedProfileRead } from "../app/lib/ask-read-only/core.mjs";
import { recoverOwnerHistoryIntent,historyOnlyInferenceQuestion } from "../app/lib/ask-read-only/owner-history-intent.mjs";
import { carryReadReferences,restoreReadReferences } from "../app/lib/ask-read-only/references.mjs";
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
