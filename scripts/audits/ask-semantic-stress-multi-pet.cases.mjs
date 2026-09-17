import assert from 'node:assert/strict';
import test from 'node:test';
import { clock, exercise } from './helpers/lifetime-harness.mjs';
import { dateCorrectionGraph, petReassignmentGraph, pets, rows } from './fixtures/ask-semantic-stress-multi-pet.mjs';

const ids = run => new Set(run.prompt.contextRecords.map(record => record.id));

test('cross-year Milo weight comparison retains both distant endpoints without newer-history substitution', async t => {
  clock(t);
  const run = await exercise('Compare Milo weight in April 2012 with August 2026.', {
    history: true, fixturePets: pets, rows, petId: 'milo', authoritativePetIds: ['milo'],
  });
  assert.ok(ids(run).has('care:milo-weight-2012'));
  assert.ok(ids(run).has('care:milo-weight-aug'));
  assert.match(run.serialized, /31\.2 kg/);
  assert.match(run.serialized, /27\.8 kg/);
});

test('late pet reassignment removes the old Milo event and exposes it only under Pepper', async t => {
  clock(t);
  const milo = await exercise('What itching did Milo have in June 2019?', {
    history: true, fixturePets: pets, rows, graph: petReassignmentGraph, petId: 'milo', authoritativePetIds: ['milo'],
  });
  assert.equal(ids(milo).has('care:milo-itch-2019-wrong'), false);
  const pepper = await exercise('What itching did Pepper have in June 2019?', {
    history: true, fixturePets: pets, rows, graph: petReassignmentGraph, petId: 'pepper', authoritativePetIds: ['pepper'],
  });
  assert.ok(ids(pepper).has('claim:corrected-pet-claim'));
  assert.match(pepper.serialized, /Pepper was licking and itching her front paws, not Milo/i);
});
test('event-date correction removes the 2017 fact and makes the corrected 2018 event reachable', async t => {
  clock(t);
  const oldDate = await exercise('What ear medication did Milo complete in September 2017?', {
    history: true, fixturePets: pets, rows, graph: dateCorrectionGraph, petId: 'milo', authoritativePetIds: ['milo'],
  });
  assert.equal(ids(oldDate).has('care:milo-med-date-wrong'), false);
  const corrected = await exercise('What ear medication did Milo complete in September 2018?', {
    history: true, fixturePets: pets, rows, graph: dateCorrectionGraph, petId: 'milo', authoritativePetIds: ['milo'],
  });
  assert.ok(ids(corrected).has('claim:corrected-date-claim'));
  assert.match(corrected.serialized, /September 14, 2018, not 2017/i);
});

test('years-later Pepper recurrence keeps the old resolved episode and the new recurrence distinct', async t => {
  clock(t);
  const run = await exercise('Summarize Pepper itching history from 2019 through 2026.', {
    history: true, fixturePets: pets, rows, petId: 'pepper', authoritativePetIds: ['pepper'],
  });
  const represented = ids(run);
  assert.ok(represented.has('care:pepper-itch-2019'));
  assert.ok(represented.has('care:pepper-itch-resolved-2019'));
  assert.ok(represented.has('care:pepper-itch-aug'));
  assert.ok(represented.has('care:pepper-itch-resolved'));
});
test('contradictory Luna weights remain separate source facts instead of silently collapsing to one truth', async t => {
  clock(t);
  const run = await exercise('Show every Luna weight recorded in November 2018.', {
    history: true, fixturePets: pets, rows, petId: 'luna', authoritativePetIds: ['luna'],
  });
  assert.ok(ids(run).has('care:luna-weight-2018'));
  assert.ok(ids(run).has('care:luna-weight-2018-conflict'));
  assert.match(run.serialized, /5\.1 kg/);
  assert.match(run.serialized, /5\.4 kg/);
});

test('deleted Pepper history stays absent while the restored active record remains independently readable', async t => {
  clock(t);
  const run = await exercise('What paw irritation was recorded for Pepper in February 2020?', {
    history: true, fixturePets: pets, rows, petId: 'pepper', authoritativePetIds: ['pepper'],
  });
  assert.equal(ids(run).has('care:pepper-old-deleted'), false);
  assert.ok(ids(run).has('care:pepper-restored-active'));
});

test('a long follow-up can compare an old referenced Milo weight with the new 2026 weight', async t => {
  clock(t);
  const messages = [
    { id: 'q-old', role: 'user', user_text: 'What did Milo weigh in April 2012?', sequence_number: 1 },
    { id: 'a-old', role: 'furvise', response_data: { directAnswer: 'Milo weighed 31.2 kg in April 2012.' }, sequence_number: 2 },
    ...Array.from({ length: 12 }, (_, i) => ({ id: `noise-${i}`, role: 'user', user_text: `Routine Milo question ${i}.`, sequence_number: i + 3 })),
  ].map(row => ({ ...row, user_id: 'synthetic-owner', conversation_id: 'chat', created_at: '2026-09-04T10:00:00Z' }));
  const run = await exercise('Compare that old weight with his August 2026 weight.', {
    history: true, fixturePets: pets, rows, petId: 'milo', conversationPetId: 'milo', messages, authoritativePetIds: ['milo'],
    expectedReviewCalls: 1, reviewResponse: { approved: true },
    interpretationProposal: { version: 'ask-request.v2', task: null, temporalScope: 'historical', mutationIntent: null, recordSelection: null, profileFields: [], projection: null,
      mode: 'read', question: 'Compare that old weight with his August 2026 weight.', requirements: [], evidenceNeeds: [
        { sourceTurnId: 'q-old', quote: 'What did Milo weigh in April 2012?', terms: ['weight'], petNames: ['Milo'], order: 'context' },
        { sourceTurnId: null, quote: 'August 2026 weight', terms: ['weight'], petNames: ['Milo'], order: 'context' },
      ], outputFormat: 'prose', evidenceBasis: 'saved_history', premiseQuotes: [], excludedPetNames: [], referenceTurnIds: ['q-old'],
      scope: 'named', petNames: ['Milo'], operation: 'comparison', selection: 'comparison', quantity: 'measurement', topic: 'weight', terms: ['weight', 'weigh'],
      from: null, to: null, episodeTopic: null, ordinal: null, frame: null },
  });
  assert.ok(ids(run).has('care:milo-weight-2012'));
  assert.ok(ids(run).has('care:milo-weight-aug'));
});
