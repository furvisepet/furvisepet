import test from 'node:test';
import assert from 'node:assert/strict';
import {wholeTaskHistoryReviewSchema as schema,parseWholeTaskHistoryReview as parse} from '../app/lib/intelligence/history-review-selection.ts';
const approved=()=>({approved:true,rejectionReason:null,obligations:{
 obligation_0:{status:'limited',sentenceSupport:[true,true],actionSupport:[true]},
 obligation_1:{status:'limited',sentenceSupport:[true,false],actionSupport:[false]},
}});
test('whole review compiles fixed support positions into a complete strict receipt',()=>{
 const receipt=parse(approved(),2,2,1);
 assert.deepEqual(receipt.retainedSentenceIndexes,[0,1]);
 assert.deepEqual(receipt.obligations[1],{index:1,status:'limited',sentenceIndexes:[0],actionIndexes:[]});
 assert.deepEqual(schema(2,2,1).properties.obligations.required,['obligation_0','obligation_1']);
});
test('missing obligations, unsupported limits, unchecked actions, and fabricated flags cannot approve',()=>{
 for(const mutate of [v=>delete v.obligations.obligation_1,v=>v.obligations.obligation_1.sentenceSupport=[false,false],v=>v.obligations.obligation_0.actionSupport=[false],v=>v.obligations.obligation_0.sentenceSupport=[true],v=>v.obligations.obligation_0.sentenceSupport=[true,2],v=>v.obligations.obligation_1.status='missing']){
  const v=approved();mutate(v);assert.throws(()=>parse(v,2,2,1));
 }
});
test('a rejected checklist conveys feedback but cannot retain any answer',()=>{
 const v=approved();v.approved=false;v.rejectionReason='The owner report was presented as a saved fact.';
 assert.equal(parse(v,2,2,1).approved,false);assert.deepEqual(parse(v,2,2,1).retainedSentenceIndexes,[]);
});
