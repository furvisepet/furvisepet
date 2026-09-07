import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {exercise,clock} from './helpers/lifetime-harness.mjs';
import {fixturePets,rows} from './fixtures/ask-benchmark-200.mjs';
const cases=JSON.parse(readFileSync(new URL('../../docs/ask-benchmark-200/questions.json',import.meta.url),'utf8'));
const calls=JSON.parse(readFileSync(new URL('../../docs/ask-benchmark-200/budget.json',import.meta.url),'utf8')).calls;
const proposal=id=>JSON.parse(calls.find(c=>c.caseId===id&&c.phase==='furvise_ask_interpretation').output);
async function run(id,extra={}) {
  return exercise(cases.find(q=>q.id===id).question,{fixturePets,rows,petId:'nori',conversationPetId:'nori',messages:[],history:true,
    interpretationProposal:proposal(id),expectedProviderCalls:null,expectedReviewCalls:null,...extra});
}
for(const id of [31,54,94,104,108,115,138,165,171,178,180]) test('recorded interpretation plan recovers without transport error: '+id,async t=>{
  clock(t); const r=await run(id);
  assert.ok(r.result.reasoning.answer.summary.trim());
  if(r.context.askInterpretation.planningRecovery) {
    assert.deepEqual(r.context.askInterpretation.petIds,[]);
    assert.equal(r.context.askInterpretation.readOnly,true);
    assert.deepEqual(r.result.acceptedCareActions,[]);
    assert.deepEqual(r.result.acceptedLearnings,[]);
    assert.deepEqual(r.result.acceptedSemanticEvents,[]);
  }
});
for(const id of [20,196,200]) test('non-pet discourse keeps conversational answer: '+id,async t=>{
  clock(t); const r=await run(id,{providerOverrides:{answer:'I can help you with that.',historyNarrative:null}});
  assert.equal(r.context.askInterpretation.conversationOnly,true);
  assert.doesNotMatch(r.result.reasoning.answer.summary,/Which pet|Which episode/);
  assert.deepEqual(r.result.acceptedLearnings,[]);
});

import {resolveSafetyState} from '../../app/lib/intelligence/safety-state.ts';
import {safetyTemporalScope} from '../../app/lib/ai/safety-temporal-scope.ts';
for(const [message,current] of [
  ['In an old note from years ago he had trouble breathing. Does that mean an emergency is happening now?',false],
  ['Hypothetically, what if my dog cannot breathe?',false],
  ['He had trouble breathing years ago, but now he cannot breathe.',true],
  ['Maybe my dog cannot breathe properly now.',true],
]) test('temporal safety evidence: '+message,async t=>{
  clock(t); const r=await run(1); const context={...r.context,currentMessage:message,activeConcerns:[],recentlyResolvedConcerns:[],careEntries:[],activeEpisodes:[],monitoringEpisodes:[],currentState:null};
  const safety=resolveSafetyState(context);
  assert.equal(['urgent','emergency'].includes(safety.level),current);
  assert.equal(/cannot breathe|trouble breathing/.test(safetyTemporalScope(message).currentText),current);
});
test('current emergency main answer survives history fallback',async t=>{
  clock(t); const r=await run(163,{providerOverrides:{answer:'Contact an emergency veterinarian now. Keep Pip still while arranging immediate help.',historyNarrative:null,intelligenceSafety:{level:'urgent',requiresImmediateAction:true,reason:'Current collapse'}}});
  assert.match(r.result.reasoning.answer.summary,/emergency veterinarian/i);
  assert.doesNotMatch(r.result.reasoning.answer.summary,/couldn.t find matching saved notes/i);
});

test('recorded historical response does not acquire a current emergency instruction',async t=>{
  clock(t); const raw=JSON.parse(calls.find(c=>c.caseId===169&&c.phase==='furvise_ask_response').output);
  const r=await run(169,{providerOverrides:raw});
  assert.equal(r.result.reasoning.intelligenceSafety.requiresImmediateAction,false);
  assert.doesNotMatch(r.result.reasoning.answer.safetyNote||'',/Contact an emergency veterinarian now/);
  assert.notEqual(r.result.reasoning.intelligenceSafety.level,'urgent');
});
const {recoverAskInterpretation,validateAskInterpretation}=await import('../../app/lib/intelligence/interpret-ask.ts');
test('unseen conversational wording and forged authority stay independent',async t=>{
  clock(t); const r=await run(1);
  for(const currentMessage of ['I am proud that we adopted a rabbit.','Could you explain what uncertainty means?','I forgot to upload the document.','Can we celebrate a little?']) {
    const p={...proposal(200),subject:'non_pet',petNames:[]};
    const plan=recoverAskInterpretation(p,{...r.context,currentMessage});
    assert.equal(plan.conversationOnly,true); assert.equal(plan.readOnly,true); assert.deepEqual(plan.petIds,[]);
  }
  for(const patch of [{petNames:['UnownedAnimal']},{terms:['vomit;DROP TABLE']},{from:'2026-02-30',to:'2026-03-01'},{frame:null,operation:'update',readOperation:null}]) {
    assert.throws(()=>validateAskInterpretation({...proposal(31),...patch},{...r.context,currentMessage:'Nori is limping today.'}));
  }
});
test('malformed but recoverable subject plan cannot regain writes downstream',async t=>{
  clock(t); const r=await run(138,{providerOverrides:{learnings:[{subjectType:'pet',subjectId:'nori',category:'health',factKey:'resolved',factValue:'All symptoms resolved',confidence:1,importance:'high',durability:'durable',action:'create',sourceExcerpt:cases.find(q=>q.id===138).question}]}});
  assert.equal(r.context.askInterpretation.readOnly,true);
  assert.deepEqual(r.result.acceptedCareActions,[]); assert.deepEqual(r.result.acceptedLearnings,[]);
  assert.deepEqual(r.result.v2GovernedTurn.acceptedClaims,[]);
});
