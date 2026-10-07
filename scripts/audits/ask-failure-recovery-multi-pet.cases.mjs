import {stressProposal} from './helpers/current-stress-harness.mjs';
import {assertSourceFreePublication} from './helpers/publication-call-expectations.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { clock, exercise } from './helpers/lifetime-harness.mjs';
import {care} from './fixtures/ask-lifetime-history.mjs';
import { pets, rows } from './fixtures/ask-semantic-stress-multi-pet.mjs';
import { lateFoodCorrectionGraph } from './fixtures/ask-multi-year-multi-pet.mjs';

const careRecords = run => (run.result.reasoning.labsList?.records || []).map(row=>({id:row.sourceId,petId:row.petId,value:row.body}));
const p=(petNames,terms,from,to)=>stressProposal({petNames,terms,from,to});

test('mid-history page failure returns bounded partial evidence instead of a false complete answer', async t => {
  clock(t);
  const run = await exercise('Summarize Pepper itching history from 2019 through 2026.', {
    history: true, fixturePets: pets, rows:[...rows,...Array.from({length:100},(_,i)=>care('pepper-page-'+i,'pepper','2020-01-15','symptom','Pepper had itching recorded in observation '+i+'.'))], petId: 'pepper', authoritativePetIds: ['pepper'],
    interpretationProposal:p(['Pepper'],['itch','lick'],'2019-01-01','2027-01-01'),failHistoryPage: 2, answer: 'Pepper had exactly two itching episodes and both resolved.',
  });
  assert.notEqual(run.result.reasoning.evidenceContract.history.retrieval, 'complete');
  assert.ok(run.result.reasoning.evidenceContract.history.reasons.some(reason => /unavailable|budget|partial/i.test(reason)));
  assert.doesNotMatch(run.result.reasoning.answer.summary, /exactly two itching episodes/i);
  assert.match(run.result.reasoning.answer.summary, /incomplete|couldn.t|only|available/i);
});

test('correction graph outage cannot resurrect a superseded food fact', async t => {
  clock(t);
  const run = await exercise('What food did Milo switch to in May 2013?', {
    history: true, fixturePets: pets, rows, petId: 'milo', authoritativePetIds: ['milo'],
    interpretationProposal:p(['Milo'],['food','rice'],'2013-05-01','2013-06-01'),graph: lateFoodCorrectionGraph, failGraph: true, answer: 'Milo switched to beef and rice.',
  });
  assert.equal(run.result.reasoning.evidenceContract.history.corrections,'partial');
  assertSourceFreePublication(run);
  assert.equal(run.context.askHistory.coverage.ticketCoverage.resultSet.certified,false);
  assert.equal(careRecords(run).some(record => /beef and rice/i.test(record.value)), false);
  assert.doesNotMatch(run.result.reasoning.answer.summary, /switched to beef and rice/i);
});
test('correction graph changing during closure fails closed instead of returning stale history', async t => {
  clock(t);
  const changed = { ...lateFoodCorrectionGraph, relations: [] };
  const run = await exercise('What food did Milo switch to in May 2013?', {
    history: true, fixturePets: pets, rows, petId: 'milo', authoritativePetIds: ['milo'],
    interpretationProposal:p(['Milo'],['food','rice'],'2013-05-01','2013-06-01'),graphAtCall: call => call === 1 ? lateFoodCorrectionGraph : changed,
    answer: 'Milo switched to beef and rice.',
  });
  assert.equal(run.result.reasoning.evidenceContract.history.corrections,'partial');
  assertSourceFreePublication(run);
  assert.equal(run.context.askHistory.coverage.ticketCoverage.resultSet.certified,false);
  assert.equal(careRecords(run).length, 0);
  assert.doesNotMatch(run.result.reasoning.answer.summary, /switched to beef and rice/i);
});

test('a retry after transient page loss can recover the same historical answer without widening pet scope', async t => {
  clock(t);
  const failed = await exercise('What did Luna weigh in November 2018?', {
    history: true, fixturePets: pets, rows, petId: 'luna', authoritativePetIds: ['luna'],interpretationProposal:p(['Luna'],['weigh','weight'],'2018-11-01','2018-12-01'), failHistoryPage: 1,
    answer: 'Luna weighed 5.1 kg.',
  });
  assertSourceFreePublication(failed);
  assert.doesNotMatch(failed.result.reasoning.answer.summary, /weighed 5\.1 kg/i);
  const recovered = await exercise('What did Luna weigh in November 2018?', {
    history: true, fixturePets: pets, rows, petId: 'luna', authoritativePetIds: ['luna'],interpretationProposal:p(['Luna'],['weigh','weight'],'2018-11-01','2018-12-01'),
  });
  assert.equal(recovered.result.reasoning.model,'server-labs-list');assert.equal(recovered.requests.length,0);assert.equal(recovered.reviewRequests.length,0);
  assert.ok(careRecords(recovered).some(record => record.id === 'care:luna-weight-2018'));
  assert.ok(careRecords(recovered).every(record => record.petId === 'luna'));
});
