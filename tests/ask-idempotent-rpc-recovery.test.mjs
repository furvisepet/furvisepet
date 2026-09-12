import test from 'node:test';
import assert from 'node:assert/strict';
import { recoverIdempotentRpc } from '../app/lib/security/idempotent-rpc-recovery.ts';

test('a lost response after atomic turn creation replays one message using the unchanged request',async()=>{
  const payload=Object.freeze({owner:'owner',request:'request',text:'question'});
  const turns=new Map();const calls=[];
  const result=await recoverIdempotentRpc(async()=>{
    calls.push(payload);
    if(!turns.has(payload.request))turns.set(payload.request,{conversation_id:'conversation',user_message_id:'message'});
    return calls.length===1?{data:null,error:{message:'TypeError: fetch failed'}}:{data:turns.get(payload.request),error:null};
  });
  assert.equal(turns.size,1);assert.equal(calls.length,2);assert.equal(calls[0],calls[1]);assert.equal(result.data.user_message_id,'message');
});
test('idempotent retry stops after two transient attempts and never retries authorization or schema errors',async()=>{
  let calls=0;const failure={data:null,error:{code:'ECONNRESET'}};
  assert.equal(await recoverIdempotentRpc(async()=>{calls++;return failure;}),failure);assert.equal(calls,2);
  for(const code of ['42501','22023','PGRST202','PGRST301','PGRST102']){
    calls=0;const permanent={data:null,error:{code}};
    assert.equal(await recoverIdempotentRpc(async()=>{calls++;return permanent;}),permanent);assert.equal(calls,1);
  }
});
test('PostgREST pool and connection errors retry with the same idempotent request',async()=>{
  for(const code of ['PGRST000','PGRST001','PGRST002','PGRST003']){
    let calls=0;const payload=Object.freeze({request:'same-key'});const seen=[];
    const result=await recoverIdempotentRpc(async()=>{seen.push(payload);return ++calls===1
      ?{data:null,error:{code,message:'database unavailable',details:null,hint:null}}
      :{data:{id:'one-message'},error:null};});
    assert.equal(calls,2);assert.equal(seen[0],seen[1]);assert.equal(result.data.id,'one-message');
  }
});
