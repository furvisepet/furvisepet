import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {engineFixture as emergencyFixture,cedar,id as legacyId} from "./helpers/ask-route-ordering.mjs";
import {ownerNoteSourceSpans} from "../app/lib/intelligence/owner-note-request.ts";
import {readOnlySuccessRouteFixture as fixture} from "./helpers/ask-read-only-success-route.mjs";
import {id,note} from "./helpers/ask-read-only-failure-route.mjs";
import {POST as confirm,request as confirmRequest,messageId} from "./helpers/ask-read-only-action-routes.mjs";

function wire(output){return {status:"completed",output,usage:{input_tokens:1000,output_tokens:80}};}
function selection(name="search_saved_records",args={pet:"p1",from:null,to:null,query:null,offset:0,order:"desc"}){
 return wire([{type:"function_call",id:"fc_read",call_id:"read",name,arguments:JSON.stringify(args)}]);
}
function answer(value){return wire([{type:"message",content:[{type:"output_text",text:JSON.stringify(value)}]}]);}
function deniedAuth(){let io=0;globalThis.__readOnlyMutationAuth={userId:id(1),supabase:new Proxy({},{get(){io++;throw Error("disabled action attempted IO");}})};return ()=>io;}

test("combined note-save and history request can read exact evidence without a write or pending confirmation",async()=>{
 const secret=process.env.FURVISE_RATE_LIMIT_HASH_SECRET;process.env.FURVISE_RATE_LIMIT_HASH_SECRET="synthetic-route-ordering-proof-secret-1109ad";
 const records=[{...note,id:id(8),body:"Juniper weighed 4.5 kg.",eventAt:"2026-09-15T12:00:00Z"},note];
 const f=fixture({records,providerCreate:(_request,n)=>n===1?selection():answer({answer:"I can read the saved notes, but I cannot save a new one through Ask.",quotes:["s1","s2"],sources:["s1","s2"],calculations:[],replyType:"partial"})});
 try{
  const response=await f.send("Save Juniper refused lunch, then show the two most recent notes."),body=await response.json();
  assert.equal(response.status,200,JSON.stringify(f.state.errors));assert.equal(f.state.calls,2);assert.equal(f.state.reads,1);
  assert.deepEqual(f.wire,f.admitted);assert.equal(body.dataChanged,false);assert.deepEqual(body.response.applicationActions,[]);
  assert.equal(body.response.pendingAppend,undefined);
  assert.deepEqual(body.response.sections.find(section=>section.heading==="Saved notes").items,records.map(row=>row.body));
  assert.ok(body.response.citationProof);assert.deepEqual(f.state.persistedAnswer.response_data.sections,body.response.sections);
  assert.equal(f.state.credit.status,"released");assert.ok(f.state.events.indexOf("assistant:terminal")<f.state.events.indexOf("credit:release"));
  assert.ok(f.state.tables.every(table=>table==="dog_profiles"));
 }finally{await f.release();if(secret===undefined)delete process.env.FURVISE_RATE_LIMIT_HASH_SECRET;else process.env.FURVISE_RATE_LIMIT_HASH_SECRET=secret;}
});
test("splitter emits exact offset spans only; no answer, scope, depth, or authority",()=>{
 const spans=ownerNoteSourceSpans(cedar,legacyId(31));assert.deepEqual(spans.map(s=>[s.role,s.start,s.end]),[["note",9,29],["companion",30,59]]);
 for(const span of spans){assert.equal(cedar.slice(span.start,span.end),span.text);assert.ok(span.id);assert.equal(span.sourceMessageId,legacyId(31));for(const key of ["answer","memoryDepth","history","execute","persist","operation"])assert.equal(span[key],undefined);}
});
for(const mode of ["modelDown","conversationFailure","denied","foreignPet"])test("actual public failure cannot write: "+mode,async()=>{
 const options=mode==="modelDown"?{providerCreate:()=>{throw Object.assign(Error("synthetic provider unavailable"),{status:500});}}
  :mode==="conversationFailure"?{conversationError:Error("synthetic durable conversation unavailable")}
  :mode==="denied"?{authentication:{response:new Response(null,{status:401})}}:{};
 const f=fixture(options);
 try{
  const res=await f.send("Save this observation.",mode==="foreignPet"?{petId:id(99)}:{});assert.ok(!res.ok);
  assert.equal(f.state.reads,0);assert.ok(f.state.tables.every(table=>table==="dog_profiles"));assert.equal(f.state.persistedAnswer,null);
  assert.equal(f.state.calls,mode==="modelDown"?1:0);
  if(mode==="denied"||mode==="conversationFailure")assert.equal(f.state.credit,null);else assert.equal(f.state.credit.status,"released");
 }finally{await f.release();}
});
for(const condition of ["missing mutation receipt","unavailable mutation database"])test("public confirmation cannot execute under "+condition,async()=>{
 const count=deniedAuth();const res=await confirm(confirmRequest(),{params:Promise.resolve({messageId})});
 assert.equal(res.status,404);assert.equal(count(),0);assert.equal(res.headers.get("cache-control"),"private, no-store");
});
test("public confirmation stays unavailable across owner, message and decision substitutions",async()=>{
 const count=deniedAuth();
 for(const candidate of [messageId,id(72)])for(const decision of ["confirm","cancel"]){
  const res=await confirm(confirmRequest("POST",{actionId:id(71),ownerId:id(99),decision}),{params:Promise.resolve({messageId:candidate})});
  assert.equal(res.status,404);
 }
 assert.equal(count(),0);
});
test("fixed emergency response requires no Brain, factual read, capability, or save",async()=>{
 const f=emergencyFixture({modelDown:true});const result=await(await f.send("Cedar cannot breathe. Save this note.")).json();
 assert.equal(result.success,true);assert.match(result.response.directAnswer,/emergency veterinarian/);assert.equal(f.state.planner,0);
 assert.equal(f.rows.pet_care_entries.length,2);assert.equal(f.rows.ask_action_capabilities.length,0);assert.deepEqual(f.state.events,[]);
});
test("public conversation uses the native bounded path; retained planning context does not acquire history",async()=>{
 const f=fixture({answer:"A prime number has two positive divisors.",replyType:"answer"});
 try{
  const res=await f.send("Explain a prime number.");assert.equal(res.status,200);assert.equal(f.state.calls,2);assert.equal(f.state.reads,0);assert.deepEqual(f.wire,f.admitted);
 }finally{await f.release();}
 const planning=readFileSync(new URL("../app/lib/intelligence/planning-context.ts",import.meta.url),"utf8");
 assert.deepEqual([...planning.matchAll(/\.from\("([^"]+)"\)/g)].map(m=>m[1]),["dog_profiles","ask_conversations","ask_conversation_messages"]);
 assert.match(planning,/select\("id,user_id,name,species,sex"\)/);
 assert.doesNotMatch(planning,/pet_concerns|ref: randomUUID|replaceReferences|concernReferences|pet_care_entries/);
});
test("malformed or mutation tool selection fails before retrieval without a repair call",async()=>{
 for(const [name,args] of [
  ["append_saved_record",{pet:"p1",body:"invented text"}],
  ["search_saved_records",{pet:"p99",from:null,to:null,query:null,offset:0,order:"desc"}],
  ["search_saved_records",{pet:"p1",from:"2026-02-30",to:null,query:null,offset:0,order:"desc"}]
 ]){
  const f=fixture({providerCreate:()=>selection(name,args)});
  try{
   const res=await f.send("Read the saved observation.");assert.ok(!res.ok);assert.equal(f.state.calls,1);assert.equal(f.state.reads,0);assert.equal(f.state.persistedAnswer,null);assert.equal(f.state.credit.status,"released");
  }finally{await f.release();}
 }
});
test("unavailable saved history releases credit and cannot publish an invented companion answer",async()=>{
 const f=fixture({readError:Error("synthetic saved history unavailable"),providerCreate:()=>selection()});
 try{
  const res=await f.send("Quote the saved note.");assert.ok(!res.ok);assert.equal(f.state.calls,1);assert.equal(f.state.reads,1);assert.equal(f.state.persistedAnswer,null);assert.equal(f.state.credit.status,"released");
 }finally{await f.release();}
});
test("confirmed temporal scope is rejected before planning or persistence when durability is unavailable",async()=>{
 const f=fixture();
 try{
  const res=await f.send("Read a saved record.",{confirmedTemporalScope:{role:"event_time",from:"2024-03-10T08:00:00Z",to:"2024-03-11T07:00:00Z",timeZone:"America/Los_Angeles",source:"client_user_confirmed"}});
  const body=await res.json();assert.equal(res.status,400);assert.equal(body.code,"INVALID_CURRENT_INPUT");
  assert.equal(f.state.calls,0);assert.equal(f.state.credit,null);assert.equal(f.state.userMessages,0);
 }finally{await f.release();}
});
