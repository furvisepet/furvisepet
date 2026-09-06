import assert from 'node:assert/strict';
import test from 'node:test';
import { exercise, clock } from './helpers/lifetime-harness.mjs';
import { care, ownerId } from './fixtures/ask-lifetime-history.mjs';
const { attachEpisodeReferences } = await import('../../app/lib/intelligence/episode-contract.ts');
const { buildAskConversationResponse } = await import('../../app/lib/ask.mjs');
const source = care('original', 'milo', '2011-02-01', 'symptom', 'Milo had a vomiting episode.', { episode_id: 'owned-episode' });
const episode = { id: 'owned-episode', user_id: ownerId, pet_profile_id: 'milo', normalized_key: 'vomiting', started_at: source.occurred_at,
  updated_at: source.updated_at, sequence_number: 7, recurrence_of: null, status: 'resolved' };
const claim = { id: 'claim-one', user_id: ownerId, subject_type: 'pet', subject_id: 'milo', claim_kind: 'event', operation_type: 'assert',
  source_type: 'ask_message', source_message_lineage_id: 'message-one', canonical_concept_key: 'vomiting', concept_key: 'vomiting',
  concept_resolution_status: 'canonical', concept_authority: 'governed_registry', lifecycle_role: 'opening', lifecycle_transition: 'started',
  polarity: 'affirmed', modality: 'reported', persistence_destination: 'history', knowledge_status: 'effective',
  occurred_at: source.occurred_at, recorded_at: source.created_at, provenance_classification: 'ask_v2_shadow',
  structured_value: { title: null, note: source.note, severity: null } };
const member = { id: 'member-one', user_id: ownerId, pet_profile_id: 'milo', episode_id: episode.id, care_entry_id: null,
  claim_id: claim.id, event_ordinal: 1, event_role: 'opening', occurred_at: claim.occurred_at, created_at: claim.recorded_at, source_issue: null };
const payload = () => structuredClone({ membership_contract: 'ask-episode-membership.v1', episodes: [episode], sources: [], memberships: [member], claims: [claim] });
const run = (options = {}, question = 'List all vomiting episodes over Milo lifetime.') => exercise(question, {
  history: true, rows: [], messages: [], careEpisodes: [episode], episodeRowsOverride: payload(), graph: { claims: [claim] }, ...options,
});
function excluded(r) {
  assert.equal(r.context.episodeResult.supportedCount, 0);
  assert.equal(r.prompt.contextRecords.some(r => r.sourceType === 'episode_evidence'), false);
  assert.equal(r.context.episodeResult.exactTotal, null);
  assert.deepEqual(r.result.acceptedCareActions, []);
  assert.deepEqual(r.result.acceptedLearnings, []);
}
test('claim-only authoritative membership reaches production generation and validation', async t => {
  clock(t); const r = await run({ answer: 'Exactly seven lifetime episodes.' });
  assert.equal(r.context.episodeResult.supportedCount, 1);
  assert.equal(r.context.episodeResult.items[0].sourceId, 'claim:claim-one');
  const record = r.prompt.contextRecords.find(r => r.sourceType === 'episode_evidence');
  assert.equal(record.metadata.sequence_number, 7); assert.equal(record.metadata.displayedOrdinal, 1);
  assert.equal(r.context.episodeResult.exactTotal, null);
  assert.doesNotMatch(r.result.reasoning.answer.summary, /Exactly seven/);
  assert.deepEqual(r.result.acceptedCareActions, []); assert.deepEqual(r.result.acceptedLearnings, []);
  assert.equal(r.queries.filter(q=>q.table==='read_ask_episode_sources').length, 4,'membership revalidated after generation');
  assert.equal(r.queries.filter(q=>q.table==='read_ask_history_correction_page').length, 5,'correction closure also revalidated after generation');
});
test('imported claim and care membership deduplicate by authoritative lineage', async t => {
  clock(t); const imported = { ...claim, source_type: 'legacy_import', provenance_classification: 'imported_legacy' };
  const data = payload(); data.claims = [imported]; data.sources = [source];
  data.memberships.push({ ...member, id: 'member-care', claim_id: null, care_entry_id: source.id, event_ordinal: 2 });
  const r = await run({ rows: [source], episodeRowsOverride: data, graph: { claims: [imported], lineage: [
    { user_id: ownerId, claim_id: claim.id, legacy_table: 'pet_care_entries', legacy_row_id: source.id, claim_role: 'primary' }] } });
  assert.equal(r.context.episodeResult.supportedCount, 1); assert.equal(r.context.episodeResult.entryCount, 1);
});
for (const kind of ['missing', 'changed', 'forgotten', 'corrected', 'superseded', 'foreign pet', 'foreign owner', 'concept', 'overflow', 'omitted', 'unknown role']) {
  test(`${kind} member excludes its entire group`, async t => {
    clock(t); const data = structuredClone(payload()); const graph = { claims: [structuredClone(claim)] };
    if (kind === 'missing') graph.claims = [];
    if (kind === 'changed') graph.claims[0].structured_value.note = 'Milo had no vomiting.';
    if (kind === 'forgotten') graph.withheld_claim_ids = [claim.id];
    if (['corrected', 'superseded'].includes(kind)) {
      graph.claims.push({ ...claim, id: 'later', operation_type: kind === 'corrected' ? 'correct' : 'supersede', knowledge_status: 'forgotten', recorded_at: '2026-08-01T00:00:00Z' });
      graph.relations = [{ id: 'edge', user_id: ownerId, from_claim_id: 'later', to_claim_id: claim.id, relation_type: kind === 'corrected' ? 'corrects' : 'supersedes' }];
    }
    if (kind === 'foreign pet') data.memberships[0].pet_profile_id = 'bruno';
    if (kind === 'foreign owner') data.memberships[0].user_id = 'another-owner';
    if (kind === 'concept') data.claims[0].canonical_concept_key = 'soft_stool';
    if (kind === 'overflow') data.memberships = Array.from({ length: 9 }, (_, i) => ({ ...member, id: `member-${i}`, event_ordinal: i + 1 }));
    if (kind === 'omitted') data.claims = [{ id: claim.id, content_omitted: true }];
    if (kind === 'unknown role') data.memberships[0].event_role = 'unknown_legacy';
    excluded(await run({ episodeRowsOverride: data, graph }));
  });
}
test('membership version changes invalidate a saved displayed reference', async t => {
  clock(t); const original = await run();
  assert.equal(original.context.episodeResult.supportedCount, 1);
  const saved = { id: 'saved', user_id: ownerId, conversation_id: 'chat', role: 'furvise', sequence_number: 2,
    response_data: attachEpisodeReferences(buildAskConversationResponse(original.result.reasoning.answer), original.context.episodeResult) };
  const data = structuredClone(payload()); data.memberships[0].event_ordinal = 2;
  const r = await run({ messages: [saved], episodeRowsOverride: data }, 'What changed during the first episode?');
  excluded(r); assert.equal(r.context.episodeResult.referenceStatus, 'stale');
});
for (const kind of ['missing imported care', 'changed imported care', 'forgotten imported care', 'missing lineage', 'SQL source hash mismatch']) {
  test(`${kind} cannot reenter through claim-only import membership`, async t => {
    clock(t); const imported = { ...claim, source_type: 'legacy_import', provenance_classification: 'imported_legacy' };
    const data = payload(); data.claims = [imported];
    const graph = { claims: [imported], sources: [source], lineage: [
      { user_id: ownerId, claim_id: claim.id, legacy_table: 'pet_care_entries', legacy_row_id: source.id, claim_role: 'primary' }] };
    if (kind === 'missing imported care') graph.sources = [];
    if (kind === 'changed imported care') graph.sources = [{ ...source, note: 'Milo was resting.' }];
    if (kind === 'forgotten imported care') graph.withheld_source_ids = [source.id];
    if (kind === 'missing lineage') graph.lineage = [];
    if (kind === 'SQL source hash mismatch') data.memberships[0].source_issue = 'legacy_source_changed_or_missing';
    excluded(await run({ episodeRowsOverride: data, graph }));
  });
}
test('a deleted continuation withholds the otherwise valid claim opening', async t => {
  clock(t); const continuation = { ...source, id: 'continuation', note: 'Milo rested.', deleted_at: '2026-08-01T00:00:00Z' };
  const data = payload(); data.sources = [continuation];
  data.memberships.push({ ...member, id: 'continuation-member', care_entry_id: continuation.id, claim_id: null, event_role: 'continuation', event_ordinal: 2 });
  excluded(await run({ episodeRowsOverride: data, rows: [continuation] }));
});
test('missing RPC fails with unavailable coverage', async t => {
  clock(t); const r = await run({ episodeError: 'PGRST202' }); excluded(r);
  assert.equal(r.context.episodeResult.coverage, 'unavailable');
});
test('saved claim references resolve with original sequence and full source details', async t => {
  clock(t); const original = await run();
  const saved = { id: 'saved', user_id: ownerId, conversation_id: 'chat', role: 'furvise', sequence_number: 2,
    response_data: attachEpisodeReferences(buildAskConversationResponse(original.result.reasoning.answer), original.context.episodeResult) };
  const r = await run({ messages: [saved] }, 'What changed during the first episode?');
  assert.equal(r.context.episodeResult.referenceStatus, 'resolved');
  assert.equal(r.context.episodeResult.items[0].sequenceNumber, 7);
  assert.deepEqual(r.context.episodeResult.details, [{ sourceId: 'claim:claim-one', occurredAt: claim.occurred_at, note: source.note }]);
  const changed = structuredClone(payload()); changed.claims[0].recorded_at = '2026-08-01T00:00:00Z';
  const stale = await run({ messages: [saved], episodeRowsOverride: changed, graph: { claims: changed.claims } }, 'What changed during the first episode?');
  excluded(stale); assert.equal(stale.context.episodeResult.referenceStatus, 'stale');
});
test('a correction arriving during revalidation fails closed', async t => {
  clock(t); let reads = 0;
  const r = await run({ graphAtCall() {
    reads++;
    return { claims: [{ ...claim, knowledge_status: reads > 2 ? 'forgotten' : 'effective' }] };
  } });
  excluded(r); assert.equal(r.context.episodeResult.coverage, 'unavailable');
});
test('incomplete correction closure excludes member evidence', async t => {
  clock(t); excluded(await run({ graph: { claims: [claim], truncated: true } }));
});
