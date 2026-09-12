import test from 'node:test';
import assert from 'node:assert/strict';
import {withProviderDeadline} from '../app/lib/ai/execution-deadline.ts';
import {OperationDeadline, StageDeadlineError} from '../app/lib/ai/execution-deadline.ts';
import {ASK_OPERATION_TIMEOUT_MS, ASK_CLIENT_TIMEOUT_MS, ASK_CONCURRENCY_TTL_MS} from '../app/lib/ai/ask-execution-limits.ts';
import {getRateLimitPolicy} from '../app/lib/security/rate-limit/config.ts';
test('a slow reviewed answer can repair while the client and concurrency lease remain active',()=>{
 let now=0; const deadline=new OperationDeadline(ASK_OPERATION_TIMEOUT_MS,()=>now);
 now=65_000; // interpretation, retrieval, generation and first review
 assert.equal(deadline.allocate('repair',30_000,12_000),30_000);
 now+=30_000;
 assert.equal(deadline.allocate('verification',25_000,4_000),21_000);
 now+=21_000;
 assert.equal(deadline.allocate('persistence',4_000),4_000);
 assert.ok(ASK_CLIENT_TIMEOUT_MS>ASK_OPERATION_TIMEOUT_MS);
 assert.ok(ASK_CONCURRENCY_TTL_MS>ASK_CLIENT_TIMEOUT_MS);
 assert.equal(getRateLimitPolicy('ASK_AI',{}).concurrencyTtlMs,ASK_CONCURRENCY_TTL_MS);
 now=ASK_OPERATION_TIMEOUT_MS;
 assert.throws(()=>deadline.allocate('repair',1_000),StageDeadlineError);
});
test('uncooperative provider settles locally and receives cancellation', async()=>{
 let signal;
 await assert.rejects(withProviderDeadline(s=>{signal=s;return new Promise(()=>{});},10),e=>e.name==='TimeoutError'&&e.code==='ABORT_ERR');
 assert.equal(signal.aborted,true);
});
test('late provider completion cannot replace timeout; ordinary failures retain identity',async()=>{
 let finish;const pending=withProviderDeadline(()=>new Promise(resolve=>{finish=resolve;}),10);
 await assert.rejects(pending,{name:'TimeoutError'});finish('late answer');await assert.rejects(pending,{name:'TimeoutError'});
 const error=new Error('fixture failure');await assert.rejects(withProviderDeadline(async()=>{throw error;},1000),e=>e===error);
 assert.equal(await withProviderDeadline(async()=>42,1000),42);
});
