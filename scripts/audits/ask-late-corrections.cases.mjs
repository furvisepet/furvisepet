import test from 'node:test';
import assert from 'node:assert/strict';
import { exercise, clock, promptHas } from './helpers/lifetime-harness.mjs';
import { decisive, care } from './fixtures/ask-lifetime-history.mjs';

test('actual callback discovers and qualifies a later unlinked correction', async t => {
  clock(t);
  const run = await exercise('Did Milo vomit in July 2014?', { history: true, answer: 'Milo vomited twice in July 2014.' });
  assert.ok(promptHas(run, 'milo-correction'));
  assert.ok(run.context.askHistory.coverage.reasons.includes('unlinked_correction_uncertain'));
  assert.equal(run.context.askHistory.coverage.provenance.find(p => p.sourceId === 'care:milo-vomit-wrong').status, 'unverified_legacy');
  assert.match(run.result.reasoning.answer.summary, /correction|reconcile/i);
});

test('later correction never broadens pet authority or becomes a write', async t => {
  clock(t);
  const foreign = care('foreign-correction', 'milo', '2026-08-20', 'general', 'Correction July 2014', { user_id: 'foreign-owner' });
  const run = await exercise('Did Milo vomit in July 2014?', { history: true, rows: [...decisive, foreign] });
  assert.ok(promptHas(run, 'milo-correction'));
  assert.ok(!promptHas(run, 'foreign-correction') && !promptHas(run, 'bruno-correction'));
  assert.equal(run.context.askHistory.coverage.corrections, 'unknown');
  assert.deepEqual(run.result.acceptedCareActions, []);
  assert.deepEqual(run.result.acceptedLearnings, []);
  assert.deepEqual(run.result.acceptedSemanticEvents, []);
});

test('changed or deleted supplemental correction is withheld after fresh lookup', async t => {
  clock(t);
  for (const graph of [
    { missingSourceIds: ['milo-correction'] },
    { sources: [ { ...decisive.find(r => r.id === 'milo-correction'), note: 'Changed to an unrelated report.' } ] },
  ]) {
    const run = await exercise('Did Milo vomit in July 2014?', { history: true, graph });
    assert.ok(!promptHas(run, 'milo-correction'));
    assert.ok(run.context.askHistory.coverage.reasons.includes('source_deleted_or_changed'));
    assert.match(run.result.reasoning.answer.summary, /incomplete|unavailable|uncertain/i);
  }
});

test('supplemental RPC failure discloses uncertainty instead of confirming the old note', async t => {
  clock(t);
  const run = await exercise('Summarize Milo history in July 2014.', { history: true, candidateError: '55000' });
  assert.ok(run.context.askHistory.coverage.reasons.includes('unlinked_correction_discovery_unavailable'));
  assert.equal(run.context.askHistory.coverage.corrections, 'unavailable');
});

test('unrelated year is not attached and bounded discovery never certifies completeness', async t => {
  clock(t);
  const rows = decisive.filter(r => !/correction/.test(r.id));
  rows.push(care('other-year', 'milo', '2026-08-20', 'general', 'Correction to the 2015 vomiting report.'));
  const run = await exercise('Did Milo vomit in July 2014?', { history: true, rows });
  assert.ok(!promptHas(run, 'other-year'));
  assert.equal(run.context.askHistory.coverage.corrections, 'unknown');
});

test('discovery is bounded even when unrelated correction notes exhaust the page', async t => {
  clock(t);
  const noise = Array.from({length: 15}, (_, i) => care(`correction-noise-${i}`, 'milo', '2020-01-01', 'general', 'Correction to a 2015 report.'));
  const run = await exercise('Did Milo vomit in July 2014?', { history: true, rows: [...decisive, ...noise] });
  assert.ok(run.context.askHistory.coverage.reasons.includes('unlinked_correction_discovery_cap'));
  assert.ok(run.context.askHistory.coverage.candidateIds.length <= 64);
  const searches = run.queries.filter(q => q.table === 'read_ask_history_candidates' && q.args.p_terms.includes('correct'));
  assert.equal(searches.length, 1);
  assert.equal(searches[0].args.p_limit, 12);
  assert.equal(searches[0].args.p_from, null);
  assert.equal(searches[0].args.p_pet_id, 'milo');
  assert.equal(run.context.askHistory.coverage.corrections, 'partial');
  assert.match(run.result.reasoning.answer.summary, /incomplete|uncertain/i);
});

for (const patch of [{ user_id: 'foreign-owner' }, { pet_profile_id: 'bruno' }, { deleted_at: '2026-08-21T00:00:00Z' }]) {
  test(`malformed supplemental boundary is rejected: ${JSON.stringify(patch)}`, async t => {
    clock(t);
    const injected = { ...care('injected', 'milo', '2026-08-20', 'general', 'Correction to 2014 report.'), ...patch };
    const run = await exercise('Summarize Milo history in July 2014.', { history: true, candidateRowsOverride: [injected] });
    assert.equal(run.context.askHistory.coverage.corrections, 'unavailable');
    assert.ok(!promptHas(run, 'injected'));
    assert.match(run.result.reasoning.answer.summary, /incomplete|uncertain/i);
  });
}
