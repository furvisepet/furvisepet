import assert from 'node:assert/strict';
import test from 'node:test';
import { clock, exercise } from './helpers/lifetime-harness.mjs';
import { pets, rows } from './fixtures/ask-semantic-stress-multi-pet.mjs';
import { lateFoodCorrectionGraph } from './fixtures/ask-multi-year-multi-pet.mjs';

const careRecords = run => (run.prompt?.contextRecords || []).filter(record => record.sourceType === 'care_update');

test('mid-history page failure returns bounded partial evidence instead of a false complete answer', async t => {
  clock(t);
  const run = await exercise('Summarize Pepper itching history from 2019 through 2026.', {
    history: true, fixturePets: pets, rows, petId: 'pepper', authoritativePetIds: ['pepper'],
    failHistoryPage: 2, answer: 'Pepper had exactly two itching episodes and both resolved.',
  });
  assert.notEqual(run.prompt.evidenceContract.history.retrieval, 'complete');
  assert.ok(run.prompt.evidenceContract.history.reasons.some(reason => /unavailable|budget|partial/i.test(reason)));
  assert.doesNotMatch(run.result.reasoning.answer.summary, /exactly two itching episodes/i);
  assert.match(run.result.reasoning.answer.summary, /incomplete|couldn.t|only|available/i);
});

test('correction graph outage cannot resurrect a superseded food fact', async t => {
  clock(t);
  const run = await exercise('What food did Milo switch to in May 2013?', {
    history: true, fixturePets: pets, rows, petId: 'milo', authoritativePetIds: ['milo'],
    graph: lateFoodCorrectionGraph, failGraph: true, answer: 'Milo switched to beef and rice.',
  });
  assert.equal(run.prompt.evidenceContract.history.corrections, 'unavailable');
  assert.equal(careRecords(run).some(record => /beef and rice/i.test(record.value)), false);
  assert.doesNotMatch(run.result.reasoning.answer.summary, /switched to beef and rice/i);
});
test('correction graph changing during closure fails closed instead of returning stale history', async t => {
  clock(t);
  const changed = { ...lateFoodCorrectionGraph, relations: [] };
  const run = await exercise('What food did Milo switch to in May 2013?', {
    history: true, fixturePets: pets, rows, petId: 'milo', authoritativePetIds: ['milo'],
    graphAtCall: call => call === 1 ? lateFoodCorrectionGraph : changed,
    answer: 'Milo switched to beef and rice.',
  });
  assert.equal(run.prompt.evidenceContract.history.corrections, 'unavailable');
  assert.equal(careRecords(run).length, 0);
  assert.doesNotMatch(run.result.reasoning.answer.summary, /switched to beef and rice/i);
});

test('a retry after transient page loss can recover the same historical answer without widening pet scope', async t => {
  clock(t);
  const failed = await exercise('What did Luna weigh in November 2018?', {
    history: true, fixturePets: pets, rows, petId: 'luna', authoritativePetIds: ['luna'], failHistoryPage: 1,
    answer: 'Luna weighed 5.1 kg.',
  });
  assert.doesNotMatch(failed.result.reasoning.answer.summary, /weighed 5\.1 kg/i);
  const recovered = await exercise('What did Luna weigh in November 2018?', {
    history: true, fixturePets: pets, rows, petId: 'luna', authoritativePetIds: ['luna'],
  });
  assert.ok(recovered.prompt.contextRecords.some(record => record.id === 'care:luna-weight-2018'));
  assert.ok(recovered.prompt.contextRecords.every(record => record.sourceType !== 'care_update' || record.petId === 'luna'));
});
