import assert from 'node:assert/strict';
import test from 'node:test';
import { exercise, clock, ASK_PROMPT_CONTEXT_CHAR_BUDGET, evidenceScopeKey } from './helpers/lifetime-harness.mjs';
import { care, decisive, irrelevant, ownerId } from './fixtures/ask-lifetime-history.mjs';

// Migrated from the lifetime audit: bounded unsupported-answer policy only.
for (const [petId, question, answer, forbidden] of [
  ['milo', 'How many soft-stool episodes are recorded?', 'Exactly seven soft-stool episodes were recorded.', /seven/],
  ['luna', 'What was Luna urine-test result?', 'The urine test was normal.', /test was normal/],
  ['oscar', 'What is Oscar diagnosis?', 'Oscar has arthritis.', /arthritis/],
  ['milo', 'Compare Milo earliest and latest weight.', 'The recorded weight decreased by 0.2 kg.', /0\.2 kg/],
]) test(`bounded answer policy rejects unsupported assertion: ${answer}`, async t => {
  clock(t);
  const run = await exercise(question, { petId, answer, providerOverrides: { answerSections: [{ heading: 'Details', items: [answer] }] } });
  assert.doesNotMatch(JSON.stringify(run.result.reasoning.answer), forbidden);
  assert.match(run.result.reasoning.answer.summary, /can't establish/);
  assert.deepEqual(run.result.reasoning.answer.sections, []);
});

test('small successful load is not proof of effective-history completeness', async t => {
  clock(t);
  const run = await exercise('What weight was reported for Milo on August 19?', { answer: 'The August 19 note reports 27.8 kg.' });
  const evidence = run.prompt.evidenceContract;
  assert.ok(evidence);
  assert.deepEqual(evidence.scope.authorizedPetIds, ['milo']);
  assert.equal(evidence.completeness.retrieval, 'unknown');
  assert.equal(evidence.completeness.corrections, 'unknown');
  assert.equal(evidence.completeness.extraction, 'unknown');
  assert.equal(evidence.completeness.grouping, 'unknown');
  assert.equal(run.result.reasoning.answer.summary, 'The August 19 note reports 27.8 kg.');
  assert.deepEqual(run.result.reasoning.evidenceContract, evidence);
});
test('capped loading, intermediate and final selection are distinct losses', async t => {
  clock(t);
  const run = await exercise('Summarize Milo entire recorded history.', { rows: [...decisive, ...irrelevant('milo')], answer: 'This is the complete lifetime history.' });
  const evidence = run.prompt.evidenceContract;
  assert.ok(evidence);
  assert.equal(evidence.scope.requestedPeriod.kind, 'lifetime');
  assert.equal(evidence.sources.find(s => s.petId === 'milo' && s.source === 'care_entries').status, 'capped');
  assert.equal(evidence.sources.find(s => s.source === 'care_entries').loadedIds.length, 80);
  assert.ok(evidence.losses.some(loss => loss.reason === 'intermediate_selection'));
  assert.ok(evidence.losses.some(loss => loss.reason === 'model_selection'));
  assert.doesNotMatch(run.result.reasoning.answer.summary, /complete lifetime history/);
  assert.match(run.result.reasoning.answer.summary, /cannot|can't|incomplete|limited/i);
  assert.doesNotMatch(run.prompt.olderUpdateSummary || '', /older updates/);
});
for (const [question, answer] of [
  ['How many separate soft-stool episodes has Milo ever had?', 'Exactly seven episodes.'],
  ['Has Milo ever vomited?', 'Milo has never vomited.'],
  ['Have I reported any vomiting for Milo?', 'No vomiting has been recorded.'],
  ['Compare all Milo recorded weights.', 'His weight decreased by 0.2 kg.'],
]) test(`unknown coverage cannot authorize exhaustive answer: ${question}`, async t => {
  clock(t);
  const run = await exercise(question, { answer });
  assert.notEqual(run.result.reasoning.answer.summary, answer);
  assert.match(run.result.reasoning.answer.summary, /cannot|can't|incomplete|limited/i);
  assert.equal(run.result.acceptedCareActions.length, 0);
  assert.equal(run.result.acceptedLearnings.length, 0);
  assert.equal(run.result.reasoning.proposedHistoryUpdate.shouldOffer, false);
});
test('failed loading survives to provider and definitive absence is replaced', async t => {
  clock(t);
  const run = await exercise('What was Luna urine-test result?', { petId: 'luna', failCare: true, answer: 'There is no recorded urine-test result.' });
  const source = run.prompt.evidenceContract?.sources.find(s => s.source === 'care_entries');
  assert.equal(source?.status, 'unavailable');
  assert.ok(source.reasons.includes('source_unavailable'));
  assert.match(run.result.reasoning.answer.summary, /couldn't|cannot|can't/i);
  assert.doesNotMatch(run.result.reasoning.answer.summary, /There is no recorded/);
});
test('profile-only second pet does not imply history loading', async t => {
  clock(t);
  const run = await exercise('Summarize the entire history of Milo and Luna.', { authoritativePetIds: ['milo', 'luna'], answer: 'Both complete histories are shown.' });
  const source = run.prompt.evidenceContract?.sources.find(s => s.petId === 'luna' && s.source === 'care_entries');
  assert.equal(source?.status, 'not_loaded');
  assert.match(run.result.reasoning.answer.summary, /cannot|can't|incomplete|limited/i);
});
test('oversized evidence is omitted whole, never emitted without its correction or qualifier', async t => {
  clock(t);
  const note = `${'Owner described the surroundings. '.repeat(22)}Correction: Bruno vomited, not Milo. Milo may have had nausea; weight was 27.8 kg.`;
  const run = await exercise('Summarize all Milo vomiting history.', { rows: [care('qualified', 'milo', '2026-08-20', 'symptom', note)] });
  const record = run.prompt.contextRecords.find(r => r.id === 'care:qualified');
  assert.ok(!record || record.value === note);
  assert.ok(run.prompt.evidenceContract.losses.some(loss => loss.sourceId === 'care:qualified' && loss.reason === 'qualified_span_over_budget'));
  assert.equal(run.prompt.evidenceContract.representation, 'partial');
  assert.ok(run.serialized.length <= ASK_PROMPT_CONTEXT_CHAR_BUDGET);
});

function certify(evidence) {
  for (const source of evidence.sources) {
    source.status = 'loaded'; source.reasons = [];
    source.completeness = { retrieval: 'complete', corrections: 'complete', extraction: 'complete', grouping: 'complete' };
  }
}
const twoReports = [care('one', 'milo', '2026-08-18', 'symptom', 'First soft-stool episode.'), care('two', 'milo', '2026-08-19', 'symptom', 'Second separate soft-stool episode.')];
test('certified complete server fact is rendered instead of a contradictory model total', async t => {
  clock(t);
  const run = await exercise('How many soft-stool episodes are recorded?', { rows: twoReports, answer: 'Exactly seven episodes.', prepareEvidence(evidence) {
    certify(evidence);
    evidence.verifiedFacts = [{ scopeKey: evidenceScopeKey(evidence.scope), kind: 'count', sourceIds: ['care:one', 'care:two'], text: 'Two separate soft-stool episodes are recorded in this verified period.' }];
  } });
  assert.equal(run.prompt.evidenceContract.completeness.grouping, 'complete');
  assert.equal(run.result.reasoning.answer.summary, 'Two separate soft-stool episodes are recorded in this verified period.');
  assert.deepEqual(run.prompt.evidenceContract.represented.filter(span => span.sourceType === 'care_update').map(span => span.sourceId).sort(), ['care:one', 'care:two']);
});
test('complete retrieval without correction/grouping certification or verified total still abstains', async t => {
  clock(t);
  for (const missing of ['corrections', 'extraction', 'grouping', 'fact']) {
    const run = await exercise('How many soft-stool episodes are recorded?', { rows: twoReports, answer: 'Exactly seven episodes.', prepareEvidence(evidence) {
      certify(evidence);
      if (missing !== 'fact') {
        evidence.sources[0].completeness[missing] = 'unknown';
        evidence.verifiedFacts = [{ scopeKey: evidenceScopeKey(evidence.scope), kind: 'count', sourceIds: ['care:one'], text: 'Seven episodes.' }];
      }
    } });
    assert.match(run.result.reasoning.answer.summary, /can't establish an exact total/);
  }
});
test('model-proposed coverage metadata never establishes authority', async t => {
  clock(t);
  const run = await exercise('How many soft-stool episodes are recorded?', { answer: 'Exactly seven episodes.',
    providerOverrides: { evidenceContract: { completeness: { retrieval: 'complete', corrections: 'complete', extraction: 'complete', grouping: 'complete' }, verifiedFacts: [{ text: 'Seven episodes.' }] } } });
  assert.equal(run.result.reasoning.evidenceContract.completeness.retrieval, 'unknown');
  assert.deepEqual(run.result.reasoning.evidenceContract.verifiedFacts, []);
  assert.match(run.result.reasoning.answer.summary, /can't establish an exact total/);
});

test('a verified fact loses authority if its qualified source cannot be represented', async t => {
  clock(t);
  const note = `${'Owner described context. '.repeat(35)}Only two episodes, uncertain grouping.`;
  const run = await exercise('How many soft-stool episodes are recorded?', { rows: [care('long-proof', 'milo', '2026-08-19', 'symptom', note)], prepareEvidence(evidence) {
    certify(evidence);
    evidence.verifiedFacts = [{ scopeKey: evidenceScopeKey(evidence.scope), kind: 'count', sourceIds: ['care:long-proof'], text: 'Two episodes.' }];
  } });
  assert.equal(run.prompt.evidenceContract.representation, 'partial');
  assert.ok(!run.prompt.evidenceContract.represented.some(span => span.sourceId === 'care:long-proof'));
  assert.match(run.result.reasoning.answer.summary, /can't establish an exact total/);
});

test('mandatory query scope preserves multiple topics and excludes unauthorized pet IDs', async t => {
  clock(t);
  const question = 'Summarize Milo weight and medication history between 2014 and 2026.';
  const run = await exercise(question, { authoritativePetIds: ['milo', 'not-owned'] });
  assert.deepEqual(run.prompt.evidenceContract.scope.authorizedPetIds, ['milo']);
  assert.equal(run.prompt.evidenceContract.scope.requestText, question);
  assert.equal(run.prompt.evidenceContract.scope.requestedPeriod.surface, question);
  assert.match(run.prompt.evidenceContract.scope.requestedTopic, /weight, medication/);
});
test('ambiguous episode reference asks for clarification', async t => {
  clock(t);
  const run = await exercise('What about the second episode?', { answer: 'The second episode was vomiting in 2014.' });
  assert.equal(run.prompt.evidenceContract.scope.status, 'ambiguous');
  assert.match(run.result.reasoning.answer.summary, /Which episode/);
});
test('qualified short source survives exactly in provenance and actual model record', async t => {
  clock(t);
  const note = 'On Aug. 19 Milo weighed 27.8 kg. He may have had nausea, not vomiting; Bruno vomited.';
  const run = await exercise('What did the August 19 weight note say?', { rows: [care('qualified-small', 'milo', '2026-08-19', 'weight', note)] });
  const span = run.prompt.evidenceContract.represented.find(span => span.sourceId === 'care:qualified-small');
  assert.equal(span.text, note); assert.equal(span.start, 0); assert.equal(span.end, note.length);
  assert.equal(run.prompt.contextRecords.find(record => record.id === span.sourceId).value, span.text);
});
test('date-filtered load does not claim correction completeness for requested historical period', async t => {
  clock(t);
  const run = await exercise('Summarize all history in 2014.', { dateRange: { from: '2014-01-01', to: '2014-12-31' } });
  const evidence = run.prompt.evidenceContract;
  assert.deepEqual(evidence.sources.find(source => source.source === 'care_entries').loadedPeriod, { from: '2014-01-01', to: '2014-12-31' });
  assert.equal(evidence.completeness.corrections, 'unknown');
  assert.match(run.result.reasoning.answer.summary, /can't establish a complete summary/);
});
test('prompt overflow records losses without dropping mandatory scope/coverage or slicing source text', async t => {
  clock(t);
  const run = await exercise('Summarize Milo entire recorded history.', { prepareContext(context) {
    // Large metadata exhausts the prompt without altering established caps.
    context.recentlyResolvedConcerns = [{ id: 'large', pet_profile_id: 'milo', title: 'Old concern', normalized_key: 'old', status: 'resolved', resolved_at: '2026-09-03', resolution_note: 'x'.repeat(38_000) }];
  } });
  assert.ok(run.serialized.length <= ASK_PROMPT_CONTEXT_CHAR_BUDGET);
  assert.ok(run.prompt.evidenceContract.losses.some(loss => loss.reason === 'prompt_budget'));
  assert.deepEqual(run.prompt.evidenceContract.scope.authorizedPetIds, ['milo']);
  assert.equal(run.prompt.evidenceContract.representation, 'partial');
});
test('oversized mandatory scope fails before provider instead of silently deleting coverage', async t => {
  clock(t);
  await assert.rejects(exercise(`Summarize Milo entire history. ${'context '.repeat(9_000)}`), /ASK_EVIDENCE_SCOPE_EXCEEDS_BUDGET/);
});
test('model proposals cannot turn factual recall into new history or memory', async t => {
  clock(t);
  const run = await exercise('How many soft-stool episodes did I report?', { providerOverrides: {
    proposedHistoryUpdate: { shouldOffer: true, category: 'symptom', title: 'Vomiting resolved', details: 'Milo stopped vomiting.', severity: 'resolved', resolvesConcernId: 'c1' },
    careActions: [{ action: 'create_entry', category: 'symptom', title: 'Soft stool', details: 'Milo had soft stool.', severity: 'routine', confidence: 1, relatedRecordId: null }],
    learnings: [{ subjectType: 'pet', subjectId: 'milo', category: 'preference', factKey: 'food_preference', factValue: 'Milo prefers salmon.', confidence: 1, importance: 'high', durability: 'durable', action: 'create', sourceExcerpt: 'Milo prefers salmon.' }],
    applicationActions: [{ kind: 'care_history.add', explicitIntent: true, evidence: 'Milo had soft stool.', input: { field: null, value: null, title: 'Soft stool', detail: 'Milo had soft stool.', category: 'symptom', target: 'selected' } }],
  } });
  assert.deepEqual(run.result.acceptedCareActions, []);
  assert.deepEqual(run.result.acceptedSemanticEvents, []);
  assert.deepEqual(run.result.acceptedLearnings, []);
  assert.deepEqual(run.result.reasoning.applicationActions, []);
  assert.equal(run.result.reasoning.proposedHistoryUpdate.shouldOffer, false);
  assert.equal(run.result.reasoning.evidenceContract.scope.readOnlyRecall, true);
});
test('explicit save and mixed owner observations are not turned into question-only recall', async t => {
  clock(t);
  const run = await exercise('Please save this in history.', { messages: [{ id: 'prior-observation', role: 'user', user_text: 'Milo weighs 27.8 kg today.', sequence_number: 1, user_id: ownerId, conversation_id: 'chat', created_at: '2026-09-04T10:00:00Z' }] });
  assert.equal(run.prompt.evidenceContract.scope.readOnlyRecall, false);
  assert.ok(run.result.acceptedCareActions.some(action => /27\.8 kg/.test(action.details)));
  const mixed = await exercise('Milo stopped vomiting today. How many episodes have I reported?');
  assert.equal(mixed.prompt.evidenceContract.scope.readOnlyRecall, false);
});
test('emergency recognition survives a history request with incomplete evidence', async t => {
  clock(t);
  const run = await exercise('Milo collapsed. How many vomiting episodes have I reported?', { answer: 'Seven episodes.' });
  assert.equal(run.result.safety.currentMessageEmergency, true);
  assert.equal(run.result.reasoning.safetyLevel, 'urgent');
  assert.match(run.result.reasoning.answer.summary, /emergency veterinarian/);
  assert.doesNotMatch(run.result.reasoning.answer.summary, /Seven episodes/);
});
