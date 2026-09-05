import assert from 'node:assert/strict';
import test from 'node:test';
import { exercise, clock } from './helpers/lifetime-harness.mjs';
import { care, irrelevant, ownerId } from './fixtures/ask-lifetime-history.mjs';

test('lexical callback uses candidate RPC; title-only old evidence reaches final representation', async t => {
  clock(t);
  const old = {...care('old-title', 'milo', '2011-02-01', 'symptom', 'Result pending; not confirmed.'), title: 'Urine test'};
  const run = await exercise('What did the February 1, 2011 urine-test result say?', {history:true, rows:[old,...irrelevant('milo',1000)]});
  const calls = run.queries.filter(q => q.table === 'read_ask_history_candidates');
  assert.equal(calls.length,2);
  assert.deepEqual(calls[0].args.p_terms,['urine','urinalysis']);
  assert.equal(calls[0].args.p_pet_id,'milo');
  assert.ok(!('p_owner_id' in calls[0].args));
  assert.ok(calls[0].signal instanceof AbortSignal);
  assert.ok(run.prompt.evidenceContract.represented.some(s => s.sourceId === 'care:old-title' && s.text.includes('Result pending; not confirmed.')));
  assert.match(run.result.reasoning.answer.summary,/pending/);
  assert.ok(run.result.reasoning.referencedRecords.some(r => r.id === 'care:old-title'));
});
for (const [code, reason] of [['THROW_ABORT','candidate_rpc_timeout'],['57014','candidate_rpc_timeout'],['PGRST202','candidate_rpc_unavailable'],['42883','candidate_rpc_unavailable'],['55000','candidate_rpc_timeout_configuration'],['XX000','candidate_rpc_unavailable']]) {
  test(`candidate failure ${code} becomes coverage loss, not absence`,async t => {
    clock(t);
    const run=await exercise('How many weight records has Milo ever had?',{history:true,candidateError:code,answer:'There are exactly zero weight records.'});
    assert.equal(run.prompt.evidenceContract.history.retrieval,'unavailable');
    assert.ok(run.prompt.evidenceContract.history.reasons.includes(reason));
    assert.match(run.result.reasoning.answer.summary,/incomplete|unavailable/i);
    assert.doesNotMatch(run.result.reasoning.answer.summary,/exactly zero/i);
    assert.equal(run.prompt.evidenceContract.history.perPet[0].exhausted,false);
  });
}
test('all emitted lexical vocabulary fits the production RPC validator',async t=>{
  clock(t);
  const {planHistoricalQuery}=await import('../../app/lib/intelligence/history-retrieval.ts');
  const expected=['vomit','threw up','thrown up','stool','diarrh','weight','weigh','food','rice','diet','litter','medication','stiff','urine','urinalysis','blood','diagnos'];
  const emitted=new Set();
  for (const topic of ['vomiting','soft stool','weight','food','litter','medication','urine','blood','diagnosis']) {
    const plan=planHistoricalQuery(`What ${topic} records have I reported?`);
    assert.ok(plan);
    for(const term of plan.terms){ assert.match(term,/^[A-Za-z][A-Za-z -]*[A-Za-z]$/); assert.ok(term.length>=3&&term.length<=32);emitted.add(term); }
  }
  assert.deepEqual([...emitted].sort(),expected.sort());
});
test('date-only requests keep the ordered table path',async t=>{
  clock(t);
  const run=await exercise('Summarize the records in 2011.',{history:true,rows:[care('old','milo','2011-02-01','general','Owner reported rest.')]});
  assert.ok(!run.queries.some(q=>q.table==='read_ask_history_candidates'));
  assert.ok(run.queries.some(q=>q.table==='pet_care_entries' && q.orders.some(([key,asc])=>key==='id'&&asc)));
});
for (const patch of [{user_id:'foreign-owner'},{pet_profile_id:'bruno'},{deleted_at:'2026-09-03T00:00:00Z'}]) {
  test(`invalid RPC source fails closed: ${JSON.stringify(patch)}`,async t=>{
    clock(t);
    const source={...care('foreign','milo','2011-02-01','weight','Milo weighed 28.4 kg.'),...patch};
    const run=await exercise('What weight records exist?',{history:true,rows:[],candidateRowsOverride:[source]});
    assert.equal(run.prompt.evidenceContract.history.retrieval,'unavailable');
    assert.ok(!run.prompt.contextRecords.some(r=>r.id==='care:foreign'));
    assert.equal(run.context.owner.userId,ownerId);
  });
}
