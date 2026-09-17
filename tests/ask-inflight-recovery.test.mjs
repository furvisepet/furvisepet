import test from 'node:test';
import assert from 'node:assert/strict';
import { clearPendingAskRecovery, persistPendingAskRecovery, readPendingAskRecovery } from '../app/lib/ask-inflight-recovery.ts';

function storage(){ const data=new Map(); return {data,getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)}; }
const requestId='11111111-1111-4111-8111-111111111111';
const petId='22222222-2222-4222-8222-222222222222';

test('pending first-turn recovery round-trips only non-content identity',()=>{
 const s=storage(); const startedAt=1_000_000;
 persistPendingAskRecovery(s,{requestId,petId,startedAt});
 assert.deepEqual(readPendingAskRecovery(s,startedAt+1000),{requestId,petId,startedAt});
 const raw=[...s.data.values()][0];
 assert.doesNotMatch(raw,/prompt|question|message|Mochi|weight/i);
});

test('invalid and stale recovery pointers are removed',()=>{
 const s=storage(); s.setItem('furvise:ask:pending-first-turn:v1',JSON.stringify({requestId:'bad',petId,startedAt:1}));
 assert.equal(readPendingAskRecovery(s,2),null); assert.equal(s.data.size,0);
 persistPendingAskRecovery(s,{requestId,petId,startedAt:1});
 assert.equal(readPendingAskRecovery(s,1_000_000_000),null); assert.equal(s.data.size,0);
});

test('matching clear cannot erase a newer pending request',()=>{
 const s=storage(); persistPendingAskRecovery(s,{requestId,petId,startedAt:1_000_000});
 clearPendingAskRecovery(s,'33333333-3333-4333-8333-333333333333');
 assert.ok(readPendingAskRecovery(s,1_000_001));
 clearPendingAskRecovery(s,requestId); assert.equal(readPendingAskRecovery(s,1_000_001),null);
});
