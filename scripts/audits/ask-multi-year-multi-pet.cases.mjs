import {assertSourceFreePublication} from './helpers/publication-call-expectations.mjs';
import {stressProposal} from './helpers/current-stress-harness.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { clock, exercise, resolveAskTurnSubject } from './helpers/lifetime-harness.mjs';
import { denseNoise, lateFoodCorrectionGraph, pets, rows } from './fixtures/ask-multi-year-multi-pet.mjs';

const plans={
 'What did Milo weigh in April 2012?':{petNames:['Milo'],terms:['weight','weigh'],from:'2012-04-01',to:'2012-05-01'},
 'What food did Milo switch to in May 2013?':{petNames:['Milo'],terms:['food','rice'],from:'2013-05-01',to:'2013-06-01'},
 'What litter did Luna switch to in March 2014?':{petNames:['Luna'],terms:['litter'],from:'2014-03-01',to:'2014-04-01'},
 'What did Milo weigh in April 1926?':{petNames:['Milo'],terms:[],from:'1926-04-01',to:'1926-05-01'}
};
const ask=async(question,options)=>{assert.ok(plans[question]);const run=await exercise(question,{...options,interpretationProposal:stressProposal({question,...plans[question]})});
 assert.equal(run.requests.length,0);assert.equal(run.reviewRequests.length,0);assert.equal(run.result.reasoning.model,'server-labs-list',JSON.stringify({coverage:run.context.askHistory.coverage,entries:run.context.askHistory.entries.map(r=>r.id)}));
 assert.ok(run.interpretationRequests.every(request=>request.input.length<=48000));return run;};
const ids = run => new Set(run.result.reasoning.labsList.records.map(record => record.sourceId));
const careIds = run => [...ids(run)].filter(id => id.startsWith('care:') || id.startsWith('claim:'));

test('old decisive Milo weight remains reachable after fourteen years of later history', async t => {
  clock(t);
  const run = await ask('What did Milo weigh in April 2012?', {
    history: true, fixturePets: pets, rows, petId: 'milo', authoritativePetIds: ['milo'],
  });
  assert.ok(ids(run).has('care:milo-weight-2012'));
  assert.match(JSON.stringify(run.result.reasoning.labsList.records), /31\.2 kg/);
  assert.ok(run.context.askHistory.coverage.plan.from.startsWith('2012-04-01'));
  assert.ok(run.context.askHistory.coverage.plan.to.startsWith('2012-05-01'));
});

test('a correction recorded thirteen years later replaces the old Milo food fact', async t => {
  clock(t);
  const run = await ask('What food did Milo switch to in May 2013?', {
    history: true, fixturePets: pets, rows, graph: lateFoodCorrectionGraph,
    petId: 'milo', authoritativePetIds: ['milo'],
  });
  const represented = ids(run);
  assert.equal(represented.has('care:milo-food-2013-original'), false);
  assert.ok(represented.has('claim:milo-food-2013-corrected'));
  assert.match(JSON.stringify(run.result.reasoning.labsList.records), /turkey and rice, not beef and rice/i);
  assert.ok(run.context.askHistory.coverage.provenance.some(item => item.sourceId === 'claim:milo-food-2013-corrected' && item.status === 'effective_replacement'));
});
test('sparse Luna history retrieves the old litter change without borrowing Milo or Pepper records', async t => {
  clock(t);
  const run = await ask('What litter did Luna switch to in March 2014?', {
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

test('100000-row effective scan retains the old row but refuses uncertified exhaustive publication',async t=>{
 clock(t);const scaledRows=[...rows,...denseNoise('milo',100_000)],question='What did Milo weigh in April 2012?';
 const run=await exercise(question,{history:true,fixturePets:pets,rows:scaledRows,petId:'milo',authoritativePetIds:['milo'],
 interpretationProposal:stressProposal({question,...plans[question]})});
 assertSourceFreePublication(run);assert.equal(run.requests.length,0);assert.equal(run.reviewRequests.length,0);
 assert.ok(run.context.askHistory.entries.some(r=>r.id==='milo-weight-2012'&&r.note==='Milo weighed 31.2 kg.'));
 const c=run.context.askHistory.coverage.ticketCoverage;
 assert.equal(c.status,'partial');assert.equal(c.resultSet.certified,false);
 assert.ok(c.reasons.includes('subject_scan_not_exhausted'));assert.ok(c.continuation.some(x=>x.petId==='milo'));
 assert.ok(run.context.askHistory.coverage.perPet.every(p=>p.rows<=256));assert.ok(run.context.askHistory.coverage.queryCount<=20);
 assert.ok(run.interpretationRequests.every(r=>r.input.length<=48000));
 assert.doesNotMatch(run.result.reasoning.answer.summary,/31\.2 kg/);
});

test('a 100-year archival interval remains queryable without widening the evidence boundary', async t => {
  clock(t);
  const run = await ask('What did Milo weigh in April 1926?', {
    history: true, fixturePets: pets, rows, petId: 'milo', authoritativePetIds: ['milo'],
  });
  assert.ok(ids(run).has('care:milo-weight-1926'));
  assert.match(JSON.stringify(run.result.reasoning.labsList.records), /31\.9 kg/);
  assert.ok(run.context.askHistory.coverage.plan.from.startsWith('1926-04-01'));
  assert.ok(run.context.askHistory.coverage.plan.to.startsWith('1926-05-01'));
  assert.ok(careIds(run).every(id => !id.startsWith('care:luna-') && !id.startsWith('care:pepper-')));
});


