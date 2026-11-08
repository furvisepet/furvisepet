import test from "node:test";
import assert from "node:assert/strict";
import {runReadOnlyAsk} from "../app/lib/ask-read-only/core.mjs";
import {buildReadOnlyPublication,MAX_READ_ONLY_PUBLICATION_BYTES} from "../app/lib/ask-read-only/publication.ts";
import {verifyAskCitationProof} from "../app/lib/ask-citation-proof.ts";
import {parseAskConversationResponse} from "../app/lib/ask.mjs";

async function resultFor(records,answer,replyType="answer"){
 let calls=0;
 return runReadOnlyAsk({ownerId:"owner",selectedPetId:"pet",pets:[{id:"pet",ownerId:"owner",name:"Juniper",species:"cat"}],
 question:"Explain the selected information.",dialogue:[],now:"2026-01-01T00:00:00Z",timeZone:"UTC"},{
  read:async()=>({sources:records,total:records.length}),
  provider:async()=>++calls===1?{calls:records.length?[{id:"read",name:"search_saved_records",arguments:JSON.stringify({pet:"p1",from:null,to:null,query:null,offset:0})}]:[],text:records.length?"":answer}:
  {answer,quotes:records.map((_,i)=>"s"+(i+1)),sources:[],calculations:[],replyType}
 });
}
test("multi-byte whole-note publication fits the database with turn metadata and verifiable citations",async t=>{
 const previous=process.env.FURVISE_RATE_LIMIT_HASH_SECRET;
 process.env.FURVISE_RATE_LIMIT_HASH_SECRET="test-publication-size-key-32-characters-long";
 t.after(()=>{if(previous===undefined)delete process.env.FURVISE_RATE_LIMIT_HASH_SECRET;else process.env.FURVISE_RATE_LIMIT_HASH_SECRET=previous;});
 const records=["記".repeat(12000),"録".repeat(12000)].map((body,i)=>({kind:"history",id:"note-"+i,ownerId:"owner",petId:"pet",body,eventAt:"2025-01-01T00:00:00Z",recordedAt:"2025-01-02T00:00:00Z"}));
 const result=await resultFor(records,"Both requested observations are quoted below.");
 const published=buildReadOnlyPublication(result,"owner","Juniper");
 assert.equal(published.limited,true);assert.equal(result.providerCallCount,2);
 const notes=published.response.sections.find(section=>section.heading==="Saved notes").items;
 assert.ok(notes.length>0&&notes.length<records.length);
 for(const note of notes)assert.ok(records.some(row=>row.body===note),"quotes must be whole original strings");
 assert.ok(Buffer.byteLength(JSON.stringify(published.response,null,1),"utf8")<=MAX_READ_ONLY_PUBLICATION_BYTES);
 const persisted={...published.response,turn:{requestId:"a".repeat(36),logicalRequestId:"b".repeat(36),finalStage:"COMPLETED",answerOutcome:"limited",diagnostic:"x".repeat(4096)}};
 assert.ok(Buffer.byteLength(JSON.stringify(persisted,null,1),"utf8")<65536);
 const replay=parseAskConversationResponse(persisted);
 assert.deepEqual(replay.sections,published.response.sections);
 const proof=verifyAskCitationProof(published.response.citationProof,"owner",replay);
 assert.equal(proof.sources.length,2);assert.match(replay.summary,/reply size limit/);
});
test("large general prose becomes an honest bounded partial response without another provider request",async()=>{
 const result=await resultFor([],"字".repeat(12000));
 const published=buildReadOnlyPublication(result,"owner","Juniper");
 assert.equal(published.limited,true);assert.equal(result.providerCallCount,2);
 assert.match(published.response.summary,/reply size limit/);
 assert.ok(Buffer.byteLength(JSON.stringify(published.response,null,1),"utf8")<=MAX_READ_ONLY_PUBLICATION_BYTES);
 assert.equal(published.response.sections.length,0);
});
test("clarifications remain limited without a misleading generic failure card; partial answers retain the notice",async()=>{
 for(const replyType of ["clarification","partial"]){
  const result=await resultFor([],replyType==="clarification"?"Which date did you mean?":"Here is the available portion.",replyType);
  const published=buildReadOnlyPublication(result,"owner","Juniper");
  const parsed=parseAskConversationResponse({...published.response,turn:{finalStage:"COMPLETED",answerOutcome:"limited"}});
  assert.equal(published.limited,true);
  if(replyType==="clarification"){assert.equal(parsed.answerType,"clarification");assert.equal(parsed.completionNotice,undefined);}
  else assert.ok(parsed.completionNotice);
 }
});
