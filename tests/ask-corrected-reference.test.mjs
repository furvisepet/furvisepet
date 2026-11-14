import test from "node:test";
import assert from "node:assert/strict";
import {reconcileCorrectedReference} from "../app/lib/ask-read-only/corrected-reference.mjs";
import {validateTaskPlan,decodeComponentSelection} from "../app/lib/ask-read-only/task-components.mjs";
import {decodeClinicalSelection} from "../app/lib/ask-read-only/clinical-policy.mjs";
import {runReadOnlyAsk} from "../app/lib/ask-read-only/core.mjs";
import {createHash} from "node:crypto";
const pets=[{id:"owned-old-pet",ownerId:"owner",handle:"p1",name:"Maple",species:"cat"},{id:"owned-new-pet",ownerId:"owner",handle:"p2",name:"Juniper",species:"cat"}];
const safety=()=>({medicationIntent:"none",referent:"clear",missingContext:[],careContext:"clinical_history",eventAssessments:[]});
const task=(extra={})=>({id:"t1",kind:"saved_content",combineHistory:false,needsHistory:true,needsOwnerFacts:false,includeSourceDates:true,recordMode:"single",workflow:"none",pets:["p2"],reference:"r1",missing:[],...extra});
function fixture(question="I meant Juniper, not Maple, for November 2024. Correct the quote and both dates."){
 const context={question,pets,references:[{reference:"r1",petHandle:"p1",kind:"history",from:"2024-11-01",to:"2024-11-30",recordedFrom:null,recordedTo:null,orderBy:"event"}]};
 const first={safety:safety(),calls:[{id:"read",name:"search_saved_records",arguments:JSON.stringify({pet:"p2",from:"2024-11-01",to:"2024-11-30",recordedFrom:null,recordedTo:null,goal:"exact_quote",query:null,alternatives:[],orderBy:"event",order:"asc",offset:0})}],text:"Old draft must not survive.",historyIntent:{requested:true,timeBasis:"event",pet:"p2"},workflowIntent:"none"};
 return {context,first,plan:[task()]};
}
test("an explicitly corrected owned pet/date clears only the obsolete hint before strict task validation and normal read binding",()=>{
 const f=fixture();assert.throws(()=>validateTaskPlan(f.plan,f.context),/ASK_READ_COMPONENT_CONTRACT/);
 const r=reconcileCorrectedReference(f.first,f.plan,f.context);assert.equal(r.taskPlan[0].reference,null);assert.deepEqual(r.taskPlan[0].pets,["p2"]);assert.equal(r.text,"");assert.doesNotThrow(()=>validateTaskPlan(r.taskPlan,f.context));
 assert.equal(JSON.parse(r.calls[0].arguments).pet,"p2");assert.equal(r.scopeCorrection.method,"explicit_owned_calendar_correction");
});
test("same-pet explicit year correction is a fresh bounded search, never old-source rehydration",()=>{
 const f=fixture("Use November 2023 instead, keeping Maple as the pet.");f.plan[0].pets=["p1"];f.first.calls=[{id:"old",name:"read_referenced_sources",arguments:'{"reference":"r1"}'}];
 const r=reconcileCorrectedReference(f.first,f.plan,f.context),args=JSON.parse(r.calls[0].arguments);
 assert.equal(args.pet,"p1");assert.equal(args.from,"2023-11-01");assert.equal(args.to,"2023-11-30");assert.equal(r.calls[0].name,"search_saved_records");
});
test("saved-axis corrections remain recorded bounds, independent of displaying both timestamps",()=>{
 const f=fixture("For Juniper, use the notes saved in November 2023 instead of Maple.");f.first.historyIntent.timeBasis="recorded";
 const args=JSON.parse(reconcileCorrectedReference(f.first,f.plan,f.context).calls[0].arguments);assert.equal(args.from,null);assert.equal(args.to,null);assert.equal(args.recordedFrom,"2023-11-01");assert.equal(args.recordedTo,"2023-11-30");
});
test("displaying both dates can preserve one established reference axis but conflicting explicit axis cannot be guessed",()=>{
 const f=fixture();f.first.historyIntent.timeBasis="ambiguous";assert.equal(reconcileCorrectedReference(f.first,f.plan,f.context).historyIntent.timeBasis,"event");
 f.context.question="For Juniper use notes saved in November 2024, not Maple.";assert.equal(reconcileCorrectedReference(f.first,f.plan,f.context),null);
});
for(const [name,patch] of [
 ["unknown reference",f=>f.plan[0].reference="forged"],
 ["foreign reference pet",f=>f.context.references[0].petHandle="p99"],
 ["multiple positive pets",f=>f.context.question="Compare Juniper and Maple in November 2024."],
 ["negated target only",f=>f.context.question="Not Maple for November 2024."],
 ["hypothetical correction",f=>f.context.question="What if I meant Juniper, not Maple, in November 2024?"],
 ["invalid calendar",f=>f.context.question="I meant Juniper not Maple for February 31 2024."],
 ["relative calendar",f=>f.context.question="I meant Juniper, not Maple, last month."],
 ["duplicate owned name",f=>f.context.pets=[...pets,{...pets[1],id:"duplicate",handle:"p3"}]],
 ["medicine authority",f=>f.first.safety.medicationIntent="decision"],
 ["current emergency",f=>f.first.safety.currentEvents=["breathing_distress"]],
 ["current ordinary concern",f=>f.first.safety.currentConcern=true],
 ["missing prescription",f=>f.first.safety.missingContext=["medicine"]],
 ["continuation task",f=>f.plan[0].kind="saved_continuation"],
 ["multiple independent reads",f=>f.first.calls.push(f.first.calls[0])],
 ["remaining-range call",f=>f.first.calls=[{id:"old",name:"read_remaining_records",arguments:'{"reference":"r1"}'}]],
 ["unmatched old reference read",f=>f.first.calls=[{id:"old",name:"read_referenced_sources",arguments:'{"reference":"r2"}'}]]
])test("no correction shortcut for "+name,()=>{const f=fixture();patch(f);assert.equal(reconcileCorrectedReference(f.first,f.plan,f.context),null);});
test("unchanged same-pet/date reference stays bound, so stale/deleted fingerprint checks cannot be bypassed",()=>{
 const f=fixture("Quote Maple's November 2024 original note and both dates.");f.plan[0].pets=["p1"];assert.equal(reconcileCorrectedReference(f.first,f.plan,f.context),null);
});
test("actual two-call core corrects a foreign-pet presentation reference and reads only the newly requested owned scope",async()=>{
 const old={id:"old-source",kind:"history",ownerId:"owner",petId:pets[0].id,body:"Maple weighed 3.1 kg. Historical routine note.",eventAt:"2024-11-15T12:00:00Z",recordedAt:"2024-11-16T12:00:00Z"};
 const fresh={...old,id:"new-source",petId:pets[1].id,body:"Juniper weighed 5.2 kg. Original corrected-pet history note."};
 const entry={kind:"history",petId:pets[0].id,timeZone:"UTC",goal:"exact_quote",from:"2024-11-01",to:"2024-11-30",recordedFrom:null,recordedTo:null,orderBy:"event",order:"asc",terms:[],limited:false,sources:[{id:old.id,hash:createHash("sha256").update(old.body).digest("hex"),eventAt:old.eventAt,recordedAt:old.recordedAt}]};
 let physical=0,reads=0;const events=[];
 const result=await runReadOnlyAsk({ownerId:"owner",selectedPetId:pets[0].id,pets,question:fixture().context.question,dialogue:[],now:"2026-11-14T00:00:00Z",timeZone:"UTC",readReferences:{version:1,entries:[entry]}},{
  onAnswerBoundary:e=>events.push(e),read:async request=>{reads++;assert.equal(request.pet.id,pets[1].id);assert.equal(request.from,"2024-11-01");assert.equal(request.reference,undefined);return {sources:[fresh],scopeExhausted:true,hasMore:false,truncated:false,total:1};},
  provider:async(req,phase)=>{
   physical++;if(phase==="read_selection")return decodeComponentSelection({safety:safety(),reads:[{name:"read_referenced_sources",arguments:{reference:"r1"}}],draft:"Wrong old pet",historyIntent:{requested:true,timeBasis:"event",pet:"p2"},workflowIntent:"none",taskPlan:[task()]},req.tools,req.context,decodeClinicalSelection);
   const h=req.SOURCE_CATALOG[0].source;return {components:[{kind:"saved",text:"The original note is quoted.",sources:[h]}],sources:[h],quotes:[h],calculations:[],replyType:"answer",presentation:{sourceDates:[h],contextRequired:false},clinicalReview:{assessment:safety(),ownerStatementRefs:[],observationFields:[]},appHelp:{intent:"none",pet:null},completion:[{task:"t1",status:"complete",reason:"none",componentIndexes:[0],sources:[h],ownerFacts:[],historyFacts:[{source:h,excerpt:fresh.body}],historySynthesis:[{topic:"history note",evidence:[{source:h,excerpt:fresh.body}]}]}]};
  }});
 assert.equal(physical,2);assert.equal(reads,1);assert.equal(result.sources[0].petId,pets[1].id);assert.ok(result.answer.answer.includes(fresh.body));assert.equal(result.answer.answer.includes(old.body),false);assert.ok(events.some(e=>e.outcome==="reference_scope_corrected"));
});

test("repairing one saved lookup preserves a genuinely separate ordinary task",()=>{
 const f=fixture();const ordinary=task({id:"t2",kind:"general_guidance",needsHistory:false,recordMode:"none",pets:[],reference:null,includeSourceDates:false});f.plan.push(ordinary);
 const r=reconcileCorrectedReference(f.first,f.plan,f.context);assert.equal(r.taskPlan.length,2);assert.deepEqual(r.taskPlan[1],ordinary);assert.equal(r.taskPlan[0].reference,null);
});
test("two independent history tasks cannot share the correction shortcut",()=>{
 const f=fixture();f.plan.push(task({id:"t2"}));assert.equal(reconcileCorrectedReference(f.first,f.plan,f.context),null);
});

test("malformed plans and unknown locators reject before lower-level decoding; only known scope mismatch can be reconsidered",()=>{
 for(const patch of [{reference:"forged"},{unexpected:"field"},{pets:["p99"]}]){const f=fixture();Object.assign(f.plan[0],patch);let decoded=0;assert.throws(()=>decodeComponentSelection({taskPlan:f.plan},[],f.context,()=>{decoded++;return f.first;}),/ASK_READ_COMPONENT_CONTRACT/);assert.equal(decoded,0);}
});
