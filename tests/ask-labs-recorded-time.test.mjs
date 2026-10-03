import test from 'node:test';
import assert from 'node:assert/strict';
import { certifiedHistoryRead } from './helpers/certified-history-read.mjs';
import { buildLabsList, serializeLabsList } from '../app/lib/intelligence/labs-list.ts';
import { reviewHistoricalAnswer } from '../app/lib/intelligence/review-history-narrative.ts';
const eventAt='2021-04-07T09:00:00Z',savedAt='2026-10-01T15:30:00Z';
const original=()=>({scope:{authorizedPetIds:['dated-subject']},petNames:{'dated-subject':'Alder'},
 represented:[{sourceId:'care:dated-note',sourceType:'care_update',petId:'dated-subject',
 text:'Alder weighed 6.75 kg.',occurredAt:eventAt,createdAt:savedAt}]});
const selection={groupBy:['subject'],union:[{orderBy:[{field:'event_at',direction:'desc'}],take:{count:1,per:'group'}}]};
for(const format of ['prose','bullets','table']){
 test('effective history keeps event and saving time distinct in '+format,async()=>{
  const f=await certifiedHistoryRead(original(),{selection,format});
  assert.equal(f.response.labsList.records[0].event_at,eventAt);
  assert.equal(f.response.labsList.records[0].recorded_at,savedAt);
  assert.ok(f.response.answer.summary.includes('2021-04-07'));
  assert.ok(f.response.answer.summary.includes(savedAt));
  assert.match(f.response.answer.summary,/saved at/i);
  assert.deepEqual(f.result.coverage.selection.retainedIds,['dated-note']);
  assert.ok(f.result.coverage.groups[0].clauses.every(c=>c.certified));
 });
}
test('unbounded effective records preserve the source saving time too',async()=>{
 const f=await certifiedHistoryRead(original());
 assert.equal(f.response.labsList.records[0].recorded_at,savedAt);
 assert.ok(f.response.answer.summary.includes(savedAt));
 assert.ok(f.response.answer.summary.includes('2021-04-07'));
});
test('later saves do not reorder semantic event-time selection',async()=>{
 const e=original();
 e.represented.push({...e.represented[0],sourceId:'care:later-event',text:'Alder weighed 7 kg.',
  occurredAt:'2021-04-09T09:00:00Z',createdAt:'2025-08-01T10:00:00Z'});
 const f=await certifiedHistoryRead(e,{selection});
 assert.deepEqual(f.response.labsList.records.map(r=>r.id),['later-event']);
 assert.equal(f.response.labsList.records[0].recorded_at,'2025-08-01T10:00:00Z');
 assert.ok(!f.response.answer.summary.includes(savedAt));
});
for(const value of [undefined,'not-a-timestamp']){
 test('unavailable save metadata is never replaced with event time: '+String(value),async()=>{
  const f=await certifiedHistoryRead(original(),{selection});
  const labs=buildLabsList(f.response.evidenceContract,f.result.records.map(r=>({...r,created_at:value})));
  assert.ok(labs);assert.equal(Object.hasOwn(labs.records[0],'recorded_at'),false);
  assert.equal(labs.records[0].event_at,eventAt);
  assert.doesNotMatch(serializeLabsList(labs),/saved at/i);
 });
}
test('rewriting a transported save timestamp invalidates its publication snapshot',async()=>{
 const f=await certifiedHistoryRead(original(),{selection});
 f.response.labsList.records[0].recorded_at='2023-01-01T00:00:00Z';
 f.response.answer.summary=serializeLabsList(f.response.labsList);
 assert.equal(await reviewHistoricalAnswer({result:f.response,client:{responses:{create:async()=>assert.fail('No model verifier')}}}),false);
});
