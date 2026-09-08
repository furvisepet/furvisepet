import assert from 'node:assert/strict';
import test from 'node:test';
import { exercise, clock } from './helpers/lifetime-harness.mjs';
import { care, pets as correctionFixturePets } from './fixtures/ask-lifetime-history.mjs';
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

test('reviewed table rows retain layout when the separator is omitted', async t => {
 clock(t);
 const table='| Date | Weight |\n| 2025-03-02 | 11.4 kg |';
 const r=await exercise('Show Milo recorded weight in a table.',{history:true,rows:[care('table-row','milo','2025-03-02','weight','Milo weighed 11.4 kg.')],messages:[],interpretationProposal:{...plan,operation:'recall',readOperation:'recall',topic:'weight',terms:['weigh']},providerOverrides:{historyNarrative:{sentences:table.split('\n').map(text=>({text,sourceIds:['care:table-row']}))}},reviewResponse:{approved:true},expectedReviewCalls:1});
 assert.ok(r.result.reasoning.answer.summary.includes(table),r.result.reasoning.answer.summary);noWrites(r);
});

test('historical comparison keeps dated evidence before optional profile detail',async t=>{
  clock(t);
  const {pets}=await import('./fixtures/ask-lifetime-history.mjs');
  const fixturePets=pets.map(p=>({...p,breed:'Mixed breed',age_value:6,age_unit:'years',weight_value:10,
    current_food:'Complete adult dry food',main_concern:'Keeping an accurate history of changes',
    wellness_goal:'Keep comfortable and active',monthly_budget:100,pronouns:'they/them',avoid_ingredients:['none recorded']}));
  const comparisonRows=['milo','luna','oscar'].flatMap((pet,i)=>[
    care(pet+'-first',pet,'2026-03-03','general',pet[0].toUpperCase()+pet.slice(1)+' weighed '+(10+i)+' kg today. Appetite was normal.'),
    care(pet+'-last',pet,'2026-08-03','general',pet[0].toUpperCase()+pet.slice(1)+' weighed '+(9+i)+' kg today. Appetite was normal.'),
  ]);
  const r=await exercise('Compare recorded weight changes for Milo, Luna and Oscar.',{
    history:true,rows:comparisonRows,messages:[],fixturePets,
    interpretationProposal:{...plan,operation:'comparison',readOperation:'comparison',selection:'comparison',
      petNames:['Milo','Luna','Oscar'],topic:'weight',terms:['weigh']}});
  const evidence=r.result.reasoning.evidenceContract;
  for(const row of comparisonRows){
    assert.ok(evidence.represented.some(span=>span.sourceId==='care:'+row.id),'missing '+row.id);
    assert.ok(!evidence.losses.some(loss=>loss.sourceId==='care:'+row.id));
  }
  assert.ok(evidence.represented.some(span=>span.sourceId==='profile:luna:avoid_ingredients'));
  assert.ok(r.serialized.length<=48000);
  noWrites(r);
});

test('explicit dated source lookup does not require the question synonym in the note',async t=>{
  clock(t);
  const source=care('dated-quantity','luna','2026-04-08','behavior',
    'Luna urinated on the bath mat once yesterday and once today.');
  const r=await exercise("How many accidents does Luna's April 8 note describe?",{
    history:true,rows:[source],messages:[],
    interpretationProposal:{...plan,operation:'recall',readOperation:'recall',selection:'reference',
      petNames:['Luna'],topic:'accidents',terms:['accident'],from:'2026-04-08',to:'2026-04-09'}});
  assert.ok(r.context.askHistory.entries.some(row=>row.id===source.id));
  noWrites(r);
});

test('natural-language dates and pet headings preserve reviewed table content',async t=>{
 clock(t);
 const weights=[care('table-first','milo','2026-06-04','general','Milo weighed 4.2 kg today.'),care('table-last','milo','2026-09-02','general','His weight today was 4.2 kg.')];
 for(const table of ['| Date | Weight |\n| --- | --- |\n| June 4, 2026 | 4.2 kg |\n| September 2, 2026 | 4.2 kg |','| Pet | Date | Weight |\n| --- | --- | --- |\n| Milo | June 4, 2026 | 4.2 kg |\n| Milo | September 2, 2026 | 4.2 kg |']) {
 const r=await exercise('Show Milo recorded weights in a table with dates.',{history:true,rows:weights,messages:[],interpretationProposal:{...plan,operation:'recall',readOperation:'recall',topic:'weight',terms:['weigh']},providerOverrides:{historyNarrative:{sentences:[{text:table,sourceIds:['care:table-first','care:table-last']}]}},reviewResponse:{approved:true},expectedReviewCalls:1});
 assert.match(r.result.reasoning.answer.summary,/June 4, 2026/);assert.match(r.result.reasoning.answer.summary,/September 2, 2026/);noWrites(r);
 }
});

test('elapsed dates include the final day and compute only from retained endpoints',async t=>{
 clock(t);
 const q="How many days are there from Milo's June 15 soft-stool note to June 20?";
 const r=await exercise(q,{history:true,rows,messages:[],interpretationProposal:{...plan,operation:'recall',readOperation:'recall',selection:'reference',from:'2026-06-15',to:'2026-06-16',terms:['soft stool']}});
 assert.equal(r.context.askHistory.entries.length,2);
 assert.match(r.result.reasoning.answer.summary,/5 calendar days/);noWrites(r);
 const {calendarIntervalAnswer}=await import('../../app/lib/intelligence/calendar-interval.ts');
 const e=structuredClone(r.result.reasoning.evidenceContract);
 e.losses.push({sourceId:'care:better',reason:'prompt_budget'});
 assert.equal(calendarIntervalAnswer(e),null);
});

test('correction identity question retrieves the correction without assigning its external subject',async t=>{
 clock(t);
 const {pets}=await import('./fixtures/ask-lifetime-history.mjs');
 const r=await exercise('Which dog was the vomiting correction about?',{history:true,fixturePets:pets.slice(0,3),rows:[care('correction-read','milo','2026-08-20','general','Correction to yesterday: that vomiting report was my sister dog Rufus, not Milo.')],messages:[],interpretationProposal:{...plan,operation:'general',readOperation:'general',subject:'non_pet',petNames:[],terms:[]}});
 assert.match(r.result.reasoning.answer.summary,/Rufus/);
 assert.doesNotMatch(r.result.reasoning.answer.summary,/Luna:|Oscar:|couldn't verify/);noWrites(r);
});

test('route-facing subject resolution keeps complete thanks conversational',async t=>{
 clock(t);
 const {readInterpretationSubject}=await import('../../app/lib/intelligence/interpret-ask.ts');
 for(const patch of [{operation:'update',readOperation:null},{operation:'general',readOperation:null},{operation:'recall',readOperation:'recall'}]) {
 const r=await exercise('Thanks, that helps.',{history:true,rows,messages:[],interpretationProposal:{...plan,...patch,subject:'unclear',petNames:[],terms:[]},providerOverrides:{answer:'You are welcome.',historyNarrative:null}});
 const subject=readInterpretationSubject(r.context.askInterpretation,'milo').resolution;
 assert.equal(subject.requiresClarification,false);assert.equal(subject.petId,'milo');assert.deepEqual(subject.petIds,[]);noWrites(r);
 }
});

test('exact lifetime illness total explains evidence limits across multiple pets',async t=>{
 clock(t);const {pets}=await import('./fixtures/ask-lifetime-history.mjs');
 const r=await exercise('Can you give me the exact number of illnesses these three pets have ever had?',{history:true,rows:[],fixturePets:pets.slice(0,3),messages:[],interpretationProposal:{...plan,operation:'count',readOperation:'count',petNames:pets.slice(0,3).map(p=>p.name),terms:['illness'],episodeTopic:null}});
 assert.match(r.result.reasoning.answer.summary,/unrecorded/);assert.doesNotMatch(r.result.reasoning.answer.summary,/Which displayed/);noWrites(r);
});

test('future-dated recurrence cannot be approved as an event that already happened',async t=>{
 clock(t);
 const r=await exercise('Does Milo improvement prove the stiffness will never return?',{history:true,rows:[care('past-comfort','milo','2026-06-04','general','Milo was comfortable for three days.'),care('future-stiff','milo','2099-06-04','symptom','Milo was stiff again.')],messages:[],interpretationProposal:{...plan,terms:[],from:null,to:null},providerOverrides:{historyNarrative:{sentences:[{text:'Milo was comfortable for three days.',sourceIds:['care:past-comfort']},{text:'His stiffness already returned in 2099.',sourceIds:['care:future-stiff']}]}},reviewResponse:{approved:true},expectedReviewCalls:1});
 assert.doesNotMatch(r.result.reasoning.answer.summary,/already returned|2099/);noWrites(r);
});

test('compacted history transport preserves source text or records its omission',async t=>{
 clock(t);const {pets}=await import('./fixtures/ask-lifetime-history.mjs');
 const many=Array.from({length:12},(_,i)=>care('00000000-0000-4000-8000-'+String(i).padStart(12,'0'),pets[i%3].id,'2026-06-'+String(i+1).padStart(2,'0'),'food',`${pets[i%3].name} ate the recorded food. ${'An ordinary recorded observation about food and appetite. '.repeat(8)}`));
 const r=await exercise('List recorded food for each pet.',{history:true,rows:many,fixturePets:pets.slice(0,3),messages:[],interpretationProposal:{...plan,petNames:pets.slice(0,3).map(p=>p.name),terms:['food']}});
 assert.ok(r.serialized.length<=48000);
 const evidence=r.result.reasoning.evidenceContract;
 const kept=evidence.represented.filter(span=>span.sourceType==='care_update');
 assert.equal(new Set(kept.map(span=>span.petId)).size,3);
 for(const row of many) {
 const span=kept.find(span=>span.sourceId==='care:'+row.id);
 if(span) assert.equal(span.text,[row.title,row.note].filter(Boolean).join(': '));
 else assert.ok(evidence.losses.some(loss=>loss.sourceId==='care:'+row.id));
 }
 noWrites(r);
});

test('retrieval excludes future records even when narrative review falls back',async t=>{
 clock(t);
 for(const terms of [[],['stiffness']]) {
 const r=await exercise('Summarize Milo stiffness history.',{history:true,rows:[care('past','milo','2026-06-04','symptom','Milo had stiffness.'),care('future','milo','2099-06-04','symptom','Milo had stiffness again.')],messages:[],interpretationProposal:{...plan,terms},providerOverrides:{historyNarrative:null},reviewResponse:{approved:false},expectedReviewCalls:1});
 assert.doesNotMatch(r.result.reasoning.answer.summary,/2099|again/);
 assert.ok(r.result.reasoning.evidenceContract.represented.some(s=>s.sourceId==='care:past'));
 assert.ok(!r.result.reasoning.evidenceContract.represented.some(s=>s.sourceId==='care:future'));noWrites(r);
 }
});
test('explicit future-dated source lookup keeps attribution and time warning',async t=>{
 clock(t);
 const r=await exercise('Quote the future-dated June 4, 2099 stiffness note for Milo.',{history:true,rows:[care('future','milo','2099-06-04','symptom','Milo had stiffness again.')],messages:[],interpretationProposal:{...plan,operation:'recall',readOperation:'recall',terms:['stiffness'],from:'2099-06-04',to:'2099-06-05'},providerOverrides:{historyNarrative:null}});
 assert.match(r.result.reasoning.answer.summary,/future-dated/);
 assert.match(r.result.reasoning.answer.summary,/2099-06-04/);noWrites(r);
});
test('mobility retrieval includes dated comfort reports',async t=>{
 clock(t);
 const r=await exercise('Does Milo September 3 improvement prove stiffness never returns?',{history:true,rows:[care('comfort','milo','2026-09-03','general','Milo was comfortable for three days.')],messages:[],interpretationProposal:{...plan,operation:'status',readOperation:'status',terms:['stiffness','improvement','return','never'],from:'2026-09-03',to:'2026-09-04'},providerOverrides:{historyNarrative:null},reviewResponse:{approved:false},expectedReviewCalls:1});
 assert.ok(r.result.reasoning.evidenceContract.represented.some(s=>s.sourceId==='care:comfort'));noWrites(r);
});

test('weight table row ordering retains both measurements despite earliest model selection',async t=>{
 clock(t);
 const r=await exercise('Show Milo recorded weights in a table, with the older measurement first.',{history:true,rows:[care('light','milo','2026-06-04','general','Milo weighed 20 kg today.'),care('heavy','milo','2026-09-03','general','Milo weighed 21 kg today.')],messages:[],interpretationProposal:{...plan,operation:'recall',readOperation:'recall',selection:'earliest',terms:['weight']}});
 assert.match(r.result.reasoning.answer.summary,/\| 2026-06-04 \| 20 kg \|/);
 assert.match(r.result.reasoning.answer.summary,/\| 2026-09-03 \| 21 kg \|/);noWrites(r);
});
test('complete thanks variants use the provider-independent route without swallowing requests',async()=>{
 const {planProviderIndependentAskTurn}=await import('../../app/lib/ai/ask-orchestrator.ts');
 for(const message of ['Thanks, that helped.','Thank you so much!','thx, appreciate it']) {
 const r=planProviderIndependentAskTurn({concerns:[],message,petName:'Milo'});
 assert.equal(r?.handledWithoutAi,true);assert.equal(r?.suggestion,null);
 }
 for(const message of ['Thanks, but Milo is vomiting.','Thanks. What should I do?','Thanks, that helped his breathing.']) {
 assert.equal(planProviderIndependentAskTurn({concerns:[],message,petName:'Milo'}),null);
 }
});

test('reformulation references the prior user question without accepting assistant facts',async t=>{
 clock(t);const {ownerId}=await import('./fixtures/ask-lifetime-history.mjs');
 const question='Can you explain that last answer more briefly?';
 const prior='How many stools are described in Milo June 15 note?';
 const messages=[{id:'prior-q',user_id:ownerId,conversation_id:'chat',role:'user',user_text:prior,sequence_number:1}];
 const r=await exercise(question,{history:true,rows,messages,interpretationProposal:{...plan,operation:'recall',readOperation:'recall',subject:'conversation',petNames:[],terms:['stool'],from:'2026-06-15',to:'2026-06-16'}});
 assert.equal(JSON.parse(r.interpretationRequests[0].input).reformulation.priorUserQuestion,prior);noWrites(r);
});

test('food summary keeps explicit diet changes ahead of incidental eating matches',async t=>{
 clock(t);const {pets}=await import('./fixtures/ask-lifetime-history.mjs');
 const entries=pets.slice(0,3).flatMap(p=>[
 care(p.id+'-before',p.id,'2026-06-04','food',p.name+' ate chicken food.'),
 care(p.id+'-change',p.id,'2026-08-02','food',p.name+' changed to turkey food.'),
 ...Array.from({length:4},(_,i)=>care(p.id+'-noise-'+i,p.id,'2026-08-'+(15+i),'general',p.name+' eats during quiet periods. '+ 'A separate ordinary observation about the surroundings. '.repeat(30)))
 ]);
 const r=await exercise("Give a separate line for each pet's recorded food: Milo, Luna, Oscar.",{history:true,rows:entries,fixturePets:pets.slice(0,3),messages:[],interpretationProposal:{...plan,operation:'comparison',readOperation:'comparison',selection:'comparison',petNames:pets.slice(0,3).map(p=>p.name),topic:'weight',terms:['weigh']}});
 for(const p of pets.slice(0,3)) {
 const kept=r.result.reasoning.evidenceContract.represented.filter(s=>s.petId===p.id);
 assert.ok(kept.some(s=>s.sourceId==='care:'+p.id+'-before'));
 assert.ok(kept.some(s=>s.sourceId==='care:'+p.id+'-change'));
 }
 assert.ok(r.result.reasoning.evidenceContract.losses.length>0);noWrites(r);
});

test('a shorter dated-note count cannot become an episode clarification',async t=>{
 clock(t);const {ownerId}=await import('./fixtures/ask-lifetime-history.mjs');
 const question='Can you explain that last answer more briefly?';
 const messages=[{id:'prior-q',user_id:ownerId,conversation_id:'chat',role:'user',user_text:'How many accidents are described in Luna July 8 note?',sequence_number:1}];
 const source=care('accidents','luna','2026-07-08','general','Luna urinated on the bath mat once yesterday and once today.');
 const r=await exercise(question,{history:true,rows:[source],messages,interpretationProposal:{...plan,operation:'count',readOperation:'count',subject:'conversation',petNames:[],selection:'summary',terms:[],from:null,to:null},providerOverrides:{historyNarrative:{sentences:[{text:'The note describes two accidents, one on July 7 and one on July 8.',sourceIds:['care:accidents']}]}},reviewResponse:{approved:true},expectedReviewCalls:0});
 assert.equal(r.context.askInterpretation.readOperation,'recall');
 assert.ok(r.result.reasoning.evidenceContract.represented.some(s=>s.sourceId==='care:accidents'));
 assert.match(r.result.reasoning.answer.summary,/two accidents/);assert.doesNotMatch(r.result.reasoning.answer.summary,/Which symptom/);noWrites(r);
});
test('medication-change hypothetical remains advice, with no pet clarification or writes',async t=>{
 clock(t);const {readInterpretationSubject}=await import('../../app/lib/intelligence/interpret-ask.ts');
 for(const operation of ['clarify','update','general']) {
 const r=await exercise('If Oscar is comfortable today, should I change the recorded medication dose myself?',{history:true,rows:[],messages:[],interpretationProposal:{...plan,operation,readOperation:operation==='update'?null:operation,subject:'unclear',petNames:[],terms:[]},providerOverrides:{answer:'Do not change a prescribed dose yourself; ask the prescribing vet.',historyNarrative:null}});
 assert.equal(readInterpretationSubject(r.context.askInterpretation,'milo').resolution.requiresClarification,false);
 assert.equal(r.context.askInterpretation.conversationOnly,true);noWrites(r);
 }
});

test('dated-note reformulation refuses ambiguous, foreign, mutating and assistant-only references',async t=>{
 clock(t);const {pets,ownerId}=await import('./fixtures/ask-lifetime-history.mjs');
 const {datedNoteReformulation}=await import('../../app/lib/intelligence/ask-plan-recovery.ts');
 const base={owner:{userId:ownerId},eligiblePets:pets.slice(0,3),pet:pets[0],currentMessage:'Can you explain that last answer more briefly?'};
 for(const text of ['Save Luna July 8 note.','How many accidents are in Luna July 8 and July 9 notes?','How many accidents are in Bruno July 8 note?']) {
 assert.equal(datedNoteReformulation({...base,conversationTurns:[{role:'user',text}]}),null);
 }
 assert.equal(datedNoteReformulation({...base,conversationTurns:[{role:'furvise',text:'How many accidents are in Luna July 8 note?'}]}),null);
 assert.equal(datedNoteReformulation({...base,currentMessage:base.currentMessage+' Also delete it.',conversationTurns:[{role:'user',text:'How many accidents are in Luna July 8 note?'}]}),null);
});

test('grouped source transport preserves every coverage field without changing server authority',async()=>{
 const {compactHistorySourceCoverage}=await import('../../app/lib/ai/history-source-transport.ts');
 const completeness={retrieval:'unknown',corrections:'partial',extraction:'unknown',grouping:'unknown'};
 const sources=['milo','luna'].flatMap(petId=>[
 {petId,source:'care_entries',status:'loaded',loadedIds:['care:'+petId],loadedCount:1,cap:25,reasons:['partial read'],completeness},
 {petId,source:'memory',status:'loaded',loadedIds:['memory:omitted'],loadedCount:3,cap:100,reasons:['not certified'],completeness},
 {petId,source:'episodes',status:'loaded',loadedIds:[],loadedCount:0,cap:40,reasons:['not certified'],completeness},
 {petId,source:'corrections',status:'unavailable',loadedIds:[],loadedCount:0,cap:10,reasons:['failed'],completeness,loadedPeriod:{from:'2026-01-01',to:'2026-09-01'}}
 ]);
 const before=structuredClone(sources),ids=new Set(['care:milo','care:luna']);
 const compact=compactHistorySourceCoverage(sources,ids);
 const expanded=[...compact.sources,...compact.unrepresentedSourceGroups.flatMap(({members,...shared})=>members.map(member=>({...shared,...member})))];
 const sort=xs=>xs.sort((a,b)=>(a.petId+':'+a.source).localeCompare(b.petId+':'+b.source));
 assert.deepEqual(sort(expanded),sort(sources.map(s=>({...s,loadedIds:s.loadedIds.filter(id=>ids.has(id))}))));
 assert.deepEqual(sources,before);
});
test('compact coverage leaves room for thirteen complete multi-pet food notes',async t=>{
 clock(t);const {pets}=await import('./fixtures/ask-lifetime-history.mjs');
 const fixturePets=pets.slice(0,3).map((p,i)=>({...p,id:'00000000-0000-4000-8000-'+String(i).padStart(12,'0')}));
 const entries=Array.from({length:13},(_,i)=>care('10000000-0000-4000-8000-'+String(i).padStart(12,'0'),fixturePets[i%3].id,'2026-06-'+String(i+1).padStart(2,'0'),'food',fixturePets[i%3].name+' ate the recorded food today. '+ 'The owner recorded ordinary appetite and energy alongside the food observation. '.repeat(2)));
 const r=await exercise('List recorded food for Milo, Luna and Oscar.',{history:true,rows:entries,fixturePets,petId:fixturePets[0].id,conversationPetId:fixturePets[0].id,messages:[],interpretationProposal:{...plan,operation:'comparison',readOperation:'comparison',selection:'comparison',petNames:fixturePets.map(p=>p.name),terms:['food']}});
 for(const row of entries) assert.ok(r.result.reasoning.evidenceContract.represented.some(s=>s.sourceId==='care:'+row.id&&s.text===row.note));
 assert.ok(r.prompt.evidenceContract.unrepresentedSourceGroups.length);
 assert.ok(r.result.reasoning.evidenceContract.sources.length>r.prompt.evidenceContract.sources.length);
 noWrites(r);
});

test('whole-history improvement and recurrence does not inherit an invented medication filter',async t=>{
 clock(t);
 const entries=[care('course','oscar','2026-06-17','general','Oscar began a medication course.'),care('comfort','oscar','2026-07-01','general','Oscar was comfortable again.'),care('return','oscar','2026-08-12','symptom','Oscar was stiff again after a longer walk.')];
 const r=await exercise("In Oscar's notes, what improved and what later came back?",{history:true,rows:entries,messages:[],interpretationProposal:{...plan,operation:'recall',readOperation:'recall',selection:'reference',petNames:['Oscar'],terms:['medication']}});
 assert.deepEqual(r.context.askInterpretation.history.terms,[]);
 for(const row of entries) assert.ok(r.result.reasoning.evidenceContract.represented.some(s=>s.sourceId==='care:'+row.id));noWrites(r);
});
test('a named symptom still keeps its topic filter in a change question',async t=>{
 clock(t);const {normalizeAskReadProposal}=await import('../../app/lib/intelligence/ask-plan-recovery.ts');
 const {pets,ownerId}=await import('./fixtures/ask-lifetime-history.mjs');
 const context={owner:{userId:ownerId},eligiblePets:pets.slice(0,3),pet:pets[0],conversationTurns:[],currentMessage:"In Oscar's notes, what changed about his stiffness?"};
 const p={...plan,terms:['stiffness']};
 assert.deepEqual(normalizeAskReadProposal(p,context).terms,['stiffness']);
});

test('explicit four-day timeline retains all requested evidence after latest-only review',async t=>{
 clock(t);
 const entries=[
 care('j15','milo','2026-06-15','general','Milo had two soft stools.'),
 care('j20','milo','2026-06-20','general','Milo stools have been normal for three days.'),
 care('a8','milo','2026-08-08','general','Milo had one soft stool.'),
 care('a10','milo','2026-08-10','general','Milo stools are normal again.'),
 care('extra','milo','2026-07-01','general','Milo enjoyed brushing.')
 ];
 const r=await exercise('For Milo, list June 15, June 20, August 8 and August 10 in chronological order.',{
 history:true,rows:entries,messages:[],interpretationProposal:{...plan,operation:'general',readOperation:'general',selection:'latest',terms:[],from:null,to:null},
 providerResponse:async()=>{throw new Error('Timeline must not call the answer provider');},expectedProviderCalls:0,expectedReviewCalls:0});
 const answer=r.result.reasoning.answer.summary;
 for(const day of ['2026-06-15','2026-06-20','2026-08-08','2026-08-10'])assert.ok(answer.includes(day),answer);
 assert.ok(answer.indexOf('2026-06-15')<answer.indexOf('2026-06-20'));
 assert.ok(answer.indexOf('2026-06-20')<answer.indexOf('2026-08-08'));
 assert.ok(answer.indexOf('2026-08-08')<answer.indexOf('2026-08-10'));
 for(const detail of ['two soft stools','normal for three days','one soft stool','normal again'])assert.ok(answer.includes(detail),answer);
 assert.doesNotMatch(answer,/brushing/);noWrites(r);
});

test('causal follow-up reads the last user-established pet and both change dates',async t=>{
 clock(t);const {ownerId}=await import('./fixtures/ask-lifetime-history.mjs');
 const messages=[{id:'prior',user_id:ownerId,conversation_id:'chat',role:'user',user_text:"What did Luna's July 9 vet recommend, and what was changed on July 10?",sequence_number:1}];
 const entries=[care('advice','luna','2026-07-09','vet_visit','The vet asked us to restore Luna previous litter arrangement and monitor her.'),care('changes','luna','2026-07-10','general','We moved Luna tray back and returned to unscented litter. We changed both things together.')];
 const r=await exercise('Does that tell us which change caused the improvement?',{history:true,rows:entries,messages,
 interpretationProposal:{...plan,operation:'clarify',readOperation:'clarify',subject:'unclear',petNames:[],terms:[],from:null,to:null},
 providerOverrides:{historyNarrative:{sentences:[{text:'Both changes were made together on July 10, so the notes do not establish which caused improvement.',sourceIds:['care:changes']}]}},reviewResponse:{approved:true},expectedReviewCalls:1});
 assert.deepEqual(r.context.askInterpretation.petIds,['luna']);
 assert.match(r.result.reasoning.answer.summary,/both|Both/);assert.doesNotMatch(r.result.reasoning.answer.summary,/Which pet/);noWrites(r);
});
test('correction lookup can name an outside animal without granting that animal ownership',async t=>{
 clock(t);
 const r=await exercise('What does the August 20 correction say about Milo and Bruno?',{history:true,messages:[],fixturePets:correctionFixturePets.slice(0,3),
 rows:[care('fix','milo','2026-08-20','general','Correction: the vomiting report was about my sister dog Bruno, not Milo. Milo did not vomit.')],
 interpretationProposal:{...plan,operation:'clarify',readOperation:'clarify',subject:'unclear',petNames:['Milo','Bruno'],terms:[],from:null,to:null}});
 assert.deepEqual(r.context.askInterpretation.petIds,['milo']);assert.match(r.result.reasoning.answer.summary,/Bruno/);assert.match(r.result.reasoning.answer.summary,/not Milo/);noWrites(r);
});

test('two named future entries survive an invented current-status plan',async t=>{
 clock(t);const {pets}=await import('./fixtures/ask-lifetime-history.mjs');
 const entries=[care('f13','oscar','2026-09-13','general','Oscar walks were shortened.'),care('f14','oscar','2026-09-14','general','Oscar looked stiff after a nap.')];
 const r=await exercise("Do Oscar's September 13 and 14 entries prove a recurrence has already happened today?",{history:true,rows:entries,messages:[],fixturePets:pets.slice(0,3),
 interpretationProposal:{...plan,operation:'status',readOperation:'status',petNames:['Oscar'],selection:'latest',terms:['recurrence'],from:'2026-09-04',to:'2026-09-05'}});
 const answer=r.result.reasoning.answer.summary;
 assert.match(answer,/2026-09-13/);assert.match(answer,/2026-09-14/);assert.match(answer,/future-dated/);assert.match(answer,/not evidence that it has already happened/);noWrites(r);
});

test('a by-date food completion lookup recovers a valid half-range',async t=>{
 clock(t);
 const r=await exercise('Did Milo finish changing food by July 10?',{history:true,messages:[],
 rows:[care('food-done','milo','2026-07-10','food','Milo finished the food transition and eats only salmon-and-rice adult dry food.')],
 interpretationProposal:{...plan,operation:'status',readOperation:'status',selection:'period',terms:['food'],from:null,to:'2026-07-11'}});
 assert.equal(r.context.askInterpretation.history.from,'1900-01-01T00:00:00.000Z');
 assert.match(r.result.reasoning.answer.summary,/finished the food transition/);noWrites(r);
});
test('missing medicine-name question reads the named pet without episode clarification',async t=>{
 clock(t);const {pets}=await import('./fixtures/ask-lifetime-history.mjs');
 const r=await exercise('Does a missing medicine name mean Oscar was never prescribed anything?',{history:true,messages:[],fixturePets:pets.slice(0,3),
 rows:[care('rx','oscar','2026-06-17','vet_visit','Oscar was prescribed a seven-day medication course. I have not recorded the medicine name.')],
 interpretationProposal:{...plan,operation:'clarify',readOperation:'clarify',selection:'reference',petNames:['Oscar'],terms:['medicine'],from:null,to:null}});
 assert.deepEqual(r.context.askInterpretation.petIds,['oscar']);assert.equal(r.context.askInterpretation.clarification,null);
 assert.match(r.result.reasoning.answer.summary,/seven-day/);assert.doesNotMatch(r.result.reasoning.answer.summary,/Which pet/);noWrites(r);
});
test('an approving reviewer cannot turn an unrecorded diagnosis into no diagnosis made',async t=>{
 clock(t);
 const r=await exercise('Did the August 27 visit establish a diagnosis for Milo?',{history:true,messages:[],
 rows:[care('vet-no-record','milo','2026-08-27','vet_visit','The vet asked us to observe Milo comfort. I have not recorded a diagnosis or new medication instructions here.')],
 interpretationProposal:{...plan,operation:'recall',readOperation:'recall',selection:'reference',terms:['diagnosis'],from:'2026-08-27',to:'2026-08-28'},
 providerOverrides:{historyNarrative:{sentences:[{text:'The August 27 visit did not establish a diagnosis, and no diagnosis was recorded.',sourceIds:['care:vet-no-record']}]}},
 reviewResponse:{approved:true},expectedReviewCalls:0});
 assert.doesNotMatch(r.result.reasoning.answer.summary,/did not establish a diagnosis/);
 assert.match(r.result.reasoning.answer.summary,/not recorded a diagnosis/);noWrites(r);
});

test('standalone no cannot overstate a note with unrecorded diagnosis',async t=>{
 clock(t);
 const r=await exercise('Did the August 27 visit establish a diagnosis for Milo?',{history:true,messages:[],
 rows:[care('missing-dx','milo','2026-08-27','vet_visit','The vet asked us to observe Milo comfort. I have not recorded a diagnosis or new medication instructions here.')],
 interpretationProposal:{...plan,operation:'recall',readOperation:'recall',selection:'reference',terms:['diagnosis'],from:'2026-08-27',to:'2026-08-28'},
 providerOverrides:{historyNarrative:{sentences:[{text:'No.',sourceIds:['care:missing-dx']},{text:'No diagnosis was recorded there.',sourceIds:['care:missing-dx']}]}},
 reviewResponse:{approved:true},expectedReviewCalls:0});
 assert.doesNotMatch(r.result.reasoning.answer.summary,/^No[.!]/);
 assert.match(r.result.reasoning.answer.summary,/not recorded a diagnosis/);noWrites(r);
});

test('direct timeline requires complete scoped records and an unmixed request',async t=>{
 clock(t);
 const q='Milo: what happened on June 15, June 20, August 8, and August 10? Please show the events in chronological order.';
 const entries=[care('t1','milo','2026-06-15','general','Milo had two soft stools.'),care('t2','milo','2026-06-20','general','Milo stools were normal for three days.'),care('t3','milo','2026-08-08','general','Milo had one soft stool.'),care('t4','milo','2026-08-10','general','Milo stools were normal again.')];
 const r=await exercise(q,{history:true,rows:entries,messages:[],
 interpretationProposal:{...plan,operation:'recall',readOperation:'recall',selection:'period',terms:[],from:'2026-06-15',to:'2026-08-11'},
 providerResponse:async()=>{throw new Error('Primary provider unavailable');},expectedProviderCalls:0});
 assert.equal(r.result.reasoning.model,'server-history-timeline');noWrites(r);
 for(const detail of ['two soft stools','three days','one soft stool','normal again'])assert.ok(r.result.reasoning.answer.summary.includes(detail));
 const {directHistoryTimelineAnswer:direct}=await import('../../app/lib/intelligence/direct-history-timeline.ts');
 const original=r.result.reasoning.evidenceContract;
 assert.ok(direct(structuredClone(original)));
 for(const mutate of [
  e=>{e.scope.requestText+=' What caused these symptoms?';},
  e=>{e.scope.requestText+=' Milo is vomiting today.';},
  e=>{e.scope.status='ambiguous';},
  e=>{e.interpretation.readOnly=false;},
  e=>{e.interpretation.petIds=['foreign'];},
  e=>{e.history.corrections='unavailable';},
  e=>{e.represented=e.represented.filter(s=>s.occurredAt?.slice(0,10)!=='2026-06-15');},
  e=>{e.losses.push({sourceId:e.represented.find(s=>s.sourceType==='care_update').sourceId,reason:'source_deleted_or_changed'});},
  e=>{e.sources.forEach(s=>{s.status='unavailable';});}
 ]) {const e=structuredClone(original);mutate(e);assert.equal(direct(e),null);}
});

test('dated diagnosis question cannot ask which already-named pet',async t=>{
 clock(t);const {pets}=await import('./fixtures/ask-lifetime-history.mjs');
 const r=await exercise('Can you tell whether Oscar received a diagnosis at the August 27 visit?',{
 history:true,messages:[],fixturePets:pets.slice(0,3),
 rows:[care('diagnosis-visit','oscar','2026-08-27','vet_visit','The vet asked us to observe Oscar comfort. I have not recorded a diagnosis here.')],
 interpretationProposal:{...plan,operation:'clarify',readOperation:'clarify',subject:'explicit',petNames:['Oscar'],selection:'reference',terms:['diagnosis'],from:null,to:null}});
 assert.deepEqual(r.context.askInterpretation.petIds,['oscar']);assert.equal(r.context.askInterpretation.clarification,null);
 assert.match(r.result.reasoning.answer.summary,/not recorded a diagnosis/);assert.doesNotMatch(r.result.reasoning.answer.summary,/Which pet/);noWrites(r);
});

test('reviewed litter changes retain two bullets through final presentation', async t => {
 clock(t);
 const entries=[care('move','milo','2026-07-05','general','Milo litter tray moved from the spare room to the laundry room and changed to scented litter.'),care('restore','milo','2026-07-10','general','Milo litter tray returned to the spare room and unscented litter together.')];
 const sentences=[{text:'On July 5, Milo litter tray was moved from the spare room to the laundry room and the litter was changed to scented litter.',sourceIds:['care:move']},{text:'On July 10, Milo litter tray was returned to the spare room and the litter was changed back to unscented.',sourceIds:['care:restore']}];
 const r=await exercise('Please summarize Milo July litter changes in two bullets.',{history:true,rows:entries,messages:[],interpretationProposal:{...plan,topic:'litter',terms:['litter']},providerOverrides:{historyNarrative:{sentences:[{text:sentences.map(s=>s.text).join(' - '),sourceIds:['care:move','care:restore']}]}},reviewResponse:{approved:true},expectedReviewCalls:1});
 assert.equal(r.result.reasoning.answer.summary.split('\n').filter(line=>line.startsWith('- ')).length,2,JSON.stringify(r.result.reasoning.answer.summary));
 noWrites(r);
});
