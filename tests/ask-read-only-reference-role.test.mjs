import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {loadReadOnlyContext} from "../app/lib/ask-read-only/context.ts";
import {runReadOnlyAsk} from "../app/lib/ask-read-only/core.mjs";
const pet={id:"pet-r",user_id:"owner-r",name:"Spruce",species:"dog"};
const source={kind:"history",id:"note-r",ownerId:"owner-r",petId:pet.id,body:"A fixture-only observation.",eventAt:"2025-02-10T12:00:00Z",recordedAt:"2025-02-11T12:00:00Z"};
const references={version:1,entries:[{kind:"history",petId:pet.id,goal:"exact_quote",from:"2025-02-10",to:"2025-02-10",recordedFrom:null,recordedTo:null,order:"asc",orderBy:"event",terms:[],limited:false,timeZone:"UTC",sources:[{id:source.id,hash:createHash("sha256").update(source.body).digest("hex"),eventAt:source.eventAt,recordedAt:source.recordedAt}]}]};
function dbFor(role,extra=[]){
 const rows=[{id:"current",role:"user",user_text:"Return to the earlier source.",response_data:null},...extra,{id:"reply",role,user_text:null,response_data:{directAnswer:"The earlier result.",readOnlyReferences:references}}];
 return {from(table){const query={};for(const method of ["select","eq","order","limit","abortSignal"])query[method]=()=>query;
 query.maybeSingle=async()=>({data:{id:"conversation"},error:null});
 query.then=(resolve,reject)=>Promise.resolve({data:table==="dog_profiles"?[pet]:rows,error:null}).then(resolve,reject);return query;
 }};
}
for(const role of ["furvise","assistant"])test("persisted "+role+" response restores usable fresh-read references",async()=>{
 const context=await loadReadOnlyContext(dbFor(role),"owner-r",pet.id,"conversation","current","Return to the earlier source.");
 assert.deepEqual(context.readReferences,references);
 let calls=0,reads=0;
 const result=await runReadOnlyAsk({ownerId:"owner-r",selectedPetId:pet.id,question:"Return to the earlier source.",now:"2026-11-10T12:00:00Z",timeZone:"UTC",...context},{
 read:async request=>{reads++;assert.deepEqual(request.sourceIds,[source.id]);assert.equal(request.pet.id,pet.id);return {sources:[source],scopeExhausted:true,total:1,hasMore:false};},
 provider:async request=>{if(++calls===1){assert.ok(request.tools.some(tool=>tool.name==="read_referenced_sources"));return {text:"",calls:[{id:"read",name:"read_referenced_sources",arguments:JSON.stringify({reference:"r1"})}]};}
 return {components:[{kind:"saved",text:"The source is quoted below.",sources:["s1"]}],quotes:["s1"],sources:["s1"],calculations:[],replyType:"answer"};}
 });
 assert.equal(reads,1);assert.equal(result.providerCallCount,2);assert.equal(result.answer.quotes[0].quote,source.body);
});
for(const role of ["user","system","unknown"])test("reference metadata from "+role+" is not restored",async()=>{
 const context=await loadReadOnlyContext(dbFor(role),"owner-r",pet.id,"conversation","current","Return to the earlier source.");
 assert.equal(context.readReferences,null);
});
test("a recent user row cannot override the last persisted Furvise reference state",async()=>{
 const context=await loadReadOnlyContext(dbFor("furvise",[{id:"untrusted",role:"user",user_text:"other",response_data:{readOnlyReferences:{version:1,entries:[]}}}]),"owner-r",pet.id,"conversation","current","Return to the earlier source.");
 assert.deepEqual(context.readReferences,references);
});
