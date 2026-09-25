import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({resolve(s,c,next){return s==='server-only'?{url:'data:text/javascript,export {};',format:'module',shortCircuit:true}:next(s,c);}});
const {recordHistoryReviewAudit,readHistoryReviewAudit,readReviewedHistoryAnswer} = await import('../app/lib/intelligence/history-review-state.ts');
test('private review diagnostics cannot create or transfer an answer approval',()=>{
 const result={};const audit={repairAttempted:false,rejectionReason:'x'.repeat(2000),dateBindings:[{index:0,citedSourceIds:['care:a'],candidates:[{anchor:'2026:8-3',sourceIds:[]}]}]};
 recordHistoryReviewAudit(result,audit);
 assert.equal(readReviewedHistoryAnswer(result),null);
 assert.deepEqual(readHistoryReviewAudit({...result}),[]);
 assert.equal(readHistoryReviewAudit(result)[0].rejectionReason.length,1600);
 audit.dateBindings[0].citedSourceIds.push('foreign');
 const copy=readHistoryReviewAudit(result);copy[0].dateBindings.splice(0);
 assert.deepEqual(readHistoryReviewAudit(result)[0].dateBindings[0].citedSourceIds,['care:a']);
 recordHistoryReviewAudit(result,{...audit,repairAttempted:true});
 recordHistoryReviewAudit(result,{...audit,repairAttempted:true,rejectionReason:'last'});
 assert.equal(readHistoryReviewAudit(result).length,2);
 assert.equal(readHistoryReviewAudit(result)[1].rejectionReason,'last');
});
