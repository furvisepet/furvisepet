// Explicitly invoked red acceptance audit; intentionally outside default test
// discovery until a retrieval implementation can satisfy these requirements.
// node --experimental-transform-types --test scripts/audits/ask-lifetime-history.audit.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { care, conversations, decisive, episodes, expected, irrelevant, now, ownerId, pets } from './fixtures/ask-lifetime-history.mjs';

const reasoningUrl = new URL('../../app/lib/ai/ask-reasoning.ts', import.meta.url).href;
const adapter = `import { generateContextAwareAskResponse as generate } from ${JSON.stringify(reasoningUrl)};
export const generateContextAwareAskResponse = input => generate({...input, client: globalThis.__historyAuditClient});`;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'server-only') return { shortCircuit: true, url: 'data:text/javascript,export default {}' };
    if (context.parentURL?.endsWith('/run-intelligence.ts') && /ask-reasoning$/.test(specifier)) {
      return { shortCircuit: true, url: `data:text/javascript,${encodeURIComponent(adapter)}` };
    }
    if (/ask-conversation-server\.ts$/.test(specifier)) {
      return { shortCircuit: true, url: `data:text/javascript,${encodeURIComponent('export const loadActionCapabilitiesForMessages = async () => new Map(); export const presentationOnlyAskResponse = value => value;')}` };
    }
    if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
      const url = new URL(specifier, context.parentURL);
      for (const suffix of ['.ts', '/index.ts']) {
        if (existsSync(fileURLToPath(url.href + suffix))) return nextResolve(url.href + suffix, context);
      }
    }
    return nextResolve(specifier, context);
  },
});
globalThis.fetch = async () => { throw new Error('Audit forbids all network/provider calls'); };
const { buildFurviseContext } = await import('../../app/lib/intelligence/retrieve-context.ts');
const { runFurviseIntelligence } = await import('../../app/lib/intelligence/run-intelligence.ts');
const { buildAskContext, ASK_PROMPT_CONTEXT_CHAR_BUDGET } = await import('../../app/lib/ai/ask-reasoning.ts');
const { selectRelevantCareEntries } = await import('../../app/lib/intelligence/build-context.ts');
const { resolveAskTurnSubject } = await import('../../app/lib/intelligence/entities/resolve-turn-subject.ts');
const { rebuildSemanticProjectionsV2 } = await import('../../app/lib/intelligence/v2/projections/rebuild.ts');
const { classifyFurviseCapabilityQuestion } = await import('../../app/lib/ai/ask-internal-product-policy.ts');

function database(rows, { messages = [], failCare = false, careEpisodes = [] } = {}) {
  const queries = [];
  const tables = { dog_profiles: pets, pet_care_entries: rows, ask_conversations: conversations, ask_conversation_messages: messages, pet_care_episodes: careEpisodes };
  return { queries, from(table) {
    const query = { table, filters: [], orders: [], cap: null, single: false }; queries.push(query);
    const chain = {
      select() { return this; }, returns() { return this; },
      eq(key, value) { query.filters.push(row => row[key] === value); return this; },
      is(key, value) { query.filters.push(row => (row[key] ?? null) === value); return this; },
      in(key, values) { query.filters.push(row => values.includes(row[key])); return this; },
      not(key, op, value) { assert.equal(op, 'is'); query.filters.push(row => row[key] !== value); return this; },
      gte(key, value) { query.filters.push(row => row[key] >= value); return this; },
      lte(key, value) { query.filters.push(row => row[key] <= value); return this; },
      or() { assert.ok(!tables[table]?.length, 'OR only unused empty memory fixtures'); return this; },
      order(key, options) { query.orders.push([key, options.ascending]); return this; },
      limit(value) { query.cap = value; return this; },
      maybeSingle() { query.single = true; return this; },
      then(resolve, reject) {
        let data = (tables[table] || []).filter(row => query.filters.every(filter => filter(row)));
        data = [...data].sort((a, b) => { for (const [key, ascending] of query.orders) {
          const cmp = String(a[key] ?? '').localeCompare(String(b[key] ?? '')); if (cmp) return ascending ? cmp : -cmp;
        } return 0; });
        if (query.cap !== null) data = data.slice(0, query.cap);
        return Promise.resolve({ data: query.single ? data[0] || null : data, error: failCare && table === 'pet_care_entries' ? { code: 'AUDIT_OFFLINE' } : null }).then(resolve, reject);
      },
    };
    return chain;
  } };
}
function output(answer = 'The supplied observations are owner reports, not a diagnosis.') {
  return { answer, answerSections: [], safetyLevel: 'normal', suggestedFollowUps: [],
    proposedHistoryUpdate: { shouldOffer: false, category: null, title: null, details: null, severity: null, resolvesConcernId: null },
    shoppingSuppressed: false, responseMode: 'practical_guidance', userIntent: 'history recall', relevantContextIds: [],
    messageUnderstanding: { primaryIntent: 'question', secondaryIntents: [], userIsAskingQuestion: true, userIsProvidingUpdate: false,
      userIsCorrectingPriorInformation: false, userIsResolvingConcern: false, userIsProvidingPreference: false, userIsMakingSmallTalk: false,
      recoveryStatus: 'none', recoveryConfidence: 1, recoveryEvidence: { outcome: 'none', surfaceText: null, targetConcept: null, confidence: 1 },
      requestedTopic: 'history', referencedPet: null, safetyRelevance: 'none', needsClarification: false, canAnswerDirectly: true },
    intelligenceSafety: { level: 'routine', reason: 'Retrospective question', requiresImmediateAction: false, shoppingSuppressed: false },
    learnings: [], careActions: [], semanticEvents: [], intelligenceMetadata: { confidence: 'high', usedPetContext: true, usedCareHistory: true, usedMemories: false } };
}
async function exercise(question, { petId = 'milo', rows = decisive, messages, dateRange, failCare, careEpisodes, answer, authoritativePetIds = [petId] } = {}) {
  const supabase = database(rows, { messages, failCare, careEpisodes });
  const context = await buildFurviseContext({ supabase, userId: ownerId, petId, conversationId: messages ? 'chat' : null,
    conversationPetId: messages ? 'milo' : null, currentMessage: question, dateRange });
  const requests = [];
  globalThis.__historyAuditClient = { responses: { async create(request) {
    requests.push(request); return { output_text: JSON.stringify(output(answer)) };
  } } };
  const result = await runFurviseIntelligence({ context, requestId: 'synthetic-audit-request', sourceMessageId: 'current-turn', authoritativePetIds });
  assert.equal(requests.length, 1, 'exactly one mocked answer-provider call');
  return { context, result, prompt: JSON.parse(requests[0].input), serialized: requests[0].input, queries: supabase.queries };
}
const promptHas = (run, id) => run.prompt.contextRecords.some(record => record.id === `care:${id}`);
const clock = t => {
  t.mock.timers.enable({ apis: ['Date'], now });
  t.mock.method(console, 'info', () => {}); // omit synthetic observability chatter only
};

test('control: actual loader is owner/pet scoped and small weight history reaches actual model input', async t => {
  clock(t);
  const run = await exercise('Compare all Milo weight measurements.');
  assert.ok(run.context.careEntries.every(row => row.user_id === ownerId && row.pet_profile_id === 'milo'));
  for (const kg of expected.miloWeights) assert.match(run.serialized, new RegExp(`${kg} kg`));
  assert.equal(run.result.acceptedCareActions.length, 0);
});
for (const [petId, question, ids] of [
  ['milo', 'How many separate soft-stool episodes has Milo had over his lifetime?', ['milo-stool-1', 'milo-stool-2']],
  ['milo', 'Compare every recorded weight for Milo.', ['milo-weight-1', 'milo-weight-2', 'milo-weight-3']],
  ['milo', 'How did Milo food change over his lifetime?', ['milo-food-1', 'milo-food-2']],
  ['luna', 'Summarize Luna litter changes and accidents over her lifetime.', ['luna-litter', 'luna-accidents', 'luna-restored', 'luna-improved']],
  ['oscar', 'Summarize Oscar medication course, stiffness recurrence and latest improvement.', ['oscar-course', 'oscar-stiffness-1', 'oscar-stiffness-2', 'oscar-improved']],
]) test(`RED lifetime coverage: ${question}`, async t => {
  clock(t);
  const run = await exercise(question, { petId, rows: [...decisive, ...irrelevant(petId)] });
  assert.equal(run.context.careEntries.length, 80, 'reconfirm actual DB cap before acceptance assertion');
  for (const id of ids) assert.ok(promptHas(run, id), `decisive ${id} missing from actual model input`);
});
test('RED broad-summary coverage includes unseen rows, not just omissions from the selected 20', async t => {
  clock(t);
  const run = await exercise('Summarize Milo entire recorded history.', { rows: [...decisive, ...irrelevant('milo')] });
  assert.ok(run.prompt.coverage?.complete === false && run.prompt.coverage?.requestedPeriod === 'lifetime',
    'actual model input lacks incomplete-lifetime coverage metadata');
});
test('RED database unavailability is distinguishable from no recorded test result at actual model boundary', async t => {
  clock(t);
  const run = await exercise('What was Luna urine-test result?', { petId: 'luna', failCare: true });
  assert.ok(run.context.contextRecovery.unavailableSources.includes('care_entries'));
  assert.match(run.serialized, /care_entries.*unavailable|unavailable.*care_entries/, 'loader warning is lost before generation');
});
test('RED intermediate 20-selection represents requested historical period', () => {
  const rows = [...decisive.filter(row => row.pet_profile_id === 'milo'), ...irrelevant('milo', 30).map(row => ({ ...row, severity: 'severe' }))];
  const selected = selectRelevantCareEntries(rows, 'Summarize 2011 and 2014.');
  assert.equal(selected.length, 20);
  assert.ok(selected.some(row => row.id === 'milo-stool-1'), 'severity displaces requested old period before final ranking');
});
test('RED final five-evidence cap cannot preserve six relevant weight observations', async t => {
  clock(t);
  const rows = Array.from({ length: 6 }, (_, i) => care(`weight-${i}`, 'milo', `2026-08-${10 + i}`, 'weight', `Milo weighed ${28.4 - i / 10} kg.`));
  const run = await exercise('Compare every recorded weight measurement.', { rows });
  assert.equal(run.context.selectedCareEntries.length, 6);
  assert.equal(run.prompt.contextRecords.filter(row => row.sourceType === 'care_update').length, 6, 'no exact aggregate substitutes for omitted measurement');
});
test('RED tail correction survives text compaction', async t => {
  clock(t);
  const note = `${'Owner described the surroundings. '.repeat(22)}Correction: the vomiting belonged to Bruno, not Milo.`;
  const run = await exercise('What does the corrected vomiting record say?', { rows: [care('tail-correction', 'milo', '2026-08-20', 'symptom', note)] });
  assert.ok(promptHas(run, 'tail-correction'));
  assert.match(run.serialized, /vomiting belonged to Bruno, not Milo/, 'fixed-prefix compaction drops material correction');
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
  ['milo', 'How many soft-stool episodes are recorded?', 'Exactly seven soft-stool episodes were recorded.', /seven/],
  ['luna', 'What was Luna urine-test result?', 'The urine test was normal.', /test was normal/],
  ['luna', 'Is Luna hiding fully resolved?', 'The hiding is fully resolved.', /fully resolved/],
  ['oscar', 'What is Oscar diagnosis?', 'Oscar has arthritis.', /arthritis/],
  ['milo', 'Compare Milo earliest and latest weight.', 'The recorded weight decreased by 0.2 kg.', /0\.2 kg/],
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
