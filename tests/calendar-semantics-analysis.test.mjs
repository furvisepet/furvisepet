import test from 'node:test';
import assert from 'node:assert/strict';
import {bindReadTicket} from '../app/lib/furvise-brain/read-ticket.ts';
import {retrieveReadTicket} from '../app/lib/furvise-brain/lungs.ts';
import {calendarDateInZone,calendarWindowToInstants} from '../app/lib/ask-time-zone.ts';
import {calendarPeriodContaining} from '../app/lib/intelligence/history-periods.ts';
import {careOccurrence} from '../app/lib/intelligence/care-occurrence.ts';
// Analysis witnesses of CURRENT behavior, not a proposed calendar implementation.
const scope={userId:'owner',ownedPetIds:['a','b'],from:'2020-01-01T00:00:00Z',to:'2027-01-01T00:00:00Z',asOf:'2026-09-20T00:00:00Z'};
const row=(id,at,note='observation',pet='a')=>({id,user_id:'owner',pet_profile_id:pet,occurred_at:at,created_at:at,note,title:null,deleted_at:null});
const plan=(patch={})=>({operation:'read',temporal:{from:null,to:null,anchor:null,calendar:'oldest_year'},predicates:[],outputs:{ordering:'asc',limit:null,completeness:'exhaustive'},...patch});
const store=(rows,effective=r=>r)=>({page:async q=>rows.filter(r=>r.pet_profile_id===q.petId&&!r.deleted_at&&Date.parse(r.occurred_at)>=Date.parse(q.from)&&Date.parse(r.occurred_at)<Date.parse(q.to)).sort((a,b)=>a.occurred_at.localeCompare(b.occurred_at)||a.id.localeCompare(b.id)).slice(q.offset,q.offset+q.limit),effective:async r=>({records:effective(r),reliable:true})});
const run=(p,rows,pets=['a'],effective)=>retrieveReadTicket(bindReadTicket(p,pets),scope,store(rows,effective));
const ids=r=>r.records.map(r=>r.id);
test('analysis: oldest year returns the bucket, not just its earliest record',async()=>{
 const r=await run(plan(),[row('one','2021-01-01'),row('two','2021-12-31'),row('new','2024-01-01')]);
 assert.deepEqual(ids(r),['one','two']);assert.equal(r.coverage.windows[0].to,'2022-01-01T00:00:00.000Z');
});
test('analysis: oldest history bucket is chosen before topic predicates',async()=>{
 const r=await run(plan({predicates:[{kind:'text_any',terms:['food']}]}),[row('older','2021-01-01','visit'),row('food','2022-01-01','food')]);
 assert.deepEqual(ids(r),[]);assert.equal(r.coverage.windows[0].from,'2021-01-01T00:00:00.000Z');
});
test('analysis: each subject owns its oldest bucket, not a household-wide year',async()=>{
 const r=await run(plan(),[row('a','2021-01-01'),row('b','2023-01-01','observation','b')],['a','b']);
 assert.deepEqual(r.coverage.windows.map(w=>[w.petId,w.from.slice(0,4)]),[['a','2021'],['b','2023']]);
});
test('analysis: bucket identity can be known while representation of all rows is incomplete',async()=>{
 const r=await run(plan(),Array.from({length:100},(_,i)=>row('r'+i,'2021-06-01')));
 assert.equal(r.records.length,32);assert.equal(r.coverage.status,'partial');assert.equal(r.coverage.selection.omittedIds.length,68);
 assert.equal(r.coverage.windows[0].from.slice(0,4),'2021');assert.equal(r.coverage.resultSet,undefined);
});
test('analysis: bounded scan cannot currently resolve a calendar bucket without exhaustion',async()=>{
 const r=await run(plan(),Array.from({length:300},(_,i)=>row('r'+i,'2021-06-01')));
 assert.deepEqual(ids(r),[]);assert.equal(r.coverage.status,'partial');assert.ok(r.coverage.reasons.includes('calendar_search_not_exhausted'));
});
test('analysis: corrected effective event dates change the oldest bucket',async()=>{
 const rows=[row('moved','2021-01-01'),row('next','2022-01-01')];
 const r=await run(plan(),rows,['a'],rs=>rs.map(r=>r.id==='moved'?{...r,occurred_at:'2023-01-01'}:r));
 assert.deepEqual(ids(r),['next']);assert.equal(r.coverage.windows[0].from.slice(0,4),'2022');
});
test('analysis: deleting the only old effective row changes bucket identity',async()=>{
 const r=await run(plan(),[row('deleted','2021-01-01'),row('next','2022-01-01')],['a'],rs=>rs.filter(r=>r.id!=='deleted'));
 assert.deepEqual(ids(r),['next']);
});
test('analysis: calendar_samples selects one ordered match per pet/year, not global top N',async()=>{
 const rows=[row('first','2021-01-01'),row('last','2021-12-01'),row('next','2022-01-01')];
 const p=plan({temporal:{from:null,to:null,anchor:null},outputs:{strategy:'calendar_samples',ordering:'asc',limit:null,completeness:'sufficient'}});
 const a=await run(p,rows),b=await run({...p,outputs:{...p.outputs,ordering:'desc'}},rows);
 assert.deepEqual(ids(a),['first','next']);assert.deepEqual(ids(b),['next','last']);assert.equal(a.coverage.periods[0].candidateIds.length,2);assert.equal(a.coverage.status,'partial');
});
test('analysis: sample limit is global and may remove an entire subject bucket',async()=>{
 const p=plan({temporal:{from:null,to:null,anchor:null},outputs:{strategy:'calendar_samples',ordering:'asc',limit:1,completeness:'sufficient'}});
 const r=await run(p,[row('a','2021-01-01'),row('b','2022-01-01','observation','b')],['a','b']);
 assert.deepEqual(ids(r),['a']);assert.equal(r.coverage.periods.length,2);assert.equal(r.coverage.status,'partial');
});
test('analysis: UTC ticket bucket and existing local calendar helper disagree near New Year',async()=>{
 const at='2022-01-01T01:00:00Z',zone='America/Vancouver';
 const r=await run(plan(),[row('boundary',at)]);
 assert.equal(r.coverage.windows[0].from.slice(0,4),'2022');assert.equal(calendarDateInZone(at,zone).slice(0,4),'2021');
 const local=calendarWindowToInstants(calendarPeriodContaining(at,'year',zone),zone);
 assert.equal(local.from,'2021-01-01T08:00:00.000Z');
});
test('analysis: explicit saved date precision differs from a genuine midnight instant',()=>{
 const dateOnly={...row('day','2022-01-01T00:00:00.000Z'),care_event_metadata:{explicitTime:'2022-01-01'}};
 assert.equal(careOccurrence(dateOnly,'America/Vancouver'),'2022-01-01T08:00:00.000Z');
 assert.equal(careOccurrence({...dateOnly,care_event_metadata:null},'America/Vancouver'),'2022-01-01T00:00:00.000Z');
});
test('analysis: latest month/year selection is not an existing ticket enum',()=>{
 for(const calendar of ['newest_year','oldest_month','latest_month'])assert.throws(()=>bindReadTicket(plan({temporal:{from:null,to:null,anchor:null,calendar}}),['a']));
});
test('analysis: a concrete explicit period needs no calendar operator',async()=>{
 const r=await run(plan({temporal:{from:'2021-01-01T00:00:00Z',to:'2022-01-01T00:00:00Z',anchor:null}}),[row('in','2021-06-01'),row('out','2022-01-01')]);
 assert.deepEqual(ids(r),['in']);assert.equal(r.coverage.resultSet.certified,true);
});
