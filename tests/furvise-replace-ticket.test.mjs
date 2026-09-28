import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === 'server-only') return { shortCircuit: true, url: 'data:text/javascript,export {}' };
  if (specifier.endsWith('/security/idempotency/admin-client.ts')) return {
    shortCircuit: true, url: 'data:text/javascript,export const createIdempotencyAdminClient = () => globalThis.__replaceDatabase;',
  };
  if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
    const url = new URL(specifier, context.parentURL);
    for (const suffix of ['.ts', '/index.ts']) if (existsSync(fileURLToPath(url.href + suffix))) return nextResolve(url.href + suffix, context);
  }
  return nextResolve(specifier, context);
} });
globalThis.fetch = async () => { throw new Error('Replace fixture forbids network calls'); };
const { interpretAskQuestion } = await import('../app/lib/intelligence/interpret-ask.ts');
const { validateAskRequest } = await import('../app/lib/intelligence/ask-request-contract.ts');
const { resolveReplaceJob } = await import('../app/lib/furvise-brain/replace-job.ts');
const { prepareBoundReplaceAction, prepareFurviseApplicationActions, resolveFurviseActionTargetBindings } = await import('../app/lib/application-actions/planner.ts');
const { executeActionCapability } = await import('../app/lib/application-actions/capabilities.ts');
const pet = { id: 'pet', name: 'Cedar', user_id: 'owner', lifecycle_status: 'active' };
function fixture(text = 'Replace that last note with: lunch was normal.', body = 'lunch was normal.') {
  const context = { owner: { userId: 'owner' }, pet, eligiblePets: [pet], conversationTurns: [], currentMessage: text,
    currentTurn: { id: 'source', role: 'user', text, createdAt: '2026-09-19T09:39:46Z' }, timeZone: 'UTC' };
  const proposal = { version: 'ask-request.v2', mode: 'update', mutationIntent: 'correct_record', task: null,
    writeJob: { operation: 'replace', target: 'last_event_for_subject', petName: 'Cedar', instructionQuote: text, bodyQuote: body, constraints: [] },
    question: text, requirements: [], referenceTurnIds: [], evidenceBasis: null, scope: 'selected', petNames: ['Cedar'],
    operation: 'general', selection: 'latest', quantity: null, topic: '', terms: [], from: null, to: null,
    episodeTopic: null, ordinal: null, frame: null };
  return { context, proposal };
}

test('Brain emits one source-bound replace job without a history narrative phase', async () => {
  const { context, proposal } = fixture();
  let calls = 0;
  const result = await interpretAskQuestion({ context, model: 'gpt-5.4-mini', client: { responses: { create: async request => {
    calls++;
    assert.deepEqual(request.reasoning, { effort: 'none' });
    const wire = request.text.format.schema;
    assert.ok(Object.keys(wire.$defs).length > 0);
    const resolve = node => node?.$ref ? wire.$defs[node.$ref.split('/').at(-1)] : node;
    const requestSchema=wire.properties.request.anyOf.find(branch=>resolve(branch.properties?.evidenceBasis)?.enum?.includes(null));
    assert.ok(requestSchema.properties.writeJob);
    return { status: 'completed', output_text: JSON.stringify(proposal), usage: { input_tokens: 10, output_tokens: 10 } };
  } } } });
  assert.equal(calls, 1);
  assert.equal(result.request.writeJob.operation, 'replace');
  assert.equal(result.request.writeJob.body.text, 'lunch was normal.');
  assert.equal(result.request.task, null);
  assert.equal(result.history, null);
  assert.equal(result.readOperation, null);
  assert.ok(Object.isFrozen(result.request.writeJob.body));
});

test('semantic spelling does not choose the operation or alter replacement text', () => {
  for (const [text, body] of [
    ['Rewrite the newest saved observation using this text: Her meal was uneventful.', 'Her meal was uneventful.'],
    ['Cambia la última nota por: el almuerzo fue normal.', 'el almuerzo fue normal.'],
  ]) {
    const { context, proposal } = fixture(text, body);
    assert.equal(validateAskRequest(proposal, context).request.writeJob.body.text, body);
  }
});

test('replacement body excludes source-bound ticket constraints before reaching Heart', async () => {
  for (const [clause, kind] of [['One row only.', 'effective_count_one'], ["Don't add a second copy.", 'no_additional_copy'],
    ['Una sola fila.', 'effective_count_one']]) {
    const { context, proposal } = fixture(`Replace that last note with: lunch was normal. ${clause}`);
    proposal.writeJob.constraints = [{ kind, quote: clause }];
    const job = validateAskRequest(proposal, context).request.writeJob;
    assert.equal(job.constraints.effectiveCount, 1);
    assert.equal(job.constraints.allowAdditionalCopy, false);
    assert.equal(job.constraints.spans[0].text, clause);
    const { target } = await resolveReplaceJob(job, targetDatabase(), 'owner');
    const action = prepareBoundReplaceAction(job, target, 'Cedar', 'request');
    assert.equal(action.input.detail, 'lunch was normal.');
    assert.equal(action.explicitIntent, false);
    // The live failure: exact source text is still invalid when it contains a constraint span.
    proposal.writeJob.bodyQuote = `lunch was normal. ${clause}`;
    assert.throws(() => validateAskRequest(proposal, context), /write_job/);
    proposal.writeJob.bodyQuote = 'lunch was normal.';
    proposal.writeJob.constraints[0].quote = 'a clause absent from this user turn';
    assert.throws(() => validateAskRequest(proposal, context), /write_job/);
  }
});

test('fe77e95 Cedar: clean 17-character body rejects a dialogue target reference, not its source span', () => {
  const proposal = JSON.parse(readFileSync(new URL('./fixtures/cedar-replace-reference-turn.json', import.meta.url), 'utf8'));
  const { context } = fixture(proposal.writeJob.instructionQuote);
  context.conversationTurns = [{ id: proposal.referenceTurnIds[0], role: 'user', text: context.currentMessage,
    createdAt: '2026-09-19T10:41:59Z' }];
  assert.equal(proposal.writeJob.bodyQuote, 'lunch was normal.');
  assert.equal(proposal.writeJob.bodyQuote.length, 17);
  assert.throws(() => validateAskRequest(proposal, context), error =>
    error.message === 'ASK_REQUEST_INVALID:write_job' && error.cause.field === 'referenceTurnIds');
  // This is the sole field difference needed to pass; the validator does not repair it.
  proposal.referenceTurnIds = [];
  const job = validateAskRequest(proposal, context).request.writeJob;
  assert.equal(job.body.text, 'lunch was normal.');
  assert.equal(job.constraints.spans[0].text, 'One row only.');
  assert.equal(job.constraints.effectiveCount, 1);
  proposal.writeJob.bodyQuote += ' One row only.';
  assert.throws(() => validateAskRequest(proposal, context), /write_job/);
});

test('a typed persistence prohibition cannot produce an executable replace job', () => {
  const { context, proposal } = fixture('Replace that last note with: lunch was normal. No lo guardes.');
  proposal.writeJob.constraints = [{ kind: 'no_write', quote: 'No lo guardes.' }];
  assert.throws(() => validateAskRequest(proposal, context), /write_job/);
});

test('conflicting reads, append jobs, foreign subjects and ungrounded bodies fail closed', () => {
  for (const change of [
    p => { p.mode = 'mixed'; p.evidenceBasis = 'saved_history'; },
    p => { p.mode = 'read'; },
    p => { p.writeJob.operation = 'append'; },
    p => { p.petNames = ['Bramble']; p.writeJob.petName = 'Bramble'; },
    p => { p.writeJob.bodyQuote = 'Cedar ate normally yesterday.'; },
    p => { p.writeJob.instructionQuote = 'lunch was normal.'; },
    p => { p.task = { intent: 'save' }; },
  ]) {
    const { context, proposal } = fixture(); change(proposal);
    assert.throws(() => validateAskRequest(proposal, context), /write_job/);
  }
});

function targetDatabase({ absent = false, error = null } = {}) {
  const seen = [];
  const query = { select() { return query; }, eq(...args) { seen.push(['eq', ...args]); return query; },
    is(...args) { seen.push(['is', ...args]); return query; }, lte(...args) { seen.push(['lte', ...args]); return query; },
    order() { return query; }, limit() { return query; },
    maybeSingle: async () => ({ data: absent ? null : { id: 'd1824d0f-8bb1-4951-bdde-8632d821ffb9' }, error }) };
  return { seen, from(table) { assert.equal(table, 'pet_care_entries'); return query; } };
}
test('target comes from effective owned rows at the source-turn cutoff, not citations', async () => {
  const { context, proposal } = fixture();
  const job = validateAskRequest(proposal, context).request.writeJob;
  const db = targetDatabase(); const resolved = await resolveReplaceJob(job, db, 'owner');
  assert.deepEqual(db.seen, [['eq', 'user_id', 'owner'], ['eq', 'pet_profile_id', 'pet'], ['is', 'deleted_at', null], ['lte', 'created_at', job.asOf]]);
  const actions = [prepareBoundReplaceAction(job, resolved.target, 'Cedar', 'request')];
  assert.equal(actions.length, 1);
  assert.equal(actions[0].kind, 'care_history.edit');
  // Semantic proposals do not silently override the existing confirmation gate.
  assert.equal(actions[0].explicitIntent, false);
  assert.deepEqual(resolveFurviseActionTargetBindings({ actions, referencedRecords: [], targetRecords: [resolved.target] }),
    { 'request:replace': 'd1824d0f-8bb1-4951-bdde-8632d821ffb9' });
  await assert.rejects(resolveReplaceJob(job, targetDatabase({ absent: true }), 'owner'), /TARGET_MISSING/);
  await assert.rejects(resolveReplaceJob(job, targetDatabase({ error: {} }), 'owner'), /TARGET_UNAVAILABLE/);
});

test('confirmed replacement uses the shipped receipt adapter and cannot succeed without its receipt', async () => {
  const { context, proposal } = fixture();
  const job = validateAskRequest(proposal, context).request.writeJob;
  const resolved = await resolveReplaceJob(job, targetDatabase(), 'owner');
  const prepared = prepareBoundReplaceAction(job, resolved.target, 'Cedar', 'request');
  const action = { ...prepared, id: 'capability', sourceMessageId: job.sourceMessageId };
  for (const storeReceipt of [false, true]) {
    let executed = false;
    const terminal = { ...action, status: 'succeeded', resultMessage: 'Updated the care-history entry.' };
    globalThis.__replaceDatabase = {
      from() { const q = { select() { return q; }, eq() { return q; }, maybeSingle: async () => ({ error: null, data: {
        id: action.id, action_payload: action, status: executed ? 'succeeded' : 'pending', receipt: executed && storeReceipt ? terminal : null,
      } }) }; return q; },
      rpc(name, args) { assert.equal(name, 'execute_ask_action_capability'); assert.equal(args.p_mode, 'confirm');
        executed = true; return { maybeSingle: async () => ({ data: { action: terminal, changed: true }, error: null }) }; },
    };
    const run = () => executeActionCapability({ capabilityId: action.id, assistantMessageId: 'assistant', userId: 'owner', mode: 'confirm' });
    if (storeReceipt) assert.equal((await run()).action.status, 'succeeded');
    else await assert.rejects(run(), /WRITE_RECEIPT/);
  }
});

test('Ask dispatches the typed job before narrative generation and keeps its bound target', () => {
  const route = readFileSync(new URL('../app/api/ask/route.ts', import.meta.url), 'utf8');
  const job = route.indexOf('const replaceJob = interpretation.request?.writeJob');
  assert.ok(job > route.indexOf('const interpretation = await interpretAskQuestion'));
  assert.ok(job < route.indexOf('return await orchestrateAskTurn'));
  assert.match(route.slice(job, route.indexOf('const task = interpretation.request?.task', job)), /return \{ \.\.\.careHistoryCorrectionOrchestration/);
  assert.doesNotMatch(route, /latestHistoryEditTarget|latestEditActions/);
});
