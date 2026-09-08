import test from 'node:test';
import assert from 'node:assert/strict';
import {explicitHistoryDays,normalizeExplicitHistoryDates} from '../app/lib/intelligence/explicit-history-dates.ts';
const plan=()=>({operation:'recall',ordinal:null,terms:['improvement'],from:null,to:'2026-07-17'});
test('by a named day is inclusive and completes only compatible bounds',()=>{
 const p=plan();normalizeExplicitHistoryDates(p,"By July 17, what did Fern's notes say?");
 assert.equal(p.from,'1900-01-01');assert.equal(p.to,'2026-07-18');
 for(const patch of [{to:'2026-02-30'},{from:'2026-08-01'},{to:'2026-07-19'},{operation:'update'},{ordinal:'second'}]) {
 const p={...plan(),...patch},old=structuredClone(p);normalizeExplicitHistoryDates(p,'By July 17, what changed?');assert.deepEqual(p,old);
 }
});
test('comparison includes both explicit dates without a synonym filter',()=>{
 const p={...plan(),operation:'comparison',from:'2026-07-01',to:'2026-07-02'};
 normalizeExplicitHistoryDates(p,"Compare Pip's July 1 improvement with his August 12 update.");
 assert.equal(p.from,'2026-07-01');assert.equal(p.to,'2026-08-13');assert.deepEqual(p.terms,[]);
 const bad={...p,terms:['SQL;']};normalizeExplicitHistoryDates(bad,'Compare July 1 and August 12.');assert.deepEqual(bad.terms,['SQL;']);
});
test('invalid calendar dates and competing dates remain unnormalized',()=>{
 assert.deepEqual(explicitHistoryDays('Compare February 30 and March 1.',2026),[]);
 assert.deepEqual(explicitHistoryDays('January 1, February 1 and March 1.',2026),[]);
});

test('topic synonyms broaden narrow terms but keep an unfiltered plan unfiltered',async()=>{
 const {normalizeHistoricalSearchTerms}=await import('../app/lib/intelligence/history-search-terms.ts');
 assert.ok(normalizeHistoricalSearchTerms(['eat'],'List recorded food for each pet.').includes('food'));
 assert.ok(normalizeHistoricalSearchTerms(['accident'],'What changed back in the litter setup?').includes('tray'));
 assert.deepEqual(normalizeHistoricalSearchTerms([],'Compare food on two dates.'),[]);
});
