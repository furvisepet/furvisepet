import assert from 'node:assert/strict';
import test from 'node:test';
import { exercise, clock } from './helpers/lifetime-harness.mjs';
import { care, ownerId, pets } from './fixtures/ask-lifetime-history.mjs';
import { emptyProposedSemanticFrame } from '../../app/lib/intelligence/semantic-frame/extract-frame.ts';
import { buildAskConversationResponse, parseAskConversationResponse } from '../../app/lib/ask.mjs';
import { restoreAskEvidencePresentation } from '../../app/lib/intelligence/ask-evidence-presentation.ts';
const plan = (overrides = {}) => ({operation: 'overview', readOperation: 'overview', selection: 'summary', subject: 'explicit', petNames: ['Milo'], topic: 'digestive history', terms: ['stomach', 'vomit', 'stool'], from: null, to: null, episodeTopic: null, ordinal: null, frame: emptyProposedSemanticFrame(), ...overrides});
const message = (text, n = 1) => ({id: `user-${n}`, user_id: ownerId, conversation_id: 'chat', role: 'user', user_text: text, sequence_number: n, created_at: '2026-09-06T11:30:00Z'});
const final = r => parseAskConversationResponse(restoreAskEvidencePresentation(buildAskConversationResponse(r.result.reasoning.answer), r.result.reasoning.evidenceContract, r.context.episodeResult)).directAnswer;
const stool = care('stool-source', 'milo', '2011-01-01', 'symptom', 'Milo had soft stool for two days.');
const correction = care('unlinked-source', 'milo', '2026-09-06', 'general', 'Correction: the vomiting report was about Bruno, not Milo.');

test('production reproduction: correction-limited digestive summary still presents saved reports', async t => {
  clock(t);
  const r = await exercise('Summarize Milo\u2019s stomach history.', {history: true, rows: [stool, correction], messages: [message('Milo had stomach trouble years ago.')], interpretationProposal: plan(),
    providerOverrides: {historySynthesis: [{sourceId: 'care:stool-source', text: stool.note}]}});
  console.log('CORRECTION SUMMARY FINAL:', final(r));
  assert.ok(r.serialized.includes(stool.note));
  assert.match(final(r), /soft stool for two days/);
  assert.match(final(r), /correction/);
});

test('production reproduction: completed interpretation usage must emit a provider attempt and safe failure reason', async t => {
  clock(t);
  const {interpretAskQuestion} = await import('../../app/lib/intelligence/interpret-ask.ts');
  const base = await exercise('Summarize Milo stomach history.', {history: true, rows: [stool], messages: [message('Tell me about Milo.')]});
  const events = [];
  // One deliberately invalid date reproduces the opaque post-usage failure.
  // It is NOT evidence that this field caused the reported live 503.
  await assert.rejects(interpretAskQuestion({context: {...base.context, currentMessage: 'When was the earliest vomiting report?'}, model: 'gpt-5-mini',
    onProviderEvent: event => events.push(event), client: {responses: {async create() {
      return {status: 'completed', output_text: JSON.stringify(plan({operation: 'recall', readOperation: 'recall', subject: 'conversation', petNames: [], selection: 'earliest', terms: ['vomit'], from: '2011-02-30', to: '2012-01-01'})), usage: {input_tokens: 500, output_tokens: 220}};
    }}}}), error => {
      console.log('INTERPRETATION FAILURE:', error.stage, error.diagnostics.providerErrorCode, 'EVENTS:', events.length);
      assert.equal(events.filter(event => event.outcome === 'started').length, 1);
      assert.equal(error.diagnostics.providerErrorCode, 'ASK_INTERPRETATION_DATES'); return true;
    });
});


function noWrites(r) {
  for (const key of ['acceptedCareActions', 'acceptedLearnings', 'acceptedSemanticEvents']) assert.deepEqual(r.result[key], [], key);
  assert.deepEqual(r.result.v2GovernedTurn.acceptedClaims, []); assert.deepEqual(r.result.v2GovernedTurn.relations, []);
  assert.equal(r.result.reasoning.proposedHistoryUpdate.shouldOffer, false);
}
const fixturePets = pets;
const vomit = care('vomit-original', 'milo', '2010-01-01', 'symptom', 'Milo vomited after breakfast.');
function reassignmentGraph() {
  const original = {id: 'original', user_id: ownerId, subject_type: 'pet', subject_id: 'milo', claim_kind: 'event', operation_type: 'assert', concept_key: 'vomiting', canonical_concept_key: 'vomiting', concept_resolution_status: 'canonical', persistence_destination: 'history', knowledge_status: 'effective', occurred_at: vomit.occurred_at, recorded_at: vomit.created_at, provenance_classification: 'imported_legacy', structured_value: {title: null, note: vomit.note, severity: null}};
  const changed = {...original, id: 'reassigned', subject_id: 'bruno', operation_type: 'correct', recorded_at: '2026-09-06T10:00:00Z', structured_value: {note: 'Bruno vomited after breakfast, not Milo.'}};
  return {claims: [original, changed], relations: [{id: 'edge', user_id: ownerId, from_claim_id: changed.id, to_claim_id: original.id, relation_type: 'corrects'}], lineage: [{user_id: ownerId, claim_id: original.id, legacy_row_id: vomit.id, legacy_table: 'pet_care_entries', claim_role: 'primary'}]};
}

test('summary, correction-limited follow-up and authoritative Bruno reassignment preserve scope', async t => {
  clock(t);
  const rows = [stool, vomit, correction, care('milo-later', 'milo', '2014-01-01', 'symptom', 'Milo vomited after a walk.')];
  const messages = [message('Tell me about Milo.')];
  const opts = {history: true, fixturePets, rows, messages, graph: reassignmentGraph()};
  const summary = await exercise('Summarize Milo stomach history.', {...opts, interpretationProposal: plan(), providerOverrides: {historySynthesis: [{sourceId: 'care:stool-source', text: stool.note}]}});
  assert.match(final(summary), /soft stool for two days/); assert.doesNotMatch(final(summary), /Milo vomited after breakfast/);
  const saved = {id: 'summary', user_id: ownerId, conversation_id: 'chat', role: 'furvise', response_data: restoreAskEvidencePresentation(buildAskConversationResponse(summary.result.reasoning.answer), summary.result.reasoning.evidenceContract, summary.context.episodeResult), sequence_number: 2};
  const follow = await exercise('When was the earliest vomiting report?', {...opts, messages: [...messages, saved], interpretationProposal: plan({operation: 'recall', readOperation: 'recall', subject: 'explicit', petNames: ['Milo'], selection: 'earliest', topic: 'vomiting', terms: ['vomit']})});
  console.log('FOLLOW-UP FINAL:', final(follow));
  assert.equal(follow.context.pet.id, 'milo'); assert.match(final(follow), /2014-01-01/);
  assert.doesNotMatch(final(follow), /2010-01-01|earliest matching report I could check/);
  assert.match(final(follow), /cannot confirm which reports/);
  const other = await exercise('What is saved about Bruno vomiting?', {...opts, interpretationProposal: plan({operation: 'recall', readOperation: 'recall', petNames: ['Bruno'], terms: ['vomit']})});
  assert.equal(other.context.pet.id, 'bruno'); assert.ok(other.context.askHistory.entries.some(row => row.pet_profile_id === 'bruno' && row.note.includes('Bruno vomited')));
  assert.ok(!other.context.askHistory.entries.some(row => row.pet_profile_id === 'milo'));
  for (const r of [summary, follow, other]) noWrites(r);
});

test('correction uncertainty does not restore superseded, deleted or forgotten source prose', async t => {
  clock(t);
  for (const graph of [{withheld_source_ids: [stool.id]}, {sources: [{...stool, deleted_at: '2026-09-06T00:00:00Z'}]}, {sources: [{...stool, note: 'New source version.'}]}]) {
    const r = await exercise('Summarize Milo stomach history.', {history: true, rows: [stool, correction], messages: [], graph, interpretationProposal: plan(), answer: stool.note});
    assert.doesNotMatch(final(r), /soft stool for two days/); noWrites(r);
  }
});

test('earliest matching report differs from first occurrence without discarding an unresolved earlier source', async t => {
  clock(t);
  const rows = [care('neg', 'milo', '2009-01-01', 'symptom', 'Milo had no vomiting on this day.'), care('prevention', 'milo', '2010-01-01', 'general', 'The vet discussed vomiting prevention.'), vomit, stool];
  for (const selection of ['earliest', 'earliest_occurrence']) {
    const r = await exercise('When was the earliest vomiting report?', {history: true, rows, messages: [message('Tell me about Milo.')], interpretationProposal: plan({operation: 'recall', readOperation: 'recall', subject: 'conversation', petNames: [], selection, topic: 'vomiting', terms: ['vomit']})});
    assert.match(final(r), selection === 'earliest' ? /2009-01-01/ : /could not identify a supported first occurrence/);
    if (selection === 'earliest_occurrence') assert.match(final(r), /vomiting prevention/);
    noWrites(r);
  }
});

test('explicit names, contextual labels and ambiguous pronouns remain server scoped', async t => {
  clock(t);
  const rows = [stool, care('luna-stool', 'luna', '2013-01-01', 'symptom', 'Luna had soft stool for one day.')];
  const luna = await exercise('Summarize Luna stool history.', {history: true, rows, messages: [message('Tell me about Milo.')], interpretationProposal: plan({subject: 'selected', petNames: [], terms: ['stool']})});
  assert.equal(luna.context.pet.id, 'luna'); assert.match(final(luna), /one day/); assert.doesNotMatch(final(luna), /two days/);
  const follow = await exercise('What is her earliest stool report?', {history: true, rows, messages: [message('Tell me about Milo.'), message('Now tell me about Luna.', 2)], interpretationProposal: plan({operation: 'recall', readOperation: 'recall', selection: 'earliest', subject: 'explicit', petNames: ['Luna'], terms: ['stool']})});
  assert.equal(follow.context.pet.id, 'luna'); assert.match(final(follow), /2013-01-01/);
  const back = await exercise('Return to Milo stomach history.', {history: true, rows, messages: [message('Tell me about Luna.')], interpretationProposal: plan({subject: 'conversation'})});
  assert.equal(back.context.pet.id, 'milo'); assert.doesNotMatch(final(back), /one day/);
  const ambiguous = await exercise('What happened to them?', {history: true, fixturePets, rows, messages: [message('Compare Milo and Bruno.')], interpretationProposal: plan({subject: 'selected', petNames: ['Milo']})});
  assert.equal(ambiguous.context.askInterpretation.clarification, 'subject'); assert.deepEqual(ambiguous.context.askInterpretation.petIds, []);
  for (const r of [luna, follow, back, ambiguous]) noWrites(r);
});

test('safe interpretation diagnostics distinguish external failure and invalid server plans', async t => {
  clock(t);
  const events = [];
  const usage = {input_tokens: 500, output_tokens: 200};
  const marker = 'PRIVATE_RESPONSE_SENTINEL';
  for (const [response, code, kind] of [
    [{status: 'incomplete', incomplete_details: {reason: marker}, usage}, 'INCOMPLETE', 'incomplete'],
    [{status: 'completed', output: [{content: [{type: 'refusal', refusal: marker}]}], usage}, 'REFUSED', 'refused'],
    [{status: 'failed', error: {code: marker, message: marker}, usage}, 'FAILED', 'failed'],
    [{status: 'completed', output_text: '{' + marker, usage}, 'JSON', 'json'],
    [{status: 'completed', output_text: '{}', usage}, 'SCHEMA', 'schema'],
    [{status: 'completed', output_text: JSON.stringify(plan({terms: ['vomit;SQL']})), usage}, 'TERMS', 'schema'],
    [{status: 'completed', output_text: JSON.stringify(plan({ordinal: 'first'})), usage}, 'EPISODE_REFERENCE', 'semantic'],
    [{status: 'completed', output_text: JSON.stringify(plan({subject: 'explicit', petNames: ['foreign']})), usage}, 'OWNERSHIP', 'semantic'],
    [{status: 'completed', output: [], usage}, 'EMPTY_OUTPUT', 'empty_output'],
  ]) {
    events.length = 0;
    await assert.rejects(exercise('Summarize Milo stomach history.', {history: true, rows: [stool], messages: [], interpretationProposal: plan(), onProviderEvent: e => events.push(e), interpretationResponse: async () => response}), e => {
      assert.equal(e.stage, 'interpretation_failed'); assert.equal(e.diagnostics.providerErrorCode, 'ASK_INTERPRETATION_' + code); assert.equal(e.diagnostics.providerErrorType, kind); return true;
    });
    assert.deepEqual(events.map(e => [e.stage, e.outcome]), [['interpretation', 'started'], ['interpretation', 'failed']]);
    assert.ok(!JSON.stringify(events).includes(marker)); assert.ok(!JSON.stringify(events).includes(stool.note));
  }
  for (const name of ['Error', 'TimeoutError']) {
    events.length = 0;
    await assert.rejects(exercise('Summarize Milo stomach history.', {history: true, rows: [stool], interpretationProposal: plan(), onProviderEvent: e => events.push(e), interpretationResponse: async () => {const e = new Error(marker); e.name = name; throw e;}}), e => e.diagnostics.providerErrorCode === (name === 'Error' ? 'ASK_INTERPRETATION_TRANSPORT' : 'ASK_INTERPRETATION_TIMEOUT'));
    assert.equal(events.filter(e => e.outcome === 'started').length, 1); assert.ok(!JSON.stringify(events).includes(marker));
  }
});


test('actual callback provider events, admission and ledger settlement survive failure and retry', async t => {
  clock(t);
  const {runAdmittedAiOperation} = await import('../../app/lib/ai/usage-guard/admission.ts');
  const {MemoryAiGuardTestStore} = await import('../../app/lib/ai/usage-guard/memory-test-store.ts');
  const {AskTurnLifecycle} = await import('../../app/lib/ai/ask-turn-model.ts');
  const {reserveAiCredit, releaseAiCredit, completeAiCredit, reconcileAiCreditLogicalRequest} = await import('../../app/lib/ai/usage-ledger.ts');
  const {SettlementLedger} = await import('./helpers/ask-settlement-ledger.mjs');
  const {OPENAI_ANALYSIS_MODEL} = await import('../../app/lib/ai/config.ts');
  const store = new MemoryAiGuardTestStore();
  const ledger = new SettlementLedger();
  const saved = new Map();
  let attempt = 0;
  const cases = [
    ['interpretation_transport', {interpretationResponse: async () => {throw Error('private transport body');}}, 1],
    ['interpretation_incomplete', {interpretationResponse: async () => ({status: 'incomplete', usage: {input_tokens: 500, output_tokens: 2600}})}, 1],
    ['interpretation_semantic', {interpretationProposal: plan({from: '2011-02-30', to: '2012-01-01'})}, 1],
    ['answer_transport', {providerResponse: async () => {throw Error('transport');}}, 2],
    ['answer_repair_budget', {providerResponse: async () => ({status: 'completed', output_text: '{}', usage: {input_tokens: 500, output_tokens: 20}})}, 2],
  ];
  for (const [label, failure, expectedCalls] of cases) {
    const logicalRequestId = 'logical-' + label;
    const payloadHash = 'hash-' + label;
    const execute = async overrides => {
      // Same logical request replay never invokes another provider or persists a
      // second response. This adapter tests the existing ledger APIs with a mocked
      // external store; it is not an authenticated HTTP/database transaction test.
      if (saved.has(logicalRequestId)) return saved.get(logicalRequestId);
      const requestId = 'attempt-' + ++attempt;
      const turn = new AskTurnLifecycle(logicalRequestId, requestId);
      turn.transition('VALIDATED').transition('ROUTED').transition('CONTEXT_READY').transition('AI_ADMITTED').transition('GENERATING');
      const credit = {feature: 'ask', ledgerClient: ledger, userId: ownerId, logicalRequestId, payloadHash, requestId};
      let thrown;
      let result;
      const stages = [];
      try {
        result = await runAdmittedAiOperation({store, feature: 'ask', intendedModel: OPENAI_ANALYSIS_MODEL, env: {NODE_ENV: 'test'}, payload: {question: 'History'}, userId: ownerId, requestId}, async () => {
          await reserveAiCredit(credit); turn.credit('reserved');
          try {
            const r = await exercise('Summarize Milo stomach history.', {history: true, rows: [stool, correction], messages: [], interpretationModel: OPENAI_ANALYSIS_MODEL, interpretationProposal: plan(), onProviderEvent: event => turn.providerEvent(event), onStage: stage => stages.push(stage), ...overrides});
            noWrites(r); saved.set(logicalRequestId, r);
            await completeAiCredit(credit); turn.credit('completed').settlement('complete', 'reconciled');
            return r;
          } catch (error) {
            await releaseAiCredit(credit); turn.credit('released').settlement('release', 'reconciled'); throw error;
          }
        });
      } catch (error) { thrown = error; turn.fail(error.stage || error.reason, true); }
      return {result, thrown, stages, trace: turn.snapshot()};
    };
    const before = store.getSnapshot('2026-09-04').calls;
    const failed = await execute(failure);
    assert.ok(failed.thrown, label);
    assert.equal(failed.trace.providerCallCount, expectedCalls, label);
    assert.equal(store.getSnapshot('2026-09-04').calls - before, expectedCalls, label);
    assert.equal(failed.trace.creditState, 'released'); assert.equal(failed.trace.creditDisposition, 'release');
    assert.equal(saved.has(logicalRequestId), false);
    if (label.startsWith('interpretation')) { assert.match(failed.trace.providerFailureClass, /ASK_INTERPRETATION_/); assert.deepEqual(failed.stages, []); }
    else assert.equal(failed.stages.at(-1), 'answer_generation');
    if (label === 'answer_repair_budget') assert.equal(failed.thrown.code, 'AI_PROVIDER_BUDGET_EXHAUSTED');
    const completed = await execute({}); assert.deepEqual(completed.stages, ['history_retrieval', 'episode_retrieval', 'answer_generation', 'final_presentation']); assert.equal(completed.trace.providerCallCount, 2); assert.equal(completed.trace.creditState, 'completed');
    const after = store.getSnapshot('2026-09-04').calls;
    await execute({}); assert.equal(store.getSnapshot('2026-09-04').calls, after);
    await reconcileAiCreditLogicalRequest({feature: 'ask', supabase: ledger, logicalRequestId, payloadHash, userId: ownerId});
    const events = [...ledger.events.values()].filter(event => event.logicalRequestId === logicalRequestId);
    assert.equal(events.filter(e => e.status === 'completed').length, 1);
    assert.equal(events.filter(e => e.status === 'released').length, 1);
    assert.equal(events.reduce((n, e) => n + e.credits, 0), 1);
  }
  assert.equal(saved.size, cases.length); assert.equal(ledger.reservedCount(), 0);
  assert.ok([...store.calls.values()].every(call => call.started));
  assert.ok([...store.calls.values()].some(call => call.state === 'completed'), 'provider usage is reconciled independently of credit release');
});


test('partial retrieval and an unresolved correction retain both limitations and usable facts', async t => {
  clock(t);
  const earlyCorrection = {...correction, occurred_at: '2010-01-01T00:00:00Z'};
  const r = await exercise('Summarize Milo stomach history.', {history: true, rows: [earlyCorrection, stool], messages: [], interpretationProposal: plan(), historyPageCap: 2, failHistoryPage: 2});
  assert.match(final(r), /soft stool for two days/); assert.match(final(r), /couldn't be loaded/); assert.match(final(r), /cannot confirm which reports/); noWrites(r);
});

test('unclear subject remains a clarification even when the model lists owned candidate names', async t => {
  clock(t);
  const r = await exercise('What happened to them?', {history: true, rows: [stool], messages: [message('Compare Milo and Bruno.')], interpretationProposal: plan({subject: 'unclear', petNames: ['Milo', 'Bruno']})});
  assert.equal(r.context.askInterpretation.clarification, 'subject'); assert.deepEqual(r.context.askInterpretation.petIds, []); noWrites(r);
});
