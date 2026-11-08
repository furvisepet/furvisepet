import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {createHmac,createHash} from 'node:crypto';
import {issueReadOnlyCitationProof,citationBodyHash} from '../app/lib/ask-citation-proof.ts';
registerHooks({resolve(s,c,next){
 if(c.parentURL?.endsWith('/api/ask/citations/route.ts') && s.includes('ask-conversation-server'))
  return {shortCircuit:true,url:'data:text/javascript,export const getAskConversationRequestContext=async()=>globalThis.__citationAuth'};
 return next(s,c);
}});
const {POST}=await import('../app/api/ask/citations/route.ts');
const secret='citation-endpoint-fixture-012345678901234567890123456789';
test('real citation endpoint rejects anonymous, spoofed and changed sources; emits exact owned quotes',async t=>{
 const prior=process.env.FURVISE_RATE_LIMIT_HASH_SECRET;
 process.env.FURVISE_RATE_LIMIT_HASH_SECRET=secret;
 t.after(()=>{if(prior===undefined)delete process.env.FURVISE_RATE_LIMIT_HASH_SECRET;else process.env.FURVISE_RATE_LIMIT_HASH_SECRET=prior;delete globalThis.__citationAuth;});
 const body={summary:'The recorded statement.',sections:[]};
 const row={id:'record',user_id:'owner',pet_profile_id:'pet',note:'Original — α\nquoted.',title:null,occurred_at:'2025-02-01T00:00:00Z',created_at:'2025-02-02T00:00:00Z',deleted_at:null};
 const payload=Buffer.from(JSON.stringify({v:1,owner:'owner',body:citationBodyHash(body),sources:[{id:row.id,petId:row.pet_profile_id,hash:createHash('sha256').update(row.note).digest('hex'),event:row.occurred_at,recorded:row.created_at}]})).toString('base64url');
 const proof=payload+'.'+createHmac('sha256',secret).update('furvise.ask.citations.v1\0'+payload).digest('hex');
 const request=(p=proof)=>new Request('https://example.test/api/ask/citations',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...body,proof:p})});
 globalThis.__citationAuth={response:new Response(null,{status:401})};
 assert.equal((await POST(request())).status,401);
 let changed=false,owned=true,reads=0;
 globalThis.__citationAuth={userId:'owner',supabase:{from(table){
  reads++;
  const q={select(){return q},eq(k,v){assert.equal(k,'user_id');assert.equal(v,'owner');return q},in(){return q},limit(){return q},is(){return q},abortSignal(){return q},
   async returns(){return {data:table==='dog_profiles'?(owned?[{id:'pet'}]:[]):[{...row,...(changed?{note:'Changed'}:{})}],error:null}}};return q;
 }}};
 const good=await POST(request());assert.equal(good.status,200);
 const result=await good.json();assert.equal(result.sources[0].quote,row.note);
 assert.doesNotMatch(JSON.stringify(result),/record"|pet"|user_id|sourceId/);
 const before=reads;assert.equal((await POST(request(proof+'x'))).status,404);assert.equal(reads,before);
 changed=true;assert.equal((await POST(request())).status,404);
 changed=false;owned=false;assert.equal((await POST(request())).status,404);
});

import {runReadOnlyAsk} from "../app/lib/ask-read-only/core.mjs";
import {buildReadOnlyPublication} from "../app/lib/ask-read-only/publication.ts";
test("maximum authorized Unicode note quotations remain verifiable through the real endpoint",async t=>{
 const prior=process.env.FURVISE_RATE_LIMIT_HASH_SECRET;process.env.FURVISE_RATE_LIMIT_HASH_SECRET=secret;
 t.after(()=>{if(prior===undefined)delete process.env.FURVISE_RATE_LIMIT_HASH_SECRET;else process.env.FURVISE_RATE_LIMIT_HASH_SECRET=prior;});
 const texts=["記".repeat(12000),"録".repeat(12000)];
 const records=texts.map((body,index)=>({kind:"history",id:"long-note-"+index,ownerId:"owner",petId:"pet",body,eventAt:"2025-02-01T00:00:00Z",recordedAt:"2025-02-02T00:00:00Z"}));
 let calls=0;
 const result=await runReadOnlyAsk({ownerId:"owner",selectedPetId:"pet",pets:[{id:"pet",ownerId:"owner",name:"Juniper",species:"cat"}],question:"Quote both saved observations.",dialogue:[],now:"2026-01-01T00:00:00Z",timeZone:"UTC"},{
  read:async()=>({sources:records,total:2}),provider:async()=>++calls===1?{calls:[{id:"read",name:"search_saved_records",arguments:JSON.stringify({pet:"p1",from:null,to:null,query:null,offset:0})}],text:""}:
   {answer:"Both original observations are quoted below.",quotes:["s1","s2"],sources:[],calculations:[],replyType:"answer"}
 });
 const published=buildReadOnlyPublication(result,"owner","Juniper").response;
 assert.equal(result.providerCallCount,2);
 // A published conversation has a smaller database envelope. Independently
 // exercise the citation endpoint's larger, bounded request contract using
 // the same authentic in-memory sources and both exact original bodies.
 const largeBody={...published,sections:[{heading:"Saved notes",items:texts}]};
 const proof=issueReadOnlyCitationProof(result,largeBody,"owner");
 const payload={proof,title:largeBody.title,summary:largeBody.summary,sections:largeBody.sections,safetyNote:largeBody.safetyNote,supportingText:largeBody.supportingText};
 const serialized=JSON.stringify(payload);assert.ok(Buffer.byteLength(serialized)>64*1024);
 globalThis.__citationAuth={userId:"owner",supabase:{from(table){
  const q={select(){return q},eq(k,v){assert.equal(k,"user_id");assert.equal(v,"owner");return q},in(){return q},limit(){return q},is(){return q},abortSignal(){return q},
   async returns(){return {data:table==="dog_profiles"?[{id:"pet",user_id:"owner"}]:records.map(row=>({id:row.id,user_id:row.ownerId,pet_profile_id:row.petId,note:row.body,title:null,occurred_at:row.eventAt,created_at:row.recordedAt,deleted_at:null})),error:null};}};return q;
 }}};
 const response=await POST(new Request("https://fixture.invalid/api/ask/citations",{method:"POST",headers:{"content-type":"application/json"},body:serialized}));
 assert.equal(response.status,200);assert.equal((await response.json()).sources.length,2);
});

import {API_BODY_LIMITS} from "../app/lib/security/request.ts";
test("citation payloads above their bounded envelope fail before any source query",async()=>{
 let reads=0;globalThis.__citationAuth={userId:"owner",supabase:{from(){reads++;throw Error("unexpected source query");}}};
 const response=await POST(new Request("https://fixture.invalid/api/ask/citations",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({proof:"invalid",summary:"x".repeat(API_BODY_LIMITS.askCitations+1),sections:[]})}));
 assert.equal(response.status,400);assert.equal(reads,0);
});
