import assert from 'node:assert/strict';
import test from 'node:test';
import { bindReadTicket } from '../app/lib/furvise-brain/read-ticket.ts';
import { retrieveReadTicket } from '../app/lib/furvise-brain/lungs.ts';
const scope = { userId:'owner', ownedPetIds:['a'], from:'2020-01-01T00:00:00Z', to:'2026-09-20T00:00:00Z', asOf:'2026-09-19T00:00:00Z' };
const row = (id, day, note) => ({ id, user_id:'owner', pet_profile_id:'a', occurred_at:day+'T00:00:00Z', created_at:day+'T00:00:00Z', updated_at:day+'T00:00:00Z', deleted_at:null, title:null, note });
const ordinary = row('ordinary','2025-03-06','Aster weighed 20 kg.');
const correction = row('correction','2025-03-07','Correction: the earlier observation described another animal.');
const sourceLineage = [{eventId:'correction',status:'unlinked',authority:'attributed_report'}];
const proposal = patch => ({operation:'read',temporal:{from:null,to:null,anchor:null},predicates:[],outputs:{completeness:'sufficient',ordering:'asc',limit:null},...patch});
const store = (rows=[ordinary,correction],patch={}) => ({page:async({offset,limit})=>rows.slice(offset,offset+limit),effective:async records=>({records,reliable:true,sourceLineage}),...patch});

test('validated unlinked wording survives as an attributed report with partial coverage',async()=>{
 const result=await retrieveReadTicket(bindReadTicket(proposal({}),['a']),scope,store());
 assert.deepEqual(result.records,[ordinary,correction]);
 assert.equal(result.coverage.status,'partial');
 assert.deepEqual(result.coverage.sourceLineage,sourceLineage);
 assert.ok(result.coverage.reasons.includes('unresolved_source_lineage'));
 assert.equal(result.coverage.sourceLineage.some(source=>source.eventId==='ordinary'),false);
 assert.equal(result.coverage.sourceLineage.some(source=>source.status==='superseded'||source.authority==='effective'),false);
});

test('an uncertain report cannot certify chronological or comparison endpoints',async()=>{
 for(const [operation,strategy,limit,ordering] of [['read','chronological',1,'desc'],['compare','temporal_endpoints',null,'asc']]){
  const ticket=bindReadTicket(proposal({operation,outputs:{completeness:'sufficient',ordering,limit,strategy}}),['a']);
  const result=await retrieveReadTicket(ticket,scope,store());
  assert.equal(result.coverage.status,'partial');
  assert.ok(result.records.some(row=>row.id==='correction'));
  assert.equal((result.coverage.chronology||result.coverage.endpointPairs)[0].blocked,true);
 }
});

test('unresolved anchor lineage and unavailable lineage are not treated as verified history',async()=>{
 const anchor=bindReadTicket(proposal({operation:'read_since_event',temporal:{from:null,to:null,anchor:{concept:'correction',relation:'from'}}}),['a']);
 const unresolved=await retrieveReadTicket(anchor,scope,store());
 assert.equal(unresolved.coverage.status,'partial');
 assert.ok(unresolved.coverage.reasons.includes('anchor_lineage_unresolved'));
 assert.deepEqual(unresolved.coverage.anchors,[]);
 for(const patch of [{effective:async()=>({records:[ordinary,correction],reliable:false,sourceLineage})},{effective:async()=>{throw Error('graph unavailable');}}]){
  const result=await retrieveReadTicket(bindReadTicket(proposal({}),['a']),scope,store(undefined,patch));
  assert.equal(result.coverage.status,'unavailable');assert.deepEqual(result.records,[]);
 }
});

test('need-query candidates carry per-source uncertainty without losing the source or certifying semantics',async()=>{
 const ticket=bindReadTicket(proposal({needs:[{needId:'need:0',from:null,to:null,target:null,termGroups:[['correction']],ordering:'asc'}]}),['a'],
  [{id:'need:0',petIds:['a'],sourceSpanId:'user:0:10'}]);
 const result=await retrieveReadTicket(ticket,scope,store([correction],{needPage:async()=>[correction]}));
 assert.deepEqual(result.records,[correction]);
 assert.deepEqual(result.coverage.needs[0].candidateIds,['correction']);
 assert.deepEqual(result.coverage.sourceLineage,sourceLineage);
 assert.equal(result.coverage.status,'partial');
 assert.ok(result.coverage.reasons.includes('unresolved_source_lineage'));
});
