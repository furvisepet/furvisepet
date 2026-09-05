// Explicitly invoked remaining lifetime acceptance audit (expected failures).
import assert from 'node:assert/strict';
import test from 'node:test';
import { decisive, episodes, expected, irrelevant, ownerId, pets } from './fixtures/ask-lifetime-history.mjs';
import { exercise as exerciseBase, database, clock, promptHas, buildAskContext, selectRelevantCareEntries, resolveAskTurnSubject, rebuildSemanticProjectionsV2, classifyFurviseCapabilityQuestion, ASK_PROMPT_CONTEXT_CHAR_BUDGET } from './helpers/lifetime-harness.mjs';
const exercise = (question, options = {}) => exerciseBase(question, { ...options, history: true });

test('control: actual loader is owner/pet scoped and small weight history reaches actual model input', async t => {
  clock(t);
  const run = await exercise('Compare all Milo weight measurements.');
  assert.ok(run.context.careEntries.every(row => row.user_id === ownerId && row.pet_profile_id === 'milo'));
  for (const kg of expected.miloWeights) assert.match(run.serialized, new RegExp(`${kg} kg`));
  assert.equal(run.result.acceptedCareActions.length, 0);
});
// Seven candidate-reachability/whole-span requirements moved to the Stage 2
// default suite. Aggregate, unlinked-correction discovery, and referent gaps remain red.
// Coverage and unavailable-source acceptance moved to the Stage 1 default suite.
test('RED intermediate 20-selection represents requested historical period', () => {
  const rows = [...decisive.filter(row => row.pet_profile_id === 'milo'), ...irrelevant('milo', 30).map(row => ({ ...row, severity: 'severe' }))];
  const selected = selectRelevantCareEntries(rows, 'Summarize 2011 and 2014.');
  assert.equal(selected.length, 20);
  assert.ok(selected.some(row => row.id === 'milo-stool-1'), 'severity displaces requested old period before final ranking');
});
test('RED late correction follows original into historical date-range recall', async t => {
  clock(t);
  const run = await exercise('Did Milo vomit in July 2014?', { dateRange: { from: '2014-07-01', to: '2014-07-31' } });
  assert.ok(promptHas(run, 'milo-vomit-wrong'));
  assert.ok(promptHas(run, 'milo-correction') || run.prompt.contextRecords.some(row => row.metadata?.superseded),
    'raw incorrect claim remains without later correction or supersession status');
});
test('control: explicit pet switch and nearby pronoun follow-up resolve without provider', async () => {
  const recentConversation = [{ role: 'user', text: 'Luna had accidents after the litter changed.' }];
  for (const message of ['How is Luna doing?', 'What should I watch for her?']) {
    const result = await resolveAskTurnSubject({ message, pets, ownerId, selectedPetId: 'milo', recentConversation,
      extractFrame: async () => { throw new Error('unexpected provider extraction'); } });
    assert.equal(result.resolution.petId, 'luna');
  }
});
test('RED ordinal follow-up after switching pets retains Luna instead of the conversation anchor Milo', async () => {
  const result = await resolveAskTurnSubject({ message: 'What about the second episode?', pets, ownerId, selectedPetId: 'milo',
    recentConversation: [{ role: 'user', text: 'Tell me about Luna litter accidents.' }],
    extractFrame: async () => { throw new Error('unexpected provider extraction'); } });
  assert.equal(result.resolution.petId, 'luna');
});
test('RED episode list in prior answer remains referencable in next actual prompt', async t => {
  clock(t);
  const messages = [
    { id: 'q1', role: 'user', user_text: 'Tell me about Milo two soft-stool episodes.', sequence_number: 1 },
    { id: 'a1', role: 'furvise', response_data: { directAnswer: 'Two episodes are recorded.', sections: [{ heading: 'Episodes', items: ['February 2011: first episode.', 'July 2014: second episode.'] }] }, sequence_number: 2 },
  ].map(row => ({ ...row, user_id: ownerId, conversation_id: 'chat', created_at: '2026-09-04T10:00:00Z' }));
  const run = await exercise('What changed during the second episode?', { messages, rows: irrelevant('milo') });
  assert.match(run.serialized, /July 2014/, 'assistant sections and ordinal/source bindings were not retained');
});
test('RED multi-pet answer loads history for every authorized subject', async t => {
  clock(t);
  const run = await exercise('Compare Milo and Luna history.', { authoritativePetIds: ['milo', 'luna'] });
  assert.ok(run.prompt.pets.some(pet => pet.id === 'luna'));
  assert.ok(run.prompt.contextRecords.some(row => row.sourceType === 'care_update' && row.petId === 'luna'), 'authorized Luna profile is present but her history was never loaded');
});
test('RED old canonical episodes survive the 20-row loader window', async t => {
  clock(t);
  const noise = Array.from({ length: 25 }, (_, i) => ({ ...episodes[0], id: `episode-noise-${i}`, normalized_key: `unrelated_${i}`,
    title: 'Unrelated routine', summary: { semanticTopic: 'routine' }, last_event_at: '2026-09-03T00:00:00Z' }));
  const run = await exercise('List all Milo soft-stool episodes.', { careEpisodes: [...episodes, ...noise] });
  assert.equal(run.queries.find(query => query.table === 'pet_care_episodes').cap, 20);
  assert.ok(run.prompt.contextRecords.some(row => row.id === 'episode:stool-episode-1'), 'old episode missing even with canonical episode rows');
});
test('RED retrieved episodes retain sequence and recurrence identity', async t => {
  clock(t);
  const run = await exercise('Describe the second soft-stool episode.', { careEpisodes: episodes });
  const record = run.prompt.contextRecords.find(row => row.id === 'episode:stool-episode-2');
  assert.ok(record, 'episode itself reaches model input');
  assert.equal(record.metadata.sequence_number, 2, 'ordinal identity dropped by record serialization');
  assert.equal(record.metadata.recurrence_of, 'stool-episode-1');
});
for (const [petId, question, answer, forbidden] of [
  ['luna', 'Is Luna hiding fully resolved?', 'The hiding is fully resolved.', /fully resolved/],
]) test(`RED answer grounding rejects unsupported assertion: ${answer}`, async t => {
  clock(t);
  const run = await exercise(question, { petId, answer });
  assert.doesNotMatch(JSON.stringify(run.result.reasoning.answer), forbidden, 'valid response schema is not factual entailment');
});
test('control: actual model input remains bounded with 10,000 stored synthetic rows', async t => {
  clock(t);
  const run = await exercise('Summarize Milo history.', { rows: [...decisive, ...irrelevant('milo', 10_000)] });
  assert.ok(run.serialized.length <= ASK_PROMPT_CONTEXT_CHAR_BUDGET);
  assert.equal(run.queries.filter(query => query.table === 'pet_care_entries').length, 1, 'no hidden pagination');
});
test('control: no live database writes exist in the audit mock', () => {
  assert.equal(database([]).from('pet_care_entries').insert, undefined);
  assert.equal(expected.miloEpisodeCount, 2);
  assert.equal(expected.lunaUrineTest, null);
  assert.equal(expected.oscarDiagnosis, null);
  assert.equal(typeof buildAskContext, 'function');
});
test('control: existing effective-claim graph handles a late cross-pet correction when supplied', () => {
  const original = { id: 'original', userId: ownerId, subjectType: 'pet', subjectId: 'milo', claimKind: 'event', operationType: 'assert',
    conceptKey: 'vomiting', canonicalConceptKey: 'vomiting', conceptResolutionStatus: 'canonical', lifecycleCapable: false,
    lifecycleRole: null, lifecycleTransition: null, persistenceDestination: 'history', knowledgeStatus: 'effective',
    occurredAt: '2014-07-09T12:00:00Z', recordedAt: '2014-07-09T12:01:00Z', provenanceClassification: 'owner_reported', structuredValue: 'Milo vomited.' };
  const correction = { ...original, id: 'correction', subjectId: 'bruno', recordedAt: '2026-08-20T12:00:00Z', structuredValue: 'Bruno vomited, not Milo.' };
  const result = rebuildSemanticProjectionsV2([correction, original], [{ fromClaimId: 'correction', toClaimId: 'original', relationType: 'corrects' }]);
  assert.deepEqual(result.effectiveClaimIds, ['correction']);
  assert.equal(result.history[0].value.petId, 'bruno');
});
test('control: ordinary history recall does not select a paid capability gate', () => {
  assert.equal(classifyFurviseCapabilityQuestion('Summarize Milo entire history.'), null);
});
test('RED addressing Furvise does not turn stored-history recall into an unavailable paid feature', () => {
  assert.equal(classifyFurviseCapabilityQuestion('Furvise, summarize all history for Milo.'), null);
});

test('RED later stage: compute exact separate-episode aggregate, not a note count', async t => {
  clock(t);
  const run = await exercise('How many separate soft-stool episodes has Milo had over his lifetime?');
  assert.match(run.result.reasoning.answer.summary, /two separate soft-stool episodes/i);
});
test('RED later stage: verified complete weight comparison renders the correct delta', async t => {
  clock(t);
  const run = await exercise('Compare Milo earliest and latest recorded weight.');
  assert.match(run.result.reasoning.answer.summary, /0\.6 kg/);
});
