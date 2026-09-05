import test from 'node:test';
import assert from 'node:assert/strict';
import { persistPendingSuggestion } from '../app/lib/intelligence/persist-pending-suggestion.ts';
import { buildResolutionSuggestion, classifyConcernEvidenceState, buildSourceGroundedResolutionAction } from '../app/lib/ai/concern-engine.ts';
import { orchestrateAskTurn } from '../app/lib/ai/ask-orchestrator.ts';
import { assertedConcernTransitions } from '../app/lib/ai/turn-classifier.ts';

const concern = { id: 'c1', user_id: 'u1', pet_profile_id: 'p1', title: 'Vomiting', normalized_key: 'vomiting', status: 'active', severity: 'important', resolved_at: null };
function dependencies(rows = [concern], error = null) {
  const reads = [], writes = [];
  const supabase = { from(table) {
    const query = { table, filters: [] }; reads.push(query);
    const result = { data: table === 'pet_concerns' ? rows : null, error: table === 'pet_concerns' ? error : null };
    const chain = { then: (resolve) => Promise.resolve(result).then(resolve) };
    for (const method of ['select','eq','in','is','returns','limit','maybeSingle','contains','order']) chain[method] = (...args) => { query.filters.push([method, ...args]); return chain; };
    return chain;
  } };
  const createCanonicalCareAuthorityClient = () => ({ from(table) { return { insert(payload) { writes.push({ table, payload }); return { select() { return { single: async () => ({ data: { id: 'saved-1' }, error: null }) }; } }; } }; } });
  return { supabase, createCanonicalCareAuthorityClient, logAskServerError() {}, reads, writes };
}
async function persist(message, deps, override = {}) {
  return persistPendingSuggestion({ ...deps, assistantMessageId: 'a1', conversationId: 'chat1', petId: 'p1', petName: 'Milo', userId: 'u1', sourceMessage: message,
    suggestion: { ...buildResolutionSuggestion({ concern, message, petName: 'Milo' }), ...override } });
}
for (const message of [
  'He stopped vomiting yesterday, but he is vomiting now.',
  'He started vomiting again today. He stopped vomiting yesterday.',
  'My sister’s dog Bruno stopped vomiting.',
  'My sister’s dog was vomiting. He stopped vomiting.',
  'He stopped vomiting, I think.',
  'If he stopped hiding and he stopped vomiting, I would be relieved.',
  'He stopped vomiting. He was vomiting.',
]) test(`final persistence rejects full-source contradiction/subject: ${message}`, async () => {
  const deps = dependencies();
  assert.equal((await persist(message, deps)).suggestion, null);
  assert.deepEqual(deps.writes, []);
  assert.deepEqual(deps.reads[0].filters, [['select','*'], ['eq','user_id','u1'], ['eq','pet_profile_id','p1'], ['in','status',['active','monitoring','reopened']], ['is','resolved_at',null], ['returns']]);
});
test('final persistence canonicalizes a model payload against fresh authority', async () => {
  const deps = dependencies(); const message = 'Milo stopped vomiting today. He vomited yesterday.';
  const result = await persist(message, deps, { payload: { title: 'Hiding resolved', note: 'Bruno recovered', concernId: 'c1' } });
  const expected = buildResolutionSuggestion({ concern, message, petName: 'Milo' });
  assert.deepEqual(result.suggestion, { ...expected, id: 'saved-1' });
  assert.deepEqual(deps.writes, [{ table: 'ai_update_suggestions', payload: { concern_id: 'c1', conversation_id: 'chat1', details: expected.details, payload: expected.payload, pet_profile_id: 'p1', source_message_id: 'a1', status: 'pending', title: expected.title, type: 'concern_resolution', user_id: 'u1' } }]);
});
test('stale authority and lookup errors fail without an insert', async () => {
  for (const deps of [dependencies([]), dependencies([], { code: 'offline' }), dependencies([{ ...concern, status: 'resolved', resolved_at: '2026-09-01' }])]) {
    assert.equal((await persist('Please save this: Milo stopped vomiting.', deps)).suggestion, null);
    assert.deepEqual(deps.writes, []);
  }
});
test('qualified history persists verbatim without a recovery mutation', async () => {
  const deps = dependencies(); const message = 'I think he stopped vomiting.';
  const suggestion = { type: 'history', title: 'Save this update?', details: message, payload: { category: 'symptom', title: 'Care update', note: message } };
  const result = await persist(message, deps, { ...suggestion, concernId: undefined });
  assert.equal(result.suggestion?.payload.note, message);
  assert.equal(deps.writes[0]?.payload.concern_id, null);
  assert.deepEqual(result.suggestion?.payload, suggestion.payload);
});

for (const message of ['He stopped vomiting.', 'He stopped vomiting today. He was vomiting yesterday.', 'He was vomiting yesterday. He stopped vomiting today.', 'Please save this: Milo stopped vomiting.']) {
  test(`positive final persistence retains exact canonical payload: ${message}`, async () => {
    const deps = dependencies(); const expected = buildResolutionSuggestion({ concern, message, petName: 'Milo' });
    const result = await persist(message, deps);
    assert.deepEqual(result.suggestion, { ...expected, id: 'saved-1' });
    assert.deepEqual(deps.writes[0].payload.payload, expected.payload);
    assert.deepEqual(expected.payload.resolvedConcernKeys, ['vomiting']);
    assert.equal(expected.payload.resolutionNote, message);
  });
}
test('history cannot strip uncertainty or carry forged recovery metadata', async () => {
  for (const payload of [
    { title: 'Vomiting resolved', note: 'He stopped vomiting.' },
    { title: 'Care update', note: 'He stopped vomiting.' },
    { title: 'Care update', note: 'He stopped vomiting, I think.', resolvedConcernKeys: ['vomiting'] },
  ]) {
    const deps = dependencies();
    const result = await persist('He stopped vomiting, I think.', deps, { type: 'history', concernId: undefined, payload });
    assert.equal(result.suggestion, null);
    assert.deepEqual(deps.writes, []);
  }
});

const currentConcern = { ...concern, opened_at: '2026-09-03T00:00:00Z' };
const temporalCases = [
  ['Milo stopped vomiting yesterday but threw up twice today.', false],
  ['Milo stopped vomiting yesterday, but vomited today.', false],
  ['Milo vomited today but stopped vomiting yesterday.', false],
  ['Milo threw up twice today, and stopped vomiting yesterday.', false],
  ['Milo stopped vomiting yesterday; vomited twice today.', false],
  ['Milo stopped vomiting yesterday, but has vomited today.', false],
  ['Milo stopped vomiting yesterday, but is vomiting today.', false],
  ['Milo vomited this morning and stopped today.', false],
  ['Milo has not stopped hiding and stopped vomiting today.', false],
  ['If Milo stopped hiding and stopped vomiting today, I would relax.', false],
  ['I think Milo stopped vomiting this morning and threw up today.', false],
  ['Milo stopped vomiting last year.', false],
  ['Milo stopped vomiting a year ago.', false],
  ['Milo stopped vomiting in 2025.', false],
  ['Milo stopped vomiting in May 2025.', false],
  ['Milo stopped vomiting on Monday.', false],
  ['Milo stopped vomiting on September 2, 2026.', false],
  ['He stopped vomiting today. He vomited this morning.', false],
  ['He vomited this morning. He stopped vomiting today.', false],
  ['He stopped vomiting this morning but threw up today.', false],
  ['He stopped vomiting this week. He vomited today.', false],
  ['Milo stopped vomiting some time ago.', false],
  ['Milo stopped vomiting when he was a puppy.', false],
  ['Milo stopped vomiting back then.', false],
  ['Milo stopped vomiting.', true],
  ['Milo is back to normal now.', true],
  ['Milo threw up yesterday but stopped vomiting today.', true],
  ['Milo vomited yesterday and stopped today.', true],
  ['Milo vomited once yesterday and stopped today.', true],
  ['Milo stopped vomiting this afternoon. He vomited this morning.', true],
  ['Milo vomited this morning. He stopped vomiting this afternoon.', true],
  ['Milo stopped vomiting today but threw up yesterday.', true],
  ['Milo vomited last night and stopped vomiting this morning.', true],
  ['Milo stopped vomiting this morning. He vomited last night.', true],
  ['Milo stopped vomiting on September 4, 2026.', true],
  ['Milo stopped vomiting last year. He stopped vomiting today.', true],
];
for (const [message, allowed] of temporalCases) {
  test(`predicate/interval/current-concern authority (${allowed}): ${message}`, async (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-09-04T18:00:00Z') });
    const input = { activeConcerns: [currentConcern], concern: currentConcern, message, petId: 'p1', petName: 'Milo' };
    // Exercise persistence first: these regressions must reach the actual write boundary.
    const deps = dependencies([currentConcern]);
    const saved = await persist(message, deps);
    const action = buildSourceGroundedResolutionAction(input);
    const state = classifyConcernEvidenceState(input);
    const result = await orchestrateAskTurn({ concerns: [currentConcern], message, petName: 'Milo', generationInput: {}, generate: async () => ({ answer: { title: 'Update', summary: 'Thanks.', sections: [], safetyNote: null }, safetyLevel: 'normal', proposedHistoryUpdate: { shouldOffer: true, resolvesConcernId: 'c1', title: 'Vomiting resolved', details: 'Milo stopped vomiting.', category: 'symptom' } }) });
    if (!allowed) {
      assert.equal(saved.suggestion, null);
      assert.deepEqual(deps.writes, []);
      assert.equal(action, null);
      assert.notEqual(state, 'resolved');
      assert.notEqual(result.suggestion?.type, 'concern_resolution');
      assert.notEqual(result.suggestion?.payload.severity, 'resolved');
      assert.equal(result.suggestion?.payload.resolvedConcernKeys, undefined);
    } else {
      const canonical = buildResolutionSuggestion({ concern: currentConcern, message, petName: 'Milo' });
      assert.deepEqual(saved.suggestion, { ...canonical, id: 'saved-1' });
      assert.deepEqual(deps.writes[0].payload.payload, canonical.payload);
      assert.equal(action?.action, 'resolve_concern');
      assert.equal(state, 'resolved');
      assert.deepEqual(result.suggestion, canonical);
    }
  });
}

test('coordinated predicates preserve source ranges and work across concern topics', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-09-04T18:00:00Z') });
  for (const [topic, past] of [['coughing', 'coughed'], ['bleeding', 'bled'], ['hiding', 'hid']]) {
    const target = { ...currentConcern, normalized_key: topic, title: topic };
    for (const [message, allowed] of [
      [`Milo stopped ${topic} yesterday but ${past} today.`, false],
      [`Milo ${past} today but stopped ${topic} yesterday.`, false],
      [`Milo ${past} yesterday but stopped ${topic} today.`, true],
    ]) {
      for (const event of assertedConcernTransitions(message)) assert.equal(message.slice(event.start, event.end), event.evidence);
      const deps = dependencies([target]);
      const proposal = buildResolutionSuggestion({ concern: target, message, petName: 'Milo' });
      const saved = await persistPendingSuggestion({ ...deps, assistantMessageId: 'a1', conversationId: 'chat1', petId: 'p1', petName: 'Milo', userId: 'u1', sourceMessage: message, suggestion: proposal });
      assert.equal(saved.suggestion?.type === 'concern_resolution', allowed, message);
      assert.equal(deps.writes.length, allowed ? 1 : 0, message);
    }
  }
});

test('historical applicability uses the freshly loaded concern opening, not the cached proposal', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-09-04T18:00:00Z') });
  const message = 'Milo stopped vomiting on September 2, 2026.';
  const oldAuthority = dependencies([{ ...currentConcern, opened_at: '2026-09-01T00:00:00Z' }]);
  const freshAuthority = dependencies([currentConcern]);
  assert.equal((await persist(message, oldAuthority)).suggestion?.type, 'concern_resolution');
  assert.equal((await persist(message, freshAuthority)).suggestion, null);
  assert.deepEqual(freshAuthority.writes, []);
});
