import test from "node:test";
import assert from "node:assert/strict";
import {supportsAppWorkflow} from "../app/lib/ask-read-only/app-capabilities.mjs";
import {runReadOnlyAsk} from "../app/lib/ask-read-only/core.mjs";
import {decodeComponentSelection} from "../app/lib/ask-read-only/task-components.mjs";
import {decodeClinicalSelection} from "../app/lib/ask-read-only/clinical-policy.mjs";
for(const question of [
 "Where can I look for my older entries in Furvise?",
 "How can I filter my saved notes by category?",
 "How do I browse old records in the app?",
 "Where should I go to find notes from earlier years?",
 "How can we search our pet history?"
])test("natural navigation admits verified display context: "+question,()=>assert.equal(supportsAppWorkflow(question),true));
for(const question of [
 "Summarize my old notes.",
 "Find my pet's oldest note.",
 "What did the last History note say?",
 "How did my pet's weight change in the saved notes?",
 "Compare the recorded dates for these notes.",
 "Can you find my old note?",
 "How would I summarize the saved notes?",
 "How can I find out if my pet has recurring itching in these notes?",
 "Where did the event in my old note happen?"
])test("content request is not converted to navigation: "+question,()=>assert.equal(supportsAppWorkflow(question),false));
test("actual two-call natural navigation renders registry controls without private IO",async()=>{
 const pet={id:"private-pet-123456789",ownerId:"owner",name:"Willow",species:"cat"};
 const safety={medicationIntent:"none",referent:"clear",missingContext:[],careContext:"none",eventAssessments:[]};
 let calls=0,reads=0;
 const out=await runReadOnlyAsk({ownerId:"owner",selectedPetId:pet.id,pets:[pet],dialogue:[],question:"Where can I look for earlier notes in Furvise?",now:"2026-11-14T12:00:00Z",timeZone:"UTC"},{
  provider:async(req,phase)=>{
   calls++;
   if(phase==="read_selection"){
    assert.equal(req.context.appCapabilities.history.route,"/history");
    return decodeComponentSelection({safety,reads:[],draft:"",historyIntent:{requested:false,timeBasis:"event",pet:null},workflowIntent:"find_care_note",taskPlan:[{id:"t1",kind:"workflow",combineHistory:false,needsHistory:false,needsOwnerFacts:false,includeSourceDates:false,recordMode:"none",workflow:"find_care_note",pets:[],reference:null,missing:[]}]},req.tools,req.context,decodeClinicalSelection);
   }
   return {components:[{kind:"general",text:"Placeholder that must not replace verified app steps.",sources:[]}],quotes:[],sources:[],calculations:[],replyType:"answer",presentation:{sourceDates:[],contextRequired:false},clinicalReview:{assessment:safety,ownerStatementRefs:[],observationFields:[]},appHelp:{intent:"find_care_note",pet:"p1"},completion:[{task:"t1",status:"complete",reason:"none",componentIndexes:[],sources:[],ownerFacts:[],historyFacts:[]}]};
  },read:async()=>{reads++;throw Error("Navigation must not read care records");}
 });
 assert.equal(calls,2);assert.equal(reads,0);assert.match(out.answer.answer,/Open History/);assert.match(out.answer.answer,/Search history/);assert.match(out.answer.answer,/Pet, Category or When/);
 assert.doesNotMatch(out.answer.answer,/Placeholder|I searched|I found|Which screen/);
});
