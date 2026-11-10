import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, next) {
  return specifier === 'server-only' ? { url: 'data:text/javascript,export {};', format: 'module', shortCircuit: true } : next(specifier, context);
} });
globalThis.fetch = async () => { throw Error('Read-ticket hygiene tests forbid network access'); };
const { validateAskRequest, askRequestSchema } = await import('../app/lib/intelligence/ask-request-contract.ts');
const { emptyProposedSemanticFrame } = await import('../app/lib/intelligence/semantic-frame/extract-frame.ts');
const { interpretAskQuestion } = await import('../app/lib/intelligence/interpret-ask.ts');

const pets = ['Aster', 'Bramble', 'Cedar'].map(name => ({ id: name.toLowerCase(), name, user_id: 'owner', species: 'cat' }));
const question = 'What is recorded about Aster?';
const context = { owner: { userId: 'owner' }, eligiblePets: pets, pet: pets[0], currentMessage: question, conversationTurns: [] };
const ticket = { subjectScope: 'selected', operation: 'read', temporal: { from: null, to: null, anchor: null }, predicates: [],
  outputs: { completeness: 'sufficient', ordering: 'asc', limit: null } };
const proposal = { version: 'ask-request.v2', mode: 'read', readTicket: ticket, question, requirements: [], referenceTurnIds: [],
  evidenceBasis: 'saved_history', scope: 'selected', petNames: [], operation: 'recall', selection: 'summary', quantity: null,
  topic: 'observations', terms: [], from: null, to: null, episodeTopic: null, ordinal: null, frame: null };

test('read requests reject mutation carriers without creating authority or an extra planner pass', async t => {
  t.mock.method(console, 'info', () => {});
  t.mock.method(console, 'warn', () => {});
  let calls = 0;
  const raw = { ...proposal, frame: null };
  const before = structuredClone(raw);
  const client = value => ({ responses: { async create() {
    calls++; return { output_text: JSON.stringify(value) };
  } } });
  const result = await interpretAskQuestion({ context, model: 'fixture', client: client(raw) });
  assert.equal(calls, 1);
  assert.equal(result.readOnly, true);
  assert.equal(result.request.mode, 'read');
  for (const field of ['task', 'mutationIntent', 'writeJob']) assert.equal(result.request[field], null);
  assert.deepEqual(result.frame, emptyProposedSemanticFrame());
  assert.deepEqual(result.request.readTicket.subjects.petIds, ['aster']);
  assert.deepEqual(raw, before);
  for (const patch of [
    { frame: { forged: 'save this' } },
    { mutationIntent: 'correct_record' },
    { task: { intent: 'resume', sourceTurnId: null } },
    { writeJob: {} },
    { mutationIntent: 'correct_record', task: { intent: 'resume', sourceTurnId: null } },
  ]) {
    const rejected = { ...raw, ...patch }, snapshot = structuredClone(rejected), start = calls;
    await assert.rejects(interpretAskQuestion({ context, model: 'fixture', client: client(rejected) }),
      error => error.diagnostics?.providerErrorCode === 'ASK_REQUEST_CONTRACT_READ_MUTATION_DOMAIN');
    assert.equal(calls, start + 1, 'mutation authority fails before another provider dispatch');
    assert.deepEqual(rejected, snapshot);
  }
  for (const patch of [{ writeJob: {} }, { mode: 'update' }, { readTicket: { ...ticket, predicates: 'invalid' } }]) {
    assert.throws(() => validateAskRequest({ ...raw, ...patch }, context), /ASK_REQUEST_INVALID/);
  }
});

test('declined mixed persistence retains only its existing typed read and original owner wording', () => {
  const currentMessage = 'I have leftover 5mg tablets. Use my saved notes. Do not log an unconfirmed status.';
  const mixed = { ...proposal, mode: 'mixed', frame: { forged: 'save this' }, task: { intent: 'save' }, mutationIntent: 'correct_record' };
  const result = validateAskRequest(mixed, { ...context, currentMessage });
  assert.equal(result.request.mode, 'read');
  assert.equal(result.request.question, currentMessage);
  assert.equal(result.request.task, null);
  assert.equal(result.request.mutationIntent, null);
  assert.equal(result.request.writeJob, null);
  assert.deepEqual(result.frame, emptyProposedSemanticFrame());
  assert.deepEqual(result.request.readTicket.temporal, ticket.temporal);
  assert.throws(() => validateAskRequest(mixed, { ...context, currentMessage: 'Log this and read my notes.' }), /read_ticket/);
  assert.throws(() => validateAskRequest({ ...mixed, writeJob: {} }, { ...context, currentMessage }), /read_ticket/);
});

test('typed subject selection overrides a conflicting legacy hint while retaining ownership and exclusions', () => {
  assert.ok(askRequestSchema({}).properties.readTicket.anyOf.filter(s=>s.properties).every(s=>s.required.includes('subjectScope')));
  for (const currentMessage of ['Show an old note.', 'ever', 'all history', 'dental']) {
    const result = validateAskRequest({ ...proposal, scope: 'account' }, { ...context, currentMessage });
    assert.deepEqual(result.petIds, ['aster']);
    assert.deepEqual(result.request.readTicket.subjects.petIds, ['aster']);
  }
  const cohort = validateAskRequest({ ...proposal, readTicket: { ...ticket, subjectScope: 'account' }, excludedPetNames: ['Aster'] }, context);
  assert.deepEqual(cohort.petIds, ['bramble', 'cedar']);
  for (const patch of [{ petNames: ['Bramble'] }, { petNames: ['Foreign'] }, { excludedPetNames: ['Aster'] },
    { readTicket: { ...ticket, subjectScope: 'invented' } }, { readTicket: { ...ticket, subjectScope: null } }]) {
    assert.throws(() => validateAskRequest({ ...proposal, ...patch }, context), /ASK_REQUEST_INVALID/);
  }
});

test('conversation identity is grounded only in referenced USER names; missing or ambiguous focus clarifies', () => {
  const plan = { ...proposal, readTicket: { ...ticket, subjectScope: 'conversation' }, scope: 'account', referenceTurnIds: ['u', 'a'] };
  const c = { ...context, currentMessage: 'Put those details in JSON.', conversationTurns: [
    { id: 'u', role: 'user', text: 'What did Cedar’s visit record?' }, { id: 'a', role: 'furvise', text: 'Bramble had a visit.' },
  ] };
  const result = validateAskRequest(plan, c);
  assert.deepEqual(result.petIds, ['cedar']);
  assert.deepEqual(result.request.referenceTurnIds, ['u']);
  assert.throws(() => validateAskRequest({ ...plan, petNames: ['Bramble'] }, c), /conversation_subject/);
  assert.throws(() => validateAskRequest({ ...plan, referenceTurnIds: ['missing'] }, c), /reference/);
  assert.throws(() => validateAskRequest({ ...plan, referenceTurnIds: ['u'], petNames: ['Bramble'] }, {
    ...c, conversationTurns: [{ id: 'u', role: 'user', text: 'The brambleberry bushes bloomed.' }],
  }), /conversation_subject/);
  for (const conversationTurns of [[{ id: 'a', role: 'furvise', text: 'Cedar had a visit.' }],
    [{ id: 'u', role: 'user', text: 'Compare Aster and Cedar.' }]]) {
    const ambiguous = validateAskRequest({ ...plan, referenceTurnIds: [] }, { ...c, conversationTurns });
    assert.equal(ambiguous.clarification, 'subject');
    assert.deepEqual(ambiguous.petIds, []);
    assert.equal(ambiguous.history, null);
    assert.equal(ambiguous.request.readTicket, null);
    assert.equal(ambiguous.readOnly, true);
  }
});

test('typed as-of boundaries remain open below; standalone paraphrases cannot replace the requested obligations', () => {
  const currentMessage = 'As of August 20, total Aster’s activity durations and label each activity.';
  const proposed = { ...proposal, question: 'List activities only.', requirements: ['List activities only'], from: '2026-08-20', to: '2026-08-21',
    readTicket: { ...ticket, temporal: { from: null, to: '2026-08-21T00:00:00.000Z', anchor: null } } };
  const result = validateAskRequest(proposed, { ...context, currentMessage });
  assert.deepEqual(result.history, { from: null, to: '2026-08-21T00:00:00.000Z', terms: [], interpretation: 'period' });
  assert.equal(result.request.question, currentMessage);
  assert.equal(result.referenceQuestion, currentMessage);
  assert.deepEqual(result.request.requirements, []);
});
