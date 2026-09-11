import test from 'node:test';
import assert from 'node:assert/strict';
import { historyNarrativeAnchorsSupported } from '../app/lib/intelligence/history-narrative-facts.ts';
import { verifiedCalculationQuantities, evaluateCalculationExpression } from '../app/lib/intelligence/history-calculation.ts';
import { clipHistoryPlan } from '../app/lib/intelligence/history-access.ts';
import { recordHistoryReview, readReviewedHistoryAnswer, historyReviewSignature } from '../app/lib/intelligence/history-review-state.ts';
import { recordedInventory, recordedCensus } from '../app/lib/intelligence/recorded-inventory.ts';
import { episodeAnswer } from '../app/lib/intelligence/episode-contract.ts';

test('signed source quantities cannot silently reverse sign', () => {
  for (const [source, answer] of [['Change was -5 kg.', 'Change was 5 kg.'], ['Change was 5 kg.', 'Change was -5 kg.'], ['Change was −5 kg.', 'Change was 5 kg.']])
    assert.equal(historyNarrativeAnchorsSupported(answer, [{ text: source }], '', [], false), false, source + ' -> ' + answer);
  assert.equal(historyNarrativeAnchorsSupported('Change was -5 kg.', [{ text: 'Change was −5 kg.' }], '', [], false), true);
});
test('a unicode minus in a source cannot ground a positive operand', () => {
  const proposal = { operation: 'convert', operands: [{ sourceId: 'a', field: 'text', literal: '5 kg' }], value: 5000, unit: 'g' };
  assert.equal(verifiedCalculationQuantities([proposal], [{ sourceId: 'a', text: 'Change was −5 kg.' }]), null);
});
test('a single expression leaf obeys finite value and scale limits', () => {
  for (const operand of [{ value: NaN, scale: 1 }, { value: Infinity, scale: 1 }, { value: 1, scale: 0 }, { value: 1, scale: -1 }, { value: 1e13, scale: 1 }])
    assert.equal(evaluateCalculationExpression([0], [{ ...operand, dimension: 'mass' }]), null);
});
test('history clipping compares instants rather than timestamp spellings', () => {
  const access = { months: 3, from: '2026-06-11T00:00:00.000Z', to: '2026-09-12T00:00:00.000Z' };
  const clipped = clipHistoryPlan({ from: '2026-06-11T01:00:00+02:00', to: '2026-09-11T23:30:00-02:00' }, access);
  assert.equal(Date.parse(clipped.from), Date.parse(access.from));
  assert.equal(Date.parse(clipped.to), Date.parse(access.to));
});
test('review receipt cannot be mutated through its input reference', () => {
  const result = { applicationActions: [], answer: { summary: 'Reviewed.' } };
  const receipt = { signature: historyReviewSignature(result), text: 'Reviewed.', sourceIds: ['a'], completion: [{ index: 0, status: 'answered', sentenceIndexes: [0], sourceIds: ['a'] }] };
  recordHistoryReview(result, receipt);
  receipt.text = 'Unreviewed.'; receipt.sourceIds.push('forged'); receipt.completion[0].status = 'missing';
  assert.equal(readReviewedHistoryAnswer(result).text, 'Reviewed.');
  assert.deepEqual(readReviewedHistoryAnswer(result).sourceIds, ['a']);
  assert.equal(readReviewedHistoryAnswer(result).completion[0].status, 'answered');
});
test('recorded certificates validate revision types and snapshot their input', () => {
  const base = { ownerId: 'owner', petId: 'pet', keys: ['vomiting'], from: null, to: null, revision: '1.1', snapshot: new Date().toISOString(), episodeCount: 1 };
  assert.equal(recordedInventory({ ...base, version: 'ask-recorded-inventory.v1', revision: 1, careIds: ['a'], claimIds: [], failures: [] }, 'owner', 'pet', ['vomiting'], null, null), null);
  const data = { ...base, version: 'ask-native-census.v1', sourceCount: 1 };
  const accepted = recordedCensus(data, 'owner', 'pet', ['vomiting'], null, null); data.episodeCount = 99;
  assert.equal(accepted.episodeCount, 1);
});
test('unresolved episode corrections do not masquerade as a transient outage', () => {
  const result = { version: 'ask-episodes.v1', conversational: true, petId: 'pet', topic: 'vomiting', from: null, to: null, items: [], supportedCount: 0, exactTotal: null, entryCount: 0, coverage: 'unavailable', reasons: ['episode_correction_unresolved'], provenance: [], referenceStatus: 'list' };
  const text = episodeAnswer(result).summary;
  assert.match(text, /correction/i); assert.doesNotMatch(text, /try again|please retry|just now/i);
  assert.match(episodeAnswer({ ...result, reasons: ['episode_read_unavailable'] }).summary, /try again|retry/i);
});

import { withExecutionDeadline } from '../app/lib/ai/execution-deadline.ts';
import { deterministicReadProjection } from '../app/lib/intelligence/read-projection.ts';
test('shared execution timeout settles an abort-ignoring read and observes late rejection', async () => {
  let rejectRead, signal;
  const pending = withExecutionDeadline(s => { signal = s; return new Promise((_, reject) => { rejectRead = reject; }); }, 10);
  await assert.rejects(pending, error => error.name === 'TimeoutError');
  assert.equal(signal.aborted, true); rejectRead(new Error('late read failure'));
  for (const budget of [NaN, Infinity, 0, -1, 2 ** 31])
    await assert.rejects(withExecutionDeadline(async () => 1, budget), /INVALID_EXECUTION_TIMEOUT/);
});
function projectionFixture(text, occurredAt = '2024-01-09T00:00:00+00:00') {
  return { interpretation: { history: { from: '2024-01-09T00:00:00.000Z', to: '2024-01-10T00:00:00.000Z' }, request: { outputFormat: 'table', projection: { nameHeader: 'Pet', valueHeader: 'Weight (g)', quantity: 'body_mass', unit: 'g', order: 'scope' } } },
    scope: { status: 'resolved', readOnlyRecall: true, authorizedPetIds: ['pet'], requestKind: 'record_lookup' },
    history: { corrections: 'unknown', provenance: [] }, losses: [], petNames: { pet: 'Clover' },
    represented: [{ sourceId: 'care:a', petId: 'pet', sourceType: 'care_update', start: 0, end: text.length, text, occurredAt }],
    sources: [{ petId: 'pet', status: 'available', loadedIds: ['care:a'] }] };
}
test('dated projection includes PostgreSQL midnight and excludes the upper bound', () => {
  assert.match(deterministicReadProjection(projectionFixture('Clover body weight was 2.1 kg.')).sentences[0].text, /2100/);
  assert.equal(deterministicReadProjection(projectionFixture('Clover body weight was 2.1 kg.', '2024-01-10T00:00:00+00:00')), null);
});
test('deterministic projection does not turn uncertain or negated weight into a value', () => {
  for (const text of ['Clover never weighed 2.1 kg.', "Clover hasn't weighed 2.1 kg.", 'If Clover weighed 2.1 kg, this is hypothetical.', 'Clover body weight was 2.1 kg, possibly.'])
    assert.equal(deterministicReadProjection(projectionFixture(text)), null, text);
});
