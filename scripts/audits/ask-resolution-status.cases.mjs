import assert from 'node:assert/strict';
import test from 'node:test';
import { exercise, clock, ASK_PROMPT_CONTEXT_CHAR_BUDGET } from './helpers/lifetime-harness.mjs';
import { care, decisive, ownerId } from './fixtures/ask-lifetime-history.mjs';
import { emptyProposedSemanticFrame } from '../../app/lib/intelligence/semantic-frame/extract-frame.ts';
import { validateGeneratedAnswer } from '../../app/lib/intelligence/validation/validate-answer.ts';

const question = 'Is Luna hiding fully resolved?';
const claim = 'The hiding is fully resolved.';
const partial = decisive.find(row => row.id === 'luna-hiding');
const terminal = care('terminal', 'luna', '2026-08-19', 'symptom', "Luna's hiding has fully resolved.");
const concept = label => ({ label, definition: null, aliases: [], parentLabels: [], relatedLabels: [] });
const frame = { ...emptyProposedSemanticFrame(), mentions: [{ localId: 'luna', surface: 'Luna', coarseType: 'animal',
  attributes: { species: 'cat', lifeStage: null, ownership: 'owner' }, evidence: [{ surfaceText: 'Luna' }], confidence: 1 }],
  claims: [{ localId: 'resolution', kind: 'state_transition', subjectRef: 'luna', predicate: concept('hiding'),
    polarity: 'affirmed', modality: 'asserted', temporal: { occurredAt: null, validFrom: null, validTo: null, surfaceText: null, precision: 'unknown' },
    uncertainty: { confidence: 1, reasons: [] }, evidence: [{ surfaceText: 'hiding fully resolved' }], persistenceHint: 'current_state',
    transition: 'resolved', fromState: 'active', toState: 'resolved', targetConcept: concept('hiding') }] };
const proposals = {
  answer: claim, answerSections: [{ heading: claim, items: [claim] }], suggestedFollowUps: [claim], relevantContextIds: ['care:luna-hiding'],
  proposedHistoryUpdate: { shouldOffer: true, category: 'symptom', title: claim, details: claim, severity: 'resolved', resolvesConcernId: 'hiding' },
  careActions: [{ action: 'create_entry', category: 'symptom', title: claim, details: claim, severity: 'routine', confidence: 1, relatedRecordId: null }],
  learnings: [{ subjectType: 'pet', subjectId: 'luna', category: 'behavior', factKey: 'hiding', factValue: claim, confidence: 1,
    importance: 'high', durability: 'durable', action: 'create', sourceExcerpt: question }],
  semanticEvents: [{ subject: { type: 'pet', name: 'Luna' }, domain: 'behavior', topic: 'hiding', eventTitle: claim, transition: 'resolved', state: 'resolved',
    temporal: { occurredAt: null, explicitTime: null }, importance: 'routine', confidence: 1, sourceExcerpt: question }],
  applicationActions: [{ kind: 'care_history.add', explicitIntent: true, evidence: question,
    input: { field: null, value: null, title: claim, detail: claim, category: 'symptom', target: 'selected' } }],
  semanticFrame: frame,
};
function noWrites(run) {
  const { result } = run;
  for (const key of ['acceptedCareActions', 'acceptedLearnings', 'acceptedSemanticEvents']) assert.deepEqual(result[key], [], key);
  for (const key of ['careActions', 'learnings', 'semanticEvents']) assert.deepEqual(result.reasoning[key], [], key);
  assert.equal(result.reasoning.proposedHistoryUpdate.shouldOffer, false);
  assert.ok(result.reasoning.applicationActions.every(action => action.kind.startsWith('navigation.') || ['pet.read', 'memory.list', 'care_history.query'].includes(action.kind)));
  assert.deepEqual(result.v2GovernedTurn.acceptedClaims, []);
  assert.deepEqual(result.v2GovernedTurn.relations, []);
  assert.ok(result.governance.careActions.every(item => item.decision !== 'accepted'));
  assert.ok(result.governance.memories.every(item => item.decision !== 'accepted'));
  assert.deepEqual(result.reasoning.semanticFrame.claims, []);
  assert.deepEqual(result.reasoning.suggestedFollowUps, []);
  assert.deepEqual(result.reasoning.referencedRecords, []);
  assert.deepEqual(result.reasoning.relevantContextIds, []);
  assert.equal(result.reasoning.evidenceContract.scope.readOnlyRecall, true);
  assert.equal(result.reasoning.messageUnderstanding.recoveryStatus, 'none');
  assert.doesNotMatch(JSON.stringify(result.reasoning.answer), /fully resolved/i);
  assert.match(result.reasoning.answer.summary, /can't establish/);
  assert.equal(result.answerValidation.valid, true);
}
const runStatus = options => exercise(question, { petId: 'luna', history: true, providerOverrides: proposals, ...options });

test('status authority takes precedence over an episode result and preserves permitted read actions', async t => {
  clock(t);
  const run = await runStatus({ afterGeneration(reasoning) {
    reasoning.applicationActions.push({ kind: 'care_history.query', explicitIntent: true, evidence: question,
      input: { field: null, value: null, title: null, detail: null, category: null, target: 'selected' } });
  } });
  noWrites(run);
  assert.equal(run.result.reasoning.applicationActions.length, 1);
  assert.equal(run.result.reasoning.applicationActions[0].kind, 'care_history.query');
  const validated = validateGeneratedAnswer(run.result.reasoning, { ...run.context,
    episodeResult: { version: 'ask-episodes.v1', petId: 'luna', topic: 'vomiting', from: null, to: null,
      items: [], supportedCount: 0, exactTotal: null, entryCount: 0, coverage: 'partial',
      reasons: ['bounded_evidence_not_lifetime_total'], provenance: [], referenceStatus: 'list' } }, 'routine', ['luna']);
  assert.equal(validated.valid, true);
  assert.deepEqual(validated.response.answer, run.result.reasoning.answer);
  assert.ok(validated.repairs.includes('applied_server_resolution_status'));
  assert.ok(!validated.repairs.includes('applied_server_episode_result'));
});

test('still-hiding attribution does not invent improvement', async t => {
  clock(t);
  const run = await runStatus({ rows: [care('still', 'luna', '2026-08-19', 'symptom', 'Luna still hides sometimes.')] });
  noWrites(run);
  assert.match(run.result.reasoning.answer.summary, /August 19, 2026 note reports that hiding still happened sometimes/);
  assert.doesNotMatch(run.result.reasoning.answer.summary, /decreased|improv/);
});

test('unchanged Luna question and August 19 partial note through actual callback; all write channels adversarial', async t => {
  clock(t);
  const run = await runStatus({ authoritativeSemanticFrame: frame, afterGeneration(reasoning) {
    assert.equal(reasoning.careActions.length, 1);
    assert.equal(reasoning.learnings.length, 1);
    assert.equal(reasoning.semanticEvents.length, 1);
    assert.equal(reasoning.semanticFrame.claims.length, 1);
    // Title and safetyNote are not provider-schema fields. Exercise the actual
    // validator boundary for those surfaces after the real generator runs.
    reasoning.answer.title = claim;
    reasoning.answer.safetyNote = claim;
  } });
  noWrites(run);
  const source = run.prompt.contextRecords.find(record => record.id === 'care:luna-hiding');
  assert.equal(source.value, partial.note);
  assert.equal(source.occurredAt, partial.occurred_at);
  assert.deepEqual(run.result.reasoning.evidenceContract, run.prompt.evidenceContract);
  assert.equal(run.prompt.evidenceContract.scope.requestKind, 'resolution_status');
  assert.match(run.result.reasoning.answer.summary, /August 19, 2026 note reports.*decreased but still happened sometimes/);
  assert.ok(run.serialized.length <= ASK_PROMPT_CONTEXT_CHAR_BUDGET);
  assert.deepEqual(run.prompt.evidenceContract.verifiedFacts, []);
});

for (const surface of ['title', 'summary', 'sections', 'safetyNote']) test(`final validator owns the complete ${surface}`, async t => {
  clock(t);
  const run = await runStatus({ afterGeneration(reasoning) {
    reasoning.answer = { title: 'Furvise', summary: 'An observation.', sections: [], safetyNote: null,
      [surface]: surface === 'sections' ? [{ heading: claim, items: [claim] }] : claim };
  } });
  noWrites(run);
  assert.deepEqual(run.result.reasoning.answer.sections, []);
  assert.equal(run.result.reasoning.answer.safetyNote, null);
});

test('terminal dated owner report remains historical, never current certification', async t => {
  clock(t);
  const run = await runStatus({ rows: [terminal] });
  noWrites(run);
  assert.match(run.result.reasoning.answer.summary, /August 19, 2026.*owner reported.*at that time/);
  assert.match(run.result.reasoning.answer.summary, /ended now/);
});

for (const [name, options] of [
  ['missing', { rows: [] }],
  ['wrong pet', { rows: [care('wrong', 'milo', '2026-08-19', 'symptom', 'Milo stopped hiding.')] }],
  ['wrong topic', { rows: [care('wrong', 'luna', '2026-08-19', 'symptom', "Luna's litter problem has fully resolved.")] }],
  ['wrong subject inside same-pet row', { rows: [care('wrong', 'luna', '2026-08-19', 'symptom', 'Milo stopped hiding.')] }],
  ['ambiguous text', { rows: [care('unclear', 'luna', '2026-08-19', 'symptom', 'Luna might have stopped hiding, but this is uncertain.')] }],
  ['conflicting notes', { rows: [partial, terminal] }],
  ['deleted', { rows: [{ ...partial, deleted_at: '2026-08-20T00:00:00Z' }] }],
  ['future date', { rows: [{ ...terminal, occurred_at: '2027-08-19T00:00:00Z' }] }],
  ['missing observation date', { rows: [{ ...terminal, occurred_at: null }] }],
  ['invalid observation date', { rows: [{ ...terminal, occurred_at: '2026-02-31T12:00:00Z' }] }],
  ['unavailable care loader', { failCare: true }],
  ['intermediate omission', { prepareContext(context) { context.selectedCareEntries = []; } }],
  ['qualified source too long', { rows: [{ ...terminal, note: `${terminal.note} ${'Qualification remains unknown. '.repeat(30)}` }] }],
]) test(`${name} returns uncertainty with zero writes`, async t => {
  clock(t);
  const run = await runStatus(options);
  noWrites(run);
  assert.doesNotMatch(run.result.reasoning.answer.summary, /note reports/);
});

for (const [text, ids] of [
  ['Is that fully resolved?', ['luna']], ['Is Luna hiding or litter fully resolved?', ['luna']],
  [question, ['luna', 'milo']], ['Is Milo hiding fully resolved?', ['luna']], [question, []],
]) test(`ambiguous subject/topic abstains: ${text} / ${ids}`, async t => {
  clock(t);
  const run = await exercise(text, { history: true, petId: 'luna', authoritativePetIds: ids, providerOverrides: proposals });
  noWrites(run);
  assert.doesNotMatch(run.result.reasoning.answer.summary, /note reports/);
});

test('final budget omissions remove attribution authority, regardless of loaded context or provider citation', async t => {
  clock(t);
  const baseline = await runStatus({ rows: [partial] });
  const emptySize = JSON.stringify({ ...baseline.prompt, contextRecords: [], evidenceContract: { ...baseline.prompt.evidenceContract, represented: [] } }).length;
  const run = await runStatus({ rows: [partial], prepareContext(context) {
    // Synthetic mandatory coverage metadata leaves too little room for the
    // source. The production budgeter, not this harness, removes the records.
    context.evidenceLoading.sources[0].reasons.push('x'.repeat(ASK_PROMPT_CONTEXT_CHAR_BUDGET - emptySize - 250));
  } });
  noWrites(run);
  assert.ok(run.serialized.length <= ASK_PROMPT_CONTEXT_CHAR_BUDGET);
  assert.ok(!run.prompt.contextRecords.some(record => record.id === 'care:luna-hiding'));
  assert.doesNotMatch(run.result.reasoning.answer.summary, /note reports/);
});

for (const recoveryStatus of ['none', 'partial', 'uncertain', 'terminal']) test(`model recovery ${recoveryStatus} cannot authorize status or writes`, async t => {
  clock(t);
  const baseline = await runStatus();
  const run = await runStatus({ providerOverrides: { ...proposals,
    messageUnderstanding: { ...baseline.result.reasoning.messageUnderstanding, recoveryStatus, userIsResolvingConcern: true, userIsProvidingUpdate: true,
      recoveryEvidence: { outcome: 'problem_ended', surfaceText: 'Luna stopped hiding.', targetConcept: 'hiding', confidence: 1 } },
    intelligenceSafety: { level: 'recently_resolved', reason: claim, requiresImmediateAction: false, shoppingSuppressed: false },
  }, afterGeneration(reasoning) { assert.equal(reasoning.messageUnderstanding.recoveryStatus, recoveryStatus); } });
  noWrites(run);
});

test('unsupported terminal provider flags retain one bounded retry before the same final authority', async t => {
  clock(t);
  const understanding = { primaryIntent: 'question', secondaryIntents: [], userIsAskingQuestion: true, userIsProvidingUpdate: false,
    userIsCorrectingPriorInformation: false, userIsResolvingConcern: true, userIsProvidingPreference: false, userIsMakingSmallTalk: false,
    recoveryStatus: 'terminal', recoveryConfidence: 1,
    recoveryEvidence: { outcome: 'none', surfaceText: null, targetConcept: null, confidence: 1 }, requestedTopic: 'hiding',
    referencedPet: 'Luna', safetyRelevance: 'none', needsClarification: false, canAnswerDirectly: true };
  const run = await runStatus({ expectedProviderCalls: 2, providerSequence: [{ messageUnderstanding: understanding },
    { messageUnderstanding: { ...understanding, recoveryStatus: 'none' } }] });
  noWrites(run);
  const attempts = [];
  await assert.rejects(runStatus({ providerSequence: new Proxy([], { get(_target, key) {
    attempts.push(Number(key)); return { messageUnderstanding: understanding };
  } }) }), /repeated unsupported terminal recovery/);
  assert.deepEqual(attempts, [0, 1], 'repeated invalid flags stop after two mocked requests');
});

for (const [name, options] of [
  ['changed', { graphAtCall: () => ({ sources: [{ ...terminal, note: 'Luna still hides sometimes.', updated_at: '2026-08-20T00:00:00Z' }] }) }],
  ['missing source', { graph: { missingSourceIds: ['terminal'] } }],
  ['unavailable correction lookup', { failGraph: true }],
  ['candidate unavailable', { failHistoryPage: 1 }],
]) test(`bounded historical status path rejects ${name}`, async t => {
  clock(t);
  const run = await exercise("Has Luna's hiding ended in 2026?", { history: true, petId: 'luna', rows: [terminal], providerOverrides: proposals, ...options });
  noWrites(run);
  assert.ok(run.prompt.evidenceContract.history);
  assert.doesNotMatch(run.result.reasoning.answer.summary, /note reports/);
});

test('dated historical retrieval can attribute unverified legacy prose without certifying current state', async t => {
  clock(t);
  const run = await exercise("Has Luna's hiding ended in 2026?", { history: true, petId: 'luna', rows: [terminal], providerOverrides: proposals });
  noWrites(run);
  assert.ok(run.prompt.evidenceContract.history);
  assert.match(run.result.reasoning.answer.summary, /owner reported.*at that time/);
  assert.equal(run.prompt.evidenceContract.history.consistency, 'read_committed_no_snapshot');
});

test('superseded historical source cannot supply a dated terminal attribution', async t => {
  clock(t);
  const original = { id: 'old', user_id: ownerId, subject_type: 'pet', subject_id: 'luna', claim_kind: 'event', operation_type: 'assert',
    concept_key: 'hiding', canonical_concept_key: 'hiding', concept_resolution_status: 'canonical', persistence_destination: 'history',
    knowledge_status: 'effective', occurred_at: terminal.occurred_at, recorded_at: terminal.created_at, provenance_classification: 'imported_legacy',
    structured_value: { title: null, note: terminal.note, severity: null } };
  const correction = { ...original, id: 'correction', subject_id: 'milo', operation_type: 'correct', structured_value: { title: null, note: 'Milo stopped hiding, not Luna.', severity: null } };
  const run = await exercise("Has Luna's hiding ended in 2026?", { history: true, petId: 'luna', rows: [terminal], providerOverrides: proposals,
    graph: { claims: [original, correction], relations: [{ id: 'edge', user_id: ownerId, from_claim_id: 'correction', to_claim_id: 'old', relation_type: 'corrects' }],
      lineage: [{ user_id: ownerId, claim_id: 'old', legacy_row_id: terminal.id, legacy_table: 'pet_care_entries', claim_role: 'primary' }] } });
  noWrites(run);
  assert.ok(run.prompt.evidenceContract.history.provenance.some(item => item.sourceId === 'care:terminal' && item.status === 'superseded'));
  assert.doesNotMatch(run.result.reasoning.answer.summary, /note reports/);
});

test('urgent safety and shopping suppression survive final deterministic status composition', async t => {
  clock(t);
  const run = await runStatus({ afterGeneration(reasoning) { reasoning.intelligenceSafety.level = 'urgent'; reasoning.shoppingSuppressed = true; } });
  noWrites(run);
  assert.equal(run.result.reasoning.safetyLevel, 'urgent');
  assert.equal(run.result.reasoning.shoppingSuppressed, true);
  assert.match(run.result.reasoning.answer.safetyNote, /emergency veterinarian/);
  const validated = validateGeneratedAnswer(run.result.reasoning, run.context, 'emergency', ['luna']);
  assert.equal(validated.valid, true);
  assert.match(validated.response.answer.safetyNote, /emergency veterinarian/);
});

for (const text of [
  'Luna stopped hiding today. Is her hiding fully resolved?',
  'Please save this: Luna stopped hiding today.',
  'Luna collapsed. Is her hiding fully resolved?',
]) test(`owner update/save/urgent observation remains outside status-only recall: ${text}`, async t => {
  clock(t);
  const run = await exercise(text, { petId: 'luna', history: true });
  assert.notEqual(run.prompt.evidenceContract.scope.requestKind, 'resolution_status');
  assert.equal(run.prompt.evidenceContract.scope.readOnlyRecall, false);
  if (text.includes('collapsed')) {
    assert.equal(run.result.safety.currentMessageEmergency, true);
    assert.equal(run.result.reasoning.shoppingSuppressed, true);
    assert.match(JSON.stringify(run.result.reasoning.answer), /emergency veterinarian/);
  }
  if (text.startsWith('Please save')) assert.ok(run.result.acceptedCareActions.length > 0);
});
