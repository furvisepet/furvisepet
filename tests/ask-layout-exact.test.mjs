import test from 'node:test';
import assert from 'node:assert/strict';
import {requestedHistoryLayout,presentReviewedHistory} from '../app/lib/intelligence/history-presentation.ts';
test('exactly and precisely preserve requested bullet counts',()=>{
 for(const q of ['Give the June history in exactly three bullets.','Summarize in precisely 3 bullet points.']) {
 assert.deepEqual(requestedHistoryLayout(q),{style:'bullets',count:3});
 assert.equal(presentReviewedHistory(['First.','Second.','Third.'],q),'- First.\n- Second.\n- Third.');
 }
});
