import assert from 'node:assert/strict';
import test from 'node:test';
import { exercise, clock, resolveAskTurnSubject } from './helpers/lifetime-harness.mjs';
import { ownerId } from './fixtures/ask-lifetime-history.mjs';
import { foodCorrectionGraph, pets, rows } from './fixtures/ask-three-month-multi-pet.mjs';

const approvedReview = { approved: true };
const historyAnswer = (text, sourceIds) => ({
  answer: text,
  historyNarrative: { sentences: [{ text, sourceIds, calculations: [] }] },
  relevantContextIds: sourceIds.filter(id => id.startsWith('care:')),
});

test('owner journey recalls Milo weights as one coherent visible answer', async t => {
  clock(t);
  const text = 'Milo was recorded at 28.4 kg in June and 27.8 kg in August 2026.';
  const run = await exercise('How did Milo weight change from June to August 2026?', {
    history:true, fixturePets:pets, rows, petId:'milo', authoritativePetIds:['milo'],
    dateRange:{from:'2026-06-01T00:00:00Z',to:'2026-09-01T00:00:00Z'},
    providerOverrides: historyAnswer(text,['care:milo-weight-jun','care:milo-weight-aug']),
    reviewResponse:approvedReview, expectedReviewCalls:0,
  });
  assert.equal(run.publication.failure,null);
  assert.match(run.publication.displayed.summary,/28\.4 kg/);
  assert.match(run.publication.displayed.summary,/27\.8 kg/);
});
test('late food correction is what the owner sees after years of old history', async t => {
  clock(t);
  const text = 'Milo switched to salmon and rice in July 2026.';
  const run = await exercise('What food did Milo switch to in July 2026?', {
    history:true, fixturePets:pets, rows, petId:'milo', authoritativePetIds:['milo'],
    dateRange:{from:'2026-07-01T00:00:00Z',to:'2026-08-01T00:00:00Z'}, graph:foodCorrectionGraph,
    providerOverrides: historyAnswer(text,['claim:milo-food-corrected']),
    reviewResponse:approvedReview, expectedReviewCalls:0,
  });
  assert.equal(run.publication.failure,null);
  assert.match(run.publication.displayed.summary,/salmon and rice/i);
  assert.doesNotMatch(run.publication.displayed.summary,/chicken and rice/i);
});

test('pet switch then pronoun follow-up stays coherent to the owner', async t => {
  clock(t);
  const first = "What about Luna's vomiting in August?";
  const decision = await resolveAskTurnSubject({message:first,pets,ownerId,selectedPetId:'milo',recentConversation:[],extractFrame:async()=>{throw Error('explicit')}});
  assert.equal(decision.resolution.petId,'luna');
  const follow = await resolveAskTurnSubject({message:'Did she recover by the next day?',pets,ownerId,selectedPetId:'milo',recentConversation:[{role:'user',text:first}],extractFrame:async()=>{throw Error('context')}});
  assert.equal(follow.resolution.petId,'luna');
});
