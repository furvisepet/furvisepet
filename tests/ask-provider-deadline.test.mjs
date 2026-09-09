import test from 'node:test';
import assert from 'node:assert/strict';
import {withProviderDeadline} from '../app/lib/ai/provider-deadline.ts';
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
