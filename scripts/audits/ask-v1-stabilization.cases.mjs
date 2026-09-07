import assert from 'node:assert/strict';
import test from 'node:test';
import { exercise, clock } from './helpers/lifetime-harness.mjs';
import { care } from './fixtures/ask-lifetime-history.mjs';
import { emptyProposedSemanticFrame } from '../../app/lib/intelligence/semantic-frame/extract-frame.ts';
const plan = selection => ({operation:'recall', readOperation:'recall', selection, subject:'explicit', petNames:['Milo'], topic:'diagnosis', terms:['diagnosis'], from:null, to:null, episodeTopic:null, ordinal:null, frame:emptyProposedSemanticFrame()});
for (const selection of ['reference','period']) test(`undated ${selection} selection degrades to bounded recall`, async t => {
  clock(t);
  const r = await exercise('What diagnosis did the vet give Milo?', {history:true, messages:[], rows:[care('diagnosis-note','milo','2026-06-17','vet_visit','No diagnosis was recorded in this note.')], interpretationProposal:plan(selection)});
  assert.equal(r.context.askInterpretation.selection,'summary');
  assert.equal(r.context.askInterpretation.history.from,null);
  assert.deepEqual(r.context.askInterpretation.petIds,['milo']);
  assert.deepEqual(r.result.acceptedCareActions,[]);
  assert.deepEqual(r.result.acceptedLearnings,[]);
});
test('recall recovery metadata cannot spend a third call before read-only governance', async t => {
  clock(t);
  const r = await exercise('What diagnosis did the vet give Milo?', {history:true, messages:[], rows:[care('diagnosis-note','milo','2026-06-17','vet_visit','No diagnosis was recorded in this note.')], interpretationProposal:plan('summary'), providerOverrides:{messageUnderstanding:{requestedTopic:'diagnosis',referencedPet:null,safetyRelevance:'none',needsClarification:false,canAnswerDirectly:true,primaryIntent:'question',secondaryIntents:[], userIsAskingQuestion:true,userIsProvidingUpdate:false,userIsResolvingConcern:true,userIsCorrectingPriorInformation:false,userIsProvidingPreference:false,userIsMakingSmallTalk:false,recoveryStatus:'terminal',recoveryConfidence:0.9,recoveryEvidence:{outcome:'partial_improvement',surfaceText:'What diagnosis did the vet give Milo?',targetConcept:'stiffness',confidence:0.9}}}});
  assert.equal(r.result.reasoning.messageUnderstanding.recoveryStatus,'none');
  assert.deepEqual(r.result.acceptedCareActions,[]);
});
