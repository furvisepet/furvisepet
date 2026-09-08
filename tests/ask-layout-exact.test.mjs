import test from 'node:test';
import assert from 'node:assert/strict';
import {requestedHistoryLayout,presentReviewedHistory} from '../app/lib/intelligence/history-presentation.ts';
test('exactly and precisely preserve requested bullet counts',()=>{
 for(const q of ['Give the June history in exactly three bullets.','Summarize in precisely 3 bullet points.']) {
 assert.deepEqual(requestedHistoryLayout(q),{style:'bullets',count:3});
 assert.equal(presentReviewedHistory(['First.','Second.','Third.'],q),'- First.\n- Second.\n- Third.');
 }
});

test('a reviewed table remains a separate block beside explanatory prose',()=>{
 const table='| Date | Weight |\n| --- | --- |\n| 2026-06-04 | 4.2 kg |\n| 2026-09-02 | 4.2 kg |';
 assert.equal(presentReviewedHistory([table,'Both recorded weights are the same.'],'Show weights in a table.'),table+'\n\nBoth recorded weights are the same.');
 assert.equal(presentReviewedHistory(['Here are the measurements.',...table.split('\n'),'Both recorded weights are the same.'],'Show weights in a table.'),'Here are the measurements.\n\n'+table+'\n\nBoth recorded weights are the same.');
});

test('bullet layout survives safe pronoun substitution without restoring changed facts',async()=>{
 const {preserveReviewedLayout}=await import('../app/lib/intelligence/history-presentation.ts');
 assert.equal(preserveReviewedLayout('- Pip ate.\n- Pip played.','- He ate. - He played.'),'- He ate.\n- He played.');
 assert.equal(preserveReviewedLayout('- Pip ate.\n- Pip played.','- He did not eat. - He played.'),'- He did not eat.\n- He played.');
 assert.equal(preserveReviewedLayout('- Pip ate.\n- Pip played.','He did not eat.'),'He did not eat.');
});

test('using two bullets is an explicit format request',()=>{
 assert.deepEqual(requestedHistoryLayout('Summarize June and August, using two bullets.'),{style:'bullets',count:2});
 assert.equal(presentReviewedHistory(['First.','Second.','Third.'],'Summarize, using two bullets.'),'- First.\n- Second. Third.');
});
