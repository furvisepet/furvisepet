import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
registerHooks({ resolve(s, c, next) { return s === 'server-only' ? { url: 'data:text/javascript,export {};', format: 'module', shortCircuit: true } : next(s, c); } });
const { bindReadTicket } = await import('../app/lib/furvise-brain/read-ticket.ts');
const { validateAskRequest } = await import('../app/lib/intelligence/ask-request-contract.ts');
const { buildAskBrainTurn } = await import('../app/lib/furvise-brain/ask-runtime.ts');
const { retrieveFurviseMemory } = await import('../app/lib/furvise-brain/memory-organ.ts');
const { retrieveEpisodeHistory } = await import('../app/lib/intelligence/episode-history.ts');
const { buildLabsList } = await import('../app/lib/intelligence/labs-list.ts');
const { bindEvidenceReadTicket } = await import('../app/lib/intelligence/evidence-read-ticket.ts');
const pet = { id: 'a', user_id: 'owner', name: 'Aster', species: 'dog' };
const context = { owner: { userId: 'owner' }, eligiblePets: [pet], pet, currentMessage: 'Read the selected record.', conversationTurns: [], conversationId: 'thread', timeZone: 'UTC' };
const read = episode => ({ operation: 'read', temporal: { from: null, to: null, anchor: null }, predicates: [],
  outputs: { completeness: 'exhaustive', ordering: 'asc', limit: null }, episode });
const count = topic => ({ operation: 'count', referent: { basis: 'scoped_register', topic, ordinal: null } });
const member = ordinal => ({ operation: 'membership', referent: { basis: 'displayed_list', topic: null, ordinal } });
const proposal = (episode, patch = {}) => ({ version: 'ask-request.v2', readTicket: read(episode), mode: 'read', question: context.currentMessage,
  requirements: [], referenceTurnIds: [], scope: 'named', petNames: ['Aster'], operation: 'recall', selection: 'summary', quantity: null,
  topic: 'observations', terms: [], from: null, to: null, episodeTopic: null, ordinal: null, frame: null, evidenceBasis: 'saved_history', ...patch });

test('unresolved episode jobs clarify with no history authority, while unspecified count retains its unit', async () => {
  for (const episode of [{ operation: 'membership', referent: null }, { operation: 'count', referent: null }, member(null), count(null)]) {
    const parsed = validateAskRequest(proposal(episode), context);
    assert.equal(parsed.request.mode, 'clarify');
    assert.equal(parsed.clarification, 'reference');
    assert.equal(parsed.history, null);
    assert.equal(parsed.ordinal, null);
    assert.equal(parsed.request.quantity, 'episodes');
    assert.equal(parsed.readOperation, episode.referent && episode.operation === 'count' ? 'count' : 'clarify');
    const live = { ...context, askInterpretation: parsed };
    const brain = buildAskBrainTurn({ context: live, logicalTurnId: 't', authoritativePetIds: ['a'] });
    assert.equal(brain.intent, 'clarify');
    assert.equal(brain.memoryNeed, 'none');
    assert.deepEqual(brain.memoryPetIds, []);
    const db = { from() { assert.fail('Unresolved referent queried history'); }, rpc() { assert.fail('Unresolved referent queried episodes'); } };
    assert.equal(await retrieveFurviseMemory(live, db, brain), live);
    assert.equal(await retrieveEpisodeHistory(live, db, ['a']), live);
  }
});

test('ordinary tickets do not acquire episode authority from prose or stray legacy fields', async () => {
  const parsed = validateAskRequest(proposal(null, { operation: 'count', quantity: 'episodes', ordinal: 'second', episodeTopic: 'vomiting' }),
    { ...context, currentMessage: 'How many vomiting episodes ever? Then the second episode.' });
  assert.equal(parsed.operation, 'recall');
  assert.equal(parsed.ordinal, null);
  assert.equal(parsed.episodeTopic, null);
  assert.equal(parsed.request.quantity, null);
  assert.equal(parsed.referenceTarget, undefined);
  const live = { ...context, askInterpretation: parsed };
  assert.equal(await retrieveEpisodeHistory(live, { rpc() { assert.fail('Ordinary ticket routed to episodes'); } }, ['a']), live);
});

test('membership revalidates the stored list instead of trusting the proposed ordinal', async () => {
  const parsed = validateAskRequest(proposal(member('second')), context);
  assert.equal(parsed.operation, 'episode');
  assert.equal(parsed.referenceTarget.basis, 'displayed_list');
  let calls = 0;
  const result = await retrieveEpisodeHistory({ ...context, askInterpretation: parsed }, { rpc(name, args) {
    calls++; assert.equal(name, 'read_ask_episode_references'); assert.equal(args.p_conversation_id, 'thread');
    return { abortSignal: async () => ({ data: null, error: null }) };
  } }, ['a']);
  assert.equal(calls, 1);
  assert.equal(result.episodeResult.referenceStatus, 'clarify');
  assert.deepEqual(result.episodeResult.items, []);
  assert.equal(result.episodeResult.exactTotal, null);
});

test('episode count uses independent membership retrieval and cannot become a list of care records', async () => {
  const parsed = validateAskRequest(proposal(count('breathing')), { ...context, currentMessage: 'Unrelated wording; ticket owns the job.' });
  assert.equal(parsed.operation, 'count');
  assert.equal(parsed.episodeTopic, 'breathing');
  let calls = 0;
  const result = await retrieveEpisodeHistory({ ...context, askInterpretation: parsed }, { rpc(name, args) {
    calls++; assert.equal(name, 'read_ask_episode_sources'); assert.deepEqual(args.p_keys, ['breathing']);
    return { abortSignal: async () => ({ data: null, error: { code: 'unavailable' } }) };
  } }, ['a']);
  assert.equal(calls, 1);
  assert.equal(result.episodeResult.coverage, 'unavailable');
  assert.equal(result.episodeResult.exactTotal, null);
  const row = { id: 'note', pet_profile_id: 'a', occurred_at: '2026-01-01T00:00:00Z', deleted_at: null, note: 'Breathing observation.' };
  const evidence = { interpretation: parsed, scope: { readOnlyRecall: true, status: 'resolved', authorizedPetIds: ['a'] },
    history: { ticketCoverage: { status: 'complete' } } };
  assert.equal(buildLabsList(evidence, [row]), null);
});

test('episode proposals cannot forge membership, ownership, totals, or bypass the direct caller', () => {
  const good = read(count('vomiting'));
  const bound = bindReadTicket(good, ['a']);
  assert.ok(Object.isFrozen(bound.episode) && Object.isFrozen(bound.episode.referent));
  for (const episode of [
    { ...count('vomiting'), exactTotal: 2 },
    { ...count('vomiting'), referent: { ...count('vomiting').referent, petId: 'foreign' } },
    { ...member('second'), referent: { ...member('second').referent, episodeId: 'invented' } },
    { ...count('vomiting'), referent: { ...count('vomiting').referent, ordinal: 'second' } },
  ]) assert.throws(() => bindReadTicket(read(episode), ['a']), /read_ticket/);
  assert.throws(() => bindReadTicket({ ...good, predicates: [{ kind: 'text_any', terms: ['vomiting'] }] }, ['a']), /read_ticket/);
  assert.throws(() => validateAskRequest(proposal(count('vomiting'), { petNames: ['Foreign'] }), context), /ownership/);
  assert.throws(() => bindEvidenceReadTicket({ read: good, kind: 'count', topics: ['vomiting'], period: { kind: 'unspecified', surface: null }, status: 'resolved', locator: null }, ['a'], ''), /ASK_EVIDENCE_TICKET_INVALID/);
});
