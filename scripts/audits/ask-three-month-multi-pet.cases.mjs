import {stressProposal} from './helpers/current-stress-harness.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { clock, exercise, resolveAskTurnSubject } from './helpers/lifetime-harness.mjs';
import { ownerId } from './fixtures/ask-lifetime-history.mjs';
import { byId, foodCorrectionGraph, period, pets, rows } from './fixtures/ask-three-month-multi-pet.mjs';

const careRecords=run=>{
 assert.equal(run.result.reasoning.model,'server-labs-list');assert.equal(run.requests.length,0);assert.equal(run.reviewRequests.length,0);
 return run.result.reasoning.labsList.records.map(row=>({id:row.sourceId,petId:row.petId,value:row.body}));
};
const ids=run=>new Set(careRecords(run).map(record=>record.id));
const p=(petNames,terms=[],from='2026-06-01',to='2026-09-01',extra={})=>stressProposal({petNames,terms,from,to,...extra});

function assertPetIsolation(run, allowedPetIds) {
  const allowed = new Set(allowedPetIds);
  for (const record of careRecords(run)) {
    assert.ok(allowed.has(record.petId), `unexpected ${record.petId} source ${record.id}`);
    const source = byId[record.id.replace(/^care:/, '')];
    if (source) assert.equal(record.petId, source.pet_profile_id, `source scope changed for ${record.id}`);
  }
}

test('three-month period keeps Milo, Luna, and Pepper evidence in separate pet scopes', async t => {
  clock(t);
  const run = await exercise('Summarize Milo, Luna, and Pepper records from June 1 through August 31, 2026.', {
    history: true, fixturePets: pets, rows, petId: 'milo', authoritativePetIds: ['milo', 'luna', 'pepper'], dateRange: period,interpretationProposal:p(['Milo','Luna','Pepper']),
  });
  assert.deepEqual(run.result.reasoning.evidenceContract.history.perPet.map(item => item.petId).sort(), ['luna', 'milo', 'pepper']);
  assertPetIsolation(run, ['milo', 'luna', 'pepper']);
  const represented = ids(run);
  for (const id of ['care:milo-weight-jun', 'care:luna-hiding-jun', 'care:pepper-itch-jun']) assert.ok(represented.has(id), id);
});

test('Milo weight recall cannot borrow Luna weight evidence from the same period', async t => {
  clock(t);
  const run = await exercise('Compare every recorded weight for Milo from June through August 2026.', {
    history: true, fixturePets: pets, rows, petId: 'milo', authoritativePetIds: ['milo'], dateRange: period,interpretationProposal:p(['Milo'],['weigh','weight']),
  });
  const represented = ids(run);
  t.diagnostic('weight ids=' + JSON.stringify([...represented]));
  t.diagnostic('weight history=' + JSON.stringify(run.result.reasoning.evidenceContract.history));
  assert.ok(represented.has('care:milo-weight-jun'));
  assert.ok(represented.has('care:milo-weight-aug'));
  assert.equal(represented.has('care:luna-weight-jul'), false);
  assert.equal(represented.has('care:luna-weight-aug'), false);
  assertPetIsolation(run, ['milo']);
});

test('an explicit Luna switch overrides a Milo-selected conversation before retrieval', async t => {
  clock(t);
  const message = "What about Luna's vomiting in August?";
  const decision = await resolveAskTurnSubject({
    message, pets, ownerId, selectedPetId: 'milo', recentConversation: [{ role: 'user', text: 'How has Milo weight changed?' }],
    extractFrame: async () => { throw new Error('explicit Luna should resolve without model extraction'); },
  });
  assert.equal(decision.resolution.petId, 'luna');
  assert.deepEqual(decision.resolution.petIds, ['luna']);
  const run = await exercise(message, { history: true, fixturePets: pets, rows, petId: 'luna', authoritativePetIds: ['luna'], dateRange: period,interpretationProposal:p(['Luna'],['vomit'],'2026-08-01') });
  assert.ok(ids(run).has('care:luna-vomit-aug'));
  assertPetIsolation(run, ['luna']);
  assert.equal(JSON.stringify(run.publication.displayed).includes('Milo weighed 28.4 kg.'), false);
});

test('a feminine pronoun after the Luna switch keeps Luna as the authoritative pet', async t => {
  clock(t);
  const message = 'Did she recover by the next day?';
  const decision = await resolveAskTurnSubject({
    message, pets, ownerId, selectedPetId: 'milo',
    recentConversation: [{ role: 'user', text: "What about Luna's vomiting in August?" }],
    extractFrame: async () => { throw new Error('recent Luna focus should resolve without model extraction'); },
  });
  assert.equal(decision.resolution.petId, 'luna');
  const run = await exercise(message, { history: true, fixturePets: pets, rows, petId: 'luna', authoritativePetIds: ['luna'], dateRange: period,messages:[{id:'prior-luna',user_id:ownerId,conversation_id:'chat',role:'user',user_text:"What about Luna's vomiting in August?",sequence_number:1,created_at:'2026-09-04T00:00:00Z'}],
    prepareContext:c=>{c.pinnedUserSourceIds=['prior-luna'];},interpretationProposal:p(['Luna'],['vomit'],'2026-08-01','2026-09-01',{scope:'conversation',referenceTurnIds:['prior-luna']}) });
  assertPetIsolation(run, ['luna']);
  assert.equal(run.result.acceptedCareActions.length, 0);
});

test('late food correction replaces the July legacy source instead of presenting both as current truth', async t => {
  clock(t);
  const run = await exercise('What food did Milo switch to in July 2026?', {
    history: true, fixturePets: pets, rows, petId: 'milo', authoritativePetIds: ['milo'],
    dateRange: { from: '2026-07-01T00:00:00Z', to: '2026-08-01T00:00:00Z' }, graph: foodCorrectionGraph,interpretationProposal:p(['Milo'],['food','rice'],'2026-07-01','2026-08-01'),
  });
  const represented = ids(run);
  t.diagnostic('correction ids=' + JSON.stringify([...represented]));
  t.diagnostic('correction history=' + JSON.stringify(run.result.reasoning.evidenceContract.history));
  assert.equal(represented.has('care:milo-food-original'), false);
  assert.ok(represented.has('claim:milo-food-corrected'));
  const correction = careRecords(run).find(record => record.id === 'claim:milo-food-corrected');
  assert.match(correction.value, /salmon and rice/);
  assert.ok(run.result.reasoning.evidenceContract.history.provenance.some(item=>item.sourceId==='claim:milo-food-corrected'&&item.status==='effective_replacement'));
  const stream=run.context.askHistory.coverage.ticketCoverage.effectiveStream.find(s=>s.petId==='milo');
  assert.ok(stream.acquiredIds.includes('milo-food-original'));assert.ok(!stream.effectiveIds.includes('milo-food-original'));
  assert.ok(stream.effectiveIds.includes('claim-milo-food-corrected'));
  assert.equal(run.context.askHistory.coverage.ticketCoverage.resultSet.certified,true);
});

test('cross-pet August vomiting comparison never turns Luna evidence into a Milo event', async t => {
  clock(t);
  const run = await exercise('Compare Milo and Luna vomiting records in August 2026.', {
    history: true, fixturePets: pets, rows, petId: 'milo', authoritativePetIds: ['milo', 'luna'],
    dateRange: { from: '2026-08-01T00:00:00Z', to: '2026-09-01T00:00:00Z' },interpretationProposal:p(['Milo','Luna'],['vomit'],'2026-08-01','2026-09-01'),
  });
  const vomiting = careRecords(run).filter(record => /vomit/i.test(record.value));
  assert.ok(vomiting.some(record => record.id === 'care:luna-vomit-aug'));
  assert.ok(vomiting.some(record => record.id === 'care:luna-vomit-resolved'));
  assert.equal(vomiting.some(record => record.petId === 'milo'), false);
  const perPet = run.result.reasoning.evidenceContract.history.perPet;
  assert.ok(perPet.some(item => item.petId === 'milo'));
  assert.ok(perPet.some(item => item.petId === 'luna'));
});
