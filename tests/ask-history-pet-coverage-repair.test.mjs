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
function result(evidence, sourceIds = ['care:a']) { return { evidenceContract: evidence, historyNarrative: { sentences: [{ text: 'Aster ate wet food.', sourceIds }] }, historyNarrativeDeclined: false, safetyLevel: 'normal', responseMode: 'practical_guidance', answer: { title: 'Furvise', summary: 'Unreviewed answer.', sections: [], safetyNote: null }, relevantContextIds: [], referencedRecords: [], suggestedFollowUps: [] }; }
const context = { pet: { id: 'a', name: 'Aster', species: 'cat' }, eligiblePets: Object.entries(names).map(([id, name]) => ({ id, name })), currentMessage: 'Compare the recorded food history for Aster and Birch.', careEntries: [], memories: [] };
async function review(r, indexes = [0]) {
  let calls = 0;
  const approved = await reviewHistoricalAnswer({ result: r, client: { responses: { create: async () => { calls++; return { status: 'completed', output_text: JSON.stringify({ approved: true, retainedSentenceIndexes: indexes }), usage: { input_tokens: 100, output_tokens: 15 } }; } } } });
  assert.equal(calls, 1); assert.equal(approved, true);
  return readReviewedHistoryAnswer(r);
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
test('reviewed subset is supplemented with a grounded second pet through actual final validation', async () => {
  const e = fixture(); const r = result(e); const receipt = await review(r);
  assert.match(receipt.text, /Aster ate wet food/); assert.match(receipt.text, /Birch ate wet food/);
  assert.deepEqual(receipt.sourceIds, ['care:a', 'care:b']);
  const validated = validateGeneratedAnswer(r, context, 'routine', ['a', 'b']);
  assert.equal(validated.valid, true, validated.errors.join(','));
  assert.match(validated.response.answer.summary, /Birch ate wet food/);
  assert.deepEqual(validated.response.relevantContextIds, ['care:a', 'care:b']);
  assert.deepEqual(validated.response.referencedRecords.map(s => s.petId), ['a', 'b']);
  r.evidenceContract.losses.push({ sourceId: 'care:b', reason: 'changed' });
  assert.equal(readReviewedHistoryAnswer(r), null, 'evidence changes invalidate receipt');
});
test('broad citations do not disguise missing subject prose', async () => {
  const receipt = await review(result(fixture(), ['care:a', 'care:b']));
  assert.match(receipt.text, /Birch ate wet food/);
});
test('reviewed subset names a missing pet whose last source was budgeted out', async () => {
  const e = fixture(); e.represented.pop(); e.losses.push({ sourceId: 'care:b', reason: 'prompt_budget' });
  const r = result(e); const receipt = await review(r);
  assert.match(receipt.text, /Birch: Saved evidence was excluded/); assert.deepEqual(receipt.sourceIds, ['care:a']);
  const v = validateGeneratedAnswer(r, context, 'routine', ['a', 'b']);
  assert.match(v.response.answer.summary, /Birch: Saved evidence was excluded/);
});
test('superseded and unauthorized evidence cannot be used as supplements', async () => {
  const e = fixture(); e.history.provenance[1].status = 'superseded';
  e.represented.push({ ...e.represented[1], sourceId: 'care:private', petId: 'private', text: 'Secret food.' });
  const receipt = await review(result(e)); assert.match(receipt.text, /Birch:.*attribution/);
  assert.doesNotMatch(receipt.text, /Birch ate wet food|Secret/); assert.deepEqual(receipt.sourceIds, ['care:a']);
});
test('current emergency still supersedes a reviewed comparison', async () => {
  const r = result(fixture()); await review(r);
  const v = validateGeneratedAnswer(r, { ...context, currentMessage: 'Aster cannot breathe and is collapsing now.' }, 'emergency', ['a', 'b']);
  assert.ok(v.repairs.includes('preserved_current_emergency_priority'));
  assert.doesNotMatch(v.response.answer.summary, /ate wet food/);
});
test('multi-pet correction quote still supplies an outcome for the other pet', () => {
  const e = fixture(); e.scope.requestText = 'Compare the food corrections for Aster and Birch.';
  e.history.provenance[0].status = 'unlinked_correction_uncertain';
  const text = attributedHistoryAnswer(e);
  assert.match(text, /link to the original report has not been verified/); assert.match(text, /Birch ate wet food/);
  assert.deepEqual(e.answerSourceIds, ['care:a', 'care:b']);
});
test('already covered pets keep the reviewed subset without duplicate extracts', async () => {
  const r = result(fixture()); r.historyNarrative.sentences.push({ text: 'Birch ate wet food.', sourceIds: ['care:b'] });
  const receipt = await review(r, [0, 1]);
  assert.equal(receipt.text.split('Birch ate wet food.').length - 1, 1);
  assert.deepEqual(receipt.sourceIds, ['care:a', 'care:b']);
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

test('supplemented source quotations survive prose sanitation byte for byte', async () => {
 const e=fixture();const source=e.represented.find(s=>s.petId==='b');
 source.text='Birch ate wet food. I have recorded no allergy diagnosis.';source.end=source.text.length;
 const r=result(e);await review(r);
 const v=validateGeneratedAnswer(r,context,'routine',['a','b']);
 assert.ok(v.response.answer.summary.includes(JSON.stringify(source.text)),v.response.answer.summary);
 assert.equal(v.valid,true,v.errors.join(','));
 const {enforceVerifiedStateClaims}=await import('../app/lib/application-actions/state-claims.ts');
 const {presentationOnlyAskResponse}=await import('../app/lib/ask-conversation-server.ts');
 const displayed=presentationOnlyAskResponse({...v.response.answer,summary:enforceVerifiedStateClaims(v.response.answer.summary,false),applicationActions:[]},[]);
 assert.ok(displayed.summary.includes(JSON.stringify(source.text)),displayed.summary);
});

test('unrelated projection losses do not turn an exhausted empty history search into retrieval failure', () => {
 const e=fixture(['b']);e.represented=[];e.sources[0].loadedIds=[];e.sources[0].loadedCount=0;
 e.history.candidateIds=[];e.history.perPet[0].rows=0;e.history.provenance=[];
 e.representation='partial';e.losses=[{sourceId:'episode:unrelated',reason:'episode_projection'}];
 assert.match(evidenceAnswerPolicy(e),/couldn't find matching saved notes/);
});
