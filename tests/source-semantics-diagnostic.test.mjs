import test from 'node:test';
import assert from 'node:assert/strict';
import {readCorrectionRelevance} from '../app/lib/intelligence/correction-relevance-read.ts';

const valid=()=>({complete:true,limit:76,claims:[],sources:[]});
const cases=[
 ['rpc_error',{error:{message:'private-error'},data:null}],
 ['missing_or_malformed_page',{error:null,data:null}],
 ['missing_or_malformed_page',{error:null,data:{...valid(),claims:'private-body'}}],
 ['missing_or_malformed_page',{error:null,data:{...valid(),complete:'private-body'}}],
 ['explicit_incomplete',{error:null,data:{...valid(),complete:false}}],
 ['invalid_limit',{error:null,data:{...valid(),limit:77}}],
 ['count_overflow',{error:null,data:{...valid(),claims:Array(77).fill({id:'private-id'})}}],
 ['count_overflow',{error:null,data:{...valid(),sources:Array(77).fill({note:'private-note'})}}],
];
for(const [expected,result] of cases)test('safe source-semantics diagnostic: '+expected,async t=>{
 const logged=t.mock.method(console,'info',()=>{});
 const db={rpc:()=>({abortSignal:async()=>result})};
 await assert.rejects(readCorrectionRelevance({db,ownerId:'private-owner',petIds:['private-pet'],candidates:[],domain:{from:null,to:null},deadline:Date.now()+10000}),e=>e.message==='source_semantics_incomplete');
 assert.equal(logged.mock.calls.length,1);
 assert.deepEqual(logged.mock.calls[0].arguments,['[Ask source semantics] unavailable',{failure:expected}]);
 assert.doesNotMatch(JSON.stringify(logged.mock.calls[0].arguments),/private/);
});
test('valid empty result emits no diagnostic and retains normal return',async t=>{
 const logged=t.mock.method(console,'info',()=>{});
 const db={rpc:()=>({abortSignal:async()=>({error:null,data:valid()})})};
 const result=await readCorrectionRelevance({db,ownerId:'owner',petIds:['pet'],candidates:[],domain:{from:null,to:null},deadline:Date.now()+10000});
 assert.equal(logged.mock.calls.length,0);assert.equal(result.queries,1);assert.equal(result.bySource.size,0);assert.deepEqual(result.unresolved,[]);
});
