import test from "node:test";
import assert from "node:assert/strict";
import {runReadOnlyAsk} from "../app/lib/ask-read-only/core.mjs";
import {buildReadOnlyPublication} from "../app/lib/ask-read-only/publication.ts";
import {parseAskConversationResponse} from "../app/lib/ask.mjs";
const oversized={kind:"history",id:"owned-oversized-note",ownerId:"owner",petId:"pet",body:"長".repeat(12001),eventAt:"2025-06-01T12:00:00Z",recordedAt:"2025-06-02T12:00:00Z"};
function fixture(records,replyType="answer",truncated=false){
 const state={calls:0,reads:0};
 return {state,run:()=>runReadOnlyAsk({ownerId:"owner",selectedPetId:"pet",pets:[{id:"pet",ownerId:"owner",name:"Juniper",species:"cat"}],question:"Quote the saved note.",dialogue:[],now:"2026-11-09T00:00:00Z",timeZone:"UTC"},{
  read:async()=>{state.reads++;return {sources:records,total:records.length,truncated};},
  provider:async()=>++state.calls===1?{calls:[{id:"read",name:"search_saved_records",arguments:JSON.stringify({pet:"p1",from:null,to:null,query:null,offset:0,order:"desc"})}],text:""}
  :{answer:"There are no saved records.",quotes:[],sources:[],calculations:[],replyType}
 })};
}
for(const replyType of ["answer","partial"])test("an owned matching note outside read limits cannot become a false no-match: "+replyType,async()=>{
 const f=fixture([oversized],replyType),result=await f.run();
 assert.equal(f.state.calls,2);assert.equal(f.state.reads,1);
 assert.equal(result.answer.replyType,"partial");assert.equal(result.answer.limited,true);
 assert.equal(result.coverage[0].truncated,true);assert.equal(result.coverage[0].total,1);
 assert.match(result.answer.answer,/found/i);assert.match(result.answer.answer,/read limits/i);
 assert.doesNotMatch(result.answer.answer,/didn.t find|no saved records/i);
 assert.deepEqual(result.sources,[]);assert.deepEqual(result.answer.quotes,[]);
 const {response,limited}=buildReadOnlyPublication(result,"owner","Juniper");
 assert.equal(limited,true);assert.equal(response.citationProof,null);
 assert.match(response.summary,/read limits/i);
 const replay=parseAskConversationResponse({...response,turn:{finalStage:"COMPLETED",answerOutcome:"limited"}});
 assert.equal(replay.summary,response.summary);assert.equal(replay.completionNotice,undefined);
});
test("a completed empty search still reports no found information without inventing a limit",async()=>{
 const f=fixture([]),result=await f.run();
 assert.equal(f.state.calls,2);assert.equal(result.coverage[0].truncated,false);
 assert.match(result.answer.answer,/didn.t find saved information/i);
 assert.doesNotMatch(result.answer.answer,/read limits/i);assert.deepEqual(result.sources,[]);
});
test("oversized foreign evidence is rejected before omission can disclose its existence",async()=>{
 const f=fixture([{...oversized,ownerId:"foreign-owner"}]);
 await assert.rejects(f.run(),/ASK_READ_SOURCE_NOT_AUTHORIZED/);
 assert.equal(f.state.calls,1);assert.equal(f.state.reads,1);
});

test("a bare truncated flag without an owned returned record cannot invent found information",async()=>{
 const f=fixture([],"partial",true),result=await f.run();
 assert.equal(f.state.calls,2);assert.deepEqual(result.sources,[]);
 assert.doesNotMatch(result.answer.answer,/information was found/i);
 assert.match(result.answer.answer,/didn.t find saved information/i);
});
