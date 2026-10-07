import {stressProposal} from './helpers/current-stress-harness.mjs';
import {assertSourceFreePublication} from './helpers/publication-call-expectations.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { exercise, clock, selectRelevantCareEntries } from './helpers/lifetime-harness.mjs';
import { care,decisive, irrelevant } from './fixtures/ask-lifetime-history.mjs';
for (const ids of [['milo','luna'], ['milo','luna','foreign']]) test('broad comparison uses only owned subjects '+ids.join(','), async t => {
  clock(t);
  const run = await exercise('Compare Milo and Luna history.', { history:true, authoritativePetIds:ids,interpretationProposal:stressProposal({question:'Compare Milo and Luna history.',petNames:['Milo','Luna']}) });
  const history=run.context.askHistory.coverage;
  assert.deepEqual(history.perPet.map(p=>p.petId).sort(), ['luna','milo']);
  assert.notEqual(history.retrieval, 'complete');
  assert.deepEqual([...run.context.askInterpretation.request.readTicket.subjects.petIds].sort(),['luna','milo']);
  assertSourceFreePublication(run);assert.ok(run.context.askHistory.entries.every(row=>['luna','milo'].includes(row.pet_profile_id)));
  assert.equal(run.result.acceptedCareActions.length,0);
});
test('single-pet broad recall requires a ticket and certifies exact bounded records', async t => {
  clock(t);
  await assert.rejects(exercise('Summarize Milo history.',{history:true}),/ASK_MEMORY_BRAIN_REQUIRED/);
  const rows=[care('bounded-one','milo','2020-01-01','general','Milo rested after the walk.')];
  const run=await exercise('Summarize Milo history.',{history:true,rows,interpretationProposal:stressProposal({question:'Summarize Milo history.',petNames:['Milo']})});
  assert.equal(run.result.reasoning.model,'server-labs-list');assert.equal(run.result.reasoning.labsList.records[0].body,rows[0].note);
  assert.deepEqual(run.result.reasoning.relevantContextIds,['care:bounded-one']);assert.equal(run.requests.length,0);assert.equal(run.reviewRequests.length,0);
});
test('year selection uses event date rather than numbers in prose', () => {
  const old=decisive.filter(r=>r.pet_profile_id==='milo');
  const noise=irrelevant('milo',30).map(r=>({...r,severity:'severe',note:'2011 product number'}));
  const selected=selectRelevantCareEntries([...old,...noise],'Summarize history in 2011 and 2014.');
  assert.equal(selected.length,20);
  assert.ok(selected.some(r=>r.id==='milo-stool-1'));
});
