import assert from 'node:assert/strict';
import test from 'node:test';
import {clipHistoryPlan,resolveAskHistoryAccess} from '../app/lib/intelligence/history-access.ts';

test('Free and Plus both expose the full lifetime history domain',()=>{
  const free=resolveAskHistoryAccess('free',new Date('2026-09-09T12:00:00Z'));
  const plus=resolveAskHistoryAccess('plus',new Date('2026-09-09T12:00:00Z'));
  assert.deepEqual(free,plus);
  assert.equal(free.months,null);
  assert.equal(free.from,'1900-01-01T00:00:00.000Z');
  assert.equal(free.to,'2026-09-10T00:00:00.000Z');
  const old=clipHistoryPlan({from:'1926-01-01T00:00:00Z',to:'2026-07-01T00:00:00Z',terms:['activity']},free);
  assert.equal(old.from,'1926-01-01T00:00:00Z');
  assert.equal(old.to,'2026-07-01T00:00:00Z');
  assert.deepEqual(old.terms,['activity']);
});

test('technical lifetime domain still rejects dates outside the supported product range',()=>{
  const access=resolveAskHistoryAccess('free',new Date('2026-09-09T12:00:00Z'));
  for(const range of [{from:'1800-01-01T00:00:00Z',to:'1801-01-01T00:00:00Z'},{from:'2102-01-01T00:00:00Z',to:'2103-01-01T00:00:00Z'}]){
    const clipped=clipHistoryPlan({...range,terms:['activity']},access);
    assert.equal(clipped.from,clipped.to);
  }
});
