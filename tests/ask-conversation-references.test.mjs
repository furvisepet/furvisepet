import test from "node:test";
import assert from "node:assert/strict";
import { runReadOnlyAsk, bindReadTool } from "../app/lib/ask-read-only/core.mjs";
import { restoreReadReferences, describeReadReferences, checkReferencedSources } from "../app/lib/ask-read-only/references.mjs";
const pet={id:"pet-a",ownerId:"owner",name:"Willow",species:"dog",handle:"p1"};
const input={ownerId:"owner",selectedPetId:pet.id,pets:[pet],question:"Read the observation.",dialogue:[],now:"2026-11-10T12:00:00Z",timeZone:"UTC"};
const source={kind:"history",id:"note-a",ownerId:"owner",petId:pet.id,body:"An original observation.",eventAt:"2025-01-12T12:00:00Z",recordedAt:"2025-03-12T12:00:00Z"};
const output=(text="The observation is quoted below.",sources=["s1"])=>({components:[{kind:sources.length?"saved":"general",text,sources}],quotes:sources,calculations:[],sources,replyType:"answer"});
async function initial(){
 let phase=0;return runReadOnlyAsk(input,{read:async()=>({sources:[source],hasMore:false,total:1}),provider:async()=>++phase===1?{text:"",calls:[{id:"first",name:"search_saved_records",arguments:JSON.stringify({pet:"p1",from:"2025-01-01",to:"2025-01-31",recordedFrom:"2025-03-01",recordedTo:"2025-03-31",query:null,offset:0})}]}:output()});
}
test("references carry pet, both time scopes and source fingerprints without note text",async()=>{
 const first=await initial(),references=restoreReadReferences(JSON.parse(JSON.stringify(first.readReferences)),[pet]);
 assert.equal(references.length,1);assert.equal(references[0].request.recordedFrom,"2025-03-01");assert.deepEqual(references[0].request.sourceIds,[source.id]);
 assert.ok(!JSON.stringify(first.readReferences).includes(source.body));assert.ok(!JSON.stringify(describeReadReferences(references)).includes(source.id));
 assert.equal(references[0].request.expectedSources[0].hash.length,64);
 assert.equal(references[0].request.referenceTimeZone,"UTC");
});
test("source-free interruptions carry durable references beyond the prose window",async()=>{
 let state=(await initial()).readReferences;
 for(let turn=0;turn<15;turn++){
  let calls=0;const result=await runReadOnlyAsk({...input,readReferences:state,dialogue:[],question:"Explain a general concept."},{read:async()=>{throw Error("unexpected read");},provider:async()=>++calls===1?{calls:[],text:"A general draft."}:output("A general explanation.",[])});
  assert.equal(result.providerCallCount,2);state=JSON.parse(JSON.stringify(result.readReferences));
 }
 assert.equal(state.entries[0].sources[0].id,source.id);
});
test("follow-up reference triggers a fresh owner-bound exact-source read",async()=>{
 const first=await initial();let calls=0,read;
 const result=await runReadOnlyAsk({...input,readReferences:first.readReferences,question:"Return to that observation."},{read:async request=>{read=request;return checkReferencedSources({sources:[source],total:1,hasMore:false,scopeExhausted:true},request);},provider:async request=>{
  if(++calls===1){assert.ok(request.tools.some(tool=>tool.name==="read_referenced_sources"));return {text:"",calls:[{id:"return",name:"read_referenced_sources",arguments:JSON.stringify({reference:"r1"})}]};}
  return output();
 }});
 assert.deepEqual(read.sourceIds,[source.id]);assert.equal(read.pet.id,pet.id);assert.equal(read.from,"2025-01-01");assert.equal(result.answer.quotes[0].quote,source.body);assert.equal(calls,2);
});
test("changed or deleted references are withheld rather than becoming remembered facts",async()=>{
 const previous=restoreReadReferences((await initial()).readReferences,[pet])[0].request;
 for(const sources of [[{...source,body:"Changed wording."}],[]]){
  const result=checkReferencedSources({sources,scopeExhausted:true},previous);assert.deepEqual(result.sources,[]);assert.equal(result.staleReference,true);
 }
});
test("JSONB property reordering does not invalidate an unchanged source fingerprint",async()=>{
 const state=structuredClone((await initial()).readReferences);
 const original=state.entries[0].sources[0];
 state.entries[0].sources[0]={recordedAt:original.recordedAt,hash:original.hash,eventAt:original.eventAt,id:original.id};
 const request=restoreReadReferences(state,[pet])[0].request;
 const result=checkReferencedSources({sources:[source],scopeExhausted:true},request);
 assert.equal(result.staleReference,false);assert.equal(result.sources.length,1);
});
test("foreign pets and malformed stored references grant no reference capability",async()=>{
 const state=structuredClone((await initial()).readReferences);
 assert.deepEqual(restoreReadReferences(state,[]),[]);
 state.entries[0].recordedFrom="2025-02-30";assert.deepEqual(restoreReadReferences(state,[pet]),[]);
 assert.throws(()=>bindReadTool("read_referenced_sources",{reference:"r1"},[pet],[]),/REFERENCE_UNAVAILABLE/);
 assert.throws(()=>bindReadTool("read_referenced_sources",{reference:"r1",pet:"p1"},[pet],[]),/TOOL_INVALID/);
});
test("reference state retains at most four goals and eight sources per goal",async()=>{
 let calls=0;const result=await runReadOnlyAsk(input,{read:async()=>({sources:Array.from({length:16},(_,i)=>({...source,id:"note-"+i})),total:16,hasMore:false}),provider:async request=>++calls===1?{text:"",calls:[{id:"first",name:"search_saved_records",arguments:JSON.stringify({pet:"p1",from:null,to:null,query:null,offset:0})}]}:{...output("Supported observations.",request.TOOL_DATA[0].sources.map(source=>source.source)),quotes:[]}});
 assert.equal(result.readReferences.entries[0].sources.length,8);assert.equal(result.readReferences.entries[0].limited,true);
 assert.equal(restoreReadReferences(result.readReferences,[pet])[0].request.referenceLimited,true);
});
