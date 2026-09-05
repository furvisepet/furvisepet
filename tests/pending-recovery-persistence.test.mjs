import test from 'node:test';
import assert from 'node:assert/strict';
import { persistPendingSuggestion } from '../app/lib/intelligence/persist-pending-suggestion.ts';
import { buildResolutionSuggestion } from '../app/lib/ai/concern-engine.ts';

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
