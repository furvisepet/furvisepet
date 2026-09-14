import assert from 'node:assert/strict';
import test from 'node:test';
import {calendarBoundaryToInstant,calendarDateInZone,resolveAskTimeZone} from '../app/lib/ask-time-zone.ts';
import {compileHistoryReadStrategies} from '../app/lib/intelligence/history-read-strategies.ts';
test('calendar windows match displayed dates and DST boundaries',()=>{
  const zone='America/Los_Angeles';
  assert.equal(calendarDateInZone('2026-09-11T06:54:00Z',zone),'2026-09-10');
  for(const [day,next,hours] of [['2026-03-08','2026-03-09',23],['2026-11-01','2026-11-02',25],['2026-09-10','2026-09-11',24]]) {
    const from=calendarBoundaryToInstant(day,zone),to=calendarBoundaryToInstant(next,zone);
    assert.equal((Date.parse(to)-Date.parse(from))/3600000,hours);
    assert.equal(calendarDateInZone(from,zone),day);
  }
  assert.equal(resolveAskTimeZone('invalid/zone'),'UTC');
  assert.equal(resolveAskTimeZone({}),'UTC');
  assert.equal(calendarBoundaryToInstant('2026-09-10T00:00:00.000Z'),'2026-09-10T00:00:00.000Z');
});
test('date target clips local boundaries against server access instants',()=>{
 const from='2026-09-10T08:00:00.000Z',to='2026-09-12T00:00:00.000Z';
 const plan=compileHistoryReadStrategies('September 10, 2026',2026,{from,to},[],4,[],'America/Los_Angeles');
 assert.equal(plan.strategies[0].from,from);
 assert.equal(plan.strategies[0].to,'2026-09-11T07:00:00.000Z');
});
