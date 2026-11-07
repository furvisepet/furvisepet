import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {createHmac,createHash} from 'node:crypto';
import {citationBodyHash} from '../app/lib/ask-citation-proof.ts';
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
