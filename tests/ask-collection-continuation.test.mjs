import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {runReadOnlyAsk,bindReadTool,readOnlyToolsForPets} from "../app/lib/ask-read-only/core.mjs";
import {fulfillReferenceReads,decodeComponentSelection} from "../app/lib/ask-read-only/task-components.mjs";
import {decodeClinicalSelection} from "../app/lib/ask-read-only/clinical-policy.mjs";
import {restoreReadReferences,continuationRange,carryReadReferences} from "../app/lib/ask-read-only/references.mjs";
import {createReadOnlyDataAccess} from "../app/lib/ask-read-only/data.ts";

const pet={id:"fixture-pet-private-001",ownerId:"fixture-owner",handle:"p1",name:"Maple",species:"cat"};
const rows=Array.from({length:36},(_,i)=>({id:"fixture-record-"+String(i).padStart(3,"0"),user_id:pet.ownerId,pet_profile_id:pet.id,note:"A monthly routine observation was recorded. No new concern was reported.",title:"Routine monthly report",occurred_at:new Date(Date.UTC(2020+Math.floor(i/12),i%12,15,12)).toISOString(),created_at:new Date(Date.UTC(2020+Math.floor(i/12),i%12,16,12)).toISOString(),deleted_at:null}));
function dbFixture(records=rows){
 const requests=[];let owner=pet.ownerId;
 const db={from(table){
  const filters=[],q={};let start=0,end=1000,order="occurred_at",asc=true;
  q.select=()=>q;q.retry=()=>q;q.abortSignal=()=>q;
  q.eq=(key,value)=>{filters.push(r=>r[key]===value);return q;};q.is=(key,value)=>{filters.push(r=>r[key]===value);return q;};
  q.in=(key,values)=>{filters.push(r=>values.includes(r[key]));q.ids=values;return q;};
  q.gte=(key,value)=>{filters.push(r=>r[key]>=value);return q;};q.lt=(key,value)=>{filters.push(r=>r[key]<value);return q;};
  q.order=(key,options)=>{if(key!=="id"){order=key;asc=options.ascending;}return q;};
  q.range=(from,to)=>{start=from;end=to;return q;};
  q.maybeSingle=async()=>({data:filters.every(f=>f({id:pet.id,user_id:owner}))?{id:pet.id,user_id:owner}:null,error:null});
  q.then=(resolve,reject)=>{
   assert.equal(table,"pet_care_entries");requests.push({ids:q.ids??null,start,end});
   const selected=records.filter(r=>filters.every(f=>f(r))).sort((a,b)=>(a[order].localeCompare(b[order])*(asc?1:-1))||a.id.localeCompare(b.id));
   return Promise.resolve({data:selected.slice(start,end+1),count:selected.length,error:null}).then(resolve,reject);
  };return q;
 }};return {db,requests,setOwner:value=>{owner=value;}};
}
const safety=()=>({medicationIntent:"none",referent:"clear",missingContext:[],careContext:"clinical_history",eventAssessments:[]});
function task(kind="saved_content",extra={}){return {id:"t1",kind,needsHistory:true,needsOwnerFacts:false,includeSourceDates:true,recordMode:"collection",workflow:"none",pets:["p1"],reference:null,missing:["which_record"],...extra};}
async function run(read,readReferences,continuation=false){
 let physical=0;const events=[];
 const input={ownerId:pet.ownerId,selectedPetId:pet.id,pets:[pet],question:continuation?"Continue the omitted period.":"Summarize all the saved routine notes over three years.",dialogue:[],now:"2026-11-12T12:00:00Z",timeZone:"UTC",readReferences};
 const result=await runReadOnlyAsk(input,{read,onAnswerBoundary:e=>events.push(e),provider:async(req,phase)=>{
  physical++;
  if(phase==="read_selection")return decodeComponentSelection({safety:safety(),reads:[continuation?{name:"read_remaining_records",arguments:{reference:"r1"}}:{name:"search_saved_records",arguments:{pet:"p1",from:"2020-01-01",to:"2022-12-31",recordedFrom:null,recordedTo:null,goal:"complete_set",alternatives:[],orderBy:"event",order:"asc",query:null,offset:0}}],draft:"",historyIntent:{requested:true,timeBasis:"event",pet:"p1"},workflowIntent:"none",taskPlan:[task(continuation?"saved_continuation":"saved_content",{reference:continuation?"r1":null})]},req.tools,req.context,decodeClinicalSelection);
  const sources=req.SOURCE_CATALOG.map(s=>s.source);
  return {components:[{kind:sources.length?"saved":"limitation",text:sources.length?"The supplied monthly reports describe the routine observations and their historical limits.":"The prior result could not be verified; please request a fresh scoped search.",sources}],sources,quotes:[],calculations:[],replyType:sources.length?"answer":"partial",presentation:{sourceDates:[],contextRequired:false},clinicalReview:{assessment:safety(),ownerStatementRefs:[],observationFields:[]},appHelp:{intent:"none",pet:null},completion:[{task:"t1",status:sources.length?"complete":"unresolved",reason:sources.length?"none":"source_unavailable",componentIndexes:[0],sources,ownerFacts:[],historyFacts:[]}]};
 }});assert.equal(physical,2);return {result,events};
}
test("actual owner-bound data path supplies32 of36 then validates anchors and reads the four omitted records",async()=>{
 const f=dbFixture(),reads=createReadOnlyDataAccess(f.db,pet.ownerId,"UTC");
 const first=(await run(reads)).result;
 assert.equal(first.sources.length,32);assert.equal(first.coverage[0].inspected,36);assert.equal(first.coverage[0].omitted,4);assert.equal(first.answer.taskCompletion[0].reason,"source_omitted");
 assert.doesNotMatch(first.answer.answer,/Which|veterinar|2020-01-15/);assert.equal(first.answer.presentation.sourceDates.length,0);
 const retained=JSON.parse(JSON.stringify(first.readReferences));assert.deepEqual(retained.entries[0].omittedRange,{axis:"event",from:"2022-09-15",to:"2022-12-15"});
 const second=(await run(reads,retained,true)).result;
 assert.equal(second.sources.length,4);assert.deepEqual(second.sources.map(s=>s.id),rows.slice(32).map(r=>r.id));assert.equal(second.answer.taskCompletion[0].status,"complete");assert.doesNotMatch(second.answer.answer,/Which/);
 assert.deepEqual(f.requests.slice(-2).map(q=>q.ids?.length??null),[8,null]);
 assert.equal(second.coverage[0].continuationValidation.valid,true);assert.equal(second.coverage[0].batchAcquisition.attempts,2);assert.equal(second.coverage[0].batchAcquisition.rawRows,12);assert.equal(second.coverage[0].inspected,4);
 assert.equal(readOnlyToolsForPets([pet],restoreReadReferences(second.readReferences,[pet])).some(t=>t.name==="read_remaining_records"),false);
});
test("deleted, changed or missing anchors stop continuation before reading its remainder",async()=>{
 const initial=(await run(createReadOnlyDataAccess(dbFixture().db,pet.ownerId,"UTC"))).result;
 for(const changed of [rows.slice(1),rows.map((r,i)=>i?{...r}:{...r,note:r.note+" Corrected."}),rows.map((r,i)=>i?{...r}:{...r,deleted_at:"2026-11-01T00:00:00Z"})]){
  const f=dbFixture(changed),out=(await run(createReadOnlyDataAccess(f.db,pet.ownerId,"UTC"),initial.readReferences,true)).result;
  assert.equal(out.sources.length,0);assert.equal(f.requests.length,1);assert.equal(out.coverage[0].continuationValidation.valid,false);assert.ok(out.coverage[0].unmet.includes("referenced_source_changed_or_missing"));
 }
 const f=dbFixture();f.setOwner("different-owner");await assert.rejects(()=>run(createReadOnlyDataAccess(f.db,pet.ownerId,"UTC"),initial.readReferences,true),/NOT_AUTHORIZED/);assert.equal(f.requests.length,0);
});
test("continuation binder rejects forged handles, unmatched intervals, foreign pets and competing result scopes",()=>{
 const source=rows[0],expected={id:source.id,hash:createHash("sha256").update(source.note).digest("hex"),eventAt:source.occurred_at,recordedAt:source.created_at};
 const entry={kind:"history",petId:pet.id,timeZone:"UTC",goal:"complete_set",from:"2020-01-01",to:"2022-12-31",recordedFrom:null,recordedTo:null,orderBy:"event",order:"asc",terms:[],limited:true,sources:[expected],omittedRange:{axis:"event",from:"2022-09-15",to:"2022-12-15"}};
 const refs=restoreReadReferences({version:1,entries:[entry]},[pet]);
 for(const args of [{reference:"r9"},{reference:"r1",from:"2020-01-01"}])assert.throws(()=>bindReadTool("read_remaining_records",args,[pet],refs),/REFERENCE|TOOL_INVALID/);
 assert.throws(()=>bindReadTool("read_remaining_records",{reference:"r1"},[{...pet,id:"another-pet"}],refs),/REFERENCE/);
 assert.equal(continuationRange({...refs[0].request,omittedRange:{axis:"event",from:"2019-01-01",to:"2019-02-01"}}),null);
 const competing=restoreReadReferences({version:1,entries:[entry,{...entry,omittedRange:{axis:"event",from:"2022-10-15",to:"2022-12-15"}}]},[pet]);
 assert.throws(()=>bindReadTool("read_remaining_records",{reference:"r1"},[pet],competing),/REFERENCE_AMBIGUOUS/);
 assert.equal(restoreReadReferences({version:1,entries:[{...entry,petId:"foreign"}]},[pet]).length,0);
});
test("recorded-axis remainder retains independent event constraints and repeated boundary days stay explicit",async()=>{
 const initial=(await run(createReadOnlyDataAccess(dbFixture().db,pet.ownerId,"UTC"))).result;
 const entry=initial.readReferences.entries[0];const recorded={...entry,from:"2020-01-01",to:"2022-12-31",recordedFrom:"2020-01-01",recordedTo:"2022-12-31",orderBy:"recorded",omittedEventRange:null,omittedRange:{axis:"recorded",from:"2022-09-16",to:"2022-12-16"}};
 const refs=restoreReadReferences({version:1,entries:[recorded]},[pet]);const request=bindReadTool("read_remaining_records",{reference:"r1"},[pet],refs);
 assert.equal(request.from,"2020-01-01");assert.equal(request.to,"2022-12-31");assert.equal(request.recordedFrom,"2022-09-16");assert.equal(request.recordedTo,"2022-12-16");
 const read=createReadOnlyDataAccess(dbFixture().db,pet.ownerId,"UTC"),result=await read(request);assert.equal(result.sources.length,4);assert.equal(result.continuationValidation.valid,true);
 const partial={...entry,discoveryIncomplete:true};assert.equal(restoreReadReferences({version:1,entries:[partial]},[pet])[0].request.discoveryIncomplete,true);
});

test("same-day overlap remains bounded and partial rather than claiming the four omitted records were uniquely fetched",async()=>{
 const sameDay=rows.map(r=>({...r,occurred_at:"2021-07-15T12:00:00.000Z"}));
 const f=dbFixture(sameDay),read=createReadOnlyDataAccess(f.db,pet.ownerId,"UTC");
 const first=(await run(read)).result;assert.equal(first.sources.length,32);assert.equal(first.coverage[0].omitted,4);
 const second=(await run(read,first.readReferences,true)).result;
 assert.equal(second.sources.length,32);assert.equal(second.coverage[0].omitted,4);assert.equal(second.answer.taskCompletion[0].status,"partial");
 assert.deepEqual(second.sources.map(s=>s.id),first.sources.map(s=>s.id));
 assert.ok(second.coverage[0].batchAcquisition.attempts<=8);assert.ok(second.coverage[0].batchAcquisition.rawRows<=64);
 assert.deepEqual(second.coverage[0].omittedRange,{axis:"event",from:"2021-07-15",to:"2021-07-15"});
});


test("explicit sole-component remainder read overrides redundant ordinary-content label without old-body read",()=>{
 const refs=[{handle:"r1",request:{omittedRange:{axis:"event",from:"2022-09-15",to:"2022-12-15"}}}];
 const first={taskPlan:[task("saved_content",{reference:"r1",missing:[]})],calls:[{id:"remain",name:"read_remaining_records",arguments:'{"reference":"r1"}'},{id:"old",name:"read_referenced_sources",arguments:'{"reference":"r1"}'}]};
 const r=fulfillReferenceReads(first,refs);assert.equal(r.taskPlan[0].kind,"saved_continuation");assert.equal(r.calls.length,1);assert.equal(r.calls[0].name,"read_remaining_records");
});
test("bounded retained anchors prioritize actually quoted exceptions and typed operands over first-read order",()=>{
 const sources=rows.map((r,i)=>({kind:"history",id:r.id,ownerId:pet.ownerId,petId:pet.id,handle:"s"+(i+1),body:r.note,eventAt:r.occurred_at,recordedAt:r.created_at}));
 const request={kind:"history",pet,goal:"complete_set",from:"2020-01-01",to:"2022-12-31",terms:[],orderBy:"event",order:"asc"};
 const result=carryReadReferences([],[{request,sourceHandles:sources.map(s=>s.handle)}],sources,{sources:sources.map(s=>s.handle),quotes:[{source:"s20"}],calculations:[{sourceHandles:["s36"]}]},"UTC");
 assert.equal(result.entries[0].sources.length,8);assert.equal(result.entries[0].sources[0].id,rows[19].id);assert.equal(result.entries[0].sources[1].id,rows[35].id);assert.equal(result.entries[0].limited,true);
});
