import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {runReadOnlyAsk,bindReadTool,validateReadOnlyAnswer} from "../app/lib/ask-read-only/core.mjs";
import {decodeClinicalSelection} from "../app/lib/ask-read-only/clinical-policy.mjs";
import {decodeComponentSelection,componentSelectionSchema,reviewComponentCompletion,renderTaskCompletion,validateTaskPlan,ownerFactSentences,fulfillReferenceReads} from "../app/lib/ask-read-only/task-components.mjs";
const pet={id:"private-pet-123456789",ownerId:"owned",name:"Willow",species:"cat"};
const source={kind:"history",id:"private-note-123456789",ownerId:"owned",petId:pet.id,body:"A routine exam recorded normal appetite at that time.",eventAt:"2021-03-12T12:00:00Z",recordedAt:"2021-03-14T12:00:00Z"};
const reference={version:1,entries:[{kind:"history",petId:pet.id,timeZone:"UTC",goal:"exact_quote",from:"2021-03-01",to:"2021-03-31",recordedFrom:null,recordedTo:null,orderBy:"event",order:"asc",terms:[],limited:false,sources:[{id:source.id,hash:createHash("sha256").update(source.body).digest("hex"),eventAt:source.eventAt,recordedAt:source.recordedAt}]}]};
const task=(extra={})=>({recordMode:extra.needsHistory?(extra.kind==="saved_continuation"?"collection":"single"):"none",id:"t1",kind:"general_guidance",needsHistory:false,needsOwnerFacts:false,includeSourceDates:false,workflow:"none",pets:[],reference:null,missing:[],...extra});
const safety=(extra={})=>({medicationIntent:"none",referent:"clear",missingContext:[],careContext:"none",eventAssessments:[],...extra});
const completion=(extra={})=>({task:"t1",status:"complete",reason:"none",componentIndexes:[0],sources:[],ownerFacts:[],historyFacts:[],...extra});
const final=(s,extra={})=>({components:[{kind:"general",text:"An ordinary answer.",sources:[]}],quotes:[],sources:[],calculations:[],replyType:"answer",presentation:{sourceDates:[],contextRequired:false},clinicalReview:{assessment:s,ownerStatementRefs:[],observationFields:[]},appHelp:{intent:"none",pet:null},completion:[completion()],...extra});
async function execute(plan,s,output,extra={},plannedReads=[],readRows=[source]){
 let calls=0,reads=[];const requests=[];
 const result=await runReadOnlyAsk({ownerId:"owned",selectedPetId:pet.id,pets:[pet],dialogue:[],question:plan.some(t=>t.kind==="workflow")?"How do I enter a photo into a Furvise care note?":"An unfamiliar question.",now:"2026-11-12T12:00:00Z",timeZone:"UTC",...extra},{
  provider:async(req,phase)=>{calls++;requests.push(req);return phase==="read_selection"?decodeComponentSelection({safety:s,reads:plannedReads,draft:"",historyIntent:{requested:plan.some(t=>t.needsHistory),timeBasis:"event",pet:null},workflowIntent:extra.workflowIntent??"find_care_note",taskPlan:plan},req.tools,req.context,decodeClinicalSelection):(typeof output==="function"?output(req):output);},
  read:async r=>{reads.push(r);const rows=typeof readRows==="function"?readRows(r):readRows;return {sources:rows,total:rows.length,hasMore:false,scopeExhausted:true};}
 });return {result,calls,reads,requests};
}
test("actual two-call core rehydrates selected prior evidence and composes a bounded vet brief",async()=>{
 const s=safety({medicationIntent:"decision",careContext:"vet_summary",missingContext:["medicine","prescription","vet_plan"]});
 const plan=[task({kind:"vet_brief",needsHistory:true,needsOwnerFacts:true,pets:["p1"],reference:"r1"})];
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
 assert.throws(()=>decodeComponentSelection({taskPlan:[task({kind:"vet_brief",needsHistory:true,pets:["p2"],reference:"r1"})]},[],ctx,()=>({})),/COMPONENT_CONTRACT/);
 const schema=componentSelectionSchema({properties:{},required:[]},ctx);assert.ok(schema.required.includes("taskPlan"));
});

test("fact extraction cannot drop a sentence's negation or attribution",()=>{
 const body="The veterinarian did not approve restarting the medicine.";
 const r=reviewComponentCompletion({...final(safety()),completion:[completion({historyFacts:[{source:"s1",excerpt:"restarting the medicine"}]})]},[task({kind:"vet_brief",needsHistory:true})],[{...source,handle:"s1",body}],[],[]);
 assert.equal(r.tasks[0].historyFacts.length,0);assert.notEqual(r.tasks[0].status,"complete");
});

test("missing clinical authority does not block independently specified historical rehydration",async()=>{
 const s=safety({medicationIntent:"decision",referent:"essential_unknown",careContext:"vet_summary",missingContext:["medicine","prescription"]});
 const r=await execute([task({kind:"vet_brief",needsHistory:true,pets:["p1"],reference:"r1",missing:["medicine"]})],s,final(s,{completion:[completion({historyFacts:[{source:"s1",excerpt:source.body}]})]}),{readReferences:reference});
 assert.equal(r.reads.length,1);assert.match(r.result.answer.answer,/routine exam/);assert.match(r.result.answer.answer,/prescribing veterinarian promptly/);
});

test("complete-set omissions and missing server arithmetic remain component-level partials",()=>{
 const p=[{...task({kind:"saved_content",needsHistory:true,recordMode:"collection"}),status:"complete",reason:"none",sources:["s1"],historyFacts:[],ownerFacts:[]}];
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

test("one comparison task can bind multiple owned pets without losing typed arithmetic",async()=>{
 const second={...pet,id:"second-private-pet-123456",name:"Rowan"};
 const rows=[{...source,body:"Willow weighed 4 kg."},{...source,id:"second-private-source-123456",petId:second.id,body:"Rowan weighed 5 kg."}];let count=0,reads=0;
 const s=safety();
 const plan=[task({kind:"calculation",needsHistory:true,pets:["p1","p2"]})];
 const result=await runReadOnlyAsk({ownerId:"owned",selectedPetId:pet.id,pets:[pet,second],dialogue:[],question:"Compare the two saved weight measurements.",now:"2026-11-12T12:00:00Z",timeZone:"UTC"},{provider:async(req,phase)=>{
  count++;if(phase==="read_selection")return decodeComponentSelection({safety:s,reads:["p1","p2"].map(pet=>({name:"search_saved_records",arguments:{pet,from:"2021-03-01",to:"2021-03-31",query:null,offset:0,order:"asc",goal:"comparison",alternatives:[],recordedFrom:null,recordedTo:null,orderBy:"event"}})),draft:"",historyIntent:{requested:true,timeBasis:"event",pet:null},workflowIntent:"none",taskPlan:plan},req.tools,req.context,decodeClinicalSelection);
  return final(s,{components:[{kind:"saved",text:"These are the two saved weight measurements, not a current assessment.",sources:["s1","s2"]}],sources:["s1","s2"],calculations:[{operation:"absolute_difference",timeBasis:"event",operands:["s1:m1","s2:m1"]}],completion:[completion({sources:["s1","s2"]})]});
 },read:async request=>{reads++;return {sources:[rows.find(r=>r.petId===request.pet.id)],total:1,scopeExhausted:true};}});
 assert.equal(count,2);assert.equal(reads,2);assert.equal(result.answer.calculations[0].value,1);assert.equal(result.answer.calculations[0].unit,"kg");assert.equal(result.answer.taskCompletion[0].status,"complete");
});

test("source dates follow the requested task instead of unsolicited footer selection or a fixed four-date cutoff",()=>{
 const sources=Array.from({length:5},(_,i)=>({...source,handle:"s"+(i+1),petName:"Willow"}));
 const t={...task({kind:"saved_content",needsHistory:true}),status:"complete",reason:"none",componentIndexes:[],sources:sources.map(s=>s.handle),historyFacts:[],ownerFacts:[]};
 const base={answer:"The available facts.",quotes:[],calculations:[],presentation:{sourceDates:[{eventAt:"unsolicited"}]}};
 assert.equal(renderTaskCompletion(base,[t],sources,null).presentation.sourceDates.length,0);
 assert.equal(renderTaskCompletion(base,[{...t,includeSourceDates:true}],sources,null).presentation.sourceDates.length,5);
});

test("a missing record task cannot publish unsupported record prose or erase an independent general answer",async()=>{
 const s=safety();const plan=[task({kind:"saved_content",needsHistory:true,pets:["p1"]}),task({id:"t2"})];
 const r=await execute(plan,s,final(s,{components:[{kind:"general",text:"The missing saved note recorded a new diagnosis.",sources:[]},{kind:"general",text:"Rainbows separate sunlight into colours.",sources:[]}],completion:[completion(),completion({task:"t2",componentIndexes:[1]})]}));
 assert.equal(r.reads.length,0);assert.doesNotMatch(r.result.answer.answer,/recorded a new diagnosis/);assert.match(r.result.answer.answer,/Rainbows separate/);assert.match(r.result.answer.answer,/I don't have verified saved information/);assert.equal(r.result.answer.taskCompletion[0].status,"unresolved");assert.equal(r.result.answer.taskCompletion[1].status,"complete");
});

test("mixed workflow help uses registry text, never model-invented controls, while keeping independent content",async()=>{
 const s=safety(),plan=[task({kind:"workflow",workflow:"care_photo_attachment"}),task({id:"t2"})];
 const r=await execute(plan,s,final(s,{components:[{kind:"general",text:"Use the Imaginary Image Vault button.",sources:[]},{kind:"general",text:"Keep routines predictable.",sources:[]}],completion:[completion(),completion({task:"t2",componentIndexes:[1]})]}));
 assert.doesNotMatch(r.result.answer.answer,/Imaginary Image Vault/);assert.match(r.result.answer.answer,/Keep routines predictable/);assert.match(r.result.answer.answer,/Something worth remembering/);assert.equal(r.result.answer.taskCompletion[0].status,"complete");assert.equal(r.result.answer.taskCompletion[1].status,"complete");
});

const boundedRead=[{name:"search_saved_records",arguments:{pet:"p1",from:"2021-03-01",to:"2021-03-31",query:null,offset:0,order:"asc",goal:"exact_quote",alternatives:[],recordedFrom:null,recordedTo:null,orderBy:"event"}}];
test("record-choice ambiguity permits bounded owned discovery and resolves only its unique admitted candidate",async()=>{
 const s=safety(),plan=[task({kind:"saved_content",needsHistory:true,pets:["p1"],missing:["which_record"]})];
 const saved=final(s,{components:[{kind:"saved",text:"The original note follows.",sources:["s1"]}],sources:["s1"],quotes:["s1"],completion:[completion({sources:["s1"]})]});
 const r=await execute(plan,s,req=>req.SOURCE_CATALOG.length?saved:final(s,{completion:[completion({status:"unresolved",reason:"source_unavailable"})]}),{},boundedRead);
 assert.equal(r.calls,2);assert.equal(r.reads.length,1);assert.equal(r.result.answer.taskCompletion[0].status,"complete");assert.equal(r.result.answer.quotes[0].quote,source.body);assert.doesNotMatch(r.result.answer.answer,/Which/);
});
test("multiple discovered candidates retain one record clarification rather than guessing",async()=>{
 const s=safety(),plan=[task({kind:"saved_content",needsHistory:true,pets:["p1"],missing:["which_record"]})];
 const r=await execute(plan,s,final(s,{sources:["s1","s2"],completion:[completion({status:"unresolved",reason:"missing_context",sources:["s1","s2"]})]}),{},boundedRead,[source,{...source,id:"second-choice-private-id",body:"A different historical observation was saved."}]);
 assert.equal(r.reads.length,1);assert.equal(r.result.answer.replyType,"clarification");assert.equal(r.result.answer.answer,"Which saved result should I use?");assert.equal(r.result.answer.taskCompletion[0].status,"unresolved");
});
test("record-choice ambiguity does not authorize an unbounded history scan",async()=>{
 const s=safety(),plan=[task({kind:"saved_content",needsHistory:true,pets:["p1"],missing:["which_record"]})];
 const reads=[{...boundedRead[0],arguments:{...boundedRead[0].arguments,from:null,to:null}}];
 const r=await execute(plan,s,final(s,{completion:[completion({status:"unresolved",reason:"missing_context"})]}),{},reads);
 assert.equal(r.reads.length,0);assert.equal(r.result.answer.answer,"Which saved result should I use?");
});

test("duplicate bounded discovery reads resolve one shared record, not two apparent choices",async()=>{
 const s=safety(),plan=[task({kind:"saved_content",needsHistory:true,pets:["p1"],missing:["which_record"]})];
 const saved=final(s,{components:[{kind:"saved",text:"The original note follows.",sources:["s1"]}],sources:["s1"],quotes:["s1"],completion:[completion({sources:["s1"]})]});
 const reads=[...boundedRead,{...boundedRead[0],arguments:{...boundedRead[0].arguments,orderBy:"recorded"}}];
 const r=await execute(plan,s,saved,{},reads);
 assert.equal(r.calls,2);assert.equal(r.reads.length,2);assert.equal(r.result.answer.taskCompletion[0].status,"complete");assert.doesNotMatch(r.result.answer.answer,/Which/);assert.equal(r.result.sources.length,1);
});

test("whole contiguous multi-sentence historical excerpts complete a brief without losing attribution",()=>{
 const body="The owner reported a change. No diagnosis was recorded.",admitted={...source,handle:"s1",body};
 const plan=[task({kind:"vet_brief",needsHistory:true,pets:["p1"]})];
 const out=reviewComponentCompletion(final(safety(),{sources:["s1"],completion:[completion({sources:["s1"],historyFacts:[{source:"s1",excerpt:body}]})]}),plan,[admitted],[],[{...pet,handle:"p1"}]);
 assert.equal(out.tasks[0].status,"complete");assert.equal(out.tasks[0].historyFacts[0].excerpt,body);
 for(const excerpt of ["reported a change.","The owner reported a change. A diagnosis was recorded."]){
  const rejected=reviewComponentCompletion(final(safety(),{sources:["s1"],completion:[completion({sources:["s1"],historyFacts:[{source:"s1",excerpt}]})]}),plan,[admitted],[],[{...pet,handle:"p1"}]);
  assert.equal(rejected.tasks[0].status,"partial");assert.equal(rejected.tasks[0].historyFacts.length,0);
 }
});
test("authoritative scoped saved task can recover absent discovery despite a redundant date flag",async()=>{
 const s=safety({missingContext:["date"]}),plan=[task({kind:"saved_content",needsHistory:true,pets:["p1"],missing:["which_record"]})];
 const saved=final(safety(),{components:[{kind:"saved",text:"The original note follows.",sources:["s1"]}],sources:["s1"],quotes:["s1"],completion:[completion({sources:["s1"]})]});
 const r=await execute(plan,s,saved,{question:"Please use Willow's March 2021 note."});
 assert.equal(r.reads.length,1);assert.equal(r.reads[0].from,"2021-03-01");assert.equal(r.reads[0].to,"2021-03-31");assert.equal(r.result.answer.taskCompletion[0].status,"complete");
 const ambiguous=await execute(plan,s,final(s,{completion:[completion({status:"unresolved",reason:"missing_context"})]}),{question:"Please use her March note."});
 assert.equal(ambiguous.reads.length,0);
});


test("collection integration rehydrates contained continuation result but never foreign or wider result",()=>{
 const outer={kind:"history",goal:"complete_set",pet:{id:"pet",ownerId:"owner"},from:"2019-01-01",to:"2021-12-31",recordedFrom:null,recordedTo:null,terms:[],referenceTimeZone:"UTC"};
 const refs=[{handle:"r1",request:outer},{handle:"r2",request:{...outer,from:"2021-09-01"}},{handle:"r3",request:{...outer,pet:{id:"other",ownerId:"owner"}}},{handle:"r4",request:{...outer,from:"2018-01-01"}}];
 const first={calls:[],taskPlan:[task({needsHistory:true,recordMode:"collection",reference:"r1",pets:["p1"]})]};
 assert.deepEqual(fulfillReferenceReads(first,refs).calls.map(c=>JSON.parse(c.arguments).reference),["r1","r2"]);
 first.taskPlan[0].recordMode="single";assert.equal(fulfillReferenceReads(first,refs).calls.length,1);
});
test("retained collection subset remains partial despite model complete declaration",()=>{
 const t={...task({kind:"saved_content",needsHistory:true,recordMode:"collection"}),status:"complete",reason:"none",sources:["s1"],componentIndexes:[0],historyFacts:[],ownerFacts:[]};
 const a=renderTaskCompletion({answer:"Selected reports.",validatedParts:[{index:0,text:"Selected reports."}],calculations:[],presentation:{}},[t],[{...source,handle:"s1"}],null,[{scope:{goal:"complete_set"},sources:[{source:"s1"}],unmet:["prior_source_selection_omitted"]}]);
 assert.equal(a.taskCompletion[0].reason,"source_omitted");assert.equal(a.taskCompletion[0].status,"partial");
});
test("calculation prose yields to deterministic result without removing independent general answer",()=>{
 const base={...task(),status:"complete",reason:"none",sources:[],historyFacts:[],ownerFacts:[]};
 const a=renderTaskCompletion({answer:"Wrong rounded arithmetic. Useful separate guidance.",validatedParts:[{index:0,text:"Wrong rounded arithmetic."},{index:1,text:"Useful separate guidance."}],calculations:[{available:true,sourceHandles:["s1"],text:"Verified arithmetic."}],presentation:{}},[{...base,kind:"calculation",needsHistory:true,recordMode:"single",sources:["s1"],componentIndexes:[0]},{...base,id:"t2",componentIndexes:[1]}],[{...source,handle:"s1"}],null,[]);
 assert.equal(a.answer,"Useful separate guidance.");assert.equal(a.calculations.length,1);
});
test("scope correction cannot complete owner-observation facts in brief",()=>{
 const p=[task({kind:"vet_brief",needsOwnerFacts:true})];const f=final(safety(),{completion:[completion({ownerFacts:[{ref:"owner1",kind:"scope_correction",excerpt:"I meant the other animal."}]})]});
 const r=reviewComponentCompletion(f,p,[],[{ref:"owner1",text:"I meant the other animal."}],[]);
 assert.equal(r.tasks[0].ownerFacts.length,0);assert.equal(r.tasks[0].status,"partial");
});


test("owner observation sentence handles publish exact whole attributed text without model retyping",()=>{
 const statements=[{ref:"owner1",text:"I meant the other animal. She did not miss medicine; I only misplaced the diary. Please prepare a brief."}];
 const sentences=ownerFactSentences(statements);assert.equal(sentences.length,3);
 const p=[task({kind:"vet_brief",needsOwnerFacts:true})];
 const f=final(safety(),{completion:[completion({ownerFacts:[{sentence:"owner1:sentence1",kind:"scope_correction"},{sentence:"owner1:sentence2",kind:"present_observation"}]})]});
 const r=reviewComponentCompletion(f,p,[],statements,[]);assert.deepEqual(r.tasks[0].ownerFacts,[{ref:"owner1",kind:"present_observation",excerpt:"She did not miss medicine; I only misplaced the diary."}]);
 const forged=final(safety(),{completion:[completion({ownerFacts:[{sentence:"owner9:sentence1",kind:"present_observation"}]})]});assert.throws(()=>reviewComponentCompletion(forged,p,[],statements,[]),/COMPONENT_CONTRACT/);
});


test("ordinary plans and constraints cannot be blocked by an observation-excerpt dependency",()=>{
 const ctx={pets:[{handle:"p1"}],references:[]};
 const t=task({kind:"general_guidance",needsOwnerFacts:true,missing:["owner_observation"]});
 const p=validateTaskPlan([t],ctx);assert.equal(p[0].needsOwnerFacts,false);assert.deepEqual(p[0].missing,[]);
 const reviewed=reviewComponentCompletion(final(safety()),p,[],[],[]);assert.equal(reviewed.tasks[0].status,"complete");
 const a=renderTaskCompletion({answer:"A useful plan.",validatedParts:[{index:0,text:"A useful plan."}],presentation:{}},reviewed.tasks,[],null);assert.equal(a.answer,"A useful plan.");
 const brief=validateTaskPlan([task({kind:"vet_brief",needsOwnerFacts:true})],ctx);assert.equal(brief[0].needsOwnerFacts,true);
});

test("a collection read cannot erase an independent single-record choice for the same pet",async()=>{
 const s=safety(),plan=[
  task({kind:"saved_content",needsHistory:true,recordMode:"collection",pets:["p1"]}),
  task({id:"t2",kind:"saved_content",needsHistory:true,recordMode:"single",pets:["p1"],missing:["which_record"]})
 ];
 const out=final(s,{components:[
  {kind:"saved",text:"The supplied reports describe routine historical observations.",sources:["s1","s2"]},
  {kind:"saved",text:"The unspecified single note was chosen automatically.",sources:["s1"]}
 ],sources:["s1","s2"],completion:[
  completion({sources:["s1","s2"]}),
  completion({task:"t2",componentIndexes:[1],sources:["s1"]})
 ]});
 const r=await execute(plan,s,out,{},[{...boundedRead[0],arguments:{...boundedRead[0].arguments,goal:"complete_set"}}],
  [source,{...source,id:"other-note-private-123456",body:"A second routine historical report was saved."}]);
 assert.equal(r.reads.length,1);
 assert.equal(r.result.answer.taskCompletion[0].status,"complete");
 assert.equal(r.result.answer.taskCompletion[1].status,"unresolved");
 assert.match(r.result.answer.answer,/supplied reports/);
 assert.match(r.result.answer.answer,/Which saved result/);
 assert.doesNotMatch(r.result.answer.answer,/chosen automatically/);
});

test("retained reference limits are not mislabeled as a new body-admission overflow",()=>{
 const sources=[{...source,handle:"s1",petName:"Willow"}];
 const t={...task({kind:"saved_content",needsHistory:true,recordMode:"collection",pets:["p1"]}),status:"complete",reason:"none",componentIndexes:[],sources:["s1"],historyFacts:[],ownerFacts:[]};
 const coverage=[{scope:{goal:"complete_set"},sources:[{source:"s1"}],omitted:0,hasMore:false,hasPrevious:false,truncated:false,unmet:["prior_source_selection_omitted"]}];
 const a=renderTaskCompletion({answer:"Available historical observations.",quotes:[],calculations:[],presentation:{}},[t],sources,null,coverage);
 assert.equal(a.taskCompletion[0].status,"partial");
 assert.match(a.answer,/retained from an earlier result/);
 assert.doesNotMatch(a.answer,/omitted by the evidence limit/);
 const b=renderTaskCompletion({answer:"Available historical observations.",quotes:[],calculations:[],presentation:{}},[t],sources,null,[{...coverage[0],omitted:2}]);
 assert.match(b.answer,/omitted by the evidence limit/);
});

test("collection calendar details come only from the bound exact source while synthesis survives",()=>{
 const s={...source,handle:"s1",petName:"Willow",body:"The usual measured diet was continued."};
 const t={...task({kind:"saved_content",needsHistory:true,recordMode:"collection",pets:["p1"],includeSourceDates:true}),
  status:"complete",reason:"none",componentIndexes:[0],sources:["s1"],ownerFacts:[],
  historyFacts:[{source:"s1",excerpt:s.body}]};
 const a=renderTaskCompletion({answer:"",validatedParts:[{index:0,text:"The reports describe a steady routine. An April entry recorded the measured diet."}],quotes:[],calculations:[],presentation:{}},[t],[s],null);
 assert.match(a.answer,/steady routine/);assert.doesNotMatch(a.answer,/April/);
 assert.match(a.answer,/event 2021-03-12; recorded 2021-03-14/);
 assert.match(a.answer,/The usual measured diet was continued/);
 const b=renderTaskCompletion({answer:"",validatedParts:[{index:0,text:"An April entry recorded the measured diet."}],quotes:[],calculations:[],presentation:{}},[{...t,historyFacts:[]}],[s],null);
 assert.equal(b.taskCompletion[0].status,"partial");assert.match(b.answer,/couldn't verify/);assert.doesNotMatch(b.answer,/April/);
});

test("inline source references use compact visible source order without unsolicited timestamps",()=>{
 const rows=[{...source,handle:"s1",petName:"Willow"},{...source,id:"another-private-note",handle:"s2",petName:"Willow"}];
 const a=validateReadOnlyAnswer({components:[{kind:"saved",text:"See s2.",sources:["s2"]}],sources:["s2"],quotes:[],calculations:[],replyType:"answer",presentation:{sourceDates:[],contextRequired:false}},rows,"Show the note.");
 assert.equal(a.answer,"See saved note 1.");assert.doesNotMatch(a.answer,/2021|T12/);
});

test("calendar label repair preserves synthesis within the same sentence and lowercase modal may",()=>{
 const s={...source,handle:"s1",petName:"Willow"};
 const t={...task({kind:"saved_content",needsHistory:true,recordMode:"collection",pets:["p1"]}),
  status:"complete",reason:"none",componentIndexes:[0],sources:["s1"],ownerFacts:[],historyFacts:[{source:"s1",excerpt:s.body}]};
 const r=renderTaskCompletion({answer:"",validatedParts:[{index:0,text:"Across 2020–2022, the notes describe a stable routine that may vary slightly."}],quotes:[],calculations:[],presentation:{}},[t],[s],null);
 assert.match(r.answer,/stable routine that may vary slightly/);
 assert.doesNotMatch(r.answer,/2020|2022/);
});

test("current no-workflow discriminator prevents stale app task replacing a returned routine",async()=>{
 const s=safety(),r=await execute([task({kind:"workflow",workflow:"care_photo_attachment"})],s,req=>{
  assert.equal(req.context.taskPlan[0].kind,"general_guidance");
  assert.equal(req.draft,"");
  return final(s,{components:[{kind:"general",text:"Use the revised three-minute quiet settling routine without food or jumping.",sources:[]}],appHelp:{intent:"care_photo_attachment",pet:"p1"}});
 },{workflowIntent:"none",question:"Return to the latest settling routine after our detour."});
 assert.match(r.result.answer.answer,/three-minute quiet/);
 assert.doesNotMatch(r.result.answer.answer,/Today|photo|Something worth remembering/);
 assert.equal(r.result.answer.taskCompletion[0].kind,"general_guidance");
});
test("app instructions bind explicit owned pet rather than stale UI selection",async()=>{
 const {renderAppWorkflow}=await import("../app/lib/ask-read-only/app-capabilities.mjs");
 const pets=[{handle:"p1",name:"Willow"},{handle:"p2",name:"Rowan"}];
 const a=renderAppWorkflow({answer:"",presentation:{}},{intent:"care_photo_attachment",pet:"p1"},pets,false,"How can I put Rowan's photo into a care note?");
 assert.match(a.answer,/choose Rowan/);assert.doesNotMatch(a.answer,/choose Willow/);
 const b=renderAppWorkflow({answer:"",presentation:{}},{intent:"create_care_note",pet:"p1"},pets,false,"Willow and Rowan both need notes.");
 assert.match(b.answer,/choose the intended pet/);
});

test("prior workflow agreement cannot authorize controls for an unrelated current routine",async()=>{
 const s=safety(),r=await execute([task({kind:"workflow",workflow:"create_care_note"})],s,req=>{
  assert.equal(req.context.taskPlan[0].workflow,"none");
  return final(s,{components:[{kind:"general",text:"Use the latest three-minute silent routine.",sources:[]}],appHelp:{intent:"create_care_note",pet:"p1"}});
 },{workflowIntent:"create_care_note",question:"Give Willow a six-minute quiet settling routine beside me, without food or stairs."});
 assert.match(r.result.answer.answer,/three-minute silent/);assert.doesNotMatch(r.result.answer.answer,/Open Today|REMEMBER/);
});

test("collection synthesis removes calendar labels and generated counts without placeholder prose",()=>{
 const s={...source,handle:"s1",petName:"Willow"};
 const t={...task({kind:"saved_content",needsHistory:true,recordMode:"collection",pets:["p1"]}),status:"complete",reason:"none",componentIndexes:[0],sources:["s1"],ownerFacts:[],historyFacts:[{source:"s1",excerpt:s.body}]};
 const text="Willow’s 2017–2019 record shows a steady routine that may vary slightly. The exception was mild scratching in May 2018. I was able to use 36 saved entries, but four notes were omitted. Weight edges upward from September to December 2019.";
 const r=renderTaskCompletion({answer:"",validatedParts:[{index:0,text}],quotes:[],calculations:[],presentation:{}},[t],[s],null);
 const overview=r.answer.split("Selected dated historical details:")[0];
 assert.match(overview,/Willow’s record shows a steady routine that may vary slightly/);
 assert.match(overview,/exception was mild scratching/);
 assert.doesNotMatch(overview,/saved period|requested period|2017|2019|May|September|December|36 saved entries|four notes/);
});

test("calendar qualifier and list removal keeps clean sentence grammar",()=>{
 const s={...source,handle:"s1",petName:"Willow"};
 const t={...task({kind:"saved_content",needsHistory:true,recordMode:"collection",pets:["p1"]}),status:"complete",reason:"none",componentIndexes:[0],sources:["s1"],ownerFacts:[],historyFacts:[{source:"s1",excerpt:s.body}]};
 const text="Willow’s saved care record through mid-2020 reads like steady preventive care. Stool became more consistent. In late 2020, the notes continue that theme, including monthly care checks in September, October, and November, and a nutrition review.";
 const r=renderTaskCompletion({answer:"",validatedParts:[{index:0,text}],quotes:[],calculations:[],presentation:{}},[t],[s],null);
 const overview=r.answer.split("Selected dated historical details:")[0];
 assert.match(overview,/record reads like steady/);
 assert.match(overview,/consistent\. The notes continue/);
 assert.match(overview,/monthly care checks and a nutrition review/);
 assert.doesNotMatch(overview,/mid-|late 2020|September|October|November|\.,|,,|and, and/);
});

test("unrelated raw app-control prose cannot pass as a completed ordinary routine",async()=>{
 const s=safety(),r=await execute([task()],s,req=>{
  assert.equal(req.context.appCapabilities.careNotes,undefined);
  return final(s,{components:[{kind:"general",text:"Use Today. Type into Something worth remembering, open Add details, then press REMEMBER.",sources:[]}]});
 },{workflowIntent:"none",question:"Revise Willow’s routine to three silent minutes."});
 assert.doesNotMatch(r.result.answer.answer,/Something worth remembering|Add details|REMEMBER/);
 assert.equal(r.result.answer.taskCompletion[0].status,"partial");
 assert.match(r.result.answer.answer,/couldn't complete/);
 assert.equal(r.calls,2);
});

test("explicit year correction resolves a contradictory date-meaning flag before the actual task gate",async()=>{
 const s=safety({missingContext:["date"]}),plan=[task({kind:"saved_content",needsHistory:true,pets:["p1"],missing:["date_meaning"],includeSourceDates:true})];
 const saved=final(safety(),{components:[{kind:"saved",text:"The original note follows.",sources:["s1"]}],sources:["s1"],quotes:["s1"],completion:[completion({sources:["s1"]})]});
 const r=await execute(plan,s,saved,{question:"I meant March 2021 for Willow. Replace the old year, keeping event time separate from when it was saved.",dialogue:[{role:"user",text:"Quote Willow's March 2020 event note with both timestamps."}]});
 assert.equal(r.calls,2);assert.equal(r.reads.length,1);assert.equal(r.reads[0].from,"2021-03-01");assert.equal(r.reads[0].to,"2021-03-31");
 assert.equal(r.result.answer.taskCompletion[0].status,"complete");assert.doesNotMatch(r.result.answer.answer,/Which|whether you mean/);
});
test("date-meaning recovery still requires one explicit owned pet and one explicit calendar scope",async()=>{
 const s=safety({missingContext:["date"]}),plan=[task({kind:"saved_content",needsHistory:true,pets:["p1"],missing:["date_meaning"]})];
 for(const question of ["Use her March 2021 note.","Use Willow's March note.","Use Willow's March 2021 and April 2022 notes."]){
  const r=await execute(plan,s,final(s,{completion:[completion({status:"unresolved",reason:"missing_context"})]}),{question});
  assert.equal(r.reads.length,0,question);
 }
});

test("explicit multi-year collection range executes despite historical-context date uncertainty",async()=>{
 const s=safety({careContext:"clinical_history",missingContext:["date"]}),plan=[task({kind:"saved_content",recordMode:"collection",needsHistory:true,pets:["p1"],missing:["date_meaning"]})];
 const saved=final(safety({careContext:"clinical_history"}),{components:[{kind:"saved",text:"The selected report follows.",sources:["s1"]}],sources:["s1"],completion:[completion({sources:["s1"],historyFacts:[{source:"s1",excerpt:source.body}]})]});
 const r=await execute(plan,s,saved,{question:"Put together Willow's complete saved care picture from January 2020 through December 2022, using event dates. Do not turn an isolated change into a recurring condition."});
 assert.equal(r.calls,2);assert.equal(r.reads.length,1);assert.equal(r.reads[0].from,"2020-01-01");assert.equal(r.reads[0].to,"2022-12-31");assert.equal(r.reads[0].goal,"complete_set");
 assert.equal(r.result.answer.taskCompletion[0].status,"complete");
});

test("explicit range recovery rejects comparisons, reversed ranges, multiple pets and medical authority",async()=>{
 const {explicitCalendarWindow,recoverBoundedCalendarRead}=await import("../app/lib/ask-read-only/calendar-scope.mjs");
 assert.deepEqual(explicitCalendarWindow("from January 2020 through December 2022"),{from:"2020-01-01",to:"2022-12-31",precision:"range"});
 for(const q of ["March 2020 and April 2021","from December 2022 through January 2020","January 2020 through December 2022 and May 2023","March with no year"])assert.equal(explicitCalendarWindow(q),null,q);
 const first={calls:[],text:"",historyIntent:{requested:true,timeBasis:"recorded",pet:"p1"},taskPlan:[task({kind:"saved_content",recordMode:"collection",needsHistory:true,pets:["p1"],missing:["year","date_meaning"]})],safety:{...safety(),scenario:"none",currentEvents:[],conditionalEvents:[]}};
 const context={question:"Willow's January 2020 through December 2022 saved history"},pets=[{...pet,handle:"p1"}];
 const recovered=recoverBoundedCalendarRead(first,context,pets),args=JSON.parse(recovered.first.calls[0].arguments);
 assert.equal(args.from,null);assert.equal(args.to,null);assert.equal(args.recordedFrom,"2020-01-01");assert.equal(args.recordedTo,"2022-12-31");assert.equal(args.goal,"complete_set");assert.deepEqual(recovered.first.taskPlan[0].missing,[]);
 for(const safetyPatch of [{medicationIntent:"decision"},{scenario:"current"},{scenario:"conditional"},{currentEvents:[{}]},{conditionalEvents:[{}]},{missingContext:["medicine"]}]){
  assert.equal(recoverBoundedCalendarRead({...first,safety:{...first.safety,...safetyPatch}},context,pets),null);
  assert.equal(recoverBoundedCalendarRead({...first,safety:{...first.safety,referent:"essential_unknown",missingContext:["date"],...safetyPatch}},context,pets),null);
 }
 assert.equal(recoverBoundedCalendarRead(first,{question:context.question+" and Maple"},[...pets,{...pet,name:"Maple",id:"second",handle:"p2"}]),null);
 assert.equal(recoverBoundedCalendarRead({...first,historyIntent:{...first.historyIntent,timeBasis:"ambiguous"}},context,pets),null);
});

test("fresh explicitly corrected scope resolves an obsolete task reference only after unique bound discovery",async()=>{
 const s=safety(),plan=[task({kind:"saved_content",needsHistory:true,pets:["p1"],reference:"r1",missing:["which_record"],includeSourceDates:true})];
 const row={...source,id:"new-year-note",eventAt:"2022-03-12T12:00:00Z",recordedAt:"2022-03-14T12:00:00Z"};
 const reads=[{name:"search_saved_records",arguments:{pet:"p1",from:"2022-03-01",to:"2022-03-31",recordedFrom:null,recordedTo:null,orderBy:"event",goal:"exact_quote",alternatives:[],query:null,offset:0,order:"asc"}}];
 const saved=final(s,{components:[{kind:"saved",text:"The original note follows.",sources:["s1"]}],sources:["s1"],quotes:["s1"],completion:[completion({sources:["s1"]})]});
 const r=await execute(plan,s,saved,{question:"Actually I meant March 2022 for Willow. Show that corrected note and both timestamps.",readReferences:reference},reads,[row]);
 assert.equal(r.calls,2);assert.equal(r.reads.length,1);assert.equal(r.result.answer.taskCompletion[0].status,"complete");assert.doesNotMatch(r.result.answer.answer,/Which saved/);assert.equal(r.result.answer.presentation.sourceDates[0].eventAt,row.eventAt);assert.equal(r.result.answer.presentation.sourceDates[0].recordedAt,row.recordedAt);assert.equal(r.result.answer.quotes[0].quote,row.body);
});

test("corrected-scope identity does not resolve from partial, competing, unmatched or ambiguous reads",async()=>{
 const {resolveRecordDiscovery}=await import("../app/lib/ask-read-only/task-components.mjs");
 const t=task({kind:"saved_content",needsHistory:true,pets:["p1"],reference:"r1",missing:["which_record"]});
 const request={kind:"history",pet:{...pet,handle:"p1"},from:"2022-03-01",to:"2022-03-31",recordedFrom:null,recordedTo:null};
 const result={queryScopeExhausted:true,truncated:false,hasPrevious:false,hasMore:false,unmet:[],inspected:1,sources:[{source:"s1"}]};
 const context={question:"Willow March 2022",timeBasis:"event",pets:[{...pet,handle:"p1"}]};
 const resolve=(plan=[t],bound=[{request}],results=[result],scope=context)=>resolveRecordDiscovery(plan,bound,results,scope);
 assert.equal(resolve().resolved,1);assert.equal(resolve().plan[0].reference,null);
 for(const patch of [{hasMore:true},{hasPrevious:true},{truncated:true},{queryScopeExhausted:false},{unmet:["prior_source_selection_omitted"]},{inspected:2},{sources:[{source:"s1"},{source:"s2"}]}])assert.equal(resolve([t],[{request}],[{...result,...patch}]).resolved,0);
 for(const patch of [{reference:"r1"},{continuation:{}},{from:"2021-03-01"},{recordedFrom:"2022-03-01"},{pet:{...request.pet,handle:"p2"}}])assert.equal(resolve([t],[{request:{...request,...patch}}]).resolved,0);
 assert.equal(resolve([t,{...t,id:"t2"}]).resolved,0);
 assert.equal(resolve([t],[{request}],[result],null).resolved,0);
 assert.equal(resolve([t],[{request}],[result],{...context,question:"her March 2022"}).resolved,0);
 assert.equal(resolve([t],[{request}],[result],{...context,timeBasis:"ambiguous"}).resolved,0);
});

test("completion check rehydrates requested single historical note for a medication-boundary brief without a third call",async()=>{
 const s=safety({medicationIntent:"decision",careContext:"vet_summary",missingContext:["medicine","prescription"]});
 const plan=[task({kind:"vet_brief",needsHistory:false,needsOwnerFacts:true,pets:["p1"],missing:["medicine","prescription"]})];
 const question="Please include the old report in a short vet brief. I missed medicine and do not know its name or directions.";
 const r=await execute(plan,s,req=>{
  const out=final(s,{completion:[completion({ownerFacts:[{ref:"owner1",excerpt:"She ate less lunch today."}]})]});
  if(req.schema.properties.evidenceCompletion)out.evidenceCompletion={sourceReview:[],missingReference:{task:"t1",reference:"r1",requestExcerpt:"Please include the old report in a short vet brief."}};
  return out;
 },{question,readReferences:reference,dialogue:[{role:"user",text:"She ate less lunch today."}]});
 assert.equal(r.calls,2);assert.equal(r.reads.length,1);assert.deepEqual(r.reads[0].sourceIds,[source.id]);
 assert.ok(r.result.answer.answer.includes(source.body));assert.match(r.result.answer.answer,/2021-03-12/);assert.match(r.result.answer.answer,/2021-03-14/);
 assert.match(r.result.answer.answer,/She ate less lunch today/);assert.match(r.result.answer.answer,/prescribing veterinarian promptly/);
 assert.equal(r.result.coverage[0].scope.compositionOnly,true);
 const {readCoverageMessages}=await import("../app/lib/ask-read-only/coverage.mjs");
 const coverage=readCoverageMessages(r.result.coverage).join(" ");
 assert.match(coverage,/not supplied to the answer model/);assert.doesNotMatch(coverage,/1 notes supplied to the answer model/);
});
test("per-source collection review restores a noteworthy original observation omitted from routine themes",async()=>{
 const extraRow={...source,id:"different-original-id",body:"A few coat mats were removed during grooming. Skin underneath looked normal.",eventAt:"2021-03-20T12:00:00Z"};
 const plan=[task({kind:"saved_content",needsHistory:true,recordMode:"collection",pets:["p1"]})],s=safety();
 const r=await execute(plan,s,req=>{
  const out=final(s,{components:[{kind:"saved",text:"Routine care.",sources:["s1","s2"]}],sources:["s1","s2"],completion:[completion({sources:["s1","s2"],historySynthesis:[{topic:"appetite",evidence:[{source:"s1",excerpt:source.body}]}]})]});
  if(req.schema.properties.evidenceCompletion)out.evidenceCompletion={sourceReview:[{source:"s1",classification:"routine"},{source:"s2",classification:"noteworthy"}],missingReference:null};
  return out;
 },{},[{...boundedRead[0],arguments:{...boundedRead[0].arguments,goal:"complete_set"}}],[source,extraRow]);
 assert.equal(r.calls,2);assert.equal(r.reads.length,1);assert.ok(r.result.answer.answer.includes(extraRow.body));
 assert.doesNotMatch(r.result.answer.answer,/recurring mats|persistent mats/);assert.equal(r.result.answer.historicalSupport[0],"s2");
});

test("zero-call collection integration plans actual omitted-window IO through the existing binder",async()=>{
 const fresh={...source,id:"private-new-note-123456789",body:"One coat mat was removed during grooming.",eventAt:"2021-09-15T12:00:00Z",recordedAt:"2021-09-16T12:00:00Z"};
 const retained=structuredClone(reference);Object.assign(retained.entries[0],{goal:"complete_set",from:"2021-01-01",to:"2021-12-31",limited:true,omittedRange:{axis:"event",from:"2021-09-15",to:"2021-12-15"}});
 const s=safety(),plan=[task({kind:"saved_content",recordMode:"collection",combineHistory:true,needsHistory:true,pets:["p1"],reference:"r1"})];
 const out=final(s,{sources:["s1","s2"],completion:[completion({componentIndexes:[],sources:["s1","s2"],historyFacts:[{source:"s1",excerpt:fresh.body},{source:"s2",excerpt:source.body}]})]});
 const r=await execute(plan,s,out,{readReferences:retained,question:"Read the omitted September through December2021 notes and combine them with the earlier result."},[],request=>request.continuation?[fresh]:[source]);
 assert.equal(r.calls,2);assert.ok(r.reads.some(q=>q.continuation&&q.from==="2021-09-15"&&q.to==="2021-12-15"&&!q.sourceIds));
 assert.ok(r.reads.some(q=>q.sourceIds?.includes(source.id)));assert.match(r.result.answer.answer,/One coat mat was removed/);assert.match(r.result.answer.answer,/routine exam/);
});
test("zero-call integration promotion is confined to declared collection continuation and preserves missing or changed-scope reads",()=>{
 const request={kind:"history",pet:{...pet,handle:"p1"},goal:"complete_set",omittedRange:{axis:"event",from:"2021-09-15",to:"2021-12-15"}};
 const t=task({kind:"saved_content",recordMode:"collection",combineHistory:true,needsHistory:true,pets:["p1"],reference:"r1"});
 const refs=[{handle:"r1",request}];
 const resolved=fulfillReferenceReads({calls:[],taskPlan:[t]},refs);
 assert.equal(resolved.taskPlan[0].kind,"saved_continuation");
 assert.deepEqual(resolved.calls.map(c=>c.name),["read_remaining_records","read_referenced_sources"]);
 for(const patch of [{combineHistory:false},{recordMode:"single"},{missing:["year"]},{kind:"vet_brief"}]){
  const x=fulfillReferenceReads({calls:[],taskPlan:[{...t,...patch}]},refs);
  assert.ok(!x.calls.some(c=>c.name==="read_remaining_records"));
 }
 const scoped={id:"explicit-new-scope",name:"search_saved_records",arguments:JSON.stringify({pet:"p1",from:"2022-01-01",to:"2022-12-31"})};
 assert.ok(!fulfillReferenceReads({calls:[scoped],taskPlan:[t]},refs).calls.some(c=>c.name==="read_remaining_records"));
 assert.ok(!fulfillReferenceReads({calls:[],taskPlan:[t]},[{handle:"r1",request:{...request,omittedRange:null}}]).calls.some(c=>c.name==="read_remaining_records"));
});

test("one integrated collection deliverable does not duplicate prior and remainder answer tasks",()=>{
 const req={kind:"history",pet:{...pet,handle:"p1"},goal:"complete_set",omittedRange:{axis:"event",from:"2021-09-15",to:"2021-12-15"}},refs=[{handle:"r1",request:req}];
 const t=task({kind:"saved_continuation",recordMode:"collection",combineHistory:true,needsHistory:true,pets:["p1"],reference:"r1"});
 const ordinary=task({id:"t3",kind:"general_guidance"});
 const r=fulfillReferenceReads({calls:[],taskPlan:[t,{...t,id:"t2",kind:"saved_content",includeSourceDates:true},ordinary]},refs);
 assert.equal(r.taskPlan.length,2);assert.equal(r.taskPlan[0].kind,"saved_continuation");assert.equal(r.taskPlan[0].includeSourceDates,true);
 assert.equal(r.taskPlan[1].kind,"general_guidance");assert.deepEqual(r.calls.map(c=>c.name),["read_remaining_records","read_referenced_sources"]);
 for(const patch of [{reference:"r2"},{pets:["p2"]},{combineHistory:false},{kind:"vet_brief"},{missing:["year"]},{needsOwnerFacts:true},{recordMode:"single"}]){
  const separate=fulfillReferenceReads({calls:[],taskPlan:[t,{...t,id:"t2",...patch}]},refs);
  assert.equal(separate.taskPlan.length,2);
 }
});

test("an independent ordinary task cannot suppress zero-call bounded collection continuation",()=>{
 const req={kind:"history",pet:{...pet,handle:"p1"},goal:"complete_set",omittedRange:{axis:"event",from:"2021-09-15",to:"2021-12-15"}};
 const collection=task({kind:"saved_content",recordMode:"collection",combineHistory:true,needsHistory:true,pets:["p1"],reference:"r1"});
 const r=fulfillReferenceReads({calls:[],taskPlan:[collection,task({id:"t2"})]},[{handle:"r1",request:req}]);
 assert.equal(r.taskPlan[0].kind,"saved_continuation");assert.equal(r.taskPlan[1].kind,"general_guidance");assert.deepEqual(r.calls.map(c=>c.name),["read_remaining_records","read_referenced_sources"]);
});

test("server calculation completion needs no generated numeric prose or factual excerpt",()=>{
 const t=task({kind:"calculation",recordMode:"collection",needsHistory:true,pets:["p1"]}),s={...source,handle:"s1"};
 const r=reviewComponentCompletion(final(safety(),{completion:[completion({componentIndexes:[],sources:["s1"]})]}),[t],[s],[],[{...pet,handle:"p1"}]);
 assert.equal(r.tasks[0].status,"complete");
 const a=renderTaskCompletion({answer:"",validatedParts:[],calculations:[{available:true,sourceHandles:["s1"],text:"Verified server arithmetic."}],sources:["s1"],presentation:{}},r.tasks,[s],null,[]);
 assert.equal(a.taskCompletion[0].status,"complete");assert.doesNotMatch(a.answer,/not been completed/);
});
test("calculation status is scoped to its selected sources and cannot borrow another pet or unavailable result",()=>{
 const t={...task({kind:"calculation",recordMode:"collection",needsHistory:true,pets:["p1"]}),status:"complete",reason:"none",sources:["s1","s2"],componentIndexes:[],historyFacts:[],ownerFacts:[]};
 const good={available:true,sourceHandles:["s1","s2"],text:"Verified server arithmetic."},foreign={available:false,sourceHandles:["s3"],text:"Unavailable other pet."};
 const render=calculations=>renderTaskCompletion({answer:"",validatedParts:[],calculations,sources:["s1","s2"],presentation:{}},[t],[{...source,handle:"s1"},{...source,id:"another",handle:"s2"},{...source,petId:"foreign",handle:"s3"}],null,[]);
 assert.equal(render([good,foreign]).taskCompletion[0].status,"complete");
 for(const calculations of [[],[foreign],[{...good,available:false}],[{...good,sourceHandles:["s1"]}],[{...good,sourceHandles:[]}],[{...good,sourceHandles:["s1","s3"]}]]){
  assert.notEqual(render(calculations).taskCompletion[0].status,"complete");
 }
});

test("an already bounded owner/date read resolves contradictory task pet and year flags before the gate",async()=>{
 const s=safety(),p=[task({kind:"saved_content",needsHistory:true,pets:["p1"],missing:["pet","year"]})];
 const out=final(s,{components:[{kind:"saved",text:"Verified original note.",sources:["s1"]}],quotes:["s1"],sources:["s1"],completion:[completion({sources:["s1"],historyFacts:[{source:"s1",excerpt:source.body}]})]});
 const r=await execute(p,s,out,{question:"Use Willow’s March 2021 original note and both timestamps."},boundedRead);
 assert.equal(r.calls,2);assert.equal(r.reads.length,1);assert.equal(r.result.answer.taskCompletion[0].status,"complete");assert.doesNotMatch(r.result.answer.answer,/Which pet and year/);
});
test("existing-read scope recovery requires the exact explicit owner/pet/calendar axis and preserves clinical guards",async()=>{
 const {recoverBoundedCalendarRead}=await import("../app/lib/ask-read-only/calendar-scope.mjs");
 const args={...boundedRead[0].arguments},p=task({kind:"saved_content",needsHistory:true,pets:["p1"],missing:["pet","year"]});
 const first={calls:[{id:"r",name:"search_saved_records",arguments:JSON.stringify(args)}],taskPlan:[p],historyIntent:{requested:true,timeBasis:"event",pet:"p1"},safety:{...safety(),missingContext:[],currentEvents:[],conditionalEvents:[]}};
 const ctx={question:"Willow March 2021 original note."},pets=[{...pet,handle:"p1"}];
 assert.ok(recoverBoundedCalendarRead(first,ctx,pets));
 for(const patch of [{pet:"p2"},{from:"2020-03-01"},{to:"2020-03-31"},{offset:16},{orderBy:"recorded"},{recordedFrom:"2021-03-01"}]){
  assert.equal(recoverBoundedCalendarRead({...first,calls:[{...first.calls[0],arguments:JSON.stringify({...args,...patch})}]},ctx,pets),null);
 }
 for(const safetyPatch of [{medicationIntent:"decision"},{careContext:"current_concern"},{currentEvents:[{}]},{conditionalEvents:[{}]},{missingContext:["medicine"]}]){
  assert.equal(recoverBoundedCalendarRead({...first,safety:{...first.safety,...safetyPatch}},ctx,pets),null);
 }
});

test("source-free notebook episode reasoning does not need a database timestamp axis",async()=>{
 const s=safety(),prose="Two mentions of the same described episode do not establish two separate events.";
 const r=await execute([task({missing:["date_meaning"]})],s,final(s,{components:[{kind:"general",text:prose,sources:[]}]}),{question:"A later diary entry refers back to the earlier incident. Does that prove two incidents?",workflowIntent:"none"});
 assert.equal(r.calls,2);assert.equal(r.reads.length,0);
 assert.equal(r.result.answer.answer,prose);
 assert.deepEqual(r.requests[1].context.taskPlan[0].missing,[]);
 assert.equal(r.result.answer.taskCompletion[0].status,"complete");
});
const axisContext={pets:[{handle:"p1"}],references:[{reference:"r1",petHandle:"p1"}]};
for(const extra of [
 {kind:"saved_content",needsHistory:true,recordMode:"single"},
 {needsHistory:true,recordMode:"single"},
 {reference:"r1"},{kind:"clinical_guidance"},{kind:"vet_brief"},
 {kind:"workflow",workflow:"find_care_note"},{needsOwnerFacts:true}
])test("timestamp axis remains meaningful outside source-free ordinary reasoning "+JSON.stringify(extra),()=>{
 const p=validateTaskPlan([task({missing:["date_meaning"],...extra})],axisContext);
 assert.deepEqual(p[0].missing,["date_meaning"]);
});
test("source-free axis cleanup never clears genuine pet/year or prescribing authority",()=>{
 const p=validateTaskPlan([task({missing:["pet","year","date_meaning","medicine","prescription","vet_plan"]})],axisContext);
 assert.deepEqual(p[0].missing,["pet","year","medicine","prescription","vet_plan"]);
});
test("a genuine timestamp-axis clarification is a readable pointed question",()=>{
 const a=renderTaskCompletion({answer:"",validatedParts:[],sources:[],calculations:[],presentation:{}},[
 {...task({kind:"saved_content",needsHistory:true,recordMode:"single",missing:["date_meaning"]}),componentIndexes:[],sources:[],historyFacts:[],ownerFacts:[],status:"unresolved",reason:"missing_context"}
 ],[],null);
 assert.equal(a.answer,"Should I use the event date or the save date?");
});
