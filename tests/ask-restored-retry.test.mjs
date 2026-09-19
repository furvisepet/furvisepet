import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { claimWithRestoredAskOrigin } from '../app/lib/ask-restored-retry.ts';

const original={conversationId:'',locale:'en-US',petId:'owned-pet',question:'Read these dates; save nothing.'};
const restored={...original,conversationId:'owned-conversation'};
const persisted={conversationId:'owned-conversation',question:original.question,userSequence:1};
const hash=p=>createHash('sha256').update(JSON.stringify(p)).digest('hex');
const conflict=()=>({response:Response.json({code:'IDEMPOTENCY_CONFLICT'},{status:409})});

test('reloaded first turn recovers its original payload and credit identity through a full hash match',async()=>{
 const calls=[];
 const claim=async p=>{calls.push(p);return hash(p)===hash(original)?{operation:{payloadHash:hash(p),key:'same-logical-turn'}}:conflict();};
 const result=await claimWithRestoredAskOrigin({claim,payload:restored,persisted});
 assert.equal(result.operation.payloadHash,hash(original));
 assert.equal(result.operation.key,'same-logical-turn');
 assert.deepEqual(calls,[restored,original]);
});
test('restoring origin never accepts changed text, locale, pet or a different conversation',async()=>{
 for(const change of [{question:'Save a different note'},{locale:'de-DE'},{petId:'other-pet'},{conversationId:'other-conversation'}]){
  const result=await claimWithRestoredAskOrigin({payload:{...restored,...change},persisted,claim:async p=>hash(p)===hash(original)?{operation:{}}:conflict()});
  assert.equal(result.response.status,409,JSON.stringify(change));
 }
});
test('follow-ups, missing owned state, active leases and non-conflict failures never try an alternate origin',async()=>{
 for(const state of [null,{...persisted,userSequence:3}]){
  let calls=0;
  await claimWithRestoredAskOrigin({payload:restored,persisted:state,claim:async()=>{calls++;return conflict();}});
  assert.equal(calls,1);
 }
 for(const [status,code] of [[409,'REQUEST_IN_PROGRESS'],[503,'IDEMPOTENCY_UNAVAILABLE'],[429,'RATE_LIMITED']]){
  let calls=0;
  const result=await claimWithRestoredAskOrigin({payload:restored,persisted,claim:async()=>{calls++;return{response:Response.json({code},{status})};}});
  assert.equal(calls,1);assert.equal(result.response.status,status);
 }
});
test('completed replay and already-canonical claims are returned without another claim',async()=>{
 for(const payload of [original,restored]){
  let calls=0;const response=Response.json({success:true});
  const result=await claimWithRestoredAskOrigin({payload,persisted,claim:async()=>{calls++;return{response};}});
  assert.equal(calls,1);assert.equal(result.response,response);
 }
});
test('new browser can restore legacy zone-free turns but cannot change a zone-bound identity',async()=>{
 for(const userSequence of [1,3]) {
  const prior={...original,conversationId:userSequence===1?'':'owned-conversation'};
  const result=await claimWithRestoredAskOrigin({payload:{...restored,timeZone:'America/Los_Angeles'},persisted:{...persisted,userSequence},claim:async p=>hash(p)===hash(prior)?{operation:{payloadHash:hash(p)}}:conflict()});
  assert.equal(result.operation.payloadHash,hash(prior));
 }
 const zoneBound={...original,timeZone:'America/Los_Angeles'};
 const result=await claimWithRestoredAskOrigin({payload:{...restored,timeZone:'Europe/London'},persisted,claim:async p=>hash(p)===hash(zoneBound)?{operation:{}}:conflict()});
 assert.equal(result.response.status,409);
});
