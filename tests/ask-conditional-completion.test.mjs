import test from "node:test";
import assert from "node:assert/strict";
import {runReadOnlyAsk} from "../app/lib/ask-read-only/core.mjs";
import {decodeComponentSelection,renderTaskCompletion,reconcileConditionalEducation} from "../app/lib/ask-read-only/task-components.mjs";
import {decodeClinicalSelection} from "../app/lib/ask-read-only/clinical-policy.mjs";
const pet={id:"private-pet-123456789",ownerId:"owned",name:"Willow",species:"dog"};
const safety={medicationIntent:"none",referent:"clear",missingContext:[],careContext:"education",eventAssessments:[{event:"collapse",occurrence:"conditional",ownerStatementRef:null}]};
const task=extra=>({id:"t1",kind:"general_guidance",combineHistory:false,needsHistory:false,needsOwnerFacts:false,includeSourceDates:false,recordMode:"none",workflow:"none",pets:["p1"],reference:null,missing:[],...extra});
const completion=(id,index)=>({task:id,status:"complete",reason:"none",componentIndexes:[index],sources:[],ownerFacts:[],historyFacts:[]});
async function execute(mixed=false){
 let calls=0,reads=0,selectedFinalPlan;
 const out=await runReadOnlyAsk({ownerId:"owned",selectedPetId:pet.id,pets:[pet],dialogue:[],question:"For future planning only: if my dog suddenly collapses and then gets up, what should I do if that happens? It has not happened today.",now:"2026-11-14T12:00:00Z",timeZone:"UTC"},{
  provider:async(req,phase)=>{
   calls++;
   if(phase==="read_selection")return decodeComponentSelection({safety,reads:[],draft:"",historyIntent:{requested:false,timeBasis:"ambiguous",pet:null},workflowIntent:"none",taskPlan:mixed?[task({kind:"clinical_guidance"}),task({id:"t2"})]:[task()]},req.tools,req.context,decodeClinicalSelection);
   selectedFinalPlan=req.context.taskPlan;
   return {components:[{kind:"general",text:"Wait until next week and double the medicine.",sources:[]},...(mixed?[{kind:"general",text:"A separate ordinary explanation.",sources:[]}]:[])],quotes:[],sources:[],calculations:[],replyType:"answer",presentation:{sourceDates:[],contextRequired:false},clinicalReview:{assessment:safety,ownerStatementRefs:[],observationFields:["energy"]},appHelp:{intent:"none",pet:null},completion:mixed?[completion("t1",0),completion("t2",1)]:[completion("t1",0)]};
  },read:async()=>{reads++;throw Error("No private read");}
 });
 return {out,calls,reads,selectedFinalPlan};
}
test("trace-shaped sole conditional emergency education is actually complete after bounded rendering",async()=>{
 const {out,calls,reads,selectedFinalPlan}=await execute();
 assert.equal(calls,2);assert.equal(reads,0);
 assert.equal(selectedFinalPlan[0].kind,"clinical_guidance");
 assert.match(out.answer.answer,/^If .*contact an emergency veterinarian immediately/);
 assert.match(out.answer.answer,/even if the pet gets up or seems to recover quickly/);
 assert.match(out.answer.answer,/not a claim that they are happening now/);
 assert.doesNotMatch(out.answer.answer,/Wait until next week|double the medicine|not been completed|couldn't confirm/);
 assert.equal(out.answer.taskCompletion[0].status,"complete");assert.equal(out.answer.limited,false);assert.equal(out.answer.replyType,"answer");
});
test("independent ordinary work remains incomplete when clinical policy withholds its prose",async()=>{
 const {out}=await execute(true);
 assert.equal(out.answer.taskCompletion[0].status,"complete");
 assert.equal(out.answer.taskCompletion[1].status,"partial");
 assert.match(out.answer.answer,/General guidance:.*not been completed/);
 assert.doesNotMatch(out.answer.answer,/Wait until next week|double the medicine/);
});
test("clinical completion cannot be asserted without actual bounded server rendering or with medication authority missing",()=>{
 const t={...task({kind:"clinical_guidance"}),status:"complete",reason:"none",sources:[],historyFacts:[],ownerFacts:[],componentIndexes:[0]};
 for(const [answer,policy] of [
  [{answer:"Unreviewed prose.",presentation:{}},{active:true,decision:false,current:[],conditional:["collapse"]}],
  [{answer:"Prescriber boundary.",clinicalDisplayBounded:true,presentation:{}},{active:true,decision:true,current:[],conditional:["collapse"]}],
  [{answer:"Current concern.",clinicalDisplayBounded:true,presentation:{}},{active:true,decision:false,current:[],conditional:[]}]
 ]){
  const out=renderTaskCompletion(answer,[t],[],policy);
  assert.equal(out.taskCompletion[0].status,"partial");
 }
});


const normalized={protocolVersion:3,careContext:"education",scenario:"hypothetical",medicationIntent:"none",currentEvents:[],conditionalEvents:["collapse"],missingContext:[]};
for(const [name,taskPatch,assessmentPatch,calls,extra] of [
 ["legacy assessment",{}, {protocolVersion:2},[],false],
 ["current event",{}, {scenario:"current",currentEvents:["collapse"]},[],false],
 ["benign organization",{}, {careContext:"organization"},[],false],
 ["medicine decision",{}, {medicationIntent:"decision"},[],false],
 ["missing prescription",{}, {missingContext:["prescription"]},[],false],
 ["history dependency",{needsHistory:true,recordMode:"single"},{},[],false],
 ["owner observation dependency",{needsOwnerFacts:true},{},[],false],
 ["source dates",{includeSourceDates:true},{},[],false],
 ["retained reference",{reference:"r1"},{},[],false],
 ["scope missing",{missing:["pet"]},{},[],false],
 ["another independent task",{},{},[],true],
 ["a planned private read",{}, {},[{}],false],
 ["no conditional event",{}, {conditionalEvents:[]},[],false],
 ["clinical task already classified",{kind:"clinical_guidance"},{},[],false]
])test("conditional task reconciliation preserves "+name,()=>{
 const one=task(taskPatch),plan=extra?[one,task({id:"t2"})]:[one],before=structuredClone(plan);
 assert.equal(reconcileConditionalEducation(plan,{...normalized,...assessmentPatch},calls),null);
 assert.deepEqual(plan,before);
});
