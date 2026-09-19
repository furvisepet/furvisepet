import test from 'node:test';
import assert from 'node:assert/strict';
import { exercise, clock, selectRelevantCareEntries } from './helpers/lifetime-harness.mjs';
import { decisive, irrelevant } from './fixtures/ask-lifetime-history.mjs';
for (const ids of [['milo','luna'], ['milo','luna','foreign']]) test('broad comparison uses only owned subjects '+ids.join(','), async t => {
  clock(t);
  const run = await exercise('Compare Milo and Luna history.', { history:true, authoritativePetIds:ids });
  const history=run.prompt.evidenceContract.history;
  assert.deepEqual(history.perPet.map(p=>p.petId).sort(), ['luna','milo']);
  assert.notEqual(history.retrieval, 'complete');
  for (const petId of ['luna','milo']) assert.ok(run.prompt.contextRecords.some(r=>r.sourceType==='care_update' && r.petId===petId));
  assert.equal(run.result.acceptedCareActions.length,0);
});
test('single-pet broad recall retains bounded fallback', async t => {
  clock(t);
  const run=await exercise('Summarize Milo history.', {history:true});
  assert.equal(run.queries.filter(q=>q.table==='pet_care_entries').length,1);
});
test('year selection uses event date rather than numbers in prose', () => {
  const old=decisive.filter(r=>r.pet_profile_id==='milo');
  const noise=irrelevant('milo',30).map(r=>({...r,severity:'severe',note:'2011 product number'}));
  const selected=selectRelevantCareEntries([...old,...noise],'Summarize history in 2011 and 2014.');
  assert.equal(selected.length,20);
  assert.ok(selected.some(r=>r.id==='milo-stool-1'));
});
