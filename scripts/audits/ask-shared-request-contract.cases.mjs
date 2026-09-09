import assert from 'node:assert/strict';
import test from 'node:test';
import { exercise, clock } from './helpers/lifetime-harness.mjs';
import { care, pets, ownerId } from './fixtures/ask-lifetime-history.mjs';
import { validateAskRequest, ASK_REQUEST_VERSION } from '../../app/lib/intelligence/ask-request-contract.ts';
import { emptyProposedSemanticFrame } from '../../app/lib/intelligence/semantic-frame/extract-frame.ts';
import { requestReferenceContext } from '../../app/lib/intelligence/request-reference-context.ts';
import { parseTaskHistoryReview } from '../../app/lib/intelligence/history-review-selection.ts';
import { verifiedCalculationQuantities, parseHistoryCalculations } from '../../app/lib/intelligence/history-calculation.ts';

const fixturePets = pets.slice(0, 3).map((pet, index) => ({ ...pet, name: ['Aster', 'Bramble', 'Cedar'][index] }));
const context = { owner: { userId: ownerId }, eligiblePets: fixturePets, pet: fixturePets[0],
  currentMessage: 'Compare the saved observations.', conversationTurns: [] };
const proposal = patch => ({ version: ASK_REQUEST_VERSION, mode: 'read', question: 'What is recorded about Aster?',
  requirements: ['Answer the requested facts only'], referenceTurnIds: [], scope: 'named', petNames: ['Aster'],
  operation: 'recall', selection: 'summary', quantity: null, topic: 'observations', terms: [],
  from: null, to: null, episodeTopic: null, ordinal: null, frame: emptyProposedSemanticFrame(), ...patch });

test('referenced assistant and repeated user turns retain their distinct IDs', () => {
  const turns = Array.from({ length: 12 }, (_, i) => ({ id: 'turn-' + i, role: i % 2 ? 'furvise' : 'user', text: 'Repeated wording' }));
  const result = requestReferenceContext(turns, ['turn-1', 'turn-2', 'missing']);
  assert.ok(result.turns.some(turn => turn.id === 'turn-1' && turn.role === 'furvise'));
  assert.ok(result.turns.some(turn => turn.id === 'turn-2'));
  assert.deepEqual(result.missingReferenceIds, ['missing']);
  assert.ok(result.turns.length <= 8);
  assert.match(result.purpose, /not_medical_evidence/);
});
test('task review cannot approve omitted requirements or references to discarded prose', () => {
  const complete = { approved: true, retainedSentenceIndexes: [0, 1], obligations: [
    { index: 0, status: 'answered', sentenceIndexes: [0] }, { index: 1, status: 'limited', sentenceIndexes: [1] }] };
  assert.equal(parseTaskHistoryReview(complete, 2, 2).approved, true);
  for (const patch of [{ obligations: complete.obligations.slice(0, 1) },
    { obligations: [complete.obligations[0], { index: 1, status: 'missing', sentenceIndexes: [] }] },
    { retainedSentenceIndexes: [0] }, { obligations: [complete.obligations[0], complete.obligations[0]] }]) {
    assert.throws(() => parseTaskHistoryReview({ ...complete, ...patch }, 2, 2));
  }
});
test('generic arithmetic verifies literal operands and dimensions independently of wording', () => {
  const sources = [{ sourceId: 'a', text: 'Recorded amount 12 kg.', occurredAt: '2026-05-01T00:00:00.000Z' },
    { sourceId: 'b', text: 'Recorded amount 9 kg.', occurredAt: '2026-05-05T00:00:00.000Z' }];
  const operands = [{ sourceId: 'a', field: 'text', literal: '12 kg' }, { sourceId: 'b', field: 'text', literal: '9 kg' }];
  for (const [operation, value, unit] of [['difference', -3, 'kg'], ['sum', 21, 'kg'], ['ratio', .75, ''], ['percent_change', -25, '%']]) {
    assert.ok(verifiedCalculationQuantities([{ operation, operands, value, unit }], sources));
    assert.equal(verifiedCalculationQuantities([{ operation, operands, value: 500, unit }], sources), null);
  }
  assert.deepEqual(verifiedCalculationQuantities([{ operation: 'convert', operands: operands.slice(0, 1), value: 12000, unit: 'g' }], sources), ['12000:g']);
  assert.equal(verifiedCalculationQuantities([{ operation: 'convert', operands: operands.slice(0, 1), value: 12000, unit: 'ml' }], sources), null);
  assert.equal(verifiedCalculationQuantities([{ operation: 'convert', operands: [{ ...operands[0], literal: '2 kg' }], value: 2000, unit: 'g' }], sources), null);
  assert.equal(verifiedCalculationQuantities([{ operation: 'convert', operands: [{ ...operands[0], sourceId: 'foreign' }], value: 12000, unit: 'g' }], sources), null);
  assert.deepEqual(verifiedCalculationQuantities([{ operation: 'elapsed_days', operands: sources.map(source => ({ sourceId: source.sourceId, field: 'occurredAt', literal: source.occurredAt })), value: 4, unit: 'days' }], sources), ['4:day']);
  assert.equal(parseHistoryCalculations([{ operation: 'eval', operands, value: 3, unit: 'kg' }]), null);
});
test('derived quantity passes shared generation without question-pattern arithmetic', async t => {
  clock(t);
  const answer = 'The recorded decrease was 3 kg.';
  const r = await exercise('Calculate the difference between those recorded amounts.', { fixturePets,
    rows: [care('a', 'milo', '2026-06-04', 'general', 'Aster had a recorded amount of 12 kg.'), care('b', 'milo', '2026-06-05', 'general', 'Aster had a recorded amount of 9 kg.')], messages: [], history: true,
    interpretationProposal: proposal({ quantity: 'measurement', operation: 'comparison' }), providerOverrides: { historyNarrative: { sentences: [{ text: answer, sourceIds: ['care:a', 'care:b'], calculations: [{ operation: 'difference', operands: [
      { sourceId: 'care:a', field: 'text', literal: '12 kg' }, { sourceId: 'care:b', field: 'text', literal: '9 kg' }], value: -3, unit: 'kg' }] }] } },
    reviewResponse: { approved: true }, expectedReviewCalls: 1 });
  assert.equal(r.result.reasoning.answer.summary, answer);
});

for (const quantity of ['records', 'measurement', 'duration', null]) test(`quantity axis prevents episode routing: ${quantity}`, () => {
  const result = validateAskRequest(proposal({ operation: 'count', quantity }), context);
  assert.equal(result.readOperation, 'recall');
  assert.equal(result.episodeTopic, null);
  assert.equal(result.readOnly, true);
});
test('true episode counts retain their independent membership path', () => {
  const result = validateAskRequest(proposal({ operation: 'count', quantity: 'episodes', episodeTopic: 'breathing' }), context);
  assert.equal(result.readOperation, 'count');
  assert.equal(result.episodeTopic, 'breathing');
});
for (const [from, to] of [[null, '2026-07-01'], ['2026-07-01', null], [null, null]]) test(`open temporal interval ${from}/${to}`, () => {
  const result = validateAskRequest(proposal({ from, to }), context);
  assert.equal(result.history.from, from && from + 'T00:00:00.000Z');
  assert.equal(result.history.to, to && to + 'T00:00:00.000Z');
});
for (const patch of [{ from: '2026-02-30' }, { from: '2026-07-02', to: '2026-07-01' },
  { petNames: ['Foreign animal'] }, { terms: ['x; DROP TABLE'] }, { referenceTurnIds: ['invented'] },
  { extra: 'untrusted' }, { operation: 'episode', ordinal: null }, { operation: 'recall', ordinal: 'second' },
  { scope: 'none', petNames: ['Aster'] }, { scope: 'selected', petNames: ['Bramble'] }]) {
  test('reject invalid authority or metadata: ' + JSON.stringify(patch), () => assert.throws(() => validateAskRequest(proposal(patch), context)));
}
test('reading one pet does not require selecting every name mentioned', () => {
  const result = validateAskRequest(proposal({ petNames: ['Bramble'] }), { ...context, currentMessage: 'Aster is selected; read Bramble records.' });
  assert.deepEqual(result.petIds, ['luna']);
});
test('account scope expands authenticated profiles and rejects foreign names', () => {
  assert.deepEqual(validateAskRequest(proposal({ scope: 'account', petNames: [] }), context).petIds, fixturePets.map(p => p.id));
  assert.throws(() => validateAskRequest(proposal({ scope: 'account', petNames: ['Foreign'] }), context));
});
test('reference metadata identifies discourse without supplying source evidence', () => {
  const c = { ...context, currentMessage: 'And that value?', conversationTurns: [
    { id: 'user-switch', role: 'user', text: 'Now Bramble, please.' },
    { id: 'answer-ref', role: 'furvise', text: 'An unverified statement.' },
  ] };
  const result = validateAskRequest(proposal({ scope: 'conversation', petNames: ['Bramble'], referenceTurnIds: ['user-switch', 'answer-ref'], question: 'What value is actually saved for Bramble?' }), c);
  assert.deepEqual(result.petIds, ['luna']);
  assert.equal(result.referenceQuestion, 'What value is actually saved for Bramble?');
  assert.deepEqual(result.frame, emptyProposedSemanticFrame());
  assert.throws(() => validateAskRequest(proposal({ scope: 'conversation', petNames: ['Cedar'] }), c));
});
test('a read contract cannot grant writes even with an assertion-looking premise', () => {
  const result = validateAskRequest(proposal({ frame: { forged: 'save this' } }), { ...context, currentMessage: 'Aster has a diagnosis. Is that premise supported?' });
  assert.equal(result.readOnly, true);
  assert.deepEqual(result.frame, emptyProposedSemanticFrame());
});

for (const [topic, note, answer] of [
  ['grooming', 'Aster was brushed on June 4.', 'Aster was brushed on June 4.'],
  ['sleep', 'Aster slept normally on June 4.', 'Aster slept normally on June 4.'],
  ['travel', 'Aster visited the cabin on June 4.', 'Aster visited the cabin on June 4.'],
]) test('shared route preserves reviewed answer across unseen topics: ' + topic, async t => {
  clock(t);
  const r = await exercise('Tell me the saved ' + topic + ' observation for Aster.', { fixturePets, rows: [care('record', 'milo', '2026-06-04', 'general', note)], messages: [], history: true,
    interpretationProposal: proposal({ topic, question: 'Tell me the saved ' + topic + ' observation for Aster.' }),
    providerOverrides: { historyNarrative: { sentences: [{ text: answer, sourceIds: ['care:record'] }] } },
    reviewResponse: { approved: true }, expectedReviewCalls: 1 });
  assert.equal(r.result.reasoning.answer.summary, answer);
  assert.deepEqual(r.result.acceptedCareActions, []);
  assert.deepEqual(r.result.acceptedLearnings, []);
  assert.equal(JSON.parse(r.reviewRequests[0].input).request.version, ASK_REQUEST_VERSION);
  assert.equal(r.interpretationRequests[0].text.format.schema.properties.version.enum[0], ASK_REQUEST_VERSION);
});
test('as-of retrieval applies upper bound with no lower bound', async t => {
  clock(t);
  const r = await exercise('What was recorded for Aster before July?', { fixturePets, rows: [
    care('before', 'milo', '2026-06-04', 'general', 'Aster slept normally.'),
    care('after', 'milo', '2026-07-04', 'general', 'Aster slept less.')], messages: [], history: true,
    interpretationProposal: proposal({ to: '2026-07-01' }) });
  assert.deepEqual(r.context.askHistory.entries.map(row => row.id), ['before']);
});
test('comparison retrieves both temporal ends for arbitrary topics within the existing budget', async t => {
  clock(t);
  const rows = Array.from({ length: 80 }, (_, index) => care('travel-' + String(index).padStart(3, '0'), 'milo',
    new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10), 'general', 'Aster tolerated travel.'));
  const r = await exercise('Compare recorded travel observations.', { fixturePets, rows, messages: [], history: true,
    interpretationProposal: proposal({ operation: 'comparison', selection: 'comparison', terms: ['travel'] }) });
  const ids = r.context.askHistory.entries.map(row => row.id);
  assert.ok(ids.includes('travel-000'));
  assert.ok(ids.includes('travel-079'));
  assert.ok(ids.length <= 32);
  assert.ok(r.context.askHistory.coverage.reasons.includes('bidirectional_endpoint_subset'));
  assert.notEqual(r.context.askHistory.coverage.retrieval, 'complete');
});
test('conversation identity must match a complete owned name', () => {
  assert.throws(() => validateAskRequest(proposal({ scope: 'conversation', petNames: ['Bramble'] }), {
    ...context, conversationTurns: [{ id: 'x', role: 'user', text: 'The brambleberry bushes bloomed.' }],
  }), /conversation_subject/);
});
test('read premise produces no memory or care proposal through full pipeline', async t => {
  clock(t);
  const r = await exercise('Aster has a diagnosis. Is that premise supported?', { fixturePets, rows: [], messages: [], history: true,
    interpretationProposal: proposal(), providerOverrides: { proposedHistoryUpdate: { shouldOffer: true, category: 'general', title: 'Diagnosis', details: 'Aster has a diagnosis.', severity: null, resolvesConcernId: null } } });
  assert.equal(r.result.reasoning.proposedHistoryUpdate.shouldOffer, false);
  assert.deepEqual(r.result.acceptedCareActions, []);
  assert.deepEqual(r.result.acceptedLearnings, []);
  assert.deepEqual(r.result.acceptedSemanticEvents, []);
});
for (const answer of ['{\n  "observation": "slept normally"\n}', '- Aster slept normally.', '| Pet | Observation |\n| --- | --- |\n| Aster | slept normally |']) {
  test('reviewed output structure survives shared pipeline: ' + answer.slice(0, 20), async t => {
    clock(t);
    const r = await exercise('Present the saved observation in the requested format.', { fixturePets,
      rows: [care('format', 'milo', '2026-06-04', 'general', 'Aster slept normally.')], messages: [], history: true,
      interpretationProposal: proposal({ requirements: ['Preserve the requested output structure'] }),
      providerOverrides: { historyNarrative: { sentences: [{ text: answer, sourceIds: ['care:format'] }] } },
      reviewResponse: { approved: true }, expectedReviewCalls: 1 });
    assert.equal(r.result.reasoning.answer.summary, answer);
  });
}
test('shared review still rejects invented quotes before model approval', async t => {
  clock(t);
  const r = await exercise('Quote Aster observation.', { fixturePets, rows: [care('quote', 'milo', '2026-06-04', 'general', 'Aster slept normally.')], messages: [], history: true,
    interpretationProposal: proposal(), providerOverrides: { historyNarrative: { sentences: [{ text: 'The note says "Aster has a confirmed disease."', sourceIds: ['care:quote'] }] } },
    reviewResponse: { approved: true } });
  assert.doesNotMatch(r.result.reasoning.answer.summary, /confirmed disease/);
});
test('unlinked correction may be reported but does not create a verified edge', async t => {
  clock(t);
  const note = 'Correction: the earlier observation described another animal.';
  const answer = 'The correction says "Correction: the earlier observation described another animal." Its link to the original report is unverified.';
  const r = await exercise('Explain what the correction reports.', { fixturePets, rows: [care('correction', 'milo', '2026-06-04', 'general', note)], messages: [], history: true,
    interpretationProposal: proposal(), providerOverrides: { historyNarrative: { sentences: [{ text: answer, sourceIds: ['care:correction'] }] } },
    reviewResponse: { approved: true }, expectedReviewCalls: 1 });
  assert.equal(r.result.reasoning.answer.summary, answer);
  assert.equal(r.context.askHistory.coverage.provenance[0].status, 'unlinked_correction_uncertain');
  assert.deepEqual(r.result.acceptedSemanticEvents, []);
});
