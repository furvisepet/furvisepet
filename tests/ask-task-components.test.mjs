import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {runReadOnlyAsk,bindReadTool} from "../app/lib/ask-read-only/core.mjs";
import {decodeClinicalSelection} from "../app/lib/ask-read-only/clinical-policy.mjs";
import {decodeComponentSelection,componentSelectionSchema,reviewComponentCompletion,renderTaskCompletion} from "../app/lib/ask-read-only/task-components.mjs";
const pet={id:"private-pet-123456789",ownerId:"owned",name:"Willow",species:"cat"};
const source={kind:"history",id:"private-note-123456789",ownerId:"owned",petId:pet.id,body:"A routine exam recorded normal appetite at that time.",eventAt:"2021-03-12T12:00:00Z",recordedAt:"2021-03-14T12:00:00Z"};
const reference={version:1,entries:[{kind:"history",petId:pet.id,timeZone:"UTC",goal:"exact_quote",from:"2021-03-01",to:"2021-03-31",recordedFrom:null,recordedTo:null,orderBy:"event",order:"asc",terms:[],limited:false,sources:[{id:source.id,hash:createHash("sha256").update(source.body).digest("hex"),eventAt:source.eventAt,recordedAt:source.recordedAt}]}]};
const task=(extra={})=>({id:"t1",kind:"general_guidance",needsHistory:false,needsOwnerFacts:false,workflow:"none",pet:null,reference:null,missing:[],...extra});
const safety=(extra={})=>({medicationIntent:"none",referent:"clear",missingContext:[],careContext:"none",eventAssessments:[],...extra});
const completion=(extra={})=>({task:"t1",status:"complete",reason:"none",componentIndexes:[0],sources:[],ownerFacts:[],historyFacts:[],...extra});
const final=(s,extra={})=>({components:[{kind:"general",text:"An ordinary answer.",sources:[]}],quotes:[],sources:[],calculations:[],replyType:"answer",presentation:{sourceDates:[],contextRequired:false},clinicalReview:{assessment:s,ownerStatementRefs:[],observationFields:[]},appHelp:{intent:"none",pet:null},completion:[completion()],...extra});
async function execute(plan,s,output,extra={}){
 let calls=0,reads=[];const requests=[];
 const result=await runReadOnlyAsk({ownerId:"owned",selectedPetId:pet.id,pets:[pet],dialogue:[],question:"An unfamiliar question.",now:"2026-11-12T12:00:00Z",timeZone:"UTC",...extra},{
  provider:async(req,phase)=>{calls++;requests.push(req);return phase==="read_selection"?decodeComponentSelection({safety:s,reads:[],draft:"",historyIntent:{requested:plan.some(t=>t.needsHistory),timeBasis:"event",pet:null},workflowIntent:"find_care_note",taskPlan:plan},req.tools,req.context,decodeClinicalSelection):output;},
  read:async r=>{reads.push(r);return {sources:[source],total:1,hasMore:false,scopeExhausted:true};}
 });return {result,calls,reads,requests};
}
test("actual two-call core rehydrates selected prior evidence and composes a bounded vet brief",async()=>{
 const s=safety({medicationIntent:"decision",careContext:"vet_summary",missingContext:["medicine","prescription","vet_plan"]});
 const plan=[task({kind:"vet_brief",needsHistory:true,needsOwnerFacts:true,pet:"p1",reference:"r1"})];
 const out=final(s,{components:[{kind:"general",text:"Resume the old schedule; it is safest even with caveats.",sources:[]}],completion:[completion({sources:["s1"],ownerFacts:[{ref:"owner1",excerpt:"She ate less breakfast this morning."}],historyFacts:[{source:"s1",excerpt:source.body}]})]});
 const r=await execute(plan,s,out,{readReferences:reference,dialogue:[{role:"user",text:"She ate less breakfast this morning."}],question:"Prepare a short vet brief with that saved note."});
 assert.equal(r.calls,2);assert.equal(r.reads.length,1);assert.deepEqual(r.reads[0].sourceIds,[source.id]);
 assert.match(r.result.answer.answer,/Vet brief/);assert.match(r.result.answer.answer,/She ate less breakfast/);assert.match(r.result.answer.answer,/2021-03-12/);assert.match(r.result.answer.answer,/2021-03-14/);
 assert.match(r.result.answer.answer,/prescribing veterinarian promptly/);assert.doesNotMatch(r.result.answer.answer,/Resume the old|safest even/);assert.deepEqual(r.result.answer.sources,["s1"]);
 assert.equal(r.result.answer.taskCompletion[0].status,"complete");
});
test("unmatched fact excerpts are omitted with component-level limitation, never fabricated or blank whole reply",()=>{
 const p=[task({kind:"vet_brief",needsHistory:true})];
 const r=reviewComponentCompletion({...final(safety()),completion:[completion({historyFacts:[{source:"s1",excerpt:"Invented corrected diagnosis"}]})]},p,[{...source,handle:"s1"}],[],[]);
 assert.equal(r.tasks[0].historyFacts.length,0);assert.notEqual(r.tasks[0].status,"complete");
 const a=renderTaskCompletion({answer:"Safe available help.",sources:[],presentation:{}},r.tasks,[{...source,handle:"s1"}],{active:true});
 assert.doesNotMatch(a.answer,/Invented corrected/);assert.match(a.answer,/remains unresolved/);
});
test("pet/year ambiguity produces one pointed question and cannot become History navigation",async()=>{
 const s=safety({referent:"essential_unknown",missingContext:["pet","date"]});
 const r=await execute([task({kind:"saved_content",needsHistory:true,missing:["pet","year"]})],s,final(s,{appHelp:{intent:"find_care_note",pet:null},completion:[completion({status:"unresolved",reason:"missing_context"})]}));
 assert.equal(r.reads.length,0);assert.equal(r.result.answer.answer,"Which pet and year should I use?");assert.equal(r.result.answer.replyType,"clarification");
});
test("explicit photo workflow uses verified text-note workaround despite conflicting final workflow mode",async()=>{
 const s=safety(),r=await execute([task({kind:"workflow",workflow:"care_photo_attachment"})],s,final(s,{appHelp:{intent:"other",pet:null},completion:[completion({componentIndexes:[]})]}));
 assert.match(r.result.answer.answer,/text-only/);assert.match(r.result.answer.answer,/Something worth remembering/);assert.match(r.result.answer.answer,/REMEMBER/);assert.match(r.result.answer.answer,/cannot upload, save/);
});
test("ordinary guidance cannot acquire app help from either pass",async()=>{
 const s=safety(),r=await execute([task()],s,final(s,{appHelp:{intent:"find_care_note",pet:null}}));
 assert.equal(r.result.answer.answer,"An ordinary answer.");assert.equal(r.reads.length,0);assert.equal(r.result.answer.limited,false);
});
test("component clarification cannot displace current emergency handoff",async()=>{
 const s=safety({careContext:"current_concern",eventAssessments:[{event:"breathing_distress",occurrence:"current",ownerStatementRef:"owner1"}]});
 const r=await execute([task({kind:"clarification",missing:["pet"]})],s,final(s,{completion:[completion({status:"unresolved",reason:"missing_context"})]}),{question:"An animal is struggling to breathe right now."});
 assert.match(r.result.answer.answer,/^Contact an emergency veterinarian now/);assert.equal(r.reads.length,0);
});
test("continuation is a bounded fresh omitted-window query without old source-ID restriction",()=>{
 const owned={...pet,handle:"p1"};const request={kind:"history",pet:owned,from:"2020-01-01",to:"2022-12-31",recordedFrom:null,recordedTo:null,terms:[],goal:"complete_set",orderBy:"event",sourceIds:[source.id],expectedSources:[source],referenceLimited:true,omittedEventRange:{from:"2022-09-15",to:"2022-12-15"}};
 const bound=bindReadTool("read_remaining_records",{reference:"r1"},[owned],[{handle:"r1",request}]);
 assert.equal(bound.from,"2022-09-15");assert.equal(bound.to,"2022-12-15");assert.equal(bound.sourceIds,undefined);assert.equal(bound.expectedSources,undefined);assert.equal(bound.referenceLimited,undefined);assert.equal(bound.pet.ownerId,"owned");
});
test("strict plan source/pet reference mismatch is rejected before rehydration",()=>{
 const ctx={pets:[{handle:"p1"},{handle:"p2"}],references:[{reference:"r1",petHandle:"p1"}]};
 assert.throws(()=>decodeComponentSelection({taskPlan:[task({kind:"vet_brief",needsHistory:true,pet:"p2",reference:"r1"})]},[],ctx,()=>({})),/COMPONENT_CONTRACT/);
 const schema=componentSelectionSchema({properties:{},required:[]},ctx);assert.ok(schema.required.includes("taskPlan"));
});

test("fact extraction cannot drop a sentence's negation or attribution",()=>{
 const body="The veterinarian did not approve restarting the medicine.";
 const r=reviewComponentCompletion({...final(safety()),completion:[completion({historyFacts:[{source:"s1",excerpt:"restarting the medicine"}]})]},[task({kind:"vet_brief",needsHistory:true})],[{...source,handle:"s1",body}],[],[]);
 assert.equal(r.tasks[0].historyFacts.length,0);assert.notEqual(r.tasks[0].status,"complete");
});

test("missing clinical authority does not block independently specified historical rehydration",async()=>{
 const s=safety({medicationIntent:"decision",referent:"essential_unknown",careContext:"vet_summary",missingContext:["medicine","prescription"]});
 const r=await execute([task({kind:"vet_brief",needsHistory:true,pet:"p1",reference:"r1",missing:["medicine"]})],s,final(s,{completion:[completion({historyFacts:[{source:"s1",excerpt:source.body}]})]}),{readReferences:reference});
 assert.equal(r.reads.length,1);assert.match(r.result.answer.answer,/routine exam/);assert.match(r.result.answer.answer,/prescribing veterinarian promptly/);
});

test("complete-set omissions and missing server arithmetic remain component-level partials",()=>{
 const p=[{...task({kind:"saved_content",needsHistory:true}),status:"complete",reason:"none",sources:["s1"],historyFacts:[],ownerFacts:[]}];
 const a=renderTaskCompletion({answer:"Available saved facts.",sources:["s1"],calculations:[],presentation:{}},p,[{...source,handle:"s1"}],null,[{scope:{goal:"complete_set"},sources:[{source:"s1"}],omitted:4}]);
 assert.equal(a.taskCompletion[0].status,"partial");assert.equal(a.taskCompletion[0].reason,"source_omitted");
 const b=renderTaskCompletion({answer:"Other useful facts.",calculations:[],presentation:{}},[{...p[0],kind:"calculation"}],[],null);
 assert.equal(b.taskCompletion[0].status,"unresolved");
});

test("withheld free prose cannot masquerade as a completed component in a bounded clinical answer",()=>{
 const t={...task(),status:"complete",reason:"none",sources:[],historyFacts:[],ownerFacts:[]};
 const a=renderTaskCompletion({answer:"Contact the prescribing veterinarian promptly.",quotes:[],calculations:[],presentation:{}},[t],[],{active:true,decision:true});
 assert.equal(a.taskCompletion[0].status,"partial");assert.match(a.answer,/General guidance:.*not been completed/);assert.equal(a.limited,true);
});
