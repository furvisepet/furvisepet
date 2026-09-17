import assert from 'node:assert/strict';
import test from 'node:test';
import { clock, exercise, resolveAskTurnSubject } from './helpers/lifetime-harness.mjs';
import { denseNoise, lateFoodCorrectionGraph, pets, rows } from './fixtures/ask-multi-year-multi-pet.mjs';

const ids = run => new Set(run.prompt.contextRecords.map(record => record.id));
const careIds = run => [...ids(run)].filter(id => id.startsWith('care:') || id.startsWith('claim:'));

test('old decisive Milo weight remains reachable after fourteen years of later history', async t => {
  clock(t);
  const run = await exercise('What did Milo weigh in April 2012?', {
    history: true, fixturePets: pets, rows, petId: 'milo', authoritativePetIds: ['milo'],
  });
  assert.ok(ids(run).has('care:milo-weight-2012'));
  assert.match(run.serialized, /31\.2 kg/);
  assert.ok(run.prompt.evidenceContract.history.plan.from.startsWith('2012-04-01'));
  assert.ok(run.prompt.evidenceContract.history.plan.to.startsWith('2012-05-01'));
});

test('a correction recorded thirteen years later replaces the old Milo food fact', async t => {
  clock(t);
  const run = await exercise('What food did Milo switch to in May 2013?', {
    history: true, fixturePets: pets, rows, graph: lateFoodCorrectionGraph,
    petId: 'milo', authoritativePetIds: ['milo'],
  });
  const represented = ids(run);
  assert.equal(represented.has('care:milo-food-2013-original'), false);
  assert.ok(represented.has('claim:milo-food-2013-corrected'));
  assert.match(run.serialized, /turkey and rice, not beef and rice/i);
  assert.ok(run.prompt.evidenceContract.history.provenance.some(item => item.sourceId === 'care:milo-food-2013-original' && item.status === 'superseded'));
});
test('sparse Luna history retrieves the old litter change without borrowing Milo or Pepper records', async t => {
  clock(t);
  const run = await exercise('What litter did Luna switch to in March 2014?', {
    history: true, fixturePets: pets, rows, petId: 'luna', authoritativePetIds: ['luna'],
  });
  const represented = careIds(run);
  assert.ok(represented.includes('care:luna-litter-2014'));
  assert.ok(represented.every(id => !id.startsWith('care:milo-') && !id.startsWith('care:pepper-')));
});

test('long conversation noise does not steal feminine pronoun continuity after an explicit Luna switch', async () => {
  const recentConversation = Array.from({ length: 30 }, (_, index) => ({
    role: 'user', text: index === 29 ? "Tell me about Luna's old litter change." : `Routine question ${index} about Milo.`,
  }));
  const result = await resolveAskTurnSubject({
    message: 'Did she have any problems after that?', pets, ownerId: 'synthetic-owner', selectedPetId: 'milo', recentConversation,
    extractFrame: async () => { throw new Error('recent explicit Luna focus should resolve deterministically'); },
  });
  assert.equal(result.resolution.petId, 'luna');
  assert.deepEqual(result.resolution.petIds, ['luna']);
});

test('100000 newer Milo rows cannot hide a decisive 2012 weight and model input stays bounded', async t => {
  clock(t);
  const scaledRows = [...rows, ...denseNoise('milo', 100_000)];
  const run = await exercise('What did Milo weigh in April 2012?', {
    history: true, fixturePets: pets, rows: scaledRows, petId: 'milo', authoritativePetIds: ['milo'],
  });
  assert.ok(ids(run).has('care:milo-weight-2012'));
  assert.match(run.serialized, /31\.2 kg/);
  assert.ok(run.serialized.length <= 48_000);
  assert.ok(run.prompt.evidenceContract.history.queryCount <= 20);
});

test('a 100-year archival interval remains queryable without widening the evidence boundary', async t => {
  clock(t);
  const run = await exercise('What did Milo weigh in April 1926?', {
    history: true, fixturePets: pets, rows, petId: 'milo', authoritativePetIds: ['milo'],
  });
  assert.ok(ids(run).has('care:milo-weight-1926'));
  assert.match(run.serialized, /31\.9 kg/);
  assert.ok(run.prompt.evidenceContract.history.plan.from.startsWith('1926-04-01'));
  assert.ok(run.prompt.evidenceContract.history.plan.to.startsWith('1926-05-01'));
  assert.ok(careIds(run).every(id => !id.startsWith('care:luna-') && !id.startsWith('care:pepper-')));
});


