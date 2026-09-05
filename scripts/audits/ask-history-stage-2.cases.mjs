import assert from 'node:assert/strict';
import test from 'node:test';
import { exercise, clock, ASK_PROMPT_CONTEXT_CHAR_BUDGET } from './helpers/lifetime-harness.mjs';
import { care, decisive, irrelevant, ownerId } from './fixtures/ask-lifetime-history.mjs';

// Promoted from the explicit lifetime audit: candidate/fact reachability, not
// exact episode totals or complete semantic-history certification.
for (const [petId, question, ids] of [
  ['milo', 'How many separate soft-stool episodes has Milo had over his lifetime?', ['milo-stool-1', 'milo-stool-2']],
  ['milo', 'Compare every recorded weight for Milo.', ['milo-weight-1', 'milo-weight-2', 'milo-weight-3']],
  ['milo', 'How did Milo food change over his lifetime?', ['milo-food-1', 'milo-food-2']],
  ['luna', 'Summarize Luna litter changes and accidents over her lifetime.', ['luna-litter', 'luna-accidents', 'luna-restored', 'luna-improved']],
  ['oscar', 'Summarize Oscar medication course, stiffness recurrence and latest improvement.', ['oscar-course', 'oscar-stiffness-1', 'oscar-stiffness-2', 'oscar-improved']],
]) test(`migrated fixture reachability: ${question}`, async t => {
  clock(t);
  const run = await exercise(question, { history: true, petId, rows: [...decisive, ...irrelevant(petId)] });
  for (const id of ids) {
    const record = run.prompt.contextRecords.find(record => record.id === `care:${id}`);
    assert.equal(record?.value, decisive.find(row => row.id === id).note);
    assert.ok(run.prompt.evidenceContract.represented.some(span => span.sourceId === record.id && span.text === record.value));
  }
});
test('migrated six-weight acceptance preserves all six exact source values', async t => {
  clock(t);
  const rows = Array.from({ length: 6 }, (_, i) => care(`weight-${i}`, 'milo', `2026-08-${10 + i}`, 'weight', `Milo weighed ${28.4 - i / 10} kg.`));
  const run = await exercise('Compare every recorded weight measurement.', { history: true, rows });
  for (const row of rows) assert.ok(run.prompt.evidenceContract.represented.some(span => span.sourceId === `care:${row.id}` && span.text === row.note));
});
test('migrated long correction reaches model intact without becoming an authoritative edge', async t => {
  clock(t);
  const note = `${'Owner described the surroundings. '.repeat(22)}Correction: the vomiting belonged to Bruno, not Milo.`;
  const run = await exercise('What does the corrected vomiting record say?', { history: true, rows: [care('tail-correction', 'milo', '2026-08-20', 'symptom', note)] });
  assert.ok(run.prompt.contextRecords.some(record => record.id === 'care:tail-correction' && record.value === note));
  assert.equal(run.prompt.evidenceContract.history.corrections, 'unknown');
  assert.match(run.result.reasoning.answer.summary, /uncertain/);
});

const original = care('old-vomit', 'milo', '2014-07-09', 'symptom', 'Milo vomited.');
const stool = care('old-stool', 'milo', '2014-07-10', 'symptom', 'Milo had soft stool.');
function claim(id, pet, note, extra = {}) { return { id, user_id: ownerId, subject_type: 'pet', subject_id: pet, claim_kind: 'event', operation_type: 'assert', concept_key: 'vomiting', canonical_concept_key: 'vomiting', concept_resolution_status: 'canonical', persistence_destination: 'history', knowledge_status: 'effective', occurred_at: '2014-07-09T12:00:00Z', recorded_at: '2014-07-09T12:01:00Z', provenance_classification: 'imported_legacy', structured_value: { title: null, note, severity: null }, ...extra }; }
const c1 = claim('claim-old', 'milo', original.note);
const c2 = claim('claim-correction', 'bruno', 'Bruno vomited, not Milo.', { operation_type: 'correct', recorded_at: '2026-08-20T12:00:00Z' });
const edge = { id: 'edge-1', user_id: ownerId, from_claim_id: c2.id, to_claim_id: c1.id, relation_type: 'corrects' };
const lineage = { user_id: ownerId, claim_id: c1.id, legacy_row_id: original.id, legacy_table: 'pet_care_entries', claim_role: 'primary' };
const graph = { claims: [c1, c2], relations: [edge], lineage: [lineage], sources: [original] };

test('2011 decisive note reaches actual provider among 100000 newer unrelated rows', async t => {
  clock(t);
  const decisive = care('decisive', 'milo', '2011-02-01', 'symptom', 'Milo had soft stool, not vomiting.');
  const run = await exercise('What soft-stool records are there for Milo in 2011?', { history: true, rows: [decisive, ...irrelevant('milo', 100000)] });
  assert.ok(run.prompt.contextRecords.some(record => record.id === 'care:decisive' && record.value === decisive.note));
  assert.ok(run.prompt.evidenceContract.history);
  assert.ok(run.serialized.length <= ASK_PROMPT_CONTEXT_CHAR_BUDGET);
  t.diagnostic(`mock queries=${run.queries.length}, serialized input chars=${run.serialized.length}`);
});
test('same-time cursor pages and final evidence do not lose six supported facts', async t => {
  clock(t);
  const rows = Array.from({ length: 30 }, (_, i) => care(`tie-${String(i).padStart(3, '0')}`, 'milo', '2011-01-01', 'weight', `Milo weighed ${28 + i / 10} kg.`));
  const run = await exercise('List weight records in 2011.', { history: true, rows });
  assert.equal(new Set(run.prompt.evidenceContract.history.candidateIds).size, 30);
  assert.equal(run.prompt.contextRecords.filter(record => record.sourceType === 'care_update').length, 30);
});
test('late validated correction removes Milo vomiting but preserves unrelated stool and provenance', async t => {
  clock(t);
  const run = await exercise('What records are there in July 2014?', { history: true, rows: [original, stool], graph });
  assert.ok(!run.prompt.contextRecords.some(record => record.value === original.note));
  assert.ok(run.prompt.contextRecords.some(record => record.value === stool.note));
  assert.ok(run.prompt.evidenceContract.history.provenance.some(item => item.sourceId === 'care:old-vomit' && item.status === 'superseded'));
});
test('failed correction read cannot resurrect the original', async t => {
  clock(t);
  const run = await exercise('What vomiting records are there in 2014?', { history: true, rows: [original], graph, failGraph: true, answer: 'Milo vomited in 2014.' });
  assert.ok(!run.prompt.contextRecords.some(record => record.id === 'care:old-vomit'));
  assert.match(run.result.reasoning.answer.summary, /correction|unavailable/i);
  assert.doesNotMatch(run.result.reasoning.answer.summary, /Milo vomited/);
});

test('topic-only search reaches 2011 without a year and row permutations preserve results', async t => {
  clock(t);
  const old = care('old', 'milo', '2011-02-01', 'weight', 'Milo weighed 28.4 kg.');
  const rows = [old, ...irrelevant('milo', 300)];
  for (const candidateRows of [rows, [...rows].reverse()]) {
    const run = await exercise('What weight records have I reported?', { history: true, rows: candidateRows });
    assert.ok(run.prompt.contextRecords.some(record => record.value === old.note));
    assert.deepEqual(run.prompt.evidenceContract.history.candidateIds, ['care:old']);
  }
});
test('graph row order does not affect reassignment; Bruno is never projected as Milo', async t => {
  clock(t);
  for (const claims of [graph.claims, [...graph.claims].reverse()]) {
    const run = await exercise('What vomiting records are there in 2014?', { history: true, rows: [original], graph: { ...graph, claims }, authoritativePetIds: ['milo', 'bruno'] });
    assert.ok(!run.prompt.contextRecords.some(record => record.petId === 'milo' && record.value.includes('Milo vomited')));
    assert.ok(run.prompt.contextRecords.some(record => record.petId === 'bruno' && record.value.includes('Bruno vomited, not Milo.')));
  }
});
for (const [label, alter] of [
  ['competing corrections', () => ({ claims: [c1, c2, { ...c2, id: 'c3' }], relations: [edge, { ...edge, id: 'e3', from_claim_id: 'c3' }] })],
  ['cycle', () => ({ claims: [{ ...c1, recorded_at: c2.recorded_at }, c2], relations: [edge, { ...edge, id: 'cycle', from_claim_id: c1.id, to_claim_id: c2.id }] })],
  ['missing target', () => ({ relations: [edge, { ...edge, id: 'missing', to_claim_id: 'missing' }] })],
  ['graph cap', () => ({ truncated: true })],
  ['missing source', () => ({ missingSourceIds: [original.id] })],
  ['stale imported note', () => ({ sources: [{ ...original, note: 'Edited source.' }] })],
]) test(`graph authority fails closed: ${label}`, async t => {
  clock(t);
  const run = await exercise('What vomiting records are there in 2014?', { history: true, rows: [original], graph: { ...graph, ...alter() }, answer: 'Milo vomited.' });
  assert.equal(run.prompt.evidenceContract.history.corrections, 'unavailable');
  assert.ok(!run.prompt.contextRecords.some(record => record.sourceType === 'care_update'));
  assert.match(run.result.reasoning.answer.summary, /correction evidence/);
  assert.doesNotMatch(run.result.reasoning.answer.summary, /Milo vomited/);
});
for (const state of ['tombstoned', 'forgotten', 'superseded']) test(`removed correction (${state}) does not revive target`, async t => {
  clock(t);
  const run = await exercise('What vomiting records are there in 2014?', { history: true, rows: [original], graph: { ...graph, claims: [c1, { ...c2, knowledge_status: state }] } });
  assert.ok(!run.prompt.contextRecords.some(record => record.id === 'care:old-vomit'));
  assert.equal(run.prompt.evidenceContract.history.provenance[0].status, 'superseded');
});
test('retraction of correction does not revive target', async t => {
  clock(t);
  const retract = { ...c2, id: 'retract', operation_type: 'retract', recorded_at: '2026-08-21T12:00:00Z', persistence_destination: 'none' };
  const run = await exercise('What vomiting records are there in 2014?', { history: true, rows: [original], graph: { ...graph, claims: [c1, c2, retract], relations: [edge, { ...edge, id: 'retract-edge', from_claim_id: retract.id, to_claim_id: c2.id, relation_type: 'retracts' }] } });
  assert.ok(!run.prompt.contextRecords.some(record => record.id === 'care:old-vomit'));
});
test('foreign-owner rows and relations cannot change own result or appear in input', async t => {
  clock(t);
  const foreign = { ...original, id: 'foreign', user_id: 'other-owner', note: 'FOREIGN SECRET vomiting.' };
  const run = await exercise('What vomiting records are there in 2014?', { history: true, rows: [original, foreign], graph: { claims: [{ ...c2, user_id: 'other-owner' }], relations: [{ ...edge, user_id: 'other-owner' }] } });
  assert.ok(run.prompt.contextRecords.some(record => record.value === original.note));
  assert.doesNotMatch(run.serialized, /FOREIGN SECRET|claim-correction/);
});
test('legacy unlinked correction is qualified uncertainty, never an authoritative edge', async t => {
  clock(t);
  const correction = care('unlinked', 'milo', '2026-09-03', 'symptom', 'Correction: Bruno vomited, not Milo.');
  const run = await exercise('What vomiting records are there?', { history: true, rows: [original, correction], answer: 'Milo never vomited.' });
  assert.equal(run.prompt.evidenceContract.history.corrections, 'unknown');
  assert.ok(run.prompt.evidenceContract.history.reasons.includes('unlinked_correction_uncertain'));
  assert.doesNotMatch(run.result.reasoning.answer.summary, /Milo never/);
});
test('page interruption and row budget expose continuation without totals', async t => {
  clock(t);
  const rows = Array.from({ length: 110 }, (_, i) => care(`n-${String(i).padStart(3, '0')}`, 'milo', '2011-01-01', 'weight', `Milo weighed ${i} kg.`));
  for (const failHistoryPage of [0, 2]) {
    const run = await exercise('How many weight records are there in 2011?', { history: true, rows, failHistoryPage, answer: 'Exactly 110.' });
    assert.ok(run.prompt.evidenceContract.history.continuation.length);
    assert.notEqual(run.prompt.evidenceContract.history.retrieval, 'complete');
    assert.match(run.result.reasoning.answer.summary, /incomplete/);
    assert.doesNotMatch(run.result.reasoning.answer.summary, /Exactly 110/);
    assert.ok(run.serialized.length <= ASK_PROMPT_CONTEXT_CHAR_BUDGET);
  }
});
test('long qualified source note bypasses obsolete 180-character cut and final quote matches', async t => {
  clock(t);
  const note = `I recorded the urine test as pending. ${'Owner described the test visit. '.repeat(20)}Result uncertain, not normal.`;
  const run = await exercise('What did Luna’s September 3 urine-test result say?', { petId: 'luna', history: true, rows: [care('long-note', 'luna', '2026-09-03', 'vet_visit', note)] });
  assert.ok(run.prompt.contextRecords.some(record => record.value === note));
  assert.ok(run.result.reasoning.answer.summary.includes(`“${note}”`));
  assert.equal(run.result.reasoning.referencedRecords[0].value, note);
});

test('deleted sources and concurrent deletion do not yield affirmative or absence claims', async t => {
  clock(t);
  for (const concurrent of [false, true]) {
    const deleted = { ...original, deleted_at: '2026-09-04T12:00:00Z' };
    const run = await exercise('What vomiting records are there in 2014?', { history: true, rows: [concurrent ? original : deleted], graph: { sources: [deleted] }, answer: 'Milo vomited.' });
    assert.ok(!run.prompt.contextRecords.some(record => record.id === 'care:old-vomit'));
    assert.doesNotMatch(run.result.reasoning.answer.summary, /Milo vomited/);
    assert.match(run.result.reasoning.answer.summary, /not.*absen|not evidence.*absen/i);
  }
});
test('restored source does not automatically revive tombstoned imported claim', async t => {
  clock(t);
  const run = await exercise('What vomiting records are there in 2014?', { history: true, rows: [original], graph: { ...graph, claims: [{ ...c1, knowledge_status: 'tombstoned' }], relations: [] } });
  assert.ok(!run.prompt.contextRecords.some(record => record.id === 'care:old-vomit'));
});
test('deleting a correction source leaves its authored relation in force', async t => {
  clock(t);
  const correctedSource = care('correction-source', 'bruno', '2014-07-09', 'symptom', c2.structured_value.note, { deleted_at: '2026-09-04T12:00:00Z' });
  const run = await exercise('What vomiting records are there in 2014?', { history: true, rows: [original], graph: { ...graph, lineage: [lineage, { ...lineage, claim_id: c2.id, legacy_row_id: correctedSource.id }], sources: [original, correctedSource] } });
  assert.ok(!run.prompt.contextRecords.some(record => record.id === 'care:old-vomit'));
  assert.equal(run.prompt.evidenceContract.history.provenance[0].status, 'superseded');
});
test('oversized retrieved evidence and partial source-note lookup cannot bypass final limitation', async t => {
  clock(t);
  const huge = care('huge', 'milo', '2011-01-01', 'symptom', `Vomiting history: ${'qualified details '.repeat(2000)}not confirmed.`);
  const run = await exercise('What vomiting records are there in 2011?', { history: true, rows: [huge], answer: 'Vomiting confirmed.' });
  assert.ok(run.prompt.evidenceContract.history.excludedIds.includes('care:huge'));
  assert.ok(run.serialized.length <= ASK_PROMPT_CONTEXT_CHAR_BUDGET);
  assert.match(run.result.reasoning.answer.summary, /incomplete/);
});
test('persisted removed-edge marker withholds target even when relation is gone', async t => {
  clock(t);
  const run = await exercise('What vomiting records are there in 2014?', { history: true, rows: [original], graph: { ...graph, claims: [c1], relations: [], withheld_claim_ids: [c1.id] }, answer: 'Milo vomited.' });
  assert.ok(!run.prompt.contextRecords.some(record => record.id === 'care:old-vomit'));
  assert.doesNotMatch(run.result.reasoning.answer.summary, /Milo vomited/);
});
test('ordinary safety questions and new owner observations keep the nonhistorical path', async t => {
  clock(t);
  for (const question of ['What should I do about vomiting?', 'Milo collapsed, what should I do?', 'Milo stopped vomiting today. Is that improvement?']) {
    const run = await exercise(question, { history: true });
    assert.equal(run.prompt.evidenceContract.history, undefined);
    assert.equal(run.prompt.evidenceContract.historyFallback, undefined);
    if (question.includes('collapsed')) assert.equal(run.result.safety.currentMessageEmergency, true);
  }
});
test('unsupported disjoint periods disclose the legacy fallback without claiming full history', async t => {
  clock(t);
  const run = await exercise('What vomiting was reported between 2011 and 2014?', { history: true, answer: 'This is the full history.' });
  assert.ok(run.prompt.evidenceContract.historyFallback);
  assert.match(run.result.reasoning.answer.summary, /limited recent context/);
  assert.doesNotMatch(run.result.reasoning.answer.summary, /This is the full history/);
});
test('supported period loads each authorized pet without borrowing another pet facts', async t => {
  clock(t);
  const luna = care('luna-note', 'luna', '2014-07-09', 'symptom', 'Luna had litter accidents.');
  const run = await exercise('Summarize Milo and Luna records in 2014.', { history: true, rows: [stool, luna], authoritativePetIds: ['milo', 'luna'] });
  assert.deepEqual(run.prompt.evidenceContract.history.perPet.map(pet => pet.petId), ['luna', 'milo']);
  assert.ok(run.prompt.contextRecords.some(record => record.petId === 'luna' && record.value === luna.note));
  assert.ok(run.prompt.contextRecords.some(record => record.petId === 'milo' && record.value === stool.note));
});
test('a later replacement is attributed as a claim, never quoted as the original dated note', async t => {
  clock(t);
  const source = care('urine-original', 'luna', '2014-09-03', 'vet_visit', 'Urine test: normal.');
  const oldClaim = { ...c1, id: 'urine-old', subject_id: 'luna', occurred_at: source.occurred_at, structured_value: { title: null, note: source.note, severity: null } };
  const replacement = { ...c2, id: 'urine-new', subject_id: 'luna', occurred_at: source.occurred_at, modality: 'suspected', polarity: 'negated', structured_value: { note: 'Urine test: pending, not normal.' } };
  const run = await exercise('What did Luna’s September 3, 2014 urine-test result say?', { petId: 'luna', history: true, rows: [source], graph: {
    claims: [oldClaim, replacement], relations: [{ ...edge, from_claim_id: replacement.id, to_claim_id: oldClaim.id }],
    lineage: [{ ...lineage, claim_id: oldClaim.id, legacy_row_id: source.id }], sources: [source],
  } });
  const represented = run.prompt.contextRecords.find(record => record.id === 'claim:urine-new');
  assert.match(represented.value, /2026-08-20.*polarity: negated; modality: suspected/);
  assert.match(run.result.reasoning.answer.summary, /original note was superseded/);
  assert.deepEqual(run.result.reasoning.relevantContextIds, []);
  assert.deepEqual(run.result.reasoning.referencedRecords, []);
});
test('Bruno-only lookup discovers the validated reassigned event without a Bruno legacy row', async t => {
  clock(t);
  const run = await exercise('What vomiting records are there in 2014?', { petId: 'bruno', history: true, rows: [original], graph });
  assert.ok(run.prompt.contextRecords.some(record => record.petId === 'bruno' && record.id === 'claim:claim-correction'));
  assert.ok(!run.prompt.contextRecords.some(record => record.petId === 'milo'));
  const sources = run.prompt.evidenceContract.sources;
  assert.equal(sources.find(source => source.petId === 'bruno' && source.source === 'care_entries').loadedCount, 0);
  assert.ok(sources.find(source => source.petId === 'bruno' && source.source === 'correction_claims').loadedIds.includes('claim:claim-correction'));
});

test('removing imported claim lineage cannot resurrect the original as unlinked legacy evidence', async t => {
  clock(t);
  const run = await exercise('What vomiting records are there in 2014?', { history: true, rows: [original], graph: { withheld_source_ids: [original.id] }, answer: 'Milo vomited.' });
  assert.ok(!run.prompt.contextRecords.some(record => record.id === 'care:old-vomit'));
  assert.doesNotMatch(run.result.reasoning.answer.summary, /Milo vomited/);
});

test('correction-only lookup does not promote unrelated shadow assertions', async t => {
  clock(t);
  const run = await exercise('What vomiting records are there in 2014?', { petId: 'bruno', history: true, rows: [], graph: { claims: [{ ...c2, operation_type: 'assert' }], relations: [] } });
  assert.ok(!run.prompt.contextRecords.some(record => record.sourceType === 'care_update'));
  assert.match(run.result.reasoning.answer.summary, /does not establish/);
});

test('short server pages do not imply exhaustion, including identical timestamps', async t => {
  clock(t);
  const rows = Array.from({ length: 6 }, (_, i) => care(`short-${i}`, 'milo', '2011-01-01', 'general', `Milo weight ${28 + i / 10} kg.`));
  const run = await exercise('List weight records in 2011.', { history: true, rows, historyPageCap: 2 });
  assert.deepEqual(run.prompt.evidenceContract.history.candidateIds, rows.map(row => `care:${row.id}`));
  assert.equal(run.prompt.evidenceContract.history.perPet[0].pages, 4);
  assert.equal(run.prompt.evidenceContract.history.perPet[0].exhausted, true);
  assert.equal(run.prompt.evidenceContract.history.retrieval, 'unknown');
});

for (const change of ['removed relation', 'changed claim']) test(`graph change during closure fails closed: ${change}`, async t => {
  clock(t);
  const changed = change === 'removed relation' ? { ...graph, relations: [] }
    : { ...graph, claims: [c1, { ...c2, knowledge_status: 'unconfirmed' }] };
  const run = await exercise('What vomiting records are there in 2014?', { history: true, rows: [original], graphAtCall: call => call === 1 ? graph : changed, answer: 'Milo vomited.' });
  assert.equal(run.prompt.evidenceContract.history.corrections, 'unavailable');
  assert.ok(!run.prompt.contextRecords.some(record => record.sourceType === 'care_update'));
  assert.doesNotMatch(run.result.reasoning.answer.summary, /Milo vomited/);
});

test('multi-pet saturated candidate pages retain bounded mandatory coverage metadata', async t => {
  clock(t);
  const rows = ['milo', 'luna', 'bruno'].flatMap((pet, petIndex) => Array.from({ length: 110 }, (_, i) =>
    care(`00000000-0000-4000-8000-${String(petIndex * 1000 + i).padStart(12, '0')}`, pet, '2011-01-01', 'general', `${pet} weight ${i} kg.`)));
  const run = await exercise('List weight records in 2011.', { history: true, rows, authoritativePetIds: ['milo', 'luna', 'bruno'] });
  assert.ok(run.serialized.length <= ASK_PROMPT_CONTEXT_CHAR_BUDGET);
  assert.match(run.result.reasoning.answer.summary, /incomplete/);
  assert.equal(run.prompt.evidenceContract.history.perPet.length, 3);
  assert.ok(run.prompt.evidenceContract.losses.some(loss => loss.reason === 'prompt_budget'));
  t.diagnostic(`saturated multi-pet mock queries=${run.queries.length}, serialized input chars=${run.serialized.length}`);
});

test('a validated event-date correction removes the claim from the old requested period', async t => {
  clock(t);
  const moved = { ...c2, subject_id: 'milo', occurred_at: '2015-07-09T12:00:00Z' };
  const run = await exercise('What vomiting records are there in 2014?', { history: true, rows: [original], graph: { ...graph, claims: [c1, moved] } });
  assert.ok(!run.prompt.contextRecords.some(record => record.sourceType === 'care_update'));
  assert.ok(run.prompt.evidenceContract.history.provenance.some(item => item.status === 'outside_requested_period'));
  assert.match(run.result.reasoning.answer.summary, /superseded/);
});

test('unsupported replacement payload cannot be hidden by another useful represented source', async t => {
  clock(t);
  const replacement = { ...c2, subject_id: 'milo', structured_value: { unsupported: 'shape' } };
  const run = await exercise('What records are there in 2014?', { history: true, rows: [original, stool], graph: { ...graph, claims: [c1, replacement] }, answer: 'Complete history.' });
  assert.ok(run.prompt.contextRecords.some(record => record.value === stool.note));
  assert.ok(run.prompt.evidenceContract.history.reasons.includes('unsupported_claim_payload'));
  assert.match(run.result.reasoning.answer.summary, /incomplete/);
  assert.doesNotMatch(run.result.reasoning.answer.summary, /Complete history/);
});
