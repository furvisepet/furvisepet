import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
function load(relative) {
  const url = new URL(relative, import.meta.url);
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, require: name => name.startsWith('.') ? load(new URL(name, url).href) : require(name) });
  return exports;
}
const { assessTaskExecution } = load('../app/lib/intelligence/task-execution-contract.ts');
const { createAnswerAssessment } = load('../app/lib/intelligence/answer-assessment.ts');
const checks = { structuralValidity: 'passed', evidenceSupport: 'passed', subjectDateCorrectness: 'passed', calculationCorrectness: 'not_applicable', taskCompletion: 'passed' };
const assessment = (overrides = {}) => createAnswerAssessment({ checks: { ...checks, ...overrides }, body: {}, evidence: [] });
const base = () => ({ assessment: assessment(), completion: [{ index: 0, status: 'answered' }], responseMode: 'answer', actions: [], careWriteRequired: false, careReceipt: { status: 'skipped', careEntryIds: [] } });
const action = status => ({ mutationClass: 'mutation', explicitIntent: true, status });

test('a reviewed read answer is billable; failed and unevaluated evidence is not', () => {
  assert.equal(assessTaskExecution(base()).creditDisposition, 'complete');
  for (const status of ['failed', 'not_evaluated']) {
    assert.equal(assessTaskExecution({ ...base(), assessment: assessment({ evidenceSupport: status }) }).creditDisposition, 'release');
  }
  assert.equal(assessTaskExecution({ ...base(), assessment: null }).creditDisposition, 'release');
});
for (const status of ['proposed', 'awaiting_confirmation', 'failed', 'succeeded']) {
  test(`execution result governs every explicit mutation: ${status}`, () => {
    const result = assessTaskExecution({ ...base(), actions: [action(status)] });
    assert.equal(result.creditDisposition, status === 'succeeded' ? 'complete' : 'release');
    assert.equal(result.mutationOutcome, status === 'succeeded' ? 'applied' : status === 'failed' ? 'failed' : 'pending');
  });
}
test('partial mixed actions cannot become a completed task', () => {
  for (const status of ['failed', 'proposed']) assert.equal(assessTaskExecution({ ...base(), actions: [action('succeeded'), action(status)] }).creditDisposition, 'release');
});
test('action readiness becomes completion only with a successful execution receipt', () => {
  const input = { ...base(), assessment: assessment({ taskCompletion: 'not_evaluated' }), completion: [{ index: 0, status: 'action_ready' }], careWriteRequired: true };
  assert.equal(assessTaskExecution(input).creditDisposition, 'release');
  assert.equal(assessTaskExecution({ ...input, careReceipt: { status: 'persisted', careEntryIds: ['entry'] } }).creditDisposition, 'complete');
  assert.equal(assessTaskExecution({ ...input, assessment: assessment({ evidenceSupport: 'failed' }), careReceipt: { status: 'persisted', careEntryIds: ['entry'] } }).creditDisposition, 'release');
});
test('batch care writes require distinct persisted entries for every requested item', () => {
  for (const ids of [[], ['entry'], ['entry', 'entry']]) {
    assert.equal(assessTaskExecution({ ...base(), careWriteRequired: true, minimumCareEntries: 2, careReceipt: { status: 'persisted', careEntryIds: ids } }).creditDisposition, 'release');
  }
  assert.equal(assessTaskExecution({ ...base(), careWriteRequired: true, minimumCareEntries: 2, careReceipt: { status: 'persisted', careEntryIds: ['a', 'b'] } }).creditDisposition, 'complete');
});
test('clarification stays free even with an incorrectly complete answer assessment', () => {
  assert.equal(assessTaskExecution({ ...base(), responseMode: 'clarification' }).creditDisposition, 'release');
  assert.equal(assessTaskExecution({ ...base(), completion: [{ index: 0, status: 'needs_information' }] }).creditDisposition, 'release');
});
test('optional background failure does not invalidate a completed read', () => {
  assert.equal(assessTaskExecution({ ...base(), careExecutionFailed: true }).creditDisposition, 'complete');
  assert.equal(assessTaskExecution({ ...base(), careWriteRequired: true, careExecutionFailed: true }).creditDisposition, 'release');
});

const route = readFileSync(new URL('../app/api/ask/route.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('route.ts', route, ts.ScriptTarget.Latest, true);
function routeFunction(name, mocks) {
  const node = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(node, name);
  const js = ts.transpileModule(node.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return vm.runInNewContext(js + '\n' + name, mocks);
}
for (const disposition of [null, 'release', 'complete']) test(`durable replay preserves settlement authority: ${disposition}`, async () => {
  const calls = [];
  const fn = routeFunction('reconcilePersistedAskCredit', {
    getAiCreditEventsForLogicalRequest: async () => [{ requestId: 'attempt', status: 'reserved', disposition }],
    setAiCreditDisposition: async input => calls.push(['decide', input.disposition]),
    reconcileAiCredit: async () => calls.push(['reconcile']),
    getRemainingAiCredits: async () => ({ remaining: 15 }),
  });
  const result = await fn({ logicalRequestId: 'turn', payloadHash: 'hash', supabase: {}, usage: {}, userId: 'owner' });
  assert.equal(result.remaining, 15);
  assert.deepEqual(calls, disposition === null ? [['decide', 'release'], ['reconcile']] : [['reconcile']]);
});
test('replay refuses conflicting disposition and identity errors', async () => {
  const conflict = new Error('identity conflict');
  const fn = routeFunction('reconcilePersistedAskCredit', {
    getAiCreditEventsForLogicalRequest: async () => [{ requestId: 'attempt', status: 'reserved', disposition: null }],
    setAiCreditDisposition: async () => { throw conflict; },
  });
  await assert.rejects(fn({ usage: {} }), error => error === conflict);
});
test('unfinished assistant persistence is presented as incomplete without rewriting reviewed prose', () => {
  const fn = routeFunction('completedResponseFromPersisted', { successfulAnswerResponse: input => input });
  const result = fn({ assistantMessage: { id: 'answer', response_data: { directAnswer: 'Reviewed draft.', turn: { finalStage: 'ANSWER_VALIDATED', taskOutcome: 'complete' } } } }, {});
  assert.equal(result.response.directAnswer, 'Reviewed draft.');
  assert.equal(result.turn.taskOutcome, 'limited');
  assert.match(result.persistenceWarning, /not confirmed/);
});

for (const status of ['succeeded', 'failed']) test(`route settles only after capability execution: ${status}`, async () => {
  const calls = [];
  const trace = {};
  const lifecycle = Object.fromEntries(['transition', 'actions', 'credit', 'settlement', 'optionalFailure'].map(key => [key, () => lifecycle]));
  lifecycle.outcomes = (answer, mutation) => { trace.taskOutcome = mutation === 'failed' ? 'failed' : 'complete'; return lifecycle; };
  lifecycle.snapshot = () => trace;
  const proposed = { ...action('proposed'), id: 'capability', kind: 'pet.update' };
  const receipt = { status: 'skipped', careEntryIds: [] };
  const fn = routeFunction('persistAssistantAnswer', {
    assessTaskExecution,
    prepareAskMemoryAuthorityLearnings: () => [], semanticTraceForStorage: () => null,
    attachEpisodeReferences: response => response,
    completeAskConversationTurn: async () => { calls.push('answer'); return { data: [{ assistant_message_id: 'answer' }] }; },
    validAssistantCompletionRow: rows => rows[0], logAskStage: () => {}, logAskServerError: () => {},
    parseStoredApplicationActions: actions => actions || [],
    createActionCapabilities: async ({ actions }) => actions,
    updateAskAssistantResponse: async () => ({ data: true }),
    shouldAutoExecuteAction: () => true,
    runOptionalAskSubsystem: async ({ operation }) => operation(),
    isSecurityUuid: () => true,
    executeActionCapability: async () => { calls.push('execute'); return { action: { ...proposed, status }, changed: status === 'succeeded' }; },
    emitOperationalEvent: () => {}, resolveAutomaticCareHistoryPresentation: () => receipt,
    isExplicitCareHistorySaveRequest: () => false,
    safeReleaseAiCredit: async () => { calls.push('release'); return true; },
    setAiCreditDisposition: async ({ disposition }) => calls.push(disposition),
    completeAiCredit: async () => calls.push('charged'),
    getRemainingAiCredits: async () => ({}),
    finalizePersistedAskAnswer: async () => { calls.push('finalize'); return null; },
    didPersistEffectiveState: () => false, revalidateAskStateViews: () => {}, emitAskTurnTrace: () => {},
    successfulAnswerResponse: input => input,
  });
  const result = await fn({
    authorizedPetIds: ['pet'], creditRequestId: 'attempt', creditReserved: true,
    intelligenceResult: { governance: {}, executionPlan: { learnings: [], careActions: [], semanticEvents: [], noteBatch: [] }, reasoning: { responseMode: 'answer' }, answerValidation: { assessment: assessment(), completion: [{ index: 0, status: 'answered' }] } },
    preparedRequest: { conversationId: 'conversation', userMessageId: 'user-message' },
    response: { directAnswer: 'Reviewed answer', applicationActions: [proposed] },
    sourceMessage: 'An arbitrary supported request', usage: {}, turnLifecycle: lifecycle,
  });
  assert.deepEqual(calls, status === 'succeeded' ? ['answer', 'execute', 'complete', 'charged', 'finalize'] : ['answer', 'execute', 'release', 'finalize']);
  assert.equal(result.creditsUsed, status === 'succeeded' ? 1 : 0);
});
