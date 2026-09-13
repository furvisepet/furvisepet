import assert from 'node:assert/strict';
import test from 'node:test';
import {clipHistoryPlan,resolveAskHistoryAccess} from '../app/lib/intelligence/history-access.ts';
test('disjoint historical requests stay empty and within the plan window',()=>{
 const access=resolveAskHistoryAccess('free',new Date('2026-09-09T12:00:00Z'));
 for(const range of [{from:'2020-01-01T00:00:00Z',to:'2021-01-01T00:00:00Z'},{from:'2027-01-01T00:00:00Z',to:'2028-01-01T00:00:00Z'}]){
  const clipped=clipHistoryPlan({...range,terms:['activity']},access);
  assert.equal(clipped.from,clipped.to);
  assert.ok(clipped.from>=access.from&&clipped.to<=access.to);
  assert.deepEqual(clipped.terms,['activity']);
 }
 const clipped=clipHistoryPlan({from:'2026-01-01T00:00:00Z',to:'2026-07-01T00:00:00Z'},access);
 assert.equal(clipped.from,access.from);assert.equal(clipped.to,'2026-07-01T00:00:00Z');
});
