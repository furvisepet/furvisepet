import test from 'node:test';
import assert from 'node:assert/strict';
import {calendarDateInZone,calendarBoundaryToInstant,resolveAskTimeZone} from '../app/lib/ask-time-zone.ts';
import {explicitCareEntryDate} from '../app/lib/history-archive.ts';
import {careOccurrence} from '../app/lib/intelligence/care-occurrence.ts';
// Test-only policy examples. No production calendar executor or expectations changed.
const day=(at,zone,metadata)=>explicitCareEntryDate(at,metadata)||calendarDateInZone(at,resolveAskTimeZone(zone));
const ownerDate=date=>({authority:'owner_report',explicitTime:date});
test('policy example: timestamp year follows the frozen request zone',()=>{
 const at='2026-01-01T01:00:00Z';
 assert.equal(day(at,'UTC'),'2026-01-01');assert.equal(day(at,'America/Los_Angeles'),'2025-12-31');
});
test('policy example: timestamp month also follows the same zone',()=>{
 const at='2026-03-01T01:00:00Z';assert.equal(day(at,'America/Los_Angeles').slice(0,7),'2026-02');assert.equal(day(at,'Asia/Tokyo').slice(0,7),'2026-03');
});
for(const zone of ['America/Los_Angeles','Asia/Tokyo']){
 test('existing UTC-midnight date-only invariant in '+zone,()=>{
  const at='2024-02-01T00:00:00.000Z',meta={explicitTime:'2024-02-01'};
  assert.equal(day(at,zone,meta),'2024-02-01');assert.equal(calendarDateInZone(careOccurrence({occurred_at:at,care_event_metadata:meta},zone),zone),'2024-02-01');
 });
 test('policy example: owner date survives a change of reading zone to '+zone,()=>{
  const saved='2026-09-14T15:00:00.000Z'; // Sep 15 local midnight in Tokyo.
  assert.equal(day(saved,zone,ownerDate('2026-09-15')),'2026-09-15');
 });
}
test('counterexample: unmarked UTC midnight is an instant, not proof of date-only precision',()=>{
 assert.equal(day('2026-01-01T00:00:00Z','America/Los_Angeles'),'2025-12-31');
});
test('policy example: explicit local day uses two independently resolved DST boundaries',()=>{
 const from=calendarBoundaryToInstant('2026-03-08','America/Los_Angeles'),to=calendarBoundaryToInstant('2026-03-09','America/Los_Angeles');
 assert.equal((Date.parse(to)-Date.parse(from))/3600000,23);assert.equal(calendarDateInZone(from,'America/Los_Angeles'),'2026-03-08');
});
test('policy example: same instant can belong to different dates without contradictory facts',()=>{
 const at='2026-09-15T03:00:00Z';assert.equal(day(at,'America/Los_Angeles'),'2026-09-14');assert.equal(day(at,'Asia/Tokyo'),'2026-09-15');assert.equal(new Date(at).toISOString(),'2026-09-15T03:00:00.000Z');
});
test('policy example: correction replaces the effective bucket, never save-time bucket',()=>{
 const before={at:'2026-01-01T10:00:00Z',created:'2026-06-01T00:00:00Z'},after={...before,at:'2026-01-01T01:00:00Z'};
 assert.equal(day(before.at,'America/Los_Angeles').slice(0,4),'2026');assert.equal(day(after.at,'America/Los_Angeles').slice(0,4),'2025');
});
test('policy example: tombstone removes the sole occupied old bucket',()=>{
 const effective=[{id:'old',at:'2021-09-18T12:00:00Z',deleted:true},{id:'next',at:'2022-06-01T12:00:00Z',deleted:false}].filter(r=>!r.deleted);
 assert.deepEqual([...new Set(effective.map(r=>day(r.at,'America/Los_Angeles').slice(0,4)))],['2022']);
});
test('policy example: C053 records keep the same year across the tested zones',()=>{
 for(const zone of ['UTC','America/Los_Angeles','Asia/Tokyo']){
 const rows=['2021-09-18T12:00:00Z','2021-12-21T12:00:00Z','2025-01-02T12:00:00Z'];
 const years=rows.map(at=>day(at,zone).slice(0,4)),oldest=[...years].sort()[0];assert.deepEqual(rows.filter((_,i)=>years[i]===oldest),rows.slice(0,2));
 }
});
test('existing missing/invalid zone fallback is UTC, not an inferred local zone',()=>{
 for(const zone of [undefined,'invalid/zone',{}])assert.equal(resolveAskTimeZone(zone),'UTC');
 assert.equal(day('2026-01-01T01:00:00Z',undefined),'2026-01-01');
});
test('policy example: future membership does not authorize inclusion before as-of',()=>{
 const asOf='2026-09-15T12:00:00Z',at='2026-09-16T01:00:00Z';
 assert.equal(day(at,'America/Los_Angeles'),'2026-09-15');assert.ok(Date.parse(at)>Date.parse(asOf),'same local date is not proof the timestamp is already past');
 assert.ok('2026-09-16'>calendarDateInZone(asOf,'Asia/Tokyo'),'a future date-only record remains future by calendar date');
});
