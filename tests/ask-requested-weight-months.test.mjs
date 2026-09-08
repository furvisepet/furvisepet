import test from 'node:test';
import assert from 'node:assert/strict';
import {requestedWeightMonths} from '../app/lib/intelligence/requested-weight-months.ts';
test('disjoint month requests exclude intervening months without inventing years',()=>{
 assert.deepEqual(requestedWeightMonths('Show Pip June and September weights as two bullets.',2026),['2026-06','2026-09']);
 assert.deepEqual(requestedWeightMonths('Show June and September 2023 weights.',2026),['2023-06','2023-09']);
 for(const q of ['Show weights from June through September.','Show June and September weights last year.','Show June 2023 and September 2024 weights.','Show June, July and September weights.']) assert.equal(requestedWeightMonths(q,2026),null);
});
