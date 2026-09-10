import test from 'node:test';
import assert from 'node:assert/strict';
import { requestAskWithSession, AskSessionExpiredError } from '../app/lib/ask-session-request.ts';
const session=(token='old',id='owner',expires_at=Date.now()/1000+3600)=>({access_token:token,user:{id},expires_at});
const result=s=>({data:{session:s},error:null});
const response=(status,code)=>Response.json({code},{status});
function setup(initial=session(),fresh=session('fresh')) {
 let reads=0,refreshes=0;
 return {auth:{getSession:async()=>{reads++;return result(initial);},refreshSession:async()=>{refreshes++;return result(fresh);}},
 counts:()=>({reads,refreshes})};
}
test('healthy session submits once without refreshing',async()=>{
 const s=setup(),tokens=[];await requestAskWithSession(s.auth,async token=>{tokens.push(token);return response(200);},new AbortController().signal);
 assert.deepEqual(tokens,['old']);assert.equal(s.counts().refreshes,0);
});
test('near-expiry token refreshes before the first submission',async()=>{
 const s=setup(session('old','owner',Date.now()/1000+10)),tokens=[];
 await requestAskWithSession(s.auth,async token=>{tokens.push(token);return response(200);},new AbortController().signal);
 assert.deepEqual(tokens,['fresh']);assert.equal(s.counts().refreshes,1);
});
test('explicit authentication failure allows one replay then stops',async()=>{
 const s=setup(),tokens=[];const r=await requestAskWithSession(s.auth,async token=>{tokens.push(token);return response(401,'AUTH_REQUIRED');},new AbortController().signal);
 assert.deepEqual(tokens,['old','fresh']);assert.equal(r.status,401);assert.equal(s.counts().refreshes,1);
});
test('provider failures, ambiguous unauthorized errors and timeouts are never replayed',async()=>{
 for(const [status,code] of [[503,'ANSWER_RETRYABLE'],[429,'RATE_LIMITED'],[401,'OTHER']]){
  const s=setup();let sends=0;await requestAskWithSession(s.auth,async()=>{sends++;return response(status,code);},new AbortController().signal);
  assert.equal(sends,1);assert.equal(s.counts().refreshes,0);
 }
 const s=setup();let sends=0;
 await assert.rejects(requestAskWithSession(s.auth,async()=>{sends++;throw new Error('timeout');},new AbortController().signal),/timeout/);
 assert.equal(sends,1);
});
test('missing session and account switching never submit under a different owner',async()=>{
 for(const fresh of [null,session('foreign','different')]){
  const s=setup(session(),fresh);let sends=0;
  await assert.rejects(requestAskWithSession(s.auth,async()=>{sends++;return response(401,'AUTH_REQUIRED');},new AbortController().signal),AskSessionExpiredError);
  assert.equal(sends,1);
 }
 const s=setup(null);await assert.rejects(requestAskWithSession(s.auth,()=>assert.fail('must not send'),new AbortController().signal),AskSessionExpiredError);
});
test('deadline cancellation during refresh prevents a later submission',async()=>{
 const controller=new AbortController();let finish;
 const s=setup(session('old','owner',0));
 s.auth.refreshSession=()=>new Promise(resolve=>{finish=resolve;controller.abort(new Error('deadline'));});
 await assert.rejects(requestAskWithSession(s.auth,()=>assert.fail('must not send'),controller.signal),/deadline/);
 finish(result(session('fresh')));
});

import { idempotentClientFetch } from '../app/lib/security/idempotency/client.ts';
test('auth recovery uses the same payload and idempotency key through the real client wrapper',async t=>{
 const s=setup(),calls=[],body=JSON.stringify({logicalTurnId:'stable-turn',message:'Read saved history',petId:'pet'});
 const signal=new AbortController().signal;
 t.mock.method(globalThis,'fetch',async(url,init)=>{
  calls.push({url,body:init.body,key:init.headers.get('Idempotency-Key'),token:init.headers.get('Authorization'),signal:init.signal});
  return calls.length===1?response(401,'AUTH_REQUIRED'):response(200);
 });
 await requestAskWithSession(s.auth,token=>idempotentClientFetch('/api/ask',
 {method:'POST',body,signal,headers:{Authorization:'Bearer '+token}},'stable-scope','stable-turn'),signal);
 assert.equal(calls.length,2);assert.equal(calls[0].body,calls[1].body);
 assert.equal(calls[0].key,calls[1].key);assert.equal(calls[0].signal,calls[1].signal);
 assert.deepEqual(calls.map(c=>c.token),['Bearer old','Bearer fresh']);
});
