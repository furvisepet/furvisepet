import test from "node:test";
import assert from "node:assert/strict";
import {runReadOnlyAsk,requiresNamedLatestSavedNote} from "../app/lib/ask-read-only/core.mjs";
import {buildReadOnlyPublication} from "../app/lib/ask-read-only/publication.ts";
process.env.FURVISE_RATE_LIMIT_HASH_SECRET="test-only-pet-notes-owner-scope-hmac-2026";
const ownerId="synthetic-owner", pet={id:"synthetic-pet",ownerId,name:"Furvise QA MG Synthetic Nonclinical 20261027",species:"dog"};
const other={id:"other-owned",ownerId,name:"Other Owned Pet",species:"dog"};
const question="For Furvise QA MG Synthetic Nonclinical 20261027, what is the latest saved journal note? Give its date and briefly quote the note. Use only recorded history; say if uncertain. Do not create or change any pet records.";
const note={kind:"history",id:"synthetic-note-1",ownerId,petId:pet.id,
 body:"QA journal: regular food and restful sleep. No medical issue reported.",
 eventAt:"2026-10-31T08:19:00Z",recordedAt:"2026-11-01T01:10:00Z"};
const input=(q=question,extra={})=>({ownerId,selectedPetId:pet.id,pets:[pet,other],question:q,
 dialogue:[],now:"2026-11-18T08:22:00Z",timeZone:"America/Vancouver",...extra});
const plan=(patch={})=>({id:"t1",kind:"saved_content",needsHistory:true,needsOwnerFacts:false,includeSourceDates:true,
 recordMode:"single",workflow:"none",pets:[],reference:null,missing:["which_record"],...patch});
const completed=(withNote=true)=>({
 presentation:{sourceDates:withNote?["s1"]:[],contextRequired:false},
 components:[{kind:withNote?"saved":"limitation",text:withNote?"The latest verified saved note is cited below.":"I could not verify a saved note.",sources:withNote?["s1"]:[]}],
 quotes:withNote?["s1"]:[],sources:withNote?["s1"]:[],calculations:[],replyType:withNote?"answer":"partial",
 completion:[{task:"t1",status:withNote?"complete":"unresolved",reason:withNote?"none":"source_unavailable",
 componentIndexes:[0],sources:withNote?["s1"]:[],ownerFacts:[],historyFacts:[]}]
});
test("exact production QA prompt requires one named owner-scoped recorded-latest note read",async()=>{
 assert.equal(requiresNamedLatestSavedNote(question,pet,[pet,other]),true);
 const reads=[],stages=[];
 const result=await runReadOnlyAsk(input(),{
  provider:async(request,phase)=>{
   stages.push(phase);
   if(phase==="read_selection")return {calls:[],text:"Try without looking.",taskPlan:[plan()]};
   assert.equal(request.SOURCE_CATALOG.length,1);
   assert.equal(request.SOURCE_CATALOG[0].kind,"history");
   assert.equal(request.context.taskPlan[0].pets[0],"p1");
   assert.deepEqual(request.context.taskPlan[0].missing,[]);
   return completed(true);
  },
  read:async req=>{reads.push(req);return {sources:[note],total:1,hasMore:false,scopeExhausted:true};}
 });
 assert.deepEqual(stages,["read_selection","read_answer"]);
 assert.equal(reads.length,1);
 assert.equal(reads[0].pet.id,pet.id);
 assert.equal(reads[0].pet.ownerId,ownerId);
 assert.equal(reads[0].kind,"history");
 assert.equal(reads[0].goal,"boundary");
 assert.equal(reads[0].orderBy,"recorded");
 assert.equal(reads[0].order,"desc");
 assert.deepEqual(reads[0].terms,[]);
 assert.equal(reads[0].recordedFrom,null);
 assert.equal(reads[0].from,null);
 assert.equal(result.sources.length,1);
 const published=buildReadOnlyPublication(result,ownerId,pet.name);
 assert.equal(result.answer.quotes[0].quote,note.body);
 assert.ok(published.response.sections.some(s=>s.heading==="Saved notes"&&s.items.includes(note.body)));
 assert.ok(JSON.stringify(published.response).includes("2026-11-01"));
 assert.equal(published.response.readOnlyTaskCompletion[0].status,"complete");
 assert.deepEqual(published.response.applicationActions,[]);
});
test("misleading lexical read cannot suppress chronological latest owner read",async()=>{
 const reads=[];
 await runReadOnlyAsk(input(),{
  provider:async(_request,phase)=>phase==="read_selection"?{
   calls:[{id:"model-query",name:"search_saved_records",arguments:JSON.stringify({pet:"p1",from:null,to:null,query:"banana",offset:0,order:"desc",goal:"relevant_records",orderBy:"event"})}],
   text:"",taskPlan:[plan({pets:[],missing:["which_record"]})]}:completed(true),
  read:async r=>{reads.push(r);return {sources:r.goal==="boundary"?[note]:[],total:r.goal==="boundary"?1:0,hasMore:false,scopeExhausted:true};}
 });
 assert.equal(reads[0].goal,"boundary");
 assert.equal(reads[0].terms.length,0);
 assert.ok(reads.some(r=>r.pet.id===pet.id));
});
test("no note genuinely available stays unresolved without an invented quote",async()=>{
 const result=await runReadOnlyAsk(input(),{
  provider:async(_request,phase)=>phase==="read_selection"?{calls:[],text:"",taskPlan:[plan()]}:completed(false),
  read:async()=>({sources:[],total:0,hasMore:false,scopeExhausted:true})
 });
 const published=buildReadOnlyPublication(result,ownerId,pet.name);
 assert.equal(result.sources.length,0);
 assert.deepEqual(result.answer.quotes,[]);
 assert.equal(published.response.readOnlyTaskCompletion[0].status,"unresolved");
 assert.equal(published.response.citationProof,null);
});
test("another named owned pet does not borrow the selected pet's saved history",async()=>{
 let reads=0;
 const q="For Other Owned Pet, what is the latest saved journal note?";
 assert.equal(requiresNamedLatestSavedNote(q,pet,[pet,other]),false);
 const result=await runReadOnlyAsk(input(q),{
  provider:async(_request,phase)=>phase==="read_selection"?{calls:[],text:""}:
   {answer:"Please switch to the requested pet before asking for its journal.",sources:[],quotes:[],calculations:[],replyType:"partial",presentation:{sourceDates:[],contextRequired:false}},
  read:async()=>{reads++;throw Error("UNAUTHORIZED_FALLBACK");}
 });
 assert.equal(reads,0);
 assert.equal(result.sources.length,0);
});
test("cross-owner history source remains rejected before answering",async()=>{
 let calls=0;
 await assert.rejects(runReadOnlyAsk(input(),{
  provider:async(_request,phase)=>{calls++;return phase==="read_selection"?{calls:[],text:"",taskPlan:[plan()]}:completed(true);},
  read:async()=>({sources:[{...note,ownerId:"foreign-owner"}],total:1,hasMore:false,scopeExhausted:true})
 }),/SOURCE_NOT_AUTHORIZED/);
 assert.equal(calls,1);
});
test("unrelated casual greeting does not touch journal",async()=>{
 assert.equal(requiresNamedLatestSavedNote("hello",pet,[pet,other]),false);
 let reads=0;
 await runReadOnlyAsk(input("hello"),{
  provider:async(_request,phase)=>phase==="read_selection"?{calls:[],text:"Hello"}:
   {answer:"Hello!",sources:[],quotes:[],calculations:[],replyType:"answer",presentation:{sourceDates:[],contextRequired:false}},
  read:async()=>{reads++;throw Error("CASUAL_READ");}
 });
 assert.equal(reads,0);
});

test("a named event-date boundary resolves record choice without a particular note ID",async()=>{
 const cat={...pet,name:"Maple"};
 const reads=[];
 await runReadOnlyAsk(input("For Maple, which event in the journal has the newest event date?",{pets:[cat,other]}),{
  provider:async(request,phase)=>{
   if(phase==="read_selection")return {calls:[],text:"Which saved result?",taskPlan:[plan()]};
   assert.deepEqual(request.context.taskPlan[0].missing,[]);
   return completed(true);
  },
  read:async req=>{reads.push(req);return {sources:[note],total:1,hasMore:false,scopeExhausted:true};}
 });
 assert.deepEqual(reads.map(r=>[r.pet.id,r.goal,r.orderBy,r.order]),[[cat.id,"boundary","event","desc"]]);
});
