import assert from "node:assert/strict";
import {readOnlySuccessRouteFixture as fixture} from "./ask-read-only-success-route.mjs";
import {note} from "./ask-read-only-failure-route.mjs";
import {AiAdmissionError} from "../../app/lib/ai/usage-guard/errors.ts";
const originalInfo=console.info;console.info=()=>{};
try{
 for(const [question,answer,expected] of [
  ["What did Juniper’s September 15 care note say about her routine?","Which year was that saved note from?",/Which year/],
  ["What did Juniper’s February 30 care note say about her routine?","That date isn’t valid. Which date did you mean?",/date isn’t valid/]
 ]){
  const f=fixture({answer,replyType:"clarification"});
  try{
   const response=await f.send(question),body=await response.json();
   assert.equal(response.status,200,JSON.stringify(f.state.errors));assert.match(body.answer,expected);
   assert.equal(f.state.reads,0);assert.ok(f.state.tables.every(table=>table==="dog_profiles"));
   assert.equal(f.state.calls,2);assert.deepEqual(f.admitted,f.wire);
   assert.equal(body.turn.taskOutcome,"limited");assert.equal(body.creditsUsed,0);
   assert.equal(f.state.persistedAnswer.response_data.turn.finalStage,"COMPLETED");assert.equal(f.state.credit.status,"released");
   assert.ok(f.state.events.indexOf("assistant:terminal")<f.state.events.indexOf("credit:release"));
  }finally{await f.release();}
 }
 for(const question of [
  "What did Juniper’s September 15, 2021 care note say about her routine?",
  "What did Juniper’s September 15 care note say about her medication and routine?"
 ]){
  const f=fixture({admissionError:new AiAdmissionError("AI_TEMPORARILY_UNAVAILABLE","offline admission sentinel")});
  const response=await f.send(question),body=await response.json();
  assert.equal(response.status,503);assert.equal(body.code,"TEMPORARY_PROVIDER_FAILURE");
  assert.equal(f.state.calls,0);assert.equal(f.state.reads,0);assert.equal(f.state.credit,null);
  assert.doesNotMatch(JSON.stringify(body),/Which year was that saved note from/);
  await f.release();
 }
 const prior=process.env.FURVISE_RATE_LIMIT_HASH_SECRET;process.env.FURVISE_RATE_LIMIT_HASH_SECRET="offline-native-date-route-citation-secret";
 try{
  const body="  Exact saved routine.\r\nSpacing stays.\t  ",record={...note,body,eventAt:"2026-09-15T12:00:00Z",recordedAt:"2026-09-16T12:00:00Z"};
  const f=fixture({records:[record],providerCreate:async(request,call)=>call===1
   ?{status:"completed",output:[{type:"function_call",call_id:"history",name:"search_saved_records",arguments:JSON.stringify({pet:"p1",from:"2026-09-15",to:"2026-09-15",query:null,offset:0,order:"desc"})}],usage:{input_tokens:100,output_tokens:20}}
   :{status:"completed",output:[{type:"message",content:[{type:"output_text",text:JSON.stringify({answer:"The saved observation is quoted below.",quotes:["s1"],sources:["s1"],calculations:[],replyType:"answer"})}]}],usage:{input_tokens:100,output_tokens:40}}
  });
  try{
   const response=await f.send("Quote Juniper’s September 15, 2026 saved routine note exactly."),result=await response.json();
   assert.equal(response.status,200,JSON.stringify(f.state.errors));assert.equal(f.state.reads,1);assert.equal(f.state.readRequests[0].from,"2026-09-15");assert.equal(f.state.readRequests[0].to,"2026-09-15");
   assert.equal(result.response.sections.find(s=>s.heading==="Saved notes").items[0],body);assert.ok(result.response.citationProof);
   assert.equal(f.state.persistedAnswer.response_data.sections.find(s=>s.heading==="Saved notes").items[0],body);
   assert.deepEqual(f.admitted,f.wire);assert.equal(f.state.calls,2);assert.equal(result.creditsUsed,1);assert.equal(result.dataChanged,false);
  }finally{await f.release();}
 }finally{if(prior===undefined)delete process.env.FURVISE_RATE_LIMIT_HASH_SECRET;else process.env.FURVISE_RATE_LIMIT_HASH_SECRET=prior;}
}finally{console.info=originalInfo;}
