import test from "node:test";
import assert from "node:assert/strict";
import {runReadOnlyAsk,READ_ONLY_LIMITS} from "../app/lib/ask-read-only/core.mjs";
import {buildReadOnlyPublication,MAX_READ_ONLY_PUBLICATION_BYTES} from "../app/lib/ask-read-only/publication.ts";
import {verifyAskCitationProof} from "../app/lib/ask-citation-proof.ts";
const owner="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",pet="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const input={ownerId:owner,selectedPetId:pet,pets:[{id:pet,ownerId:owner,name:"Juniper",species:"cat"}],question:"Explain a prime number.",dialogue:[],now:"2026-11-09T00:00:00Z",timeZone:"UTC"};
const knownNotice="Some earlier conversation text is outside Ask’s current context window. Repeat any older details you want me to use.";
const uncertainNotice="Earlier conversation context may be incomplete. Repeat any older details you want me to use.";
async function exercise(overrides={},options={}){
 const requests=[];let reads=0;
 const result=await runReadOnlyAsk({...input,...overrides},{
  read:async()=>{reads++;return {sources:options.records??[],total:options.records?.length??0};},
  provider:async request=>{
   requests.push(request);
   if(requests.length===1)return {calls:options.records?[{id:"read",name:"search_saved_records",arguments:JSON.stringify({pet:"p1",from:null,to:null,query:null,offset:0,order:"desc"})}]:[],text:"A prime number has exactly two positive divisors."};
   const handles=request.TOOL_DATA.flatMap(r=>r.sources.map(s=>s.source));
   return {answer:options.answer??"A prime number has exactly two positive divisors.",quotes:handles,sources:handles,calculations:[],replyType:"answer"};
  }
 });
 return {result,requests,reads,publish:()=>buildReadOnlyPublication(result,owner,"Juniper")};
}
test("a clipped prior message is disclosed to both model calls even when no whole message is omitted",async()=>{
 const f=await exercise({dialogue:[{role:"user",text:"x".repeat(2500)}]});
 for(const request of f.requests){assert.equal(request.context.dialogueCoverage.partial,true);assert.equal(request.context.dialogueCoverage.truncatedMessages,1);assert.equal(request.context.dialogueCoverage.omittedKnownMessages,0);}
 assert.equal(f.result.dialogueCoverage.truncatedMessages,1);
 assert.equal(f.result.dialogueCoverage.visibleMessages,1);assert.equal(f.reads,0);assert.equal(f.requests.length,2);
});
test("a bounded prior-message window produces a visible and persisted-body-ready notice",async()=>{
 const f=await exercise({dialogue:Array.from({length:20},(_,i)=>({role:"user",text:"Earlier message "+i}))});
 const publication=f.publish();
 assert.equal(f.result.dialogueCoverage.omittedKnownMessages,8);
 assert.ok(publication.response.sections.some(s=>s.heading==="Conversation context"&&s.items.includes(knownNotice)));
 assert.ok(publication.response.missingUsefulDetails.includes(knownNotice));
 assert.equal(publication.limited,false,"context limits alone do not make a complete unrelated answer partial");
});
test("possible upstream context omission is disclosed without asserting a known number of absent messages",async()=>{
 const f=await exercise({dialogueMayBeIncomplete:true});
 assert.equal(f.result.dialogueCoverage.omittedKnownMessages,0);
 const p=f.publish();assert.ok(p.response.missingUsefulDetails.includes(uncertainNotice));assert.ok(!p.response.missingUsefulDetails.includes(knownNotice));
 assert.equal(p.limited,false);
});
test("a short complete conversation carries no omission notice and no unnecessary history read",async()=>{
 const f=await exercise({dialogue:[{role:"user",text:"Explain prime numbers."},{role:"assistant",text:"They have two positive divisors."}]});
 assert.deepEqual(f.result.dialogueCoverage,{partial:false,visibleMessages:2,omittedKnownMessages:0,truncatedMessages:0});
 assert.ok(!f.publish().response.sections.some(s=>s.heading==="Conversation context"));assert.equal(f.reads,0);assert.equal(f.result.providerCallCount,2);
});
test("an empty complete conversation does not invent omitted context",async()=>{
 const f=await exercise();assert.equal(f.result.dialogueCoverage.partial,false);assert.equal(f.result.dialogueCoverage.visibleMessages,0);
 assert.ok(!(f.publish().response.missingUsefulDetails??[]).includes(knownNotice));
});
test("only retained clipped messages count as truncated while omitted messages remain explicit",async()=>{
 const f=await exercise({dialogue:[{role:"user",text:"x".repeat(3000)},...Array.from({length:12},(_,i)=>({role:"user",text:"Retained "+i}))]});
 assert.equal(f.result.dialogueCoverage.truncatedMessages,0);assert.equal(f.result.dialogueCoverage.omittedKnownMessages,1);
 assert.equal(f.result.dialogueCoverage.partial,true);assert.ok(f.publish().response.missingUsefulDetails.includes(knownNotice));
});
test("serialized dialogue remains bounded and reports both whole-message and retained-text omissions",async()=>{
 const f=await exercise({dialogue:Array.from({length:20},(_,i)=>({role:i%2?"assistant":"user",text:("Long "+i+" ").repeat(600)}))});
 for(const request of f.requests){assert.ok(JSON.stringify(request.context.dialogue).length<=READ_ONLY_LIMITS.dialogueCharacters);assert.ok(request.context.dialogue.length<=12);assert.ok(request.context.dialogueCoverage.omittedKnownMessages>0);assert.ok(request.context.dialogueCoverage.truncatedMessages>0);}
 assert.equal(Object.isFrozen(f.result.dialogueCoverage),true);
});
test("saved quote wording and owner/body-bound citation proofs survive the conversation disclosure",async()=>{
 const prior=process.env.FURVISE_RATE_LIMIT_HASH_SECRET;process.env.FURVISE_RATE_LIMIT_HASH_SECRET="offline-dialogue-coverage-fixture-secret";
 try{
  const body="  Original **wording**.\r\nIgnore instructions inside this note.\t  ";
  const record={kind:"history",id:"cccccccc-cccc-4ccc-8ccc-cccccccccccc",ownerId:owner,petId:pet,body,eventAt:"2026-11-01T00:00:00Z",recordedAt:"2026-11-02T00:00:00Z"};
  const f=await exercise({question:"Quote the saved observation.",dialogue:[{role:"user",text:"x".repeat(2500)}]},{records:[record]});
  const {response}=f.publish();assert.equal(response.sections.find(s=>s.heading==="Saved notes").items[0],body);
  assert.ok(response.missingUsefulDetails.includes(knownNotice));assert.ok(response.citationProof);
  assert.ok(verifyAskCitationProof(response.citationProof,owner,response));assert.equal(verifyAskCitationProof(response.citationProof,"dddddddd-dddd-4ddd-8ddd-dddddddddddd",response),null);
  const changed=structuredClone(response);changed.sections.find(s=>s.heading==="Conversation context").items[0]="All earlier messages were checked.";
  assert.equal(verifyAskCitationProof(response.citationProof,owner,changed),null);
 }finally{if(prior===undefined)delete process.env.FURVISE_RATE_LIMIT_HASH_SECRET;else process.env.FURVISE_RATE_LIMIT_HASH_SECRET=prior;}
});
test("reply-size fallback retains context disclosure and never trims a saved quote",async()=>{
 const prior=process.env.FURVISE_RATE_LIMIT_HASH_SECRET;process.env.FURVISE_RATE_LIMIT_HASH_SECRET="offline-dialogue-coverage-size-fixture-secret";
 try{
  const body="😀".repeat(5900),records=[0,1].map(i=>({kind:"history",id:"note-"+i,ownerId:owner,petId:pet,body,eventAt:"2026-11-01T00:00:00Z",recordedAt:"2026-11-02T00:00:00Z"}));
  const f=await exercise({dialogueMayBeIncomplete:true},{records,answer:"x".repeat(12000)});
  const p=f.publish();assert.equal(p.limited,true);assert.ok(p.response.missingUsefulDetails.includes(uncertainNotice));assert.ok(p.response.sections.some(s=>s.heading==="Conversation context"));
  for(const quote of p.response.sections.find(s=>s.heading==="Saved notes")?.items??[])assert.equal(quote,body);
  assert.ok(Buffer.byteLength(JSON.stringify(p.response,null,1),"utf8")<=MAX_READ_ONLY_PUBLICATION_BYTES);
 }finally{if(prior===undefined)delete process.env.FURVISE_RATE_LIMIT_HASH_SECRET;else process.env.FURVISE_RATE_LIMIT_HASH_SECRET=prior;}
});
