import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyConcernEvidenceState, isPendingUpdateSuggestionGrounded, buildResolutionSuggestion, buildSourceGroundedResolutionAction } from '../app/lib/ai/concern-engine.ts';
import { orchestrateAskTurn } from '../app/lib/ai/ask-orchestrator.ts';
import { governCanonicalEvents } from '../app/lib/intelligence/semantic-events.ts';
import { evaluateCareActionPolicy } from '../app/lib/intelligence/memory-policy.ts';
import { resolveSafetyState } from '../app/lib/intelligence/safety-state.ts';
import { buildExplicitCareHistoryAction } from '../app/lib/intelligence/care-history-policy.ts';

export const concern = { id: 'vomiting-1', user_id: 'owner-1', pet_profile_id: 'milo', title: 'Vomiting', normalized_key: 'vomiting', status: 'active', severity: 'important', opened_at: '2026-08-01', updated_at: '2026-08-01', resolved_at: null, resolution_note: null, source_care_entry_id: null };
const blocked = [
  'He stopped vomiting yesterday, but he is vomiting now.',
  'He stopped vomiting yesterday but is vomiting now.',
  'He is throwing up now; he stopped vomiting yesterday.',
  'He started vomiting again today. He stopped vomiting yesterday.',
  'It started again today. He stopped vomiting yesterday.',
  'He stopped vomiting yesterday. He started vomiting again today.',
  'He stopped vomiting but it started again.',
  'He stopped vomiting. He was vomiting.',
  'He stopped vomiting on August 19. He vomited on August 20.',
  'He vomited on August 20. He stopped vomiting on August 19.',
  'My sister’s dog Bruno stopped vomiting.',
  "My friend's dog Bruno was sick. He stopped vomiting yesterday.",
  'Bruno stopped vomiting.',
  'My dog Bruno stopped vomiting.',
  'I think he stopped vomiting.',
  'He stopped vomiting, I think.',
  'If he stopped hiding and he stopped vomiting, I would be relieved.',
];
for (const message of blocked) test(`full source blocks recovery: ${message}`, async () => {
  const input = { concern, activeConcerns: [concern], message, petId: 'milo', petName: 'Milo' };
  assert.ok(!['resolved', 'improved'].includes(classifyConcernEvidenceState(input)));
  assert.equal(buildSourceGroundedResolutionAction(input), null);
  const safety = resolveSafetyState({ currentMessage: message, pet: { id: 'milo', name: 'Milo' }, activeConcerns: [concern], recentlyResolvedConcerns: [], activeEpisodes: [], monitoringEpisodes: [], careEntries: [], currentState: null });
  assert.notEqual(safety.level, 'recently_resolved');
  assert.equal(isPendingUpdateSuggestionGrounded({ ...input, suggestion: buildResolutionSuggestion({ concern, message, petName: 'Milo' }) }), false);
  const result = await orchestrateAskTurn({ concerns: [concern], message, petName: 'Milo', generationInput: {}, generate: async () => ({ answer: { title: 'Update', summary: 'Thanks for the update.', sections: [], safetyNote: null }, safetyLevel: 'normal', proposedHistoryUpdate: { shouldOffer: true, resolvesConcernId: concern.id, title: 'Vomiting resolved', details: 'He stopped vomiting.', category: 'symptom' } }) });
  assert.notEqual(result.suggestion?.type, 'concern_resolution');
  if (result.suggestion) {
    assert.equal(result.suggestion.payload.title, 'Care update');
    assert.equal(result.suggestion.payload.note, message);
    assert.equal(result.suggestion.payload.resolvedConcernKeys, undefined);
  }
});
test('model omissions cannot authorize semantic or automatic recovery', () => {
  for (const message of blocked) {
    const excerpt = message.includes('He stopped vomiting') ? 'He stopped vomiting' : message;
    const proposal = { subject: { type: 'pet', name: 'Milo' }, domain: 'health', topic: 'vomiting', eventTitle: 'Vomiting resolved', transition: 'resolved', state: 'resolved', temporal: { occurredAt: null, explicitTime: null }, importance: 'important', confidence: 0.99, sourceExcerpt: excerpt };
    const episode = { id: 'ep1', pet_profile_id: 'milo', normalized_key: 'health_vomiting', title: 'Vomiting', linked_concern_id: concern.id, status: 'active', last_event_at: '2026-08-01', started_at: '2026-08-01' };
    assert.equal(governCanonicalEvents({ proposals: [proposal], message, pet: { id: 'milo', name: 'Milo' }, activeEpisodes: [episode], activeConcerns: [concern] }).accepted.length, 0, message);
    const actions = [{ action: 'resolve_concern', category: 'symptom', title: 'Vomiting resolved', details: excerpt, severity: 'routine', confidence: 0.99, relatedRecordId: concern.id }];
    assert.equal(evaluateCareActionPolicy({ actions, currentMessage: message, understanding: {}, safetyLevel: 'recently_resolved', activeConcernIds: [concern.id], activeConcerns: [concern], petId: 'milo', petName: 'Milo' }).accepted.length, 0, message);
  }
});
for (const message of [
  'Milo stopped vomiting.', 'He stopped vomiting.',
  'He was vomiting yesterday. He stopped vomiting today.',
  'He stopped vomiting today. He was vomiting yesterday.',
  'He stopped vomiting on August 20. He vomited on August 19.',
  'He vomited on August 19. He stopped vomiting on August 20.',
  'Please save this: Milo stopped vomiting.',
  'My dog Milo stopped vomiting.',
]) test(`clear recovery remains supported: ${message}`, () => {
  assert.equal(classifyConcernEvidenceState({ concern, activeConcerns: [concern], message, petId: 'milo', petName: 'Milo' }), 'resolved');
  const action = buildSourceGroundedResolutionAction({ activeConcerns: [concern], message, petId: 'milo', petName: 'Milo' });
  assert.deepEqual(action, { action: 'resolve_concern', category: 'symptom', title: 'Vomiting resolved', details: message, severity: 'routine', confidence: 0.99, relatedRecordId: concern.id });
});

test('rejected recovery keeps qualified observations, not a recovery payload', async () => {
  for (const message of ['I think he stopped vomiting.', 'He stopped vomiting, I think.']) {
    const result = await orchestrateAskTurn({ concerns: [concern], message, petName: 'Milo', generationInput: {}, generate: async () => ({ answer: { title: 'Update', summary: 'Thanks.', sections: [], safetyNote: null }, safetyLevel: 'normal', proposedHistoryUpdate: { shouldOffer: true, resolvesConcernId: concern.id, title: 'Vomiting resolved', details: 'He stopped vomiting.', category: 'symptom' } }) });
    assert.deepEqual(result.suggestion, { type: 'history', title: 'Save this update?', details: `Milo: ${message}`, payload: { category: 'general', title: 'Care update', note: message } });
  }
});
test('explicit saves preserve qualified history and do not relabel an outside animal', () => {
  const input = { currentMessage: 'Can you save that to his care history?', pet: { name: 'Milo' } };
  const observation = 'I think he stopped vomiting.';
  const action = buildExplicitCareHistoryAction({ ...input, conversationTurns: [{ role: 'user', text: observation }] });
  assert.equal(action?.action, 'create_entry');
  assert.equal(action?.relatedRecordId, null);
  assert.match(action?.details || '', /I think he stopped vomiting/);
  for (const source of ['My sister’s dog Bruno stopped vomiting.', 'My sister’s dog was sick. He stopped vomiting.']) {
    assert.equal(buildExplicitCareHistoryAction({ ...input, conversationTurns: [{ role: 'user', text: source }] }), null);
  }
});
