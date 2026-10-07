import {certifiedHistoryRead} from './helpers/certified-history-read.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'server-only') return { shortCircuit: true, url: 'data:text/javascript,export default {}' };
  if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
    const url = new URL(specifier, context.parentURL);
    for (const suffix of ['.ts', '/index.ts']) if (existsSync(fileURLToPath(url.href + suffix))) return next(url.href + suffix, context);
  }
  return next(specifier, context);
} });
globalThis.fetch = async () => { throw new Error('Network forbidden in synthetic regression'); };
test('conversation previews use the same claim policy as a reloaded answer', async () => {
  const { toConversationSummary } = await import('../app/lib/ask-conversation-server.ts');
  const row = { id: 'chat', pet_profile_id: 'pet', title: 'My chosen title', status: 'active', last_activity_at: '2026-09-11',
    preview: 'Her profile is open. The math comes out to 20.', dog_profiles: { name: 'Clover' } };
  assert.equal(toConversationSummary(row).preview, 'The math comes out to 20.');
  assert.equal(toConversationSummary(row).title, row.title);
  assert.equal(row.preview, 'Her profile is open. The math comes out to 20.');
});
const { evidenceAnswerPolicy, evidenceSource, attributedHistoryAnswer } = await import('../app/lib/intelligence/ask-evidence.ts');
const { reviewHistoricalAnswer, readReviewedHistoryAnswer } = await import('../app/lib/intelligence/review-history-narrative.ts');
const { validateGeneratedAnswer } = await import('../app/lib/intelligence/validation/validate-answer.ts');
const names = { a: 'Aster', b: 'Birch', c: 'Clover' };
function fixture(ids = ['a', 'b']) {
  const plan = { from: null, to: null, terms: ['food'], interpretation: 'lexical' };
  const represented = ids.map(petId => { const text = `${names[petId]} ate wet food.`; return { sourceId: `care:${petId}`, petId, sourceType: 'care_update', field: 'value', start: 0, end: text.length, text, occurredAt: '2024-01-01T00:00:00Z' }; });
  return { version: 'ask-evidence.v1', scope: { authorizedPetIds: ids, requestedTopic: 'food', requestText: 'Compare the recorded food history for Aster and Birch.', requestedPeriod: { kind: 'unspecified', surface: null }, requestKind: 'comparison', status: 'resolved', readOnlyRecall: true },
    interpretation: { readOnly: true, topic: 'food', operation: 'comparison', selection: 'summary', history: plan }, petNames: names,
    sources: ids.map(id => evidenceSource(id, 'care_entries', [`care:${id}`])), represented, representation: 'complete', losses: [], verifiedFacts: [],
    completeness: { retrieval: 'unknown', corrections: 'unknown', extraction: 'unknown', grouping: 'unknown' },
    history: { plan, candidateIds: ids.map(id => `care:${id}`), queryCount: ids.length, retrieval: 'unknown', corrections: 'unknown', extraction: 'unknown', grouping: 'unknown', continuation: [], reasons: [], consistency: 'read_committed_no_snapshot', perPet: ids.map(petId => ({ petId, rows: 1, pages: 1, exhausted: true, status: 'unknown' })), provenance: ids.map(id => ({ sourceId: `care:${id}`, status: 'effective_linked', claimIds: [] })), claimSources: [], excludedIds: [] } };
}
function result(evidence, sourceIds = ['care:a']) { return { applicationActions: [], evidenceContract: evidence, historyNarrative: { sentences: [{ text: 'Aster ate wet food.', sourceIds }] }, historyNarrativeDeclined: false, safetyLevel: 'normal', responseMode: 'practical_guidance', answer: { title: 'Furvise', summary: 'Unreviewed answer.', sections: [], safetyNote: null }, relevantContextIds: [], referencedRecords: [], suggestedFollowUps: [] }; }
const context = { pet: { id: 'a', name: 'Aster', species: 'cat' }, eligiblePets: Object.entries(names).map(([id, name]) => ({ id, name })), currentMessage: 'Compare the recorded food history for Aster and Birch.', careEntries: [], memories: [] };
test("canonical review boundary: shared reviewer has one whole-answer contract without legacy subset approval instructions",async()=>{
 const e=fixture();await rejectUncertified(result(e));const f=await certifiedHistoryRead(e);assert.equal(f.response.model,'server-labs-list');assert.deepEqual(f.response.relevantContextIds,['care:a','care:b']);
});
async function rejectUncertified(r,options={}) {
 const before=structuredClone(r.evidenceContract);let calls=0;
 const approved=await reviewHistoricalAnswer({...options,result:r,client:{responses:{create:async()=>{calls++;throw Error('RETIRED_REVIEW_PROVIDER_FORBIDDEN');}}}});
 assert.equal(approved,false);assert.equal(calls,0);assert.equal(readReviewedHistoryAnswer(r),null);
 assert.deepEqual(r.evidenceContract,before);assert.deepEqual(r.applicationActions,[]);
}

test('extractive output retains all three pets and only supported source IDs', () => {
  const e = fixture(['a', 'b', 'c']); e.represented = e.represented.filter(s => s.petId !== 'b'); e.losses.push({ sourceId: 'care:b', reason: 'historical_evidence_budget' });
  const text = evidenceAnswerPolicy(e);
  assert.match(text, /Aster ate wet food/); assert.match(text, /Clover ate wet food/); assert.match(text, /Birch: Saved evidence was excluded/);
  assert.deepEqual(e.answerSourceIds, ['care:a', 'care:c']);
});
for (const mode of ['zero', 'retrieval', 'budget', 'attribution', 'partial-span', 'period-filter', 'unowned', 'corrections']) test(`empty usable evidence distinguishes ${mode}`, () => {
  const e = fixture(['b']);
  if (mode === 'zero') { e.represented = []; e.sources[0].loadedIds = []; e.sources[0].loadedCount = 0; e.history.candidateIds = []; e.history.perPet[0].rows = 0; e.history.provenance = []; }
  if (mode === 'retrieval') { e.represented = []; e.history.perPet[0].status = 'unavailable'; }
  if (mode === 'budget') { e.represented = []; e.losses = [{ sourceId: 'care:b', reason: 'historical_evidence_budget' }]; }
  if (mode === 'attribution') e.history.provenance[0].status = 'superseded';
  if (mode === 'partial-span') e.represented[0].start = 1;
  if (mode === 'period-filter') e.interpretation.history = { ...e.interpretation.history, from: '2025-01-01', to: '2026-01-01' };
  if (mode === 'unowned') e.sources[0].loadedIds = [];
  if (mode === 'corrections') e.history.corrections = 'unavailable';
  const text = evidenceAnswerPolicy(e); assert.match(text, /Birch/); assert.deepEqual(e.answerSourceIds, []);
  if (mode === 'zero') assert.match(text, /couldn't find matching saved notes/);
  else { assert.doesNotMatch(text, /couldn't find matching saved notes/); assert.doesNotMatch(text, /Birch ate wet food/); }
  if (mode === 'retrieval') assert.match(text, /couldn't check the saved history/);
  if (mode === 'budget') assert.match(text, /selection or size limits/);
  if (mode === 'attribution') assert.match(text, /correction or attribution/);
  if (mode === 'corrections') assert.match(text, /couldn't check corrections/);
});
test("canonical review boundary: reviewed subset is supplemented with a grounded second pet through actual final validation",async()=>{
 const e=fixture();await rejectUncertified(result(e));const f=await certifiedHistoryRead(e);assert.deepEqual(f.response.labsList.records.map(r=>r.petId),['a','b']);assert.match(f.validation.response.answer.summary,/Aster ate wet food/);assert.match(f.validation.response.answer.summary,/Birch ate wet food/);f.response.evidenceContract.history.ticketCoverage.status='unavailable';assert.equal(readReviewedHistoryAnswer(f.response),null);assert.equal(await reviewHistoricalAnswer({result:f.response}),false);
});
test("canonical review boundary: broad citations do not disguise missing subject prose",async()=>{
 await rejectUncertified(result(fixture(),['care:a','care:b']));const f=await certifiedHistoryRead(fixture());f.response.answer.summary='Aster ate wet food.';assert.equal(await reviewHistoricalAnswer({result:f.response}),false);assert.equal(readReviewedHistoryAnswer(f.response),null);
});
test("canonical review boundary: reviewed subset names a missing pet whose last source was budgeted out",async()=>{
 const e=fixture();e.represented.pop();e.losses.push({sourceId:'care:b',reason:'prompt_budget'});await rejectUncertified(result(e));const text=evidenceAnswerPolicy(e);assert.match(text,/Birch: Saved evidence was excluded/);assert.deepEqual(e.answerSourceIds,['care:a']);assert.doesNotMatch(text,/couldn't find matching saved notes/);
});
test("canonical review boundary: superseded and unauthorized evidence cannot be used as supplements",async()=>{
 const e=fixture();e.history.provenance[1].status='superseded';e.represented.push({...e.represented[1],sourceId:'care:private',petId:'private',text:'Secret food.'});await rejectUncertified(result(e));const text=evidenceAnswerPolicy(e);assert.match(text,/Birch:.*attribution/);assert.doesNotMatch(text,/Birch ate wet food|Secret/);assert.deepEqual(e.answerSourceIds,['care:a']);
});
test("canonical review boundary: current emergency still supersedes a reviewed comparison",async()=>{
 const f=await certifiedHistoryRead(fixture());const emergencyContext={...context,owner:{userId:'owner'},eligiblePets:context.eligiblePets.map(p=>({...p,user_id:'owner'})),currentMessage:'Aster cannot breathe and is collapsing now.'};const {resolveSafetyState}=await import('../app/lib/intelligence/safety-state.ts');const safety=resolveSafetyState({...emergencyContext,activeConcerns:[],recentlyResolvedConcerns:[],activeEpisodes:[],monitoringEpisodes:[],currentState:null});assert.equal(safety.currentMessageEmergency,true);const v=validateGeneratedAnswer(f.response,emergencyContext,'emergency',['a','b'],safety);assert.equal(v.valid,true,v.errors.join());assert.equal(v.response.model,'server-current-emergency');assert.deepEqual(v.response.relevantContextIds,[]);assert.ok(v.repairs.includes('preserved_current_emergency_priority'));assert.doesNotMatch(v.response.answer.summary,/ate wet food/);
});
test('multi-pet correction quote still supplies an outcome for the other pet', () => {
  const e = fixture(); e.scope.requestText = 'Compare the food corrections for Aster and Birch.';
  e.history.provenance[0].status = 'unlinked_correction_uncertain';
  const text = attributedHistoryAnswer(e);
  assert.match(text, /link to the original report has not been verified/); assert.match(text, /Birch ate wet food/);
  assert.deepEqual(e.answerSourceIds, ['care:a', 'care:b']);
});
test("canonical review boundary: already covered pets keep the reviewed subset without duplicate extracts",async()=>{
 const r=result(fixture());r.historyNarrative.sentences.push({text:'Birch ate wet food.',sourceIds:['care:b']});await rejectUncertified(r);const f=await certifiedHistoryRead(fixture());assert.equal(f.response.answer.summary.split('Birch ate wet food.').length-1,1);assert.deepEqual(f.response.relevantContextIds,['care:a','care:b']);
});
test('unsupported quantitative prose is rejected before the reviewer can approve it', async () => {
  const r = result(fixture()); r.historyNarrative.sentences[0].text = 'Aster ate wet food for 99 days.';
  let calls = 0;
  assert.equal(await reviewHistoricalAnswer({ result: r, client: { responses: { create: async () => { calls++; throw new Error('Must not call reviewer'); } } } }), false);
  assert.equal(calls, 0); assert.equal(readReviewedHistoryAnswer(r), null);
});
test('unavailable corrections still block review and give each pet a limitation', async () => {
  const e = fixture(); e.history.corrections = 'unavailable'; const r = result(e);
  assert.equal(await reviewHistoricalAnswer({ result: r, client: { responses: { create: async () => { throw new Error('Must not review uncertain attribution'); } } } }), false);
  const text = evidenceAnswerPolicy(e);
  assert.match(text, /Aster: I couldn't check corrections/); assert.match(text, /Birch: I couldn't check corrections/);
  assert.deepEqual(e.answerSourceIds, []);
});
test('real representation contract records a missing span without manufacturing no-match', async () => {
  const { representEvidence } = await import('../app/lib/intelligence/ask-evidence.ts');
  const e = fixture(); e.losses.push({ sourceId: 'care:b', reason: 'context_budget' });
  representEvidence(e, [{ id: 'care:a', petId: 'a', sourceType: 'care_update', value: 'Aster ate wet food.', occurredAt: '2024-01-01T00:00:00Z' }]);
  assert.equal(e.representation, 'partial');
  const text = evidenceAnswerPolicy(e);
  assert.match(text, /Birch: Saved evidence was excluded/); assert.doesNotMatch(text, /couldn't find matching/);
});
test('legacy empty-search marker cannot override known representation loss', () => {
  const e = fixture(['b']); delete e.interpretation; e.represented = [];
  e.history.reasons.push('no_matching_candidates_not_absence'); e.losses.push({ sourceId: 'care:b', reason: 'historical_evidence_budget' });
  assert.match(evidenceAnswerPolicy(e), /selection or size limits/);
});

test("canonical review boundary: supplemented source quotations survive prose sanitation byte for byte",async()=>{
 const e=fixture(),source=e.represented[1];source.text='Birch ate wet food. I have recorded no allergy diagnosis.';source.end=source.text.length;await rejectUncertified(result(e));const f=await certifiedHistoryRead(e);assert.ok(f.validation.response.answer.summary.includes(JSON.stringify(source.text)));assert.equal(f.response.labsList.records[1].body,source.text);const {presentationOnlyAskResponse}=await import('../app/lib/ask-conversation-server.ts');const displayed=presentationOnlyAskResponse({...f.validation.response.answer,applicationActions:[]},[]);assert.ok(displayed.summary.includes(JSON.stringify(source.text)));
});

test('unrelated projection losses do not turn an exhausted empty history search into retrieval failure', () => {
 const e=fixture(['b']);e.represented=[];e.sources[0].loadedIds=[];e.sources[0].loadedCount=0;
 e.history.candidateIds=[];e.history.perPet[0].rows=0;e.history.provenance=[];
 e.representation='partial';e.losses=[{sourceId:'episode:unrelated',reason:'episode_projection'}];
 assert.match(evidenceAnswerPolicy(e),/couldn't find matching saved notes/);
});

test("canonical review boundary: reviewed cross-pet sentence with each named and cited pet does not append duplicate extracts",async()=>{
 const r=result(fixture(),['care:a','care:b']);r.historyNarrative.sentences[0].text='Aster ate wet food, and Birch ate wet food.';await rejectUncertified(r);const f=await certifiedHistoryRead(fixture());assert.deepEqual(f.response.relevantContextIds,['care:a','care:b']);for(const name of ['Aster','Birch'])assert.equal(f.validation.response.answer.summary.split(name+' ate wet food.').length-1,1);
});
test("canonical review boundary: mentioning another pet without citing its records does not satisfy coverage",async()=>{
 const r=result(fixture(),['care:a']);r.historyNarrative.sentences[0].text='Aster ate wet food; Birch is also in the question.';await rejectUncertified(r);const f=await certifiedHistoryRead(fixture());f.response.relevantContextIds=['care:a'];assert.equal(await reviewHistoricalAnswer({result:f.response}),false);
});
test("canonical review boundary: single-sentence history keeps its uncertainty in the same sentence",async()=>{
 const e=fixture(['a']);e.scope.requestText='Write one sentence about Aster food.';e.history.reasons=['unlinked_correction_uncertain'];await rejectUncertified(result(e));e.history.provenance[0].status='unlinked_correction_uncertain';const text=attributedHistoryAnswer(e);assert.match(text,/An unlinked correction leaves attribution uncertain; I cannot confirm which reports it changes/);assert.doesNotMatch(text,/Aster ate wet food/);assert.deepEqual(e.answerSourceIds,[]);
});

test("canonical review boundary: old reports cannot become an unattributed present food state even if a reviewer would approve",async()=>{
 const e=fixture(['a']),r=result(e);for(const text of ['Aster eats wet food.','The January 1 note says Aster eats wet food.']){r.historyNarrative.sentences[0].text=text;await rejectUncertified(r);}const f=await certifiedHistoryRead(e);assert.match(f.response.answer.summary,/2024-01-01/);assert.ok(f.response.answer.summary.includes(JSON.stringify('Aster ate wet food.')));assert.doesNotMatch(f.response.answer.summary,/Aster eats wet food/);
});

test("canonical review boundary: cleanup cannot leave only a disclaimer or restore a false save claim",async()=>{
 const e=fixture(['a']),r=result(e);r.historyNarrative.sentences[0].text='I recorded Aster ate wet food.';await rejectUncertified(r);const f=await certifiedHistoryRead(e);assert.match(f.validation.response.answer.summary,/Aster ate wet food/);assert.doesNotMatch(f.validation.response.answer.summary,/I recorded/);assert.deepEqual(f.response.relevantContextIds,['care:a']);
});

test('dated observation attribution survives state governance and stored presentation', async () => {
 const {enforceVerifiedStateClaims,containsUnverifiedStateClaim}=await import('../app/lib/application-actions/state-claims.ts');
 const {presentationOnlyAskResponse}=await import('../app/lib/ask-conversation-server.ts');
 for (const fact of [
  'The newest observation was recorded on September 4: Cedar was comfortable.',
  'As of September 7, the latest saved update was recorded on September 4: Cedar jumped comfortably.',
  'The note says no cause was recorded.',
  'As of September 7, the latest update was recorded on September 4, 2026: Cedar jumped comfortably.'
 ]) {
  assert.equal(enforceVerifiedStateClaims(fact, false), fact);
  assert.equal(presentationOnlyAskResponse({title:'Furvise',summary:fact,sections:[]},[]).summary, fact);
 }
 for (const claim of [
  'The note was recorded on September 4 by Furvise.',
  'Her profile was recorded on September 4.',
  'The observation was recorded on September 4, and her profile was deleted.',
  'I recorded the observation on September 4.'
 ]) assert.equal(containsUnverifiedStateClaim(claim), true, claim);
});

test("canonical review boundary: structured current-report drafts receive owner provenance without a paid repair",async()=>{
 const e=fixture(['a']);e.scope.requestText='I have leftover 5mg tablets. Summarize my report, without saving.';e.interpretation.request={mode:'history',outputFormat:'prose',evidenceNeeds:[]};const r=result(e);r.historyNarrative.sentences[0].text='You report having leftover 5 mg tablets.';await rejectUncertified(r);assert.deepEqual(r.historyNarrative.sentences[0].sourceIds,['care:a']);assert.deepEqual(r.applicationActions,[]);
});
test("canonical review boundary: owner provenance does not waive an invented quantity or multi-pet ambiguity",async()=>{
 for(const ids of [['a'],['a','b']]){const e=fixture(ids);e.scope.requestText='I have leftover 5mg tablets.';e.interpretation.request={mode:'history',outputFormat:'prose',evidenceNeeds:[]};const r=result(e);r.historyNarrative.sentences[0].text=ids.length===1?'You report having 50 mg tablets.':'Aster has 5 mg tablets.';await rejectUncertified(r);assert.equal(readReviewedHistoryAnswer(r),null);}
});
test("canonical review boundary: incidental note subsets are reviewed, while requested exact counts still require proof",async()=>{
 for(const quantity of [undefined,'records']){const e=fixture(['a']);e.represented.push({...e.represented[0],sourceId:'care:extra'});e.sources[0].loadedIds.push('care:extra');e.history.provenance.push({sourceId:'care:extra',status:'effective_linked',claimIds:[]});e.scope.requestText=quantity?'Give an exact count of all saved notes.':'Summarize the food notes.';e.interpretation.request={mode:'history',outputFormat:'prose',evidenceNeeds:[],quantity};const r=result(e,['care:a','care:extra']);r.historyNarrative.sentences[0].text='One note reports wet food.';await rejectUncertified(r);}const f=await certifiedHistoryRead(fixture());assert.equal(f.response.labsList.records.length,2);assert.deepEqual(f.response.labsList.calculations,[]);
});
test("canonical review boundary: unique date citations are candidates for independent review, never automatic approval",async()=>{
 const e=fixture(['a']);e.scope.requestText='Summarize the January 1 and January 3, 2024 food notes.';const extra={...e.represented[0],sourceId:'care:later',occurredAt:'2024-01-03T12:00:00Z',text:'Aster ate dry food.'};extra.end=extra.text.length;e.represented.push(extra);e.sources[0].loadedIds.push(extra.sourceId);e.history.provenance.push({sourceId:extra.sourceId,status:'effective_linked',claimIds:[]});const r=result(e);r.historyNarrative.sentences[0].text='The January 1 and January 3, 2024 notes report food.';await rejectUncertified(r);assert.deepEqual(r.historyNarrative.sentences[0].sourceIds,['care:a']);const f=await certifiedHistoryRead(e);assert.deepEqual(f.response.labsList.records.map(r=>r.event_at),['2024-01-01T00:00:00Z','2024-01-03T12:00:00Z']);
});

test("canonical review boundary: targeted repair reconstructs the full answer and still requires independent approval",async()=>{
 for(const repairAttempted of [false,true]){const e=fixture(['a']);e.scope.requestText='I think the redness returned. Summarize my report.';e.interpretation.request={mode:'history',outputFormat:'prose',evidenceNeeds:[]};const r=result(e);r.historyNarrative.sentences[0].text='The redness returned.';await rejectUncertified(r,{repairAttempted});assert.equal(r.historyNarrative.sentences[0].text,'The redness returned.');}
});

const {readPartialHistoryReview} = await import('../app/lib/intelligence/history-review-state.ts');
test("canonical review boundary: deterministic anchor failure uses bounded prose repair despite generic action-policy feedback",async()=>{
 const e=fixture(['a']),r=result(e);r.historyNarrative.sentences[0].text='Aster ate 800 g of wet food.';await rejectUncertified(r);const f=await certifiedHistoryRead(e);assert.doesNotMatch(f.response.answer.summary,/800/);assert.deepEqual(f.response.relevantContextIds,['care:a']);
});
function partialFixture() {
 const e=fixture(['a']);
 e.scope.requestText='Describe Aster’s food history and explain whether I should restart leftover prescription tablets.';
 e.interpretation.request={mode:'read',outputFormat:'prose',evidenceNeeds:[]};
 const r=result(e);
 r.intelligenceSafety={level:'routine'};
 r.historyNarrative.sentences=[
  {text:'Aster ate wet food.',sourceIds:['care:a']},
  {text:'Ask the prescribing veterinarian before restarting leftover prescription medication.',sourceIds:['request:current']},
  {text:'Aster has a confirmed new diagnosis.',sourceIds:['care:a']},
 ];
 return r;
}
function partialDenial(count,flags) {return {status:'completed',output_text:JSON.stringify({approved:false,rejectionReason:'The diagnosis is unsupported; other independent answers remain useful.',actionVerdicts:[],independentSentenceSupport:flags,
 obligations:{obligation_0:{status:'missing',sentenceSupport:Array(count).fill(false),actionSupport:[]}}})};}
test("canonical review boundary: whole-task rejection retains independently reviewed guidance, never unsupported clauses or completion authority",async()=>{
 const r=partialFixture();await rejectUncertified(r,{repairAttempted:true});assert.equal(readPartialHistoryReview(r),null);assert.equal(readPartialHistoryReview(structuredClone(r)),null);const v=validateGeneratedAnswer(r,{...context,currentMessage:r.evidenceContract.scope.requestText},'routine',['a']);assert.doesNotMatch(v.response.answer.summary,/confirmed new diagnosis/);assert.equal(v.assessment.checks.taskCompletion,'failed');
});
test("canonical review boundary: unchecked chunks and invalid numeric anchors never become partial approval",async()=>{
 for(const flags of [[false,false,false],[true,true,true]]){const r=partialFixture();r.historyNarrative.sentences[2].text='Aster weighs 500 kg.';await rejectUncertified(r,{client:{responses:{create:async()=>partialDenial(3,flags)}}});assert.equal(readPartialHistoryReview(r),null);assert.equal(readReviewedHistoryAnswer(r),null);}
});
test('a tenant-supplied completed-note field cannot authorize factual review or duplicate actions',async()=>{
 const r=partialFixture();r.evidenceContract.completedOwnerNote={sourceMessageId:'source',petId:'a',entryIds:['saved']};
 await rejectUncertified(r,{repairAttempted:true});assert.deepEqual(r.applicationActions,[]);assert.equal(readPartialHistoryReview(r),null);
});

test("canonical review boundary: subscription history boundary does not skip review of independent answer parts",async()=>{
 const r=partialFixture();r.historyNarrative.sentences=r.historyNarrative.sentences.slice(0,2);r.evidenceContract.historyAccess={from:'2021-09-15T00:00:00.000Z',to:'2026-09-16T00:00:00.000Z'};r.evidenceContract.history.reasons=['requested_period_outside_subscription_window'];await rejectUncertified(r,{repairAttempted:true});assert.equal(readPartialHistoryReview(r),null);const v=validateGeneratedAnswer(r,{...context,currentMessage:r.evidenceContract.scope.requestText},'routine',['a']);assert.equal(v.assessment.checks.taskCompletion,'failed');
});

test("canonical review boundary: completed explicit month removes partial-summary prefix even when wording is classified as overview",async()=>{
 const e=fixture(['a']);e.scope.requestText="What happened with Aster's food in April 2019?";e.scope.requestKind='overview';e.represented[0].occurredAt='2019-04-15T12:00:00Z';e.represented[0].text='Aster started a sensitive-stomach food trial.';e.represented[0].end=e.represented[0].text.length;const r=result(e);r.historyNarrative.sentences[0].text='Partial summary: Aster started a sensitive-stomach food trial.';await rejectUncertified(r);const f=await certifiedHistoryRead(e,{temporal:{from:'2019-04-01T00:00:00Z',to:'2019-05-01T00:00:00Z',anchor:null}});assert.doesNotMatch(f.response.answer.summary,/partial summary/i);assert.match(f.response.answer.summary,/sensitive-stomach food trial/);assert.deepEqual(f.response.relevantContextIds,['care:a']);
});
