import test from "node:test";
import assert from "node:assert/strict";
import {completeFreshHistory} from "../app/lib/ask-read-only/continuation-evidence.mjs";
import {renderTaskCompletion} from "../app/lib/ask-read-only/task-components.mjs";
const source=(n,body,petId="owned-pet")=>({id:"row-"+n,handle:"s"+n,kind:"history",petId,petName:petId==="owned-pet"?"Willow":"Other",body,eventAt:"2024-"+String(n+1).padStart(2,"0")+"-15T12:00:00Z",recordedAt:"2024-"+String(n+1).padStart(2,"0")+"-16T12:00:00Z"});
const routine="Routine check reported usual appetite and activity, with no new ongoing concern.";
function fixture(){
 const sources=[source(1,"Old recovered event. No ongoing problem was reported afterward."),source(2,"Weight was 6.1 kg. "+routine),source(3,"Weight was 6.2 kg. "+routine),source(4,"Weight was 6.3 kg. "+routine),source(5,"Weight was 6.0 kg. A measured diet continued; appetite was normal and no persistent digestive change was reported.")];
 const evidence={source:"s2",excerpt:routine,petId:"owned-pet",pet:"Willow",eventAt:sources[1].eventAt,recordedAt:sources[1].recordedAt};
 const task={id:"t1",kind:"saved_continuation",needsHistory:true,needsOwnerFacts:false,recordMode:"collection",combineHistory:true,reference:"r1",pets:["p1"],missing:[],status:"complete",reason:"none",sources:sources.map(s=>s.handle),componentIndexes:[0],includeSourceDates:true,ownerFacts:[],historyFacts:[{source:"s1",excerpt:sources[0].body}],historySynthesis:[{topic:"usual appetite",evidence:[evidence]}]};
 const result=(role,selected)=>({scope:{kind:"history",pet:"Willow",petHandle:"p1",reference:"r1",evidenceRole:role,goal:"complete_set"},sources:selected.map(s=>({source:s.handle,kind:s.kind,pet:s.petName,body:s.body,eventAt:s.eventAt,recordedAt:s.recordedAt})),unmet:[],omitted:0,hasMore:false});
 return {sources,task,coverage:[result("retained_prior",sources.slice(0,1)),result("fresh_remainder",sources.slice(1))],result};
}
test("four fresh bodies: identical complete narrative gains verified report support, distinct missed finding is exact full-body evidence",()=>{
 const f=fixture(),[t]=completeFreshHistory([f.task],f.sources,f.coverage);
 assert.deepEqual(t.historySynthesis[0].evidence.map(e=>e.source),["s2","s3","s4"]);
 assert.equal(t.historyFacts.find(f=>f.source==="s5").excerpt,f.sources[4].body);
 assert.deepEqual(t.continuationEvidenceReview,{freshSourceCount:4,representedFreshSources:4,matchedRoutineSupports:2,recoveredFacts:1,unrepresentedFreshSources:0});
 assert.equal(f.task.historySynthesis[0].evidence.length,1,"no mutation of validated input");
});
test("visible continuation labels the fresh interval and includes the newly read nutrition/negation alongside prior recovery",()=>{
 const f=fixture(),answer={answer:"Untrusted generic summary",sources:f.sources.map(s=>s.handle),quotes:[],validatedParts:[{index:0,text:"Untrusted generic summary"}],presentation:{sourceDates:[],contextRequired:false}};
 const out=renderTaskCompletion(answer,[f.task],f.sources,null,f.coverage);
 assert.match(out.answer,/Read from the omitted interval: 3 selected saved reports/);
 assert.match(out.answer,/Newly read omitted-interval notes/);
 assert.ok(out.answer.includes(f.sources[4].body));assert.ok(out.answer.includes(f.sources[0].body));
 assert.doesNotMatch(out.answer,/Untrusted generic summary|recurring|worsening/);
 assert.ok(out.historicalSupport.includes("s5"));
});
test("same-day repeated/overlapping acquisition does not duplicate support or turn mentions into episodes",()=>{
 const f=fixture();f.coverage.push(f.coverage[1]);f.sources.forEach(s=>s.eventAt="2024-05-15T12:00:00Z");f.coverage.forEach(r=>r.sources.forEach(s=>s.eventAt="2024-05-15T12:00:00Z"));
 const [t]=completeFreshHistory([f.task],f.sources,f.coverage);
 assert.equal(t.continuationEvidenceReview.freshSourceCount,4);assert.equal(new Set(t.historySynthesis[0].evidence.map(e=>e.source)).size,3);
});
test("foreign pet, unselected source, changed body and prior-only rows cannot authorize a recovered finding",()=>{
 const f=fixture(),foreign=source(6,"A foreign private note.","foreign-pet");
 f.sources.push(foreign);const other=f.result("fresh_remainder",[foreign]);other.scope.reference="r2";other.scope.petHandle="p2";f.coverage.push(other);
 f.coverage[1].sources[3].body="Forged replacement body";
 const [t]=completeFreshHistory([f.task],f.sources,f.coverage);
 assert.equal(t.historyFacts.some(f=>f.source==="s6"||f.source==="s5"),false);
 assert.equal(t.continuationEvidenceReview.freshSourceCount,3);
 const prior=completeFreshHistory([f.task],f.sources,[f.coverage[0]])[0];assert.equal(prior.continuationEvidenceReview,undefined);
});
test("long or over-cap missing original evidence stays partial, never excerpt-trimmed into a claim of complete integration",()=>{
 const f=fixture();f.sources[4].body="A long original note with conditional and negated context. ".repeat(8);f.coverage[1]=f.result("fresh_remainder",f.sources.slice(1));
 const [t]=completeFreshHistory([f.task],f.sources,f.coverage);assert.equal(t.status,"partial");assert.equal(t.freshEvidenceMissing,true);assert.equal(t.continuationEvidenceReview.unrepresentedFreshSources,1);assert.equal(t.historyFacts.some(f=>f.source==="s5"),false);
 const capped=fixture();capped.task.historyFacts=Array.from({length:6},()=>({...capped.task.historyFacts[0]}));assert.equal(completeFreshHistory([capped.task],capped.sources,capped.coverage)[0].historyFacts.length,6);
});
test("negative, future and conflicting notes preserve complete exact original bodies and do not borrow affirmative fragments",()=>{
 const f=fixture();f.sources[4].body="If appetite changes, call the clinic. No appetite change occurred. A later correction disputed the original account.";f.coverage[1]=f.result("fresh_remainder",f.sources.slice(1));
 const [t]=completeFreshHistory([f.task],f.sources,f.coverage);assert.equal(t.historyFacts.find(f=>f.source==="s5").excerpt,f.sources[4].body);
});
test("non-continuation, missing scope, unresolved tasks do not gain synthetic history or treatment authority",()=>{
 const f=fixture();for(const patch of [{kind:"saved_content"},{missing:["pet"]},{status:"unresolved"}])assert.equal(completeFreshHistory([{...f.task,...patch}],f.sources,f.coverage)[0].continuationEvidenceReview,undefined);
});

test("clinical-policy rendering cannot gain automatic recovered history from the composition-only helper",()=>{
 const f=fixture(),answer={answer:"Contact the veterinarian.",sources:f.sources.map(s=>s.handle),quotes:[],validatedParts:[{index:0,text:"ignored"}],presentation:{sourceDates:[],contextRequired:false}};
 const out=renderTaskCompletion(answer,[f.task],f.sources,{active:true,decision:null,current:[],conditional:[]},f.coverage);
 assert.equal(out.answer.includes(f.sources[4].body),false);assert.deepEqual(out.continuationEvidenceReview,[]);
});
test("actual two-call core integrates a distinct fresh note even when independent source review labels all new notes routine",async()=>{
 const {createHash}=await import("node:crypto"),{runReadOnlyAsk}=await import("../app/lib/ask-read-only/core.mjs"),{decodeComponentSelection}=await import("../app/lib/ask-read-only/task-components.mjs"),{decodeClinicalSelection}=await import("../app/lib/ask-read-only/clinical-policy.mjs");
 const f=fixture(),pet={id:"owned-pet",ownerId:"owner",handle:"p1",name:"Willow",species:"cat"},old=f.sources[0];
 const ref={kind:"history",petId:pet.id,timeZone:"UTC",goal:"complete_set",from:"2024-01-01",to:"2024-12-31",recordedFrom:null,recordedTo:null,orderBy:"event",order:"asc",terms:[],limited:true,sources:[{id:old.id,hash:createHash("sha256").update(old.body).digest("hex"),eventAt:old.eventAt,recordedAt:old.recordedAt}],omittedRange:{axis:"event",from:"2024-03-15",to:"2024-06-15"}};
 const safety={medicationIntent:"none",referent:"clear",missingContext:[],careContext:"none",eventAssessments:[]},events=[];let physical=0,reads=0;
 const task={id:"t1",kind:"saved_continuation",needsHistory:true,needsOwnerFacts:false,includeSourceDates:true,recordMode:"collection",workflow:"none",pets:["p1"],reference:"r1",missing:[],combineHistory:true};
 const out=await runReadOnlyAsk({ownerId:"owner",selectedPetId:pet.id,pets:[pet],question:"Read the omitted interval and combine its findings with the earlier evidence.",dialogue:[],now:"2026-11-14T12:00:00Z",timeZone:"UTC",readReferences:{version:1,entries:[ref]}},{
  onAnswerBoundary:e=>events.push(e),
  read:async request=>{reads++;const selected=request.continuation?f.sources.slice(1):[old];return {sources:selected.map(s=>({...s,ownerId:"owner"})),hasMore:false,truncated:false,scopeExhausted:true,total:selected.length,inspected:selected.length,...(request.continuation?{continuationValidation:{valid:true,attempts:1,rawRows:1}}:{})};},
  provider:async(req,phase)=>{
   physical++;if(phase==="read_selection")return decodeComponentSelection({safety,reads:[{name:"read_remaining_records",arguments:{reference:"r1"}}],draft:"",historyIntent:{requested:true,timeBasis:"event",pet:"p1"},workflowIntent:"none",taskPlan:[task]},req.tools,req.context,decodeClinicalSelection);
   const catalog=req.SOURCE_CATALOG,all=catalog.map(s=>s.source),selected=catalog.filter(s=>s.body!==f.sources[4].body).map(s=>s.source),prior=catalog.find(s=>s.body===old.body),fresh=catalog.find(s=>s.body===f.sources[1].body);
   return {components:[{kind:"saved",text:"A generic partial overview.",sources:selected}],sources:selected,quotes:[],calculations:[],replyType:"answer",presentation:{sourceDates:[],contextRequired:false},clinicalReview:{assessment:safety,ownerStatementRefs:[],observationFields:[]},appHelp:{intent:"none",pet:null},
    evidenceCompletion:{sourceReview:{routine:all,noteworthy:[],uncertain:[],irrelevant:[]},missingReference:null},
    completion:[{task:"t1",status:"complete",reason:"none",componentIndexes:[0],sources:selected,ownerFacts:[],historyFacts:[{source:prior.source,excerpt:prior.body}],historySynthesis:[{topic:"usual appetite",evidence:[{source:fresh.source,excerpt:routine}]}]}]};
  }});
 assert.equal(physical,2);assert.equal(reads,2);assert.ok(out.answer.answer.includes(f.sources[4].body));assert.ok(out.answer.answer.includes(old.body));
 const composed=events.find(e=>e.outcome==="fresh_continuation_composed");assert.equal(composed.freshSourceCount,4);assert.equal(composed.representedFreshSources,4);assert.equal(composed.recoveredFacts,1);
 assert.equal(out.sources.length,5);assert.match(out.answer.answer,/Read from the omitted interval: 3 selected saved reports/);
});

test("requested fresh membership survives model-selected proof omission but an unmatched reference or pet cannot recover it",()=>{
 const f=fixture();f.task.sources=f.task.sources.filter(h=>h!=="s5");
 const [t]=completeFreshHistory([f.task],f.sources,f.coverage);assert.ok(t.sources.includes("s5"));assert.ok(t.freshRepresentedHandles.includes("s5"));
 for(const patch of [{reference:"r2"},{petHandle:"p2"}]){const bad=structuredClone(f.coverage);Object.assign(bad[1].scope,patch);assert.equal(completeFreshHistory([f.task],f.sources,bad)[0].continuationEvidenceReview,undefined);}
});
