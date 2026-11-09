import test from "node:test";
import assert from "node:assert/strict";
import {runReadOnlyAsk} from "../app/lib/ask-read-only/core.mjs";
const pet={id:"pet-test",ownerId:"owner-test",name:"Juniper",species:"cat"};
const input={ownerId:pet.ownerId,selectedPetId:pet.id,pets:[pet],question:"What was recorded?",dialogue:[],timeZone:"UTC",now:"2026-11-08T12:00:00Z"};
const source={kind:"history",id:"note-test",ownerId:pet.ownerId,petId:pet.id,body:"Original saved observation.",eventAt:"2026-01-01T12:00:00Z",recordedAt:"2026-01-01T12:01:00Z"};
const call=id=>({id,name:"search_saved_records",arguments:JSON.stringify({pet:"p1",from:null,to:null,query:null,offset:0,order:"desc"})});
for(const replyType of ["answer","partial"])test("empty reads cannot publish fabricated saved-record prose: "+replyType,async()=>{
 let calls=0;
 const result=await runReadOnlyAsk(input,{read:async()=>({sources:[],total:0}),provider:async()=>++calls===1?{calls:[call("one")],text:""}:{answer:"The saved note said invented pineapple.",quotes:[],sources:[],calculations:[],replyType}});
 assert.equal(calls,2);assert.equal(result.answer.limited,true);
 assert.doesNotMatch(result.answer.answer,/invented pineapple/);assert.match(result.answer.answer,/saved|evidence|source/i);
});
test("retrieved but unselected evidence cannot certify attributed prose",async()=>{
 let calls=0;
 const result=await runReadOnlyAsk(input,{read:async()=>({sources:[source],total:1}),provider:async()=>++calls===1?{calls:[call("one")],text:""}:{answer:"The record proves invented pineapple.",quotes:[],sources:[],calculations:[],replyType:"answer"}});
 assert.equal(calls,2);assert.equal(result.answer.limited,true);assert.equal(result.sources.length,0);
 assert.doesNotMatch(result.answer.answer,/invented pineapple/);assert.match(result.answer.answer,/verify|source-backed|evidence/i);
});
test("a source that changes across overlapping reads fails before the answer call",async()=>{
 let calls=0,reads=0;
 await assert.rejects(()=>runReadOnlyAsk(input,{read:async()=>({sources:[++reads===1?source:{...source,body:"Changed observation."}],total:1}),provider:async()=>{calls++;return {calls:[call("one"),call("two")],text:""};}}),/SOURCE_CHANGED/);
 assert.equal(calls,1);assert.equal(reads,2);
});
test("both model phases see explicit bounded dialogue coverage",async()=>{
 const requests=[];
 const dialogue=Array.from({length:20},(_,i)=>({role:i%2?"assistant":"user",text:"Entry "+i+" "+ "context ".repeat(200)}));
 await runReadOnlyAsk({...input,dialogue},{read:async()=>{throw Error("no read expected");},provider:async request=>{requests.push(request);return requests.length===1?{calls:[],text:"A general draft."}:{answer:"I only see a bounded recent conversation.",quotes:[],sources:[],calculations:[],replyType:"answer"};}});
 for(const request of requests){
  assert.equal(request.context.dialogueCoverage.partial,true);
  assert.equal(request.context.dialogueCoverage.visibleMessages,request.context.dialogue.length);
  assert.ok(request.context.dialogueCoverage.omittedKnownMessages>0);
 }
});

 test("ambiguous fractional, ranged and spaced numbers cannot become a different saved measurement",async()=>{
 const {readSourceMeasurements}=await import("../app/lib/ask-read-only/calculations.mjs");
 for(const text of ["1 / 2 kg","1⁄2 kg","4–5 kg","4 – 5 kg","−2 kg","1 234 kg","1\u202f234 kg"])
  assert.deepEqual(readSourceMeasurements(text,"s1"),[],text);
 assert.equal(readSourceMeasurements("Weight: 4.5 kg. Later: 5 kg.","s1").length,2);
 });
