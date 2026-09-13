import test from 'node:test';
import assert from 'node:assert/strict';
import { vetBriefSessionToken, vetBriefAuthenticatedFetch } from '../app/lib/vet-brief/session.ts';
import { savePendingVetBriefInput, readPendingVetBriefInput, removePendingVetBriefInput } from '../app/lib/vet-brief/pending-input.ts';
const session = (token, seconds=3600, owner='owner') => ({access_token:token,expires_at:Date.now()/1000+seconds,user:{id:owner}});
const result = (value,error=null) => ({data:{session:value},error});
const response = (status,code) => Response.json({code},{status});
test('concurrent same-account refresh recovers a stale refresh response but never reuses the old token',async()=>{
 let reads=0;
 assert.equal(await vetBriefSessionToken({getSession:async()=>result(session(++reads===1?'old':'concurrent',reads===1?1:3600)),refreshSession:async()=>result(null,Error('invalid refresh token'))},360),'concurrent');
 await assert.rejects(vetBriefSessionToken({getSession:async()=>result(session('old',1)),refreshSession:async()=>result(null,Error('invalid refresh token'))},360),/sign in again/i);
});
test('transient refresh retries once, while revoked credentials do not retry',async()=>{
 let calls=0;
 assert.equal(await vetBriefSessionToken({getSession:async()=>result(session('old',1)),refreshSession:async()=>++calls===1?result(null,{status:503}):result(session('new'))},360),'new');
 assert.equal(calls,2);
 calls=0;
 await assert.rejects(vetBriefSessionToken({getSession:async()=>result(session('old',1)),refreshSession:async()=>{calls++;return result(null,{status:400});}},360));
 assert.equal(calls,1);
});
test('read outage recovery is bounded and never retries a mutation or an unclassified outage',async()=>{
 const auth={getSession:async()=>result(session('token')),refreshSession:async()=>result(session('new'))};
 for(const [method,code,expected] of [['GET','VET_BRIEF_READ_UNAVAILABLE',2],['POST','VET_BRIEF_READ_UNAVAILABLE',1],['GET','OTHER',1]]){
  let calls=0;
  const final=await vetBriefAuthenticatedFetch(auth,{method},async()=>{calls++;return response(503,code);});
  assert.equal(final.status,503);assert.equal(calls,expected);
 }
});
test('read retry and authentication retry share a three-request limit and preserve the account',async()=>{
 let calls=0;
 const auth={getSession:async()=>result(session('old')),refreshSession:async()=>result(session('new'))};
 const final=await vetBriefAuthenticatedFetch(auth,{method:'GET'},async init=>{
  calls++; if(calls===1)return response(503,'VET_BRIEF_READ_UNAVAILABLE');
  if(calls===2)return response(401,'VET_BRIEF_AUTH_REQUIRED');
  assert.equal(init.headers.get('Authorization'),'Bearer new');return response(200,'OK');
 });assert.equal(final.status,200);assert.equal(calls,3);
 let reads=0;calls=0;
 await assert.rejects(vetBriefAuthenticatedFetch({...auth,getSession:async()=>result(session('token',3600,++reads===1?'owner':'other'))},{},async()=>{calls++;return response(503,'VET_BRIEF_READ_UNAVAILABLE');}),/account changed/);
 assert.equal(calls,1);
});
test('temporary input restores all 12000 characters only for the same owner and pet within its lifetime',()=>{
 const data=new Map();const storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
 const scope={userId:'owner',petId:'pet'};const input={purpose:'x'.repeat(11993)+' NOT UP',from:'2018-09-13',to:'2026-09-13'};
 savePendingVetBriefInput(storage,scope,input,1000);
 assert.equal(input.purpose.length,12000);assert.deepEqual(readPendingVetBriefInput(storage,scope,2000),input);
 assert.equal(readPendingVetBriefInput(storage,{...scope,userId:'other'},2000),null);
 assert.equal(readPendingVetBriefInput(storage,{...scope,petId:'other'},2000),null);
 assert.equal(readPendingVetBriefInput(storage,scope,1801000),null);
 savePendingVetBriefInput(storage,scope,input,2000);removePendingVetBriefInput(storage,scope);assert.equal(readPendingVetBriefInput(storage,scope,2001),null);
});
