import {stressProposal} from './helpers/current-stress-harness.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { exercise, clock } from './helpers/lifetime-harness.mjs';
import { care } from './fixtures/ask-lifetime-history.mjs';
import { emptyProposedSemanticFrame } from '../../app/lib/intelligence/semantic-frame/extract-frame.ts';
const plan = selection => ({...stressProposal({petNames:['Milo'],topic:'diagnosis',terms:['diagnosis']}),selection});
for (const selection of ['reference','period']) test(`undated ${selection} selection preserves validated scope without inventing dates`, async t => {
  clock(t);
  const r = await exercise('What diagnosis did the vet give Milo?', {history:true, expectedReviewCalls:1, messages:[], rows:[care('diagnosis-note','milo','2026-06-17','vet_visit','No diagnosis was recorded in this note.')], interpretationProposal:plan(selection)});
  assert.equal(r.context.askInterpretation.request.readTicket.selection,undefined,'unbounded legacy hints do not manufacture a finite selector');
  assert.equal(r.context.askInterpretation.request.readTicket.temporal.from,null);
  assert.equal(r.context.askInterpretation.request.readTicket.temporal.to,null);
  assert.equal(r.result.reasoning.model,'server-labs-list');assert.deepEqual(r.result.reasoning.relevantContextIds,['care:diagnosis-note']);
  assert.equal(r.result.reasoning.labsList.records[0].body,'No diagnosis was recorded in this note.');
  assert.equal(r.requests.length,0);assert.equal(r.reviewRequests.length,0);
  assert.equal(r.context.askInterpretation.history.from,null);
  assert.deepEqual(r.context.askInterpretation.petIds,['milo']);
  assert.deepEqual(r.result.acceptedCareActions,[]);
  assert.deepEqual(r.result.acceptedLearnings,[]);
});
test('recall recovery metadata cannot trigger extra extraction before read-only governance and independent review', async t => {
  clock(t);
  const r = await exercise('What diagnosis did the vet give Milo?', {history:true, expectedReviewCalls:1, messages:[], rows:[care('diagnosis-note','milo','2026-06-17','vet_visit','No diagnosis was recorded in this note.')], interpretationProposal:plan('summary'), providerOverrides:{messageUnderstanding:{requestedTopic:'diagnosis',referencedPet:null,safetyRelevance:'none',needsClarification:false,canAnswerDirectly:true,primaryIntent:'question',secondaryIntents:[], userIsAskingQuestion:true,userIsProvidingUpdate:false,userIsResolvingConcern:true,userIsCorrectingPriorInformation:false,userIsProvidingPreference:false,userIsMakingSmallTalk:false,recoveryStatus:'terminal',recoveryConfidence:0.9,recoveryEvidence:{outcome:'partial_improvement',surfaceText:'What diagnosis did the vet give Milo?',targetConcept:'stiffness',confidence:0.9}}}});
  assert.equal(r.result.reasoning.messageUnderstanding.recoveryStatus,'none');
  assert.deepEqual(r.result.acceptedCareActions,[]);
});
