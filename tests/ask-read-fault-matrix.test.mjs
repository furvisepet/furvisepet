import test from 'node:test';
import assert from 'node:assert/strict';
import { recoverTransientRead } from '../app/lib/security/read-recovery.ts';
import { transientClaimFailure } from '../app/lib/security/idempotency/claim-recovery.ts';
import { withExecutionDeadline, OperationDeadline } from '../app/lib/ai/execution-deadline.ts';

test('definitive 4xx refusals override misleading transient names, messages and codes',async()=>{
 let checked=0;
 for(let status=400;status<500;status++) for(const detail of [{name:'TimeoutError'},{message:'fetch failed'},{code:'PGRST003'},{code:'ECONNRESET'}]){
  const error={status,...detail};assert.equal(transientClaimFailure(error),false,JSON.stringify(error));
  for(const response of [{data:null,error},{data:null,error:detail,status},{data:null,error,status:503}]) {
   let calls=0;
   assert.equal(await recoverTransientRead(async()=>{calls++;return response;}),response);
   assert.equal(calls,1,JSON.stringify(response));checked++;
  }
 }
 assert.equal(checked,1200);
});
test('transient reads stay bounded and cannot convert failures into empty evidence',async()=>{
 for(const status of [502,503,504]) for(const throws of [false,true]){
  let calls=0;const error={status};
  const action=()=>recoverTransientRead(async()=>{calls++;if(throws)throw error;return{data:null,error};});
  if(throws)await assert.rejects(action(),e=>e===error);else assert.equal((await action()).error,error);
  assert.equal(calls,2);
 }
});
test('64 stalled readers settle locally; late transport results cannot replace deadlines',async()=>{
 const signals=[],late=[];
 const results=await Promise.allSettled(Array.from({length:64},()=>withExecutionDeadline(signal=>{signals.push(signal);return new Promise(resolve=>late.push(resolve));},5)));
 assert.ok(results.every(r=>r.status==='rejected'&&r.reason.code==='ABORT_ERR'));
 assert.ok(signals.every(s=>s.aborted));
 for(const resolve of late)resolve({data:'late unreviewed value'});
 await Promise.resolve();
 assert.ok(results.every(r=>r.status==='rejected'));
});
test('1000 stage allocations cannot reset a shared operation deadline',()=>{
 let now=0;const deadline=new OperationDeadline(1000,()=>now);
 for(let i=0;i<1000;i++){
  now=i;const allocation=deadline.allocate('answer_generation',1000);
  assert.equal(allocation,1000-i);
 }
 now=1000;assert.throws(()=>deadline.allocate('repair',1000),{code:'ASK_STAGE_DEADLINE'});
});
