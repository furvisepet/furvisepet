import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
// Test-only no-op for Next.js's server boundary; all actual publication code still runs.
registerHooks({resolve(specifier,context,nextResolve) {
 if(specifier==="server-only")return {url:"data:text/javascript,",shortCircuit:true};
 return nextResolve(specifier,context);
}});
process.env.FURVISE_RATE_LIMIT_HASH_SECRET="synthetic-test-secret-".repeat(4);
const { runReadOnlyAsk }=await import("../app/lib/ask-read-only/core.mjs");
const { buildReadOnlyPublication }=await import("../app/lib/ask-read-only/publication.ts");
const pet={id:"synthetic-qa-dog",ownerId:"synthetic-owner",name:"Synthetic QA Dog",species:"dog"};
const note={kind:"history",id:"synthetic-note",ownerId:pet.ownerId,petId:pet.id,
 body:"Synthetic QA recorded note, no clinical information.",
 eventAt:"2026-10-31T10:00:00Z",recordedAt:"2026-10-31T12:00:00Z"};
const input=question=>({ownerId:pet.ownerId,selectedPetId:pet.id,pets:[pet],dialogue:[],
 question,now:"2026-11-17T12:00:00Z",timeZone:"America/Vancouver"});
test("verified single journal source fills empty date intro and displays concise but honest search scope",async()=>{
 const call={id:"c1",name:"search_saved_records",arguments:JSON.stringify({
  pet:"p1",from:null,to:null,query:null,offset:0,goal:"boundary",order:"desc",orderBy:"recorded"})};
 const result=await runReadOnlyAsk(input("What is the latest saved journal note? Give its date and quote."),{
  provider:async(_request,phase)=>phase==="read_selection"?{text:"",calls:[call]}:{
   answer:"The latest saved journal note I found is dated.",sources:["s1"],quotes:["s1"],
   calculations:[],replyType:"answer",presentation:{sourceDates:["s1"],contextRequired:false}},
  read:async()=>({sources:[note],total:1,inspected:1,scopeExhausted:true,hasMore:false,
   discovery:[{mode:"chronological",inspected:1,total:1,pages:1,exhausted:true}]})
 });
 const pub=buildReadOnlyPublication(result,pet.ownerId,pet.name);
 assert.match(pub.response.summary,/dated 2026-10-31\./);
 assert.ok(pub.response.sections.some(section=>section.heading==="Saved notes"&&section.items.includes(note.body)));
 const coverage=pub.response.sections.find(section=>section.heading==="Search coverage");
 assert.ok(coverage);
 assert.equal(coverage.items.length,1);
 assert.match(coverage.items[0],/Checked 1 saved-note candidate/);
 assert.match(coverage.items[0],/does not establish all related history/);
 assert.ok(pub.response.citationProof);
 assert.deepEqual(pub.response.applicationActions,[]);
});
test("simple greeting stays unburdened by search coverage",async()=>{
 const result=await runReadOnlyAsk(input("hi"),{
  provider:async(_request,phase)=>phase==="read_selection"?{text:"Hi!",calls:[]}:{
   answer:"Hi! How can I help today?",sources:[],quotes:[],calculations:[],replyType:"answer",
   presentation:{sourceDates:[],contextRequired:false}},
  read:async()=>{throw new Error("HISTORY_READ_FOR_GREETING");}
 });
 const pub=buildReadOnlyPublication(result,pet.ownerId,pet.name);
 assert.match(pub.response.directAnswer,/Hi! How can I help today/);
 assert.equal(pub.response.sections.some(section=>section.heading==="Search coverage"),false);
 assert.deepEqual(pub.response.applicationActions,[]);
});
test("cross-pet dated weight prose repairs the missing date using only verified cited note",async()=>{
 const aster={id:"synthetic-aster",ownerId:pet.ownerId,name:"Aster",species:"dog"};
 const history={kind:"history",id:"synthetic-aster-sept",ownerId:pet.ownerId,petId:aster.id,
  body:"Aster weighed 30.31 kg. Monthly care check recorded stable appetite, usual routine, and no new ongoing concern.",
  eventAt:"2026-09-15T12:00:00Z",recordedAt:"2026-09-16T12:00:00Z"};
 const profile={kind:"profile",id:aster.id,ownerId:pet.ownerId,petId:aster.id,
  body:"Aster, dog, 11 years.",eventAt:"2026-08-01T12:00:00Z",recordedAt:"2026-08-02T12:00:00Z"};
 const result=await runReadOnlyAsk({...input("Tell me about Aster from her saved notes."),
  pets:[pet,aster],selectedPetId:pet.id},{
  provider:async (_req,phase)=>phase==="read_selection"?{text:"",calls:[]}:
   {answer:"One dated note says that on Aster weighed 30.31 kg, and the monthly care check recorded stable appetite. I cannot infer current health from this older record.",
    sources:["s2"],quotes:["s2"],calculations:[],replyType:"answer",presentation:{sourceDates:["s2"],contextRequired:false}},
  read:async request=>({sources:[request.kind==="profile"?profile:history],total:1,scopeExhausted:true,hasMore:false})
 });
 const pub=buildReadOnlyPublication(result,pet.ownerId,pet.name);
 assert.match(pub.response.summary,/on 2026-09-15, Aster weighed 30\.31 kg/);
 assert.doesNotMatch(pub.response.summary,/on Aster weighed/);
 assert.match(pub.response.summary,/recorded date: 2026-09-16/);
 assert.equal(result.sources.filter(s=>s.kind==="history").length,1);
 assert.equal(pub.response.readOnlyEvidence,true);
 assert.ok(pub.response.citationProof);
 assert.deepEqual(pub.response.applicationActions,[]);
});
test("ambiguous cross-pet source never supplies a made-up date to the opening sentence",async()=>{
 const aster={id:"synthetic-aster",ownerId:pet.ownerId,name:"Aster",species:"dog"};
 const history={kind:"history",id:"synthetic-aster-other",ownerId:pet.ownerId,petId:aster.id,
  body:"Aster rested calmly after a short walk.",eventAt:"2026-09-15T12:00:00Z",recordedAt:"2026-09-16T12:00:00Z"};
 const profile={kind:"profile",id:aster.id,ownerId:pet.ownerId,petId:aster.id,
  body:"Aster, dog, 11 years.",eventAt:"2026-08-01T12:00:00Z",recordedAt:"2026-08-02T12:00:00Z"};
 const result=await runReadOnlyAsk({...input("Tell me about Aster from her saved notes."),
  pets:[pet,aster],selectedPetId:pet.id},{
  provider:async (_req,phase)=>phase==="read_selection"?{text:"",calls:[]}:
   {answer:"One dated note says that on Aster weighed 30.31 kg.",sources:["s2"],quotes:["s2"],
    calculations:[],replyType:"answer",presentation:{sourceDates:["s2"],contextRequired:false}},
  read:async request=>({sources:[request.kind==="profile"?profile:history],total:1,scopeExhausted:true,hasMore:false})
 });
 const pub=buildReadOnlyPublication(result,pet.ownerId,pet.name);
 assert.match(pub.response.summary,/on Aster weighed/);
 assert.doesNotMatch(pub.response.summary,/on 2026-09-15, Aster weighed/);
});
test("exact source facts stay intact while surrounding execution claims are removed",async()=>{
 const {guardVerifiedSourceText}=await import("../app/lib/ask-read-only/publication.ts");
 const exact="Here’s what I found in the saved notes:\nQA Marigold 20Y - event 2011-05-14: “Synthetic QA record: Marigold changed to salmon food; no rabbit food switch was recorded.”";
 const safe=guardVerifiedSourceText(exact,exact);
 assert.equal(safe.checked,exact);assert.equal(safe.stateRejected,false);
 const unsafe=guardVerifiedSourceText("I saved the profile. "+exact,exact);
 assert.doesNotMatch(unsafe.checked,/I saved the profile/);
 assert.match(unsafe.checked,/Marigold changed to salmon food/);
 assert.equal(unsafe.stateRejected,true);
});
