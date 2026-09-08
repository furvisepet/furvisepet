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
