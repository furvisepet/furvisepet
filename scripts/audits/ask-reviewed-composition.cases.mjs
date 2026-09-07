import assert from 'node:assert/strict';
import test from 'node:test';
import { exercise, clock } from './helpers/lifetime-harness.mjs';
import { care } from './fixtures/ask-lifetime-history.mjs';
import { emptyProposedSemanticFrame } from '../../app/lib/intelligence/semantic-frame/extract-frame.ts';
const plan = {operation:'overview',readOperation:'overview',selection:'summary',subject:'explicit',petNames:['Milo'],topic:'stomach',terms:['stool'],from:null,to:null,episodeTopic:null,ordinal:null,frame:emptyProposedSemanticFrame()};
const rows = [care('june','milo','2026-06-15','symptom','Milo had two soft stools today. He was eating normally.'),care('better','milo','2026-06-20','general','Milo has had normal stools for three days.')];
const draft = {sentences:[{text:'Milo had soft stools in June, followed by a report of normal stools three days in a row.',sourceIds:['care:june','care:better']}]};
test('reviewed summary survives final composition without a whole-note dump', async t => {
  clock(t);
  const r = await exercise('Summarize Milo stomach history.',{history:true,rows,messages:[],interpretationProposal:plan,providerOverrides:{historyNarrative:draft},reviewResponse:{approved:true},expectedReviewCalls:1});
  assert.ok(r.result.reasoning.answer.summary.startsWith(draft.sentences[0].text));
  assert.doesNotMatch(r.result.reasoning.answer.summary,/report:|Note:/);
  assert.deepEqual(r.result.acceptedCareActions,[]);
  assert.deepEqual(r.result.acceptedLearnings,[]);
});

const opts = overrides => ({history:true,rows,messages:[],interpretationProposal:plan,providerOverrides:{historyNarrative:draft},...overrides});
function noWrites(r) {
  assert.deepEqual(r.result.acceptedCareActions,[]);
  assert.deepEqual(r.result.acceptedLearnings,[]);
  assert.deepEqual(r.result.acceptedSemanticEvents,[]);
  assert.equal(r.result.reasoning.proposedHistoryUpdate.shouldOffer,false);
}
test('review rejection removes a causal invention while retaining sourced fallback', async t => {
  clock(t);
  const bad={sentences:[{text:'Chicken definitely caused both episodes.',sourceIds:['care:june','care:better']}]};
  const r=await exercise("Were Milo's soft stools definitely caused by chicken?",opts({providerOverrides:{historyNarrative:bad,answer:bad.sentences[0].text},reviewResponse:{approved:false},expectedReviewCalls:1}));
  assert.doesNotMatch(r.result.reasoning.answer.summary,/definitely caused/);
  assert.match(r.result.reasoning.answer.summary,/soft stools/); noWrites(r);
  assert.ok(r.reviewRequests[0].instructions.includes('Temporal association does not establish cause'));
  assert.equal(JSON.parse(r.reviewRequests[0].input).sources.length,2);
});
test('invalid, unavailable and omitted citations cannot reach semantic approval', async t => {
  clock(t);
  for (const sourceId of ['care:foreign','care:missing','conversation:prior']) {
    const r=await exercise('Summarize Milo stomach history.',opts({providerOverrides:{historyNarrative:{sentences:[{text:'Unsupported fact.',sourceIds:[sourceId]}]}}}));
    assert.doesNotMatch(r.result.reasoning.answer.summary,/Unsupported fact/); noWrites(r);
  }
  const changed=await exercise('Summarize Milo stomach history.',opts({graph:{sources:[{...rows[0],note:'Changed after selection.'}]},reviewResponse:{approved:true}}));
  assert.doesNotMatch(changed.result.reasoning.answer.summary,/three days in a row/);
});
test('review failure, refusal and malformed approval never fail a completed answer', async t => {
  clock(t);
  for (const response of [
    async()=>{throw new DOMException('timed out','TimeoutError');},
    async()=>({status:'incomplete',output_text:'{"approved":true,"retainedSentenceIndexes":[0]}',usage:{input_tokens:20,output_tokens:10}}),
    async()=>({status:'completed',output_text:'{"approved":true,"extra":"forged"}',usage:{input_tokens:20,output_tokens:10}}),
    async()=>({status:'completed',output_text:'not JSON',usage:{input_tokens:20,output_tokens:10}}),
  ]) {
    const r=await exercise('Summarize Milo stomach history.',opts({reviewProviderResponse:response,expectedReviewCalls:1}));
    assert.match(r.result.reasoning.answer.summary,/soft stools/); noWrites(r);
  }
});
test('admission denial for optional review preserves the two completed calls', async t => {
  clock(t);
  const {runWithAiAdmission}=await import('../../app/lib/ai/usage-guard/context.ts');
  const {AiAdmissionError}=await import('../../app/lib/ai/usage-guard/errors.ts');
  let attempts=0;
  const admission={async beginProviderCall(){if(++attempts>2)throw new AiAdmissionError('AI_PROVIDER_BUDGET_EXHAUSTED','provider_call_budget_exhausted');return {reservation:{}};},async recordProviderUsage(){},recordProviderFailure(){}};
  const r=await runWithAiAdmission(admission,()=>exercise('Summarize Milo stomach history.',opts()));
  assert.equal(attempts,3); assert.match(r.result.reasoning.answer.summary,/soft stools/); noWrites(r);
});
test('three admitted calls cover interpretation, generation and one review', async t => {
  clock(t);
  const {runWithAiAdmission}=await import('../../app/lib/ai/usage-guard/context.ts');
  const {getAiFeaturePolicy}=await import('../../app/lib/ai/usage-guard/features.ts');
  const {AiAdmissionError}=await import('../../app/lib/ai/usage-guard/errors.ts');
  const {executeAdmittedProviderCall}=await import('../../app/lib/ai/usage-guard/provider-call-budget.ts');
  assert.equal(getAiFeaturePolicy('ask').maximumProviderCalls,3);
  let calls=0,invoked=false;
  const admission={async beginProviderCall(){if(++calls>3)throw new AiAdmissionError('AI_PROVIDER_BUDGET_EXHAUSTED','provider_call_budget_exhausted');return {reservation:{}};},async recordProviderUsage(){},recordProviderFailure(){}};
  await runWithAiAdmission(admission,async()=>{
    const r=await exercise('Summarize Milo stomach history.',opts({reviewResponse:{approved:true},expectedReviewCalls:1}));
    assert.equal(calls,3); noWrites(r);
    await assert.rejects(executeAdmittedProviderCall({model:'gpt-5-mini',maxOutputTokens:50,providerInput:'fourth',invoke:async()=>{invoked=true;}}));
  });
  assert.equal(invoked,false);
});
test('review receipts cannot be forged, cloned or reused after evidence changes', async t => {
  clock(t);
  const {reviewHistoricalAnswer,readReviewedHistoryAnswer}=await import('../../app/lib/intelligence/review-history-narrative.ts');
  const r=await exercise('Summarize Milo stomach history.',opts({reviewResponse:{approved:false},expectedReviewCalls:1}));
  const result=r.result.reasoning;
  result.reviewedHistory={approved:true}; assert.equal(readReviewedHistoryAnswer(result),null);
  const client={responses:{async create(){return {status:'completed',output_text:'{"approved":true,"retainedSentenceIndexes":[0]}',usage:{input_tokens:20,output_tokens:10}};}}};
  assert.equal(await reviewHistoricalAnswer({result,client}),true);
  assert.ok(readReviewedHistoryAnswer(result));
  assert.equal(readReviewedHistoryAnswer(structuredClone(result)),null);
  result.evidenceContract.represented[0].text+=' Changed.';
  assert.equal(readReviewedHistoryAnswer(result),null);
});
test('mutation during review invalidates approval', async t => {
  clock(t);
  const {reviewHistoricalAnswer,readReviewedHistoryAnswer}=await import('../../app/lib/intelligence/review-history-narrative.ts');
  const r=await exercise('Summarize Milo stomach history.',opts({reviewResponse:{approved:false},expectedReviewCalls:1}));
  const result=r.result.reasoning;
  const accepted=await reviewHistoricalAnswer({result,client:{responses:{async create(){result.evidenceContract.losses.push({sourceId:'care:june',reason:'changed'});return {status:'completed',output_text:'{"approved":true,"retainedSentenceIndexes":[0]}',usage:{input_tokens:20,output_tokens:10}};}}}});
  assert.equal(accepted,false); assert.equal(readReviewedHistoryAnswer(result),null);
});
test('dialogue is available for continuity but never becomes a cited source', async t => {
  clock(t);
  const {ownerId}=await import('./fixtures/ask-lifetime-history.mjs');
  const {buildAskConversationResponse}=await import('../../app/lib/ask.mjs');
  const messages=[{id:'prior-user',user_id:ownerId,conversation_id:'chat',role:'user',user_text:'Tell me about Milo.',sequence_number:1},
    {id:'prior-assistant',user_id:ownerId,conversation_id:'chat',role:'furvise',response_data:buildAskConversationResponse({title:'Furvise',summary:'Milo has a confirmed allergy.',sections:[],safetyNote:null}),sequence_number:2}];
  const r=await exercise('Summarize Milo stomach history.',opts({messages,reviewResponse:{approved:true},expectedReviewCalls:1}));
  assert.ok(r.prompt.dialogueContext.turns.some(turn=>turn.text.includes('Tell me about Milo')));
  assert.ok(!r.prompt.dialogueContext.turns.some(turn=>turn.text.includes('confirmed allergy')));
  assert.ok(!r.prompt.contextRecords.some(record=>record.sourceType==='conversation_turn'));
  assert.ok(!JSON.parse(r.reviewRequests[0].input).sources.some(source=>source.text.includes('confirmed allergy')));
  assert.doesNotMatch(r.result.reasoning.answer.summary,/confirmed allergy/);noWrites(r);
});

test('an invented date is withheld even when a reviewer would approve it', async t => {
  clock(t);
  const r=await exercise('Summarize Milo stomach history.',opts({providerOverrides:{historyNarrative:{sentences:[{text:'Milo had two soft stools on July 8.',sourceIds:['care:june']}] }},reviewResponse:{approved:true}}));
  assert.doesNotMatch(r.result.reasoning.answer.summary,/July 8/);noWrites(r);
});
test('an unsupported dose is withheld before model review', async t => {
  clock(t);
  const r=await exercise('Summarize Milo stomach history.',opts({providerOverrides:{historyNarrative:{sentences:[{text:'Milo needed 2.5 mg medication.',sourceIds:['care:june']}] }},reviewResponse:{approved:true}}));
  assert.doesNotMatch(r.result.reasoning.answer.summary,/2\.5 mg/);noWrites(r);
});
test('one unsupported sentence does not erase independent supported synthesis', async t => {
  clock(t);
  const mixed={sentences:[...draft.sentences,{text:'He also had a problem on July 8.',sourceIds:['care:missing']}]};
  const r=await exercise('Summarize Milo stomach history.',opts({providerOverrides:{historyNarrative:mixed},reviewResponse:{approved:true},expectedReviewCalls:1}));
  assert.ok(r.result.reasoning.answer.summary.startsWith(draft.sentences[0].text));
  assert.doesNotMatch(r.result.reasoning.answer.summary,/July 8/);noWrites(r);
});
test('inflected latest-status search reaches hides after an older hiding note',async t=>{
  clock(t);
  const status={...plan,operation:'status',readOperation:'status',selection:'latest',topic:'hiding',terms:['hiding']};
  const r=await exercise('Is Milo hiding resolved?',opts({interpretationProposal:status,rows:[
    care('hid-old','milo','2026-08-15','behavior','Milo is hiding during building work.'),
    care('hid-latest','milo','2026-09-02','behavior','Milo still hides during loud drilling.')],providerOverrides:{historyNarrative:{sentences:[{text:'The September 2 note says Milo still hides during loud drilling.',sourceIds:['care:hid-latest']}] }},reviewResponse:{approved:true},expectedReviewCalls:1}));
  assert.match(r.result.reasoning.answer.summary,/September 2/);
  assert.ok(r.context.askHistory.entries.some(row=>row.id==='hid-latest'));noWrites(r);
});

test('real admission store reserves the third slot only for review and reconciles all usage',async t=>{
  clock(t);
  const {runAdmittedAiOperation}=await import('../../app/lib/ai/usage-guard/admission.ts');
  const {MemoryAiGuardTestStore}=await import('../../app/lib/ai/usage-guard/memory-test-store.ts');
  const {OPENAI_ANALYSIS_MODEL}=await import('../../app/lib/ai/config.ts');
  const {executeAdmittedProviderCall}=await import('../../app/lib/ai/usage-guard/provider-call-budget.ts');
  const {ownerId}=await import('./fixtures/ask-lifetime-history.mjs');
  const store=new MemoryAiGuardTestStore();
  let fourthInvoked=false;
  await runAdmittedAiOperation({store,feature:'ask',intendedModel:OPENAI_ANALYSIS_MODEL,env:{NODE_ENV:'test'},payload:{question:'summary'},userId:ownerId,requestId:'composition-real-admission'},async()=>{
    const r=await exercise('Summarize Milo stomach history.',opts({interpretationModel:OPENAI_ANALYSIS_MODEL,reviewResponse:{approved:true},expectedReviewCalls:1}));
    assert.ok(r.result.reasoning.answer.summary.startsWith(draft.sentences[0].text));
    await assert.rejects(executeAdmittedProviderCall({purpose:'history_review',model:OPENAI_ANALYSIS_MODEL,maxOutputTokens:100,providerInput:'extra',invoke:async()=>{fourthInvoked=true;}}));
  });
  assert.equal(store.getSnapshot('2026-09-04').calls,3);
  assert.equal(fourthInvoked,false);
});
test('date and quantity anchors remain associated instead of mixing source years',async()=>{
  const {historyNarrativeAnchorsSupported:check}=await import('../../app/lib/intelligence/history-narrative-facts.ts');
  const sources=[{text:'Milo weighed 27.8 kg.',occurredAt:'2011-06-15T12:00:00Z'},{text:'Normal stools.',occurredAt:'2026-08-08T12:00:00Z'}];
  assert.equal(check('Milo weighed 27.8 kg on June 15, 2011.',sources),true);
  assert.equal(check('Milo weighed 8 kg on June 15, 2011.',sources),false);
  assert.equal(check('Milo weighed 27.8 kg on June 15, 2026.',sources),false);
});

test('a clear named-topic follow-up recovers an unnecessary clarification through the callback',async t=>{
  clock(t);
  const recovery={...plan,operation:'clarify',readOperation:'clarify',petNames:['Luna'],topic:'accidents',terms:[]};
  const r=await exercise("What about Luna\u2019s accidents?",opts({interpretationProposal:recovery,rows:[care('luna-accidents','luna','2026-07-17','general','Luna has had no more accidents since July 10. She is using the tray normally.')],providerOverrides:{historyNarrative:{sentences:[{text:'The July 17 note says Luna had no more accidents since July 10.',sourceIds:['care:luna-accidents']}] }},reviewResponse:{approved:true},expectedReviewCalls:1}));
  assert.equal(r.reviewRequests.length,1);
  assert.equal(r.context.askInterpretation.history.terms[0],'accident');
  assert.match(r.result.reasoning.answer.summary,/July 17/);
  assert.doesNotMatch(r.result.reasoning.answer.summary,/Which pet/); noWrites(r);
});

test('confirmed loss does not spend a third call repairing death as symptom recovery',async t=>{
  clock(t);
  const lossPlan={...plan,operation:'update',readOperation:null,terms:[],topic:'death'};
  const r=await exercise('Milo died today. I feel like I lost part of my life.',opts({interpretationProposal:lossPlan,providerOverrides:{
    answer:'I am so sorry about Milo. Losing him can leave a huge gap in your day. I am here if you want to tell me about him.',
    historyNarrative:null,responseMode:'grief_support',
    messageUnderstanding:{primaryIntent:'general_conversation',secondaryIntents:[],userIsAskingQuestion:false,userIsProvidingUpdate:true,userIsCorrectingPriorInformation:false,userIsResolvingConcern:false,userIsProvidingPreference:false,userIsMakingSmallTalk:false,recoveryStatus:'terminal',recoveryConfidence:0.98,recoveryEvidence:{outcome:'problem_ended',surfaceText:'Milo died today',targetConcept:'life',confidence:0.98},requestedTopic:'death',referencedPet:'Milo',safetyRelevance:'possible',needsClarification:false,canAnswerDirectly:true}
  }}));
  assert.equal(r.result.reasoning.responseMode,'grief_support');
  assert.equal(r.result.reasoning.messageUnderstanding.recoveryStatus,'none');
  assert.match(r.result.reasoning.answer.summary,/sorry/);
  assert.ok(r.result.acceptedCareActions.every(action=>action.action==='create_entry' && action.title==='Milo died'));
  assert.equal(r.result.reasoning.proposedHistoryUpdate.shouldOffer,false);
});

test('named-topic recovery preserves ambiguous episode and foreign-subject clarification',async t=>{
  clock(t);
  for (const question of ['What about Luna second episode?','What about Luna that one?','What about Bruno accidents?']) {
    const ambiguous={...plan,operation:'clarify',readOperation:'clarify',subject:'unclear',petNames:[],topic:'accidents',terms:[]};
    const r=await exercise(question,opts({interpretationProposal:ambiguous,providerOverrides:{historyNarrative:null}}));
    assert.equal(r.context.askInterpretation.history,null);
    assert.match(r.result.reasoning.answer.summary,/Which pet/);
    noWrites(r);
  }
});

test('yesterday cannot silently become the source timestamp',async()=>{
  const {historyNarrativeAnchorsSupported:check}=await import('../../app/lib/intelligence/history-narrative-facts.ts');
  const sources=[{text:'We started giving Milo chicken treats yesterday.',occurredAt:'2026-06-12T12:00:00Z'}];
  assert.equal(check('Milo started chicken treats on June 12.',sources),false);
  assert.equal(check('Milo started chicken treats on June 11.',sources),true);
  assert.equal(check('The June 12 note says chicken treats started the previous day.',sources),true);
});
test('reviewed narrative keeps source IDs out of visible prose even with a missing bracket',async t=>{
  clock(t);
  const r=await exercise('Summarize Milo stomach history.',opts({providerOverrides:{historyNarrative:{sentences:[{text:draft.sentences[0].text+' [care:june] [care:better',sourceIds:['care:june','care:better']}]}},reviewResponse:{approved:true},expectedReviewCalls:1}));
  assert.doesNotMatch(r.result.reasoning.answer.summary,/care:|\[/);
  assert.ok(r.result.reasoning.answer.summary.startsWith(draft.sentences[0].text));
});

test('unused lookup bounds cannot fail a pure update and never become retrieval scope',async t=>{
  clock(t);
  const r=await exercise('Milo died today. I feel like I lost part of my life.',opts({interpretationProposal:{...plan,operation:'update',readOperation:null,terms:['death'],topic:'death',from:null,to:'2026-09-04'},providerOverrides:{answer:'I am so sorry about Milo. I am here if you want to talk about him.',historyNarrative:null,responseMode:'grief_support'}}));
  assert.equal(r.context.askInterpretation.history,null);
  assert.equal(r.result.reasoning.responseMode,'grief_support');
  assert.match(r.result.reasoning.answer.summary,/sorry/);
});

// Synthetic table regression: presentation must retain approved measurements.
test('reviewed weight table retains its rows after final sanitation', async t => {
  clock(t);
  const weights = [care('weight-a','milo','2025-01-03','weight','Milo weighed 12.5 kg.'),care('weight-b','milo','2025-02-04','weight','Milo weighed 12.1 kg.')];
  const table = '| Date | Weight |\n| --- | --- |\n| 2025-01-03 | 12.5 kg |\n| 2025-02-04 | 12.1 kg |';
  const r = await exercise('Show Milo recorded weights in a table with date and weight.',{history:true,rows:weights,messages:[],interpretationProposal:{...plan,operation:'recall',readOperation:'recall',topic:'weight',terms:['weigh']},providerOverrides:{historyNarrative:{sentences:table.split('\n').map(text=>({text,sourceIds:['care:weight-a','care:weight-b']}))}},reviewResponse:{approved:true},expectedReviewCalls:1});
  assert.ok(r.result.reasoning.answer.summary.includes(table), r.result.reasoning.answer.summary);
  noWrites(r);
});

test('multiline table is reviewed and header-only approval falls back to sourced facts', async t => {
  clock(t);
  const weights=[care('table-weight','milo','2025-03-02','weight','Milo weighed 11.4 kg.')];
  const table='| Date | Weight |\n| --- | --- |\n| 2025-03-02 | 11.4 kg |';
  const options={history:true,rows:weights,messages:[],interpretationProposal:{...plan,operation:'recall',readOperation:'recall',topic:'weight',terms:['weigh']},reviewResponse:{approved:true},expectedReviewCalls:1};
  const complete=await exercise('Show Milo recorded weight in a table.',{...options,providerOverrides:{historyNarrative:{sentences:[{text:table,sourceIds:['care:table-weight']}]}}});
  assert.ok(complete.result.reasoning.answer.summary.includes(table)); noWrites(complete);
  const partial=await exercise('Show Milo recorded weight in a table.',{...options,providerOverrides:{historyNarrative:{sentences:table.split('\n').map(text=>({text,sourceIds:['care:table-weight']}))}},reviewResponse:{approved:true,retainedSentenceIndexes:[0,1]}});
  assert.match(partial.result.reasoning.answer.summary,/11\.4 kg/); noWrites(partial);
  const rejected=await exercise('Show Milo recorded weight in a table.',{...options,providerOverrides:{historyNarrative:{sentences:[{text:table.replace('11.4','99.9'),sourceIds:['care:table-weight']}]}},expectedReviewCalls:0});
  assert.doesNotMatch(rejected.result.reasoning.answer.summary,/99\.9/); assert.match(rejected.result.reasoning.answer.summary,/11\.4 kg/); noWrites(rejected);
});
