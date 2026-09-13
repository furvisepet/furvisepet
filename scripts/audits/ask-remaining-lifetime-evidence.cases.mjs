import assert from 'node:assert/strict';
import test from 'node:test';
import { exercise, clock } from './helpers/lifetime-harness.mjs';
import { care, ownerId } from './fixtures/ask-lifetime-history.mjs';
const { attachEpisodeReferences } = await import('../../app/lib/intelligence/episode-contract.ts');
const { buildAskConversationResponse } = await import('../../app/lib/ask.mjs');
const first = care('lifetime-first', 'milo', '2011-02-01', 'symptom', 'Milo had a vomiting episode.', { episode_id: 'lifetime-ep1' });
const second = care('lifetime-second', 'milo', '2014-07-09', 'symptom', 'Milo had a separate vomiting episode.', { episode_id: 'lifetime-ep2' });
const episodes = [first, second].map((s, i) => ({ id: s.episode_id, user_id: ownerId, pet_profile_id: 'milo', normalized_key: 'vomiting',
  started_at: s.occurred_at, last_event_at: s.occurred_at, updated_at: s.updated_at, status: 'resolved', sequence_number: i ? 12 : 7, recurrence_of: i ? first.episode_id : null }));
const run = (options = {}, question = 'List all vomiting episodes over Milo lifetime.') => exercise(question, {
  history: true, rows: [first, second], careEpisodes: episodes, messages: [], ...options,
});
function absent(r, id) {
  assert.equal(r.context.episodeResult.items.some(item => item.id === `episode:${id}`), false);
  assert.equal(r.prompt.contextRecords.some(item => item.id === `episode:${id}`), false);
  assert.equal(r.context.episodeResult.references?.items.some(item => item.id === `episode:${id}`) ?? false, false);
  assert.equal(r.context.episodeResult.exactTotal, null);
  assert.deepEqual(r.result.acceptedCareActions, []);
  assert.deepEqual(r.result.acceptedLearnings, []);
}
for (const kind of ['oversized note', 'omitted title', 'missing note']) {
  test(`${kind} withholds its whole episode while preserving independently supported old evidence`, async t => {
    clock(t);
    const member = care('omitted-member', 'milo', '2011-02-02', 'general', 'Milo was resting.', { episode_id: first.episode_id });
    const source = kind === 'oversized note' ? { ...member, note: 'x'.repeat(2100) } : member;
    const options = kind === 'oversized note' ? { rows: [first, source, second] } : {
      rows: [first, member, second], episodeRowsOverride: { episodes, sources: [first, second,
        { ...member, ...(kind === 'omitted title' ? { title: null, content_omitted: true } : { note: null }) }] },
    };
    const r = await run(options);
    absent(r, first.episode_id);
    assert.equal(r.context.episodeResult.supportedCount, 1);
    assert.ok(r.context.episodeResult.reasons.includes('episode_input_bound'));
    assert.equal(r.context.episodeResult.items[0].id, `episode:${second.episode_id}`);
  });
}
test('stored sequence and recurrence survive old retrieval without becoming displayed ordinals or exact totals', async t => {
  clock(t);
  const noise = Array.from({ length: 25 }, (_, i) => ({ ...episodes[0], id: `routine-${i}`, normalized_key: 'routine', last_event_at: '2026-09-03T00:00:00Z' }));
  const r = await run({ careEpisodes: [...noise, ...episodes], answer: 'Exactly twelve lifetime episodes.' });
  const records = episodes.map(e => r.prompt.contextRecords.find(item => item.id === `episode:${e.id}`));
  assert.deepEqual(records.map(r => r.metadata.sequence_number), [7, 12]);
  assert.deepEqual(records.map(r => r.metadata.displayedOrdinal), [1, 2]);
  assert.equal(records[1].metadata.recurrence_of, first.episode_id);
  assert.equal(r.context.episodeResult.exactTotal, null);
  assert.equal(r.context.episodeResult.supportedCount, 2);
  assert.doesNotMatch(r.result.reasoning.answer.summary, /Exactly twelve/);
  assert.match(r.result.reasoning.answer.summary, /not an exact lifetime total/);
});
test('newly omitted member invalidates a persisted displayed reference', async t => {
  clock(t);
  const original = await run();
  const saved = { id: 'saved', user_id: ownerId, conversation_id: 'chat', role: 'furvise', sequence_number: 2, created_at: '2026-09-04T00:00:00Z',
    response_data: attachEpisodeReferences(buildAskConversationResponse(original.result.reasoning.answer), original.context.episodeResult) };
  const member = care('later-member', 'milo', '2011-02-02', 'general', 'x'.repeat(2100), { episode_id: first.episode_id });
  const r = await run({ rows: [first, member, second], messages: [saved] }, 'What changed during the first episode?');
  absent(r, first.episode_id);
  assert.equal(r.context.episodeResult.referenceStatus, 'stale');
});
test('forgotten onset cannot regain evidence through an owned episode projection', async t => {
  clock(t);
  const r = await run({ graph: { withheld_source_ids: [first.id] } });
  absent(r, first.episode_id);
  assert.equal(r.context.episodeResult.supportedCount, 1);
});
test('foreign membership payload fails closed at the actual callback', async t => {
  clock(t);
  const r = await run({ episodeRowsOverride: { episodes, sources: [{ ...first, user_id: 'foreign-owner' }, second] } });
  absent(r, first.episode_id);
  absent(r, second.episode_id);
  assert.equal(r.context.episodeResult.coverage, 'unavailable');
});
