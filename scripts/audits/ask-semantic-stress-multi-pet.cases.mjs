import assert from 'node:assert/strict';
import test from 'node:test';
import { clock } from './helpers/lifetime-harness.mjs';
import { dateCorrectionGraph, petReassignmentGraph, pets, rows } from './fixtures/ask-semantic-stress-multi-pet.mjs';

import {stressExercise as exercise,stressProposal,evidenceIds as ids,visible} from './helpers/current-stress-harness.mjs';

test('cross-year Milo weight comparison retains both distant endpoints without newer-history substitution', async t => {
  clock(t);
  const run = await exercise('Compare Milo weight in April 2012 with August 2026.', {
    history: true, fixturePets: pets, rows, petId: 'milo', authoritativePetIds: ['milo'],
    interpretationProposal:stressProposal({petNames:['Milo'],selection:'comparison',terms:['weigh','weight'],from:'2012-04-01',to:'2026-09-01'}),
  });
  assert.ok(ids(run).has('care:milo-weight-2012'));
  assert.ok(ids(run).has('care:milo-weight-aug'));
  assert.match(visible(run), /31\.2 kg/);
  assert.match(visible(run), /27\.8 kg/);
});

test('late pet reassignment removes the old Milo event and exposes it only under Pepper', async t => {
  clock(t);
  const milo = await exercise('What itching did Milo have in June 2019?', {
    history: true, fixturePets: pets, rows, graph: petReassignmentGraph, expectEmpty:true, petId: 'milo', authoritativePetIds: ['milo'],
    interpretationProposal:stressProposal({petNames:['Milo'],terms:['itch','paw'],from:'2019-06-01',to:'2019-07-01'}),
  });
  assert.equal(ids(milo).has('care:milo-itch-2019-wrong'), false);
  const pepper = await exercise('What itching did Pepper have in June 2019?', {
    history: true, fixturePets: pets, rows, graph: petReassignmentGraph, petId: 'pepper', authoritativePetIds: ['pepper'],
    interpretationProposal:stressProposal({petNames:['Pepper'],terms:['itch','paw'],from:'2019-06-01',to:'2019-07-01'}),
  });
  assert.ok(ids(pepper).has('claim:corrected-pet-claim'));
  assert.match(visible(pepper), /Pepper was licking and itching her front paws, not Milo/i);
});
test('event-date correction removes the 2017 fact and makes the corrected 2018 event reachable', async t => {
  clock(t);
  const oldDate = await exercise('What ear medication did Milo complete in September 2017?', {
    history: true, fixturePets: pets, rows, graph: dateCorrectionGraph, petId: 'milo', authoritativePetIds: ['milo'],
    interpretationProposal:stressProposal({petNames:['Milo'],terms:['ear','medication'],from:'2017-09-01',to:'2017-10-01'}),
  });
  assert.equal(ids(oldDate).has('care:milo-med-date-wrong'), false);
  const corrected = await exercise('What ear medication did Milo complete in September 2018?', {
    history: true, fixturePets: pets, rows, graph: dateCorrectionGraph, petId: 'milo', authoritativePetIds: ['milo'],
    interpretationProposal:stressProposal({petNames:['Milo'],terms:['ear','medication'],from:'2018-09-01',to:'2018-10-01'}),
  });
  assert.ok(ids(corrected).has('claim:corrected-date-claim'));
  assert.match(visible(corrected), /September 14, 2018, not 2017/i);
});

test('years-later Pepper recurrence keeps the old resolved episode and the new recurrence distinct', async t => {
  clock(t);
  const run = await exercise('Summarize Pepper itching history from 2019 through 2026.', {
    history: true, fixturePets: pets, rows, petId: 'pepper', authoritativePetIds: ['pepper'],
    interpretationProposal:stressProposal({petNames:['Pepper'],terms:['itch','paw','lick'],from:'2019-01-01',to:'2026-09-01'}),
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
    interpretationProposal:stressProposal({petNames:['Luna'],terms:['weigh','weight'],from:'2018-11-01',to:'2018-12-01'}),
  });
  assert.ok(ids(run).has('care:luna-weight-2018'));
  assert.ok(ids(run).has('care:luna-weight-2018-conflict'));
  assert.match(visible(run), /5\.1 kg/);
  assert.match(visible(run), /5\.4 kg/);
});

test('deleted Pepper history stays absent while the restored active record remains independently readable', async t => {
  clock(t);
  const run = await exercise('What paw irritation was recorded for Pepper in February 2020?', {
    history: true, fixturePets: pets, rows, petId: 'pepper', authoritativePetIds: ['pepper'],
    interpretationProposal:stressProposal({petNames:['Pepper'],terms:['paw','irritation'],from:'2020-02-01',to:'2020-03-01'}),
  });
  assert.equal(ids(run).has('care:pepper-old-deleted'), false);
  assert.ok(ids(run).has('care:pepper-restored-active'));
});

test('a pinned long follow-up compares the exact old antecedent; an omitted reference fails closed', async t => {
  clock(t);
  const messages = [
    { id: 'q-old', role: 'user', user_text: 'What did Milo weigh in April 2012?', sequence_number: 1 },
    { id: 'a-old', role: 'furvise', response_data: { directAnswer: 'Milo weighed 31.2 kg in April 2012.' }, sequence_number: 2 },
    ...Array.from({ length: 12 }, (_, i) => ({ id: `noise-${i}`, role: 'user', user_text: `Routine Milo question ${i}.`, sequence_number: i + 3 })),
  ].map(row => ({ ...row, user_id: 'synthetic-owner', conversation_id: 'chat', created_at: '2026-09-04T10:00:00Z' }));
  await assert.rejects(exercise('Compare that old weight with his August 2026 weight.',{
    history:true,fixturePets:pets,rows,petId:'milo',conversationPetId:'milo',messages,authoritativePetIds:['milo'],
    interpretationProposal:{...stressProposal({petNames:['Milo'],selection:'comparison',terms:['weigh','weight'],from:'2012-04-01',to:'2026-09-01'}),referenceTurnIds:['q-old']},
  }),e=>e.stage==='interpretation_failed'&&/earlier messages were omitted/.test(e.message));
  const run = await exercise('Compare that old weight with his August 2026 weight.', {
    prepareContext:c=>{c.pinnedUserSourceIds=['q-old'];}, history: true, fixturePets: pets, rows, petId: 'milo', conversationPetId: 'milo', messages, authoritativePetIds: ['milo'],
    interpretationProposal:{...stressProposal({petNames:['Milo'],selection:'comparison',terms:['weigh','weight'],from:'2012-04-01',to:'2026-09-01'}),referenceTurnIds:['q-old']},
  });
  assert.ok(ids(run).has('care:milo-weight-2012'));
  assert.ok(ids(run).has('care:milo-weight-aug'));
});
