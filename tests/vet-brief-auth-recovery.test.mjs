import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyVetBriefUser} from '../app/lib/vet-brief/auth.ts';
import {vetBriefAuthenticatedFetch} from '../app/lib/vet-brief/session.ts';
const result=(user,error=null)=>({data:{user},error});
const session=(owner='owner',token='fresh')=>({data:{session:{user:{id:owner},access_token:token,expires_at:Date.now()/1000+3600}},error:null});
test('authoritative auth recovers transient failure once, never trusts data paired with an error',async()=>{
 for(const status of [0,429,500,503]){
  let calls=0; const value=await verifyVetBriefUser(async()=>++calls===1?result({id:'untrusted'},{status}):result({id:'verified'}));
  assert.equal(value.user.id,'verified');assert.equal(calls,2);
 }
 let calls=0;const failure=await verifyVetBriefUser(async()=>{calls++;throw Error('offline');});
 assert.equal(failure.failure,'unavailable');assert.equal(calls,2);
});
test('invalid sessions stop without retry and service failure is not expiry',async()=>{
 for(const status of [400,401,403]){let calls=0;const r=await verifyVetBriefUser(async()=>{calls++;return result(null,{status});});assert.equal(r.failure,'rejected');assert.equal(calls,1);}
 const r=await verifyVetBriefUser(async()=>result(null,{status:503}));assert.equal(r.failure,'unavailable');
});
test('known pre-operation 401 refreshes once and preserves mutation identity, body and owner',async()=>{
 let refreshes=0;const sent=[];
 const auth={getSession:async()=>session('owner','old'),refreshSession:async()=>{refreshes++;return session();}};
 const response=await vetBriefAuthenticatedFetch(auth,{method:'POST',body:'unchanged appointment',headers:{'Idempotency-Key':'same-key'}},async init=>{sent.push(init);return sent.length===1?Response.json({code:'VET_BRIEF_AUTH_REQUIRED'},{status:401}):Response.json({ok:true});},360);
 assert.equal(response.status,200);assert.equal(refreshes,1);assert.equal(sent.length,2);
 assert.equal(sent[0].body,sent[1].body);assert.equal(sent[1].headers.get('Idempotency-Key'),'same-key');assert.equal(sent[1].headers.get('Authorization'),'Bearer fresh');
});
test('no replay for ambiguous or completed requests and no retry into another account',async()=>{
 for(const status of [200,409,429,500,503,504,401]){
  let calls=0;const auth={getSession:async()=>session(),refreshSession:async()=>{throw Error('must not refresh');}};
  const r=await vetBriefAuthenticatedFetch(auth,{},async()=>{calls++;return Response.json({code:'OTHER'},{status});});assert.equal(r.status,status);assert.equal(calls,1);
 }
 let calls=0;await assert.rejects(vetBriefAuthenticatedFetch({getSession:async()=>session(),refreshSession:async()=>session('other')},{},async()=>{calls++;return Response.json({code:'VET_BRIEF_AUTH_REQUIRED'},{status:401});}),/sign in again/i);assert.equal(calls,1);
 let attempts=0;const r=await vetBriefAuthenticatedFetch({getSession:async()=>session(),refreshSession:async()=>session()},{},async()=>{attempts++;return Response.json({code:'VET_BRIEF_AUTH_REQUIRED'},{status:401});});assert.equal(r.status,401);assert.equal(attempts,2);
});
