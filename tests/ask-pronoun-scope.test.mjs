import test from "node:test";
import assert from "node:assert/strict";
import {requirePronounPet} from "../app/lib/ask-read-only/pronoun-scope.mjs";
import {runReadOnlyAsk} from "../app/lib/ask-read-only/core.mjs";
import {decodeComponentSelection} from "../app/lib/ask-read-only/task-components.mjs";
import {decodeClinicalSelection} from "../app/lib/ask-read-only/clinical-policy.mjs";
const pets=[{id:"owned-maple-private",ownerId:"owner",handle:"p1",name:"Maple",species:"dog"},{id:"owned-juniper-private",ownerId:"owner",handle:"p2",name:"Juniper",species:"cat"}];
const safety=()=>({medicationIntent:"none",referent:"clear",missingContext:["date"],careContext:"none",eventAssessments:[]});
const task=()=>({id:"t1",kind:"saved_content",combineHistory:false,needsHistory:true,needsOwnerFacts:false,includeSourceDates:false,recordMode:"single",workflow:"none",pets:["p1"],reference:null,missing:["year"]});
function fixture(){
 const first={calls:[],text:"Selected pet is not source authority.",historyIntent:{requested:true,timeBasis:"ambiguous",pet:"p1"},workflowIntent:"none",safety:safety()},plan=[task()],context={question:"What did she weigh in May?",pets,references:[]};
 return {first,plan,context,dialogue:[],bind:(name,a)=>{const p=pets.find(p=>p.handle===a.pet);if(!p)throw Error("FOREIGN");return{kind:"profile",pet:p};}};
}
test("unestablished history pronoun clears UI-only identity and requires pet plus existing year",()=>{
 const f=fixture(),r=requirePronounPet(f.first,f.plan,f.context,f.dialogue,f.bind);assert.ok(r);assert.deepEqual(r.plan[0].pets,[]);assert.deepEqual(r.plan[0].missing,["pet","year"]);assert.equal(r.first.historyIntent.pet,null);assert.equal(r.first.safety.referent,"essential_unknown");assert.deepEqual(r.first.calls,[]);
});
test("profile lookup cannot turn UI selection into a pronoun antecedent",()=>{
 const f=fixture();f.first.calls=[{id:"p",name:"read_pet_profile",arguments:'{"pet":"p1"}'}];const r=requirePronounPet(f.first,f.plan,f.context,f.dialogue,f.bind);assert.ok(r);assert.equal(r.diagnostic.suppressedReads,1);assert.deepEqual(r.first.calls,[]);
});
for(const [label,change]of [
 ["named current pet",f=>f.context.question="What did Maple weigh in May?"],
 ["owner established dialogue",f=>f.dialogue=[{role:"user",text:"Use Juniper for this question."}]],
 ["bound prior reference",f=>f.context.references=[{reference:"r1"}]],
 ["single owned pet",f=>f.context.pets=[pets[0]]],
 ["ordinary general guidance",f=>f.plan=[{...task(),kind:"general_guidance",needsHistory:false,recordMode:"none"}]],
 ["no pronoun",f=>f.context.question="What weight was recorded in May?"],
 ["actual medication authority",f=>f.first.safety.medicationIntent="decision"],
 ["current concern",f=>f.first.safety.careContext="current_concern"],
 ["current emergency",f=>f.first.safety.currentEvents=[{}]],
 ["future emergency",f=>f.first.safety.conditionalEvents=[{}]],
 ["missing medicine",f=>f.first.safety.missingContext=["medicine"]],
 ["vet brief",f=>f.plan[0].kind="vet_brief"]
])test("pronoun boundary preserves "+label,()=>{const f=fixture();change(f);assert.equal(requirePronounPet(f.first,f.plan,f.context,f.dialogue,f.bind),null);});
test("assistant-only naming is not owner evidence and foreign reads are still rejected",()=>{
 const f=fixture();f.dialogue=[{role:"assistant",text:"Maybe Maple."}];assert.ok(requirePronounPet(f.first,f.plan,f.context,f.dialogue,f.bind));
 f.first.calls=[{id:"p",name:"read_pet_profile",arguments:'{"pet":"foreign"}'}];assert.throws(()=>requirePronounPet(f.first,f.plan,f.context,f.dialogue,f.bind),/FOREIGN/);
});
test("actual two-call first-history path asks both scopes without a private read or invented weight",async()=>{
 const f=fixture();let calls=0,reads=0;const seen=[];
 const r=await runReadOnlyAsk({ownerId:"owner",selectedPetId:pets[0].id,pets,dialogue:[],question:f.context.question,now:"2026-11-14T00:00:00Z",timeZone:"UTC"},{
  provider:async(req,phase)=>{calls++;seen.push(req.context);if(phase==="read_selection")return decodeComponentSelection({safety:safety(),reads:[],draft:"Maybe Maple.",historyIntent:f.first.historyIntent,workflowIntent:"none",taskPlan:f.plan},req.tools,req.context,decodeClinicalSelection);
   return {components:[{kind:"general",text:"Which year should I use?",sources:[]}],quotes:[],sources:[],calculations:[],replyType:"clarification",presentation:{sourceDates:[],contextRequired:false},clinicalReview:{assessment:safety(),ownerStatementRefs:[],observationFields:[]},appHelp:{intent:"none",pet:null},completion:[{task:"t1",status:"unresolved",reason:"missing_context",componentIndexes:[0],sources:[],ownerFacts:[],historyFacts:[]}]};},
  read:async()=>{reads++;throw Error("UNEXPECTED_PRIVATE_READ");}
 });
 assert.equal(calls,2);assert.equal(reads,0);assert.equal(r.answer.answer,"Which pet and year should I use?");assert.deepEqual(seen[1].taskPlan[0].pets,[]);
});
