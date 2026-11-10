import test from "node:test";
import assert from "node:assert/strict";
import { runReadOnlyAsk } from "../app/lib/ask-read-only/core.mjs";
import { buildReadOnlyPublication } from "../app/lib/ask-read-only/publication.ts";
import { loadReadOnlyContext } from "../app/lib/ask-read-only/context.ts";
import { checkReferencedSources } from "../app/lib/ask-read-only/references.mjs";
import { readOnlyPublicationFixture } from "./helpers/ask-read-only-publication.mjs";
test("actual durable-publication path retains bounded reference metadata",async()=>{
 const fixture=await readOnlyPublicationFixture();await fixture.run();
 assert.deepEqual(fixture.state.row.response_data.readOnlyReferences,{version:1,entries:[]});
});
test("published references survive JSONB-shaped storage, context loading and fresh follow-up reads",async()=>{
 const key="FURVISE_RATE_LIMIT_HASH_SECRET",before=process.env[key];process.env[key]="reference-fixture-only-signing-material";
 try{
  const pet={id:"pet-a",ownerId:"owner",name:"Willow",species:"dog"};
  const source={kind:"history",id:"note-a",ownerId:"owner",petId:pet.id,body:"A fresh fixture observation.",eventAt:"2025-01-12T12:00:00Z",recordedAt:"2025-03-12T12:00:00Z"};
  const input={ownerId:"owner",selectedPetId:pet.id,pets:[pet],question:"Read the observation.",dialogue:[],now:"2026-11-10T12:00:00Z",timeZone:"UTC"};
  const final={components:[{kind:"saved",text:"The note is quoted below.",sources:["s1"]}],quotes:["s1"],sources:["s1"],calculations:[],replyType:"answer"};
  let calls=0;
  const first=await runReadOnlyAsk(input,{read:async()=>({sources:[source],total:1,hasMore:false}),provider:async()=>++calls===1?{text:"",calls:[{id:"read",name:"search_saved_records",arguments:JSON.stringify({pet:"p1",from:null,to:null,query:null,offset:0})}]}:final});
  const {response}=buildReadOnlyPublication(first,"owner","Willow");
  const jsonb=value=>Array.isArray(value)?value.map(jsonb):value&&typeof value==="object"?Object.fromEntries(Object.keys(value).sort().map(key=>[key,jsonb(value[key])])):value;
  const persisted=jsonb(JSON.parse(JSON.stringify(response)));
  const db={from(table){const query={};for(const method of ["select","eq","order","limit","abortSignal"])query[method]=()=>query;
   query.maybeSingle=async()=>({data:{id:"conversation"},error:null});
   query.then=(resolve,reject)=>Promise.resolve({error:null,data:table==="dog_profiles"?[{id:pet.id,user_id:"owner",name:pet.name,species:pet.species}]:[{id:"current",role:"user",user_text:"Return to that note.",response_data:null},{id:"previous",role:"assistant",user_text:null,response_data:persisted}]}).then(resolve,reject);return query;
  }};
  const context=await loadReadOnlyContext(db,"owner",pet.id,"conversation","current","Return to that note.");
  assert.equal(context.readReferences.entries[0].sources[0].id,source.id);
  let followCalls=0,reads=0;
  const result=await runReadOnlyAsk({...input,...context,question:"Return to that note."},{read:async request=>{reads++;assert.deepEqual(request.sourceIds,[source.id]);return checkReferencedSources({sources:[source],scopeExhausted:true,total:1,hasMore:false},request);},provider:async()=>++followCalls===1?{text:"",calls:[{id:"follow",name:"read_referenced_sources",arguments:JSON.stringify({reference:"r1"})}]}:final});
  assert.equal(reads,1);assert.equal(result.answer.quotes[0].quote,source.body);assert.equal(result.providerCallCount,2);
 }finally{if(before===undefined)delete process.env[key];else process.env[key]=before;}
});
