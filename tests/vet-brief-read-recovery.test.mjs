import test from 'node:test';
import assert from 'node:assert/strict';
import {readVetBrief,vetBriefReadUnavailable} from '../app/lib/vet-brief/read.ts';
test('saved read recovers one transient failure but preserves absence and permanent failures',async()=>{
 let calls=0;const row={id:'saved'};
 const found=await readVetBrief(async()=>++calls===1?{data:null,error:{code:'PGRST003'}}:{data:row,error:null});
 assert.equal(calls,2);assert.equal(found.data,row);
 calls=0;const absent=await readVetBrief(async()=>{calls++;return {data:null,error:null};});assert.equal(absent.error,null);assert.equal(calls,1);
 calls=0;const denied=await readVetBrief(async()=>{calls++;return {data:null,error:{code:'42501'}};});assert.equal(denied.error.code,'42501');assert.equal(calls,1);
});
test('persistent database failures remain unavailable, with no private details in response',async()=>{
 let calls=0;const failed=await readVetBrief(async()=>{calls++;throw {code:'ETIMEDOUT',message:'private record'};});
 assert.equal(calls,2);assert.ok(failed.error);
 const response=vetBriefReadUnavailable('confirmed_brief',failed.error);assert.equal(response.status,503);assert.match(response.headers.get('Cache-Control'),/no-store/);assert.doesNotMatch(await response.text(),/private record|not available/);
});
