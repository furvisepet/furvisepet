import test from "node:test";
import assert from "node:assert/strict";
import {runReadOnlyAsk} from "../app/lib/ask-read-only/core.mjs";
import {decodeComponentSelection} from "../app/lib/ask-read-only/task-components.mjs";
import {decodeClinicalSelection} from "../app/lib/ask-read-only/clinical-policy.mjs";
import {createReadOnlyDataAccess} from "../app/lib/ask-read-only/data.ts";
const pet={id:"fixture-pet-private-001",ownerId:"fixture-owner",name:"Maple",species:"cat"};
const routine="Routine care reports described normal appetite and usual activity.";
const texts=new Map([[4,"One mild paw irritation was observed after a walk. It settled at follow-up."],[16,"A coat check found no new skin concern."],[26,"A gradual food transition began over one week. Appetite remained normal."],[28,"A grooming visit recorded no new coat concern."]]);
const rows=Array.from({length:36},(_,i)=>({id:"fixture-record-"+String(i).padStart(3,"0"),user_id:pet.ownerId,pet_profile_id:pet.id,note:"Maple weighed "+(4+i/100).toFixed(2)+" kg. "+(texts.get(i)??routine),occurred_at:new Date(Date.UTC(2020+Math.floor(i/12),i%12,15,12)).toISOString(),created_at:new Date(Date.UTC(2020+Math.floor(i/12),i%12,16,12)).toISOString(),deleted_at:null}));
function fixture(){
 const requests=[];
 return {requests,db:{from(table){
  const filters=[],q={};let start=0,end=1000,order="occurred_at",asc=true;
  q.select=()=>q;q.retry=()=>q;q.abortSignal=()=>q;
  q.eq=(k,v)=>{filters.push(r=>r[k]===v);return q;};q.is=q.eq;
  q.in=(k,vs)=>{filters.push(r=>vs.includes(r[k]));return q;};
  q.gte=(k,v)=>{filters.push(r=>r[k]>=v);return q;};q.lt=(k,v)=>{filters.push(r=>r[k]<v);return q;};
  q.order=(k,o)=>{if(k!=="id"){order=k;asc=o.ascending;}return q;};
  q.range=(a,b)=>{start=a;end=b;return q;};
  q.maybeSingle=async()=>({data:filters.every(f=>f({id:pet.id,user_id:pet.ownerId}))?{id:pet.id,user_id:pet.ownerId}:null,error:null});
  q.then=(resolve,reject)=>{assert.equal(table,"pet_care_entries");requests.push({start,end});const all=rows.filter(r=>filters.every(f=>f(r))).sort((a,b)=>a[order].localeCompare(b[order])*(asc?1:-1)||a.id.localeCompare(b.id));return Promise.resolve({data:all.slice(start,end+1),count:all.length,error:null}).then(resolve,reject);};
  return q;
 }}};
}
const safety=()=>({medicationIntent:"none",referent:"clear",missingContext:[],careContext:"clinical_history",eventAssessments:[]});
test("actual32-of36 composition reserves facts for late reviewed exceptions and carries their bounded anchors",async()=>{
 const f=fixture();let calls=0;
 const result=await runReadOnlyAsk({ownerId:pet.ownerId,selectedPetId:pet.id,pets:[pet],question:"Summarize the entire2020 through2022 history, oldest event first, including meaningful changes and coverage gaps.",dialogue:[],now:"2026-11-14T00:00:00Z",timeZone:"UTC"},{
 read:createReadOnlyDataAccess(f.db,pet.ownerId,"UTC"),provider:async(req,phase)=>{
  calls++;
  if(phase==="read_selection")return decodeComponentSelection({safety:safety(),reads:[{name:"search_saved_records",arguments:{pet:"p1",from:"2020-01-01",to:"2022-12-31",recordedFrom:null,recordedTo:null,goal:"complete_set",alternatives:[],orderBy:"event",order:"asc",query:null,offset:0}}],draft:"",historyIntent:{requested:true,timeBasis:"event",pet:"p1"},workflowIntent:"none",taskPlan:[{id:"t1",kind:"saved_content",combineHistory:false,needsHistory:true,needsOwnerFacts:false,includeSourceDates:true,recordMode:"collection",workflow:"none",pets:["p1"],reference:null,missing:[]}]},req.tools,req.context,decodeClinicalSelection);
  const catalog=req.SOURCE_CATALOG;assert.equal(catalog.length,32,"explicit collection must acquire through the owner-bound source path");const handles=catalog.map(s=>s.source),noteworthy=catalog.filter((s,i)=>texts.has(i)).map(s=>s.source);
  return {components:[{kind:"saved",text:"The historical overview.",sources:handles}],sources:handles,quotes:[],calculations:[],replyType:"partial",presentation:{sourceDates:[],contextRequired:false},clinicalReview:{assessment:safety(),ownerStatementRefs:[],observationFields:[]},appHelp:{intent:"none",pet:null},completion:[{task:"t1",status:"partial",reason:"source_omitted",componentIndexes:[0],sources:handles,ownerFacts:[],historyFacts:catalog.slice(0,6).map(s=>({source:s.source,excerpt:s.body})),historySynthesis:[{topic:"normal appetite",evidence:[{source:catalog[0].source,excerpt:routine}]}]}],evidenceCompletion:{sourceReview:{routine:handles.filter(h=>!noteworthy.includes(h)),noteworthy,uncertain:[],irrelevant:[]},missingReference:null}};
 }});
 assert.equal(calls,2);assert.equal(result.coverage[0].inspected,36);assert.equal(result.coverage[0].omitted,4);assert.equal(result.sources.length,32);
 assert.ok(result.answer.answer.includes(rows[26].note),"later food transition must be in the actual narrative, not merely a source card");
 assert.ok(result.answer.answer.includes(rows[4].note));
 assert.match(result.answer.answer,/28 selected saved reports/);
 assert.ok(result.answer.answer.indexOf("event2020-05-15".replace("event","event "))<result.answer.answer.indexOf("event2022-03-15".replace("event","event ")));
 assert.equal(result.answer.taskCompletion[0].reason,"source_omitted");
 assert.equal(result.readReferences.entries[0].sources.length,8);assert.ok(result.readReferences.entries[0].sources.some(s=>s.id===rows[26].id),"late salient fact must survive owner-bound continuation retention");
 assert.deepEqual(result.readReferences.entries[0].omittedRange,{axis:"event",from:"2022-09-15",to:"2022-12-15"});
 assert.ok(f.requests.length<=8);
});

test("explicit enumerated-year collection acquires through existing owner binder when interpretation omits every read",async()=>{
 const f=fixture();let calls=0;
 const result=await runReadOnlyAsk({ownerId:pet.ownerId,selectedPetId:pet.id,pets:[pet],question:"Review Maple's complete saved history for 2020, 2021 and 2022, starting with the oldest events. Give a useful overall picture.",dialogue:[],now:"2026-11-14T00:00:00Z",timeZone:"UTC"},{
 read:createReadOnlyDataAccess(f.db,pet.ownerId,"UTC"),provider:async(req,phase)=>{
  calls++;
  if(phase==="read_selection")return decodeComponentSelection({safety:{...safety(),careContext:"vet_summary"},reads:[],draft:"",historyIntent:{requested:true,timeBasis:"event",pet:"p1"},workflowIntent:"none",taskPlan:[{id:"t1",kind:"saved_content",combineHistory:false,needsHistory:true,needsOwnerFacts:false,includeSourceDates:true,recordMode:"collection",workflow:"none",pets:["p1"],reference:null,missing:[]}]},req.tools,req.context,decodeClinicalSelection);
  const catalog=req.SOURCE_CATALOG;assert.equal(catalog.length,32,"explicit collection must acquire through the owner-bound source path");const handles=catalog.map(s=>s.source),noteworthy=catalog.filter((s,i)=>texts.has(i)).map(s=>s.source);
  return {components:[{kind:"saved",text:"The historical overview.",sources:handles}],sources:handles,quotes:[],calculations:[],replyType:"partial",presentation:{sourceDates:[],contextRequired:false},clinicalReview:{assessment:safety(),ownerStatementRefs:[],observationFields:[]},appHelp:{intent:"none",pet:null},completion:[{task:"t1",status:"partial",reason:"source_omitted",componentIndexes:[0],sources:handles,ownerFacts:[],historyFacts:catalog.slice(0,6).map(s=>({source:s.source,excerpt:s.body})),historySynthesis:[{topic:"normal appetite",evidence:[{source:catalog[0].source,excerpt:routine}]}]}],evidenceCompletion:{sourceReview:{routine:handles.filter(h=>!noteworthy.includes(h)),noteworthy,uncertain:[],irrelevant:[]},missingReference:null}};
 }});
 assert.equal(calls,2);assert.equal(result.coverage[0].inspected,36);assert.equal(result.coverage[0].omitted,4);assert.equal(result.sources.length,32);
 assert.ok(result.answer.answer.includes(rows[26].note),"later food transition must be in the actual narrative, not merely a source card");
 assert.ok(result.answer.answer.includes(rows[4].note));
 assert.match(result.answer.answer,/28 selected saved reports/);
 assert.ok(result.answer.answer.indexOf("event2020-05-15".replace("event","event "))<result.answer.answer.indexOf("event2022-03-15".replace("event","event ")));
 assert.equal(result.answer.taskCompletion[0].reason,"source_omitted");
 assert.equal(result.readReferences.entries[0].sources.length,8);assert.ok(result.readReferences.entries[0].sources.some(s=>s.id===rows[26].id),"late salient fact must survive owner-bound continuation retention");
 assert.deepEqual(result.readReferences.entries[0].omittedRange,{axis:"event",from:"2022-09-15",to:"2022-12-15"});
 assert.ok(f.requests.length<=8);
});
