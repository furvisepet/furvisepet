import test from 'node:test';
import assert from 'node:assert/strict';
import {serializeLabsList,labsListSourceIds} from '../app/lib/intelligence/labs-list.ts';
function fixture(status='partial') {
 return {ticket:{authority:'stored_report',operation:'read',subjects:{petIds:['subject']},temporal:{from:null,to:null,anchor:null,calendar:null},outputs:{completeness:'sufficient',ordering:'asc',limit:null},predicates:[]},
 coverage:{status,reasons:['no_cross_query_snapshot'],sourceLineage:[]},
 records:[{id:'private-record-id',sourceId:'care:private-record-id',petId:'subject',event_at:'2025-02-01T12:00:00Z',recorded_at:'2025-02-03T14:05:00Z',body:'A | B — café',predicates_matched:[]}],
 petNames:{subject:'Pet'},calculations:[],presentation:'prose'};
}
test('stored source IDs stay in the internal binding and leave primary report prose',()=>{
 const data=fixture(),text=serializeLabsList(data);
 assert.deepEqual(labsListSourceIds(data),['care:private-record-id']);
 assert.doesNotMatch(text,/private-record-id|2025-02-03T14:05:00/);
 assert.ok(text.includes(JSON.stringify(data.records[0].body).replace(/[\\|]/g,'\\$&')));
 assert.match(text,/couldn't confirm all matching notes/);
 assert.match(text,/what is current or corrected/);
});
test('complete reports do not certify present or corrected state',()=>{
 const text=serializeLabsList(fixture('complete'));
 assert.match(text,/what is current or corrected/);
});

test('same-day saved and event times remain distinct in human-readable UTC',()=>{
 const data=fixture('complete');
 data.records[0].event_at='2025-02-03T12:00:12.345Z';
 data.records[0].recorded_at='2025-02-03T14:05:56.789Z';
 const text=serializeLabsList(data);
 assert.match(text,/Feb 3, 2025, 12:00:12\.345 UTC/);
 assert.match(text,/Feb 3, 2025, 14:05:56\.789 UTC/);
 assert.doesNotMatch(text,/2025-02-03T/);
});
