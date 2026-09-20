import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
registerHooks({ resolve(s, c, next) { return s === 'server-only'
  ? { url: 'data:text/javascript,export {};', format: 'module', shortCircuit: true } : next(s, c); } });
globalThis.fetch = async () => { throw Error('OFFLINE_ONLY'); };
const { createEffectiveWindowResolver } = await import('../app/lib/intelligence/history-retrieval.ts');
const { retrieveReadTicket } = await import('../app/lib/furvise-brain/lungs.ts');
const { bindCompositionalReadTicket, eventOrder } = await import('../app/lib/furvise-brain/read-selection.ts');
const scope = { userId: 'owner', ownedPetIds: ['a','b','c'], from: '2010-01-01T00:00:00Z',
  to: '2027-01-01T00:00:00Z', asOf: '2026-09-20T00:00:00Z' };
const at = i => new Date(Date.UTC(2016,0,i+1)).toISOString();
const row = (pet, i, note='weight') => ({ id: pet+'-'+i, user_id:'owner', pet_profile_id:pet,
  occurred_at:at(i), created_at:at(i), updated_at:at(i), deleted_at:null, severity:null, title:null, note, category:'general' });
const clause = (direction='desc', count=1) => ({ orderBy:[{field:'event_at',direction}], take:{count,per:'group'} });
const plan = (pets=['a'], topic='weight', union=[clause()], limit=null) => bindCompositionalReadTicket({
  operation:'compare', temporal:{from:null,to:null,anchor:null,calendar:null}, predicates:[{kind:'text_any',terms:[topic]}],
  needs:[], selection:{groupBy:['subject'],union}, outputs:{completeness:'sufficient',ordering:'desc',limit},
},pets);
const claim = (id, pet, i, operation='assert', note='weight') => ({ id,user_id:'owner',subject_id:pet,subject_type:'pet',
  structured_value:{note,title:null,severity:null}, occurred_at:at(i), recorded_at:operation==='assert'?at(i):'2026-01-01T00:00:00Z',
  operation_type:operation, knowledge_status:'effective', persistence_destination:'history', claim_kind:'observation',
  concept_key:'observation', canonical_concept_key:null, concept_resolution_status:'unresolved', provenance_classification:'owner_report' });
const link = (claimId, sourceId) => ({user_id:'owner',claim_id:claimId,legacy_row_id:sourceId,legacy_table:'pet_care_entries',claim_role:'primary'});
const edge = (from,to,relation_type='supersedes') => ({id:from+'-'+to,user_id:'owner',from_claim_id:from,to_claim_id:to,relation_type});
function fixture(rows, graph={}, pets=['a']) {
  const pages=[], calls=[];
  // SQL-faithful bounded RPC mock. In particular tombstone markers for care
  // roots are returned ONLY for p_care_ids, not for merely linked sources.
  const db={rpc(name,args){assert.equal(name,'read_ask_history_correction_page'); calls.push(args);
    return {abortSignal:async()=>{
      const claims=graph.claims||[], edges=graph.edges||[], links=graph.links||[];
      const seeds=claims.filter(c=>args.p_seed_pet_ids.includes(c.subject_id)
        && ['correct','supersede'].includes(c.operation_type)
        && (!args.p_event_from||c.occurred_at>=args.p_event_from)&&(!args.p_event_to||c.occurred_at<args.p_event_to)
        && edges.some(e=>e.from_claim_id===c.id&&['corrects','supersedes'].includes(e.relation_type)));
      const roots=new Set([...args.p_claim_ids,...seeds.map(c=>c.id),...links.filter(l=>args.p_care_ids.includes(l.legacy_row_id)).map(l=>l.claim_id)]);
      const relations=edges.filter(e=>roots.has(e.from_claim_id)||roots.has(e.to_claim_id));
      const ids=new Set([...roots,...relations.flatMap(e=>[e.from_claim_id,e.to_claim_id])]);
      const lineage=links.filter(l=>ids.has(l.claim_id));
      const sources=new Set([...args.p_care_ids,...lineage.map(l=>l.legacy_row_id)]);
      return {error:null,data:{claims:structuredClone(claims.filter(c=>ids.has(c.id))),relations,lineage,
        sources:[...rows,...(graph.sources||[])].filter(r=>sources.has(r.id)&&!(graph.missing||[]).includes(r.id)),
        withheld_source_ids:(graph.removedSources||[]).filter(id=>args.p_care_ids.includes(id)),
        withheld_claim_ids:(graph.removedClaims||[]).filter(id=>ids.has(id)),
        truncated:!!graph.truncated || (graph.partialPets||[]).some(p=>args.p_seed_pet_ids.includes(p))}};
    }};
  }};
  const coverage={plan:{from:scope.from,to:scope.to,terms:[],interpretation:'period'},candidateIds:[],queryCount:0,
    retrieval:'unknown',corrections:'unknown',extraction:'unknown',grouping:'unknown',continuation:[],reasons:[],
    consistency:'read_committed_no_snapshot',perPet:[],provenance:[],claimSources:[],excludedIds:[]};
  const effectiveWindow=createEffectiveWindowResolver({owned:new Set(scope.ownedPetIds),petIds:pets,userId:'owner',db,coverage,deadline:Date.now()+60000});
  const store={effectiveWindow,effective:async()=>{throw Error('must use correction-aware stream');},
    page:async input=>{pages.push(input);return rows.filter(r=>r.pet_profile_id===input.petId&&!r.deleted_at
      && r.occurred_at>=input.from&&r.occurred_at<input.to).sort((a,b)=>input.ordering==='asc'?eventOrder(a,b):eventOrder(b,a))
      .slice(input.offset,input.offset+input.limit);}};
  return {store,pages,calls,coverage};
}
async function run(rows, graph={}, ticket=plan()) {
  const f=fixture(rows,graph,ticket.subjects.petIds);
  return {...f,result:await retrieveReadTicket(ticket,scope,f.store)};
}
const selected = r => r.coverage.effectiveStream.flatMap(s=>s.certifiedSelectedIds).sort();

test('120 rows each: latest effective selections certify with two acquired rows per subject',async()=>{
  const rows=scope.ownedPetIds.flatMap(p=>Array.from({length:120},(_,i)=>row(p,i)));
  const r=await run(rows,{},plan(scope.ownedPetIds));
  assert.deepEqual(selected(r.result),['a-119','b-119','c-119']);
  assert.equal(r.pages.length,3);assert.equal(r.calls.length,3);
  assert.ok(r.result.coverage.effectiveStream.every(s=>s.acquiredIds.length===2));
  assert.ok(r.result.coverage.groups.every(g=>g.selectionStatus==='complete'&&!g.exhausted));
  assert.equal(r.result.coverage.status,'partial'); // no fabricated exhaustive history
});
for(const topic of ['weight','food','medication','observation']){
  test('later out-of-page correction replaces latest '+topic,async()=>{
    const rows=[row('a',0,topic),row('a',118,'unrelated'),row('a',119,topic)];
    const graph={claims:[claim('B','a',119,'assert',topic),claim('C','a',119,'correct',topic+' amended')],
      edges:[edge('C','B','corrects')],links:[link('B','a-119')]};
    const r=await run(rows,graph,plan(['a'],topic));
    assert.deepEqual(selected(r.result),['claim-C']);
    assert.equal(r.result.records[0].note,topic+' amended');
    assert.ok(!r.result.coverage.effectiveStream[0].effectiveIds.includes('a-119'));
    assert.equal(r.pages.length,1);assert.equal(r.calls.length,2);
    assert.equal(r.result.coverage.effectiveStream[0].acquiredIds.length,2);
  });
}
test('replacement seed from an unacquired older root can move into latest position',async()=>{
  const rows=Array.from({length:120},(_,i)=>row('a',i));
  const graph={claims:[claim('old','a',0),claim('moved','a',130,'supersede')],
    edges:[edge('moved','old')],links:[link('old','a-0')]};
  const r=await run(rows,graph);
  assert.deepEqual(selected(r.result),['claim-moved']);
  assert.ok(!r.result.coverage.effectiveStream[0].acquiredIds.includes('a-0'));
  assert.ok(r.calls.some(c=>c.p_care_ids.includes('a-0')),'seed source receives root tombstone lookup');
  assert.equal(r.pages.length,1);assert.equal(r.calls.length,2);
});
test('tombstoned raw endpoint continues to the next effective match',async()=>{
  const rows=[row('a',0),row('a',118,'unrelated'),row('a',119)];
  const r=await run(rows,{removedSources:['a-119']});
  assert.deepEqual(selected(r.result),['a-0']);
  assert.equal(r.pages.length,2);assert.equal(r.calls.length,2);
  assert.deepEqual(r.pages.map(p=>p.offset),[0,2]);
});
test('out-of-window retract edge removes a candidate before selection',async()=>{
  const rows=[row('a',0),row('a',118,'unrelated'),row('a',119)];
  const graph={claims:[claim('B','a',119),claim('T','a',200,'retract','withdrawn')],
    edges:[edge('T','B','retracts')],links:[link('B','a-119')]};
  const r=await run(rows,graph);
  assert.deepEqual(selected(r.result),['a-0']);
  assert.equal(r.pages.length,2);assert.equal(r.calls.length,4);
});
test('care-root tombstone on linked replacement outside the acquired page cannot resurrect it',async()=>{
  const rows=[row('a',0),row('a',118,'unrelated'),row('a',119)];
  const source=row('a',120);
  const graph={claims:[claim('B','a',119),claim('C','a',120,'correct')],edges:[edge('C','B','corrects')],
    links:[link('B','a-119'),link('C','a-120')],sources:[source],removedSources:['a-120']};
  const r=await run(rows,graph);
  assert.deepEqual(selected(r.result),['a-0']);
  assert.ok(r.calls.some(c=>c.p_care_ids.includes('a-120')));
  assert.ok(!r.result.records.some(r=>r.id==='claim-C'));
});
test('truncated or missing cross-window lineage stays uncertified',async()=>{
  const rows=[row('a',0),row('a',119)];
  for(const graph of [{truncated:true},{claims:[claim('B','a',119),claim('C','a',120,'correct')],
    edges:[edge('C','B','corrects')],links:[link('B','a-119'),link('C','missing')]}]){
    const r=await run(rows,graph);
    assert.deepEqual(selected(r.result),[]);
    assert.equal(r.result.coverage.groups[0].selectionStatus,'partial');
    assert.equal(r.result.coverage.effectiveStream[0].lineageClosed,false);
  }
});
test('one subject with unresolved lineage does not erase other certified selections, including rotation',async()=>{
  const rows=scope.ownedPetIds.flatMap(p=>Array.from({length:120},(_,i)=>row(p,i)));
  const a=await run(rows,{partialPets:['b']},plan(['a','b','c']));
  const b=await run(rows,{partialPets:['b']},plan(['c','a','b']));
  assert.deepEqual(selected(a.result),['a-119','c-119']);
  assert.deepEqual(selected(a.result),selected(b.result));
  assert.deepEqual(a.result.coverage.groups.map(g=>g.selectionStatus),['complete','partial','complete']);
  assert.deepEqual(a.pages,b.pages);
  assert.ok(a.calls.length<=6);
});
test('earliest, take-two and union certify independently with the same executor',async()=>{
  const rows=scope.ownedPetIds.flatMap(p=>Array.from({length:120},(_,i)=>row(p,i)));
  for(const [union,expected] of [
    [[clause('asc')],['0']],
    [[clause('desc',2)],['118','119']],
    [[clause('asc'),clause('desc')],['0','119']],
  ]){
    const r=await run(rows,{},plan(scope.ownedPetIds,'weight',union));
    assert.deepEqual(selected(r.result),scope.ownedPetIds.flatMap(p=>expected.map(i=>p+'-'+i)).sort());
    assert.ok(r.result.coverage.groups.every(g=>g.clauses.every(c=>c.certified)));
    assert.ok(r.calls.length<=6);
  }
});
test('absence needs exhaustion and output caps cannot certify omitted required rows',async()=>{
  const rows=[row('a',0),row('a',1),row('b',0,'food'),row('c',0),row('c',1)];
  const r=await run(rows,{},plan(scope.ownedPetIds));
  assert.equal(r.result.coverage.groups[1].selectionStatus,'complete_empty');
  const capped=await run(rows,{},plan(scope.ownedPetIds,'weight',[clause()],1));
  assert.equal(capped.result.records.length,1);
  assert.ok(capped.result.coverage.groups.find(g=>g.petId==='c').blocked);
  assert.ok(!selected(capped.result).includes('c-1'));
});
test('unlinked uncertainty and unknown replacement event time cannot certify selection',async()=>{
  const rows=[row('a',0),row('a',119,'weight correction pending')];
  const r=await run(rows);
  assert.deepEqual(selected(r.result),[]);
  const C={...claim('C','a',120,'correct'),occurred_at:null};
  const unknown=await run([row('a',0),row('a',119)],{claims:[claim('B','a',119),C],
    edges:[edge('C','B','corrects')],links:[link('B','a-119')]});
  assert.deepEqual(selected(unknown.result),[]);
});
test('graph budget exhaustion is honest and does not turn bounded acquisition into a lifetime scan',async()=>{
  const rows=Array.from({length:10000},(_,i)=>({...row('a',i),occurred_at:at(i%120),created_at:at(i%120)}));
  const r=await run(rows,{},plan(['a'],'absent'));
  assert.ok(r.calls.length<=6);
  assert.ok(r.pages.reduce((n,p)=>n+p.limit,0)<=256);
  assert.equal(r.result.coverage.groups[0].selectionStatus,'partial');
  assert.deepEqual(selected(r.result),[]);
});

test('correction changing the predicate or moving a record behind the frontier forces continued selection',async()=>{
  for(const C of [claim('C','a',119,'correct','food'),claim('C','a',-1,'correct','weight')]){
    const rows=[row('a',0),row('a',118,'unrelated'),row('a',119)];
    const r=await run(rows,{claims:[claim('B','a',119),C],edges:[edge('C','B','corrects')],links:[link('B','a-119')]});
    assert.deepEqual(selected(r.result),['a-0']);
    assert.equal(r.pages.length,2);assert.equal(r.calls.length,4);
    assert.ok(!r.result.records.some(r=>r.id==='a-119'));
  }
});
test('a stale imported source outside the acquired window blocks certification',async()=>{
  const rows=[row('a',0),row('a',118,'unrelated'),row('a',119)];
  const graph={claims:[claim('B','a',119),claim('C','a',120,'correct')],edges:[edge('C','B','corrects')],
    links:[link('B','a-119'),link('C','a-120')],sources:[row('a',120,'changed source')]};
  const r=await run(rows,graph);
  assert.deepEqual(selected(r.result),[]);
  assert.equal(r.result.coverage.effectiveStream[0].lineageClosed,false);
  assert.deepEqual(r.result.records,[]);
});
test('an unknown replacement date outside the raw page cannot evade complete seed discovery',async()=>{
  const rows=Array.from({length:120},(_,i)=>row('a',i));
  const graph={claims:[claim('old','a',0),{...claim('C','a',0,'correct'),occurred_at:null}],
    edges:[edge('C','old','corrects')],links:[link('old','a-0')]};
  const r=await run(rows,graph);
  assert.deepEqual(selected(r.result),[]);
  assert.ok(r.calls.every(c=>c.p_event_from===null&&c.p_event_to===null&&c.p_terms.length===0));
});

test('ties must pass the event-time frontier or exhaust; no claim/raw identifier ordering shortcut',async()=>{
  const rows=[row('a',0),{...row('a',1),occurred_at:at(119)},row('a',119)];
  const r=await run(rows);
  assert.deepEqual(selected(r.result),['a-119']);
  assert.equal(r.pages.length,2);
});
test('a closed graph alone is insufficient if the selected direction has not passed its cutoff',async()=>{
  const rows=Array.from({length:1000},(_,i)=>({...row('a',i),occurred_at:at(119),created_at:at(119)}));
  const r=await run(rows);
  assert.deepEqual(selected(r.result),[]);
  assert.equal(r.result.coverage.groups[0].selectionStatus,'partial');
});
test('malformed or uncertified store results cannot publish raw candidates as effective evidence',async()=>{
  const rows=[row('a',0),row('a',1)];
  for(const foreign of [false,true]){
    const f=fixture(rows);
    f.store.effectiveWindow=async()=>({records:[{...rows[1],...(foreign?{user_id:'foreign'}:{})}],
      lineageClosed:foreign,replacementSeedsExhausted:foreign,sourceLineage:[],reasons:[],graphCalls:0,lineageRows:0});
    const r=await retrieveReadTicket(plan(),scope,f.store);
    assert.deepEqual(r.records,[]);
    assert.deepEqual(selected(r),[]);
  }
});
