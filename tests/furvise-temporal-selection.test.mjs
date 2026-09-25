import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
registerHooks({ resolve(s,c,next) { return s==='server-only'
  ? {url:'data:text/javascript,export {};',format:'module',shortCircuit:true} : next(s,c); } });
const { bindCompositionalReadTicket, eventOrder } = await import('../app/lib/furvise-brain/read-selection.ts');
const { retrieveReadTicket } = await import('../app/lib/furvise-brain/lungs.ts');
const scope={userId:'owner',ownedPetIds:['a','b'],from:'2020-01-01T00:00:00Z',
  to:'2027-01-01T00:00:00Z',asOf:'2026-09-20T00:00:00Z'};
const clause=(direction='desc',count=1)=>({orderBy:[{field:'event_at',direction}],take:{count,per:'group'}});
const proposal=(relation='after',union=[clause()],topic='food')=>({
  operation:'read_since_event',temporal:{from:null,to:null,anchor:{concept:'visit',relation},calendar:null},
  predicates:[{kind:'text_any',terms:[topic]}],needs:[],selection:{groupBy:['subject'],union},
  outputs:{completeness:'sufficient',ordering:'asc',limit:null,strategy:null}});
const row=(id,day,note='food',pet='a')=>({id,user_id:'owner',pet_profile_id:pet,note,title:null,
  occurred_at:new Date(Date.UTC(2025,0,day)).toISOString(),created_at:'2025-09-01T00:00:00Z',
  updated_at:'2025-09-01T00:00:00Z',deleted_at:null});
const rows=[row('pre',1),row('anchor',3,'visit food'),row('early',4),row('late',7)];
function store(input=rows,patch={}) {
  const calls=[];
  return {calls,effective:async records=>({records,reliable:true}),
    // A date-dependent query must never bypass temporal resolution through this fast path.
    effectiveWindow:async()=>{throw Error('UNRESOLVED_TEMPORAL_DISPATCH');},
    page:async q=>{calls.push(q);return input.filter(r=>r.pet_profile_id===q.petId
      && Date.parse(r.occurred_at)>=Date.parse(q.from)&&Date.parse(r.occurred_at)<Date.parse(q.to))
      .sort((a,b)=>q.ordering==='desc'?eventOrder(b,a):eventOrder(a,b)).slice(q.offset,q.offset+q.limit);},...patch};
}
const run=(p=proposal(),s=store(),pets=['a'])=>retrieveReadTicket(bindCompositionalReadTicket(p,pets),scope,s);
const ids=r=>r.records.map(r=>r.id);
test('A semantic anchor plus descending selection binds and runs after effective temporal resolution',async()=>{
  const p=proposal(),r=await run(p);
  assert.equal(p.temporal.from,null);assert.deepEqual(ids(r),['late']);
  assert.equal(r.coverage.anchors[0].eventId,'anchor');assert.equal(r.coverage.groups[0].blocked,false);
});
test('B ascending take selects the first matching record inside the resolved window',async()=>{
  assert.deepEqual(ids(await run(proposal('after',[clause('asc')]))),['early']);
});
test('C independent earliest and latest selections union inside the anchor window',async()=>{
  assert.deepEqual(ids(await run(proposal('after',[clause('asc'),clause('desc')]))),['early','late']);
});
test('D from includes a matching anchor event',async()=>{
  assert.deepEqual(ids(await run(proposal('from',[clause('asc')]))),['anchor']);
});
test('E after excludes all matching records at the anchor instant',async()=>{
  const s=store([...rows,row('same-time',3)]);
  assert.deepEqual(ids(await run(proposal('after',[clause('asc')]),s)),['early']);
});
test('before is exclusive and is applied before latest selection',async()=>{
  assert.deepEqual(ids(await run(proposal('before'))),['pre']);
});
test('F missing anchor never falls back to whole history or complete_empty',async()=>{
  const r=await run(proposal(),store(rows.filter(r=>r.id!=='anchor')));
  assert.deepEqual(ids(r),[]);assert.equal(r.coverage.status,'anchor_missing');
  assert.ok(r.coverage.reasons.includes('anchor_not_found'));
});
test('ambiguous anchor is never chosen by newest ordering',async()=>{
  const r=await run(proposal(),store([...rows,row('other-visit',6,'visit')]));
  assert.deepEqual(ids(r),[]);assert.equal(r.coverage.status,'anchor_missing');
  assert.ok(r.coverage.reasons.includes('anchor_ambiguous'));
});
test('G correction moves the anchor boundary before semantic selection',async()=>{
  const corrected=row('corrected',6,'visit food');
  const r=await run(proposal(),store(rows,{effective:async()=>({records:[rows[0],corrected,rows[2],rows[3]],reliable:true})}));
  assert.deepEqual(ids(r),['late']);assert.equal(r.coverage.anchors[0].eventId,'corrected');
  assert.equal(r.coverage.windows[0].from,corrected.occurred_at);
});
test('G deleted anchor does not survive effective truth',async()=>{
  const r=await run(proposal(),store(rows,{effective:async()=>({records:rows.map(r=>r.id==='anchor'
    ? {...r,deleted_at:'2025-09-01T00:00:00Z'}:r),reliable:true})}));
  assert.equal(r.coverage.status,'anchor_missing');assert.deepEqual(ids(r),[]);
});
test('uncertain anchor lineage remains partial',async()=>{
  const r=await run(proposal(),store(rows,{effective:async records=>({records,reliable:true,
    sourceLineage:[{eventId:'anchor',status:'uncertain',authority:'attributed_report'}]})}));
  assert.equal(r.coverage.status,'partial');assert.ok(r.coverage.reasons.includes('anchor_lineage_unresolved'));
  assert.deepEqual(ids(r),[]);
});
test('bounded anchor discovery cannot certify uniqueness from a directional prefix',async()=>{
  const s=store(Array.from({length:300},(_,i)=>row('r'+i,1,i===299?'visit food':'food')));
  const r=await run(proposal(),s);
  assert.equal(r.coverage.status,'partial');assert.ok(r.coverage.reasons.includes('anchor_search_not_exhausted'));
  assert.deepEqual(ids(r),[]);assert.equal(s.calls.reduce((n,q)=>n+q.limit,0),256);
});
test('explicit dates intersect the resolved anchor without hiding it during discovery',async()=>{
  const p=proposal('after',[clause('asc')]);p.temporal.from=rows[3].occurred_at;
  const r=await run(p);assert.deepEqual(ids(r),['late']);assert.equal(r.coverage.anchors[0].eventId,'anchor');
});
test('multi-subject concept resolves independently and subject rotation preserves selected IDs',async()=>{
  const input=[...rows,row('b-pre',2,'food','b'),row('b-anchor',6,'visit food','b'),row('b-late',8,'food','b')];
  for(const pets of [['a','b'],['b','a']]){
    const r=await run(proposal('after',[clause('asc')]),store(input),pets);
    assert.deepEqual(ids(r),['early','b-late']);
    assert.deepEqual(Object.fromEntries(r.coverage.anchors.map(a=>[a.petId,a.eventId])),{a:'anchor',b:'b-anchor'});
    assert.ok(r.coverage.groups.every(g=>!g.blocked));
  }
});
test('a missing subject anchor fails closed under existing cohort anchor semantics',async()=>{
  const r=await run(proposal(),store([...rows,row('b-food',8,'food','b')]),['a','b']);
  assert.equal(r.coverage.status,'anchor_missing');assert.deepEqual(ids(r),[]);
});
test('alternate predicates and take-two reuse the same temporal phase and executor',async()=>{
  for(const topic of ['medication','observation','weight']){
    const input=rows.map(r=>({...r,note:r.note.replaceAll('food',topic)}));
    const r=await run(proposal('after',[clause('desc',2)],topic),store(input));
    assert.deepEqual(ids(r),['early','late']);
  }
});
test('malformed anchors, incompatible operators and contradictory explicit dates still reject',()=>{
  const p=proposal();
  for(const temporal of [
    {...p.temporal,anchor:{concept:'',relation:'after'}},
    {...p.temporal,anchor:{concept:'visit',relation:'during'}},
    {...p.temporal,anchor:{concept:'visit',relation:'after',petId:'foreign'}},
    {...p.temporal,from:'2026-01-01T00:00:00Z',to:'2025-01-01T00:00:00Z'},
    {...p.temporal,calendar:'oldest_year'},
  ])assert.throws(()=>bindCompositionalReadTicket({...p,temporal},['a']),/read_ticket/);
  assert.throws(()=>bindCompositionalReadTicket(p,[]),/read_ticket/);
  assert.throws(()=>bindCompositionalReadTicket({...p,operation:'compare'},['a']),/read_ticket/);
  assert.throws(()=>bindCompositionalReadTicket({...p,outputs:{...p.outputs,strategy:'chronological'}},['a']),/read_ticket/);
});
test('unauthorized subject cannot trigger anchor discovery',async()=>{
  const s=store(),t=bindCompositionalReadTicket(proposal(),['foreign']);
  const r=await retrieveReadTicket(t,scope,s);
  assert.equal(r.coverage.status,'unavailable');assert.deepEqual(s.calls,[]);
});
test('found anchor with no matching evidence may honestly be complete_empty',async()=>{
  const r=await run(proposal('after',[clause()],'unrecorded'));
  assert.equal(r.coverage.status,'complete_empty');assert.deepEqual(ids(r),[]);
  assert.equal(r.coverage.anchors.length,1);
});

test('duplicate semantic clauses reject without silent deduplication or key-order dependence',()=>{
 const duplicate={take:{per:'group',count:1},orderBy:[{direction:'asc',field:'event_at'}]};
 const p=proposal('after',[clause('asc'),duplicate]);const original=structuredClone(p);
 assert.throws(()=>bindCompositionalReadTicket(p,['a']),e=>e.cause?.rule==='duplicate_selection_clause'&&e.cause?.field==='selection.union[1]');
 assert.deepEqual(p,original);
});
for(const [label,union] of [['opposite boundaries',[clause('asc'),clause('desc')]],['distinct cardinalities',[clause('asc'),clause('asc',2)]],['single clause',[clause('asc')]]])test(label+' remains legal after duplicate-clause guard',()=>{
 assert.equal(bindCompositionalReadTicket(proposal('after',union),['a']).selection.union.length,union.length);
});
test('distinct semantic clauses may certify one overlapping source without shape rejection',async()=>{
 const {fixture,row:measurementRow}=await import('./helpers/calculation-fixture.mjs');
 const {result:r}=await fixture({sourceRows:[measurementRow('only','sample 4 kg')]});
 assert.deepEqual(ids(r),['only']);assert.deepEqual(r.coverage.groups[0].clauses.map(c=>c.ids),[['only'],['only']]);assert.ok(r.coverage.groups[0].clauses.every(c=>c.certified));
});
