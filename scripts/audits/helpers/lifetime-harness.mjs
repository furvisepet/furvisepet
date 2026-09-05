import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { conversations, decisive, now, ownerId, pets } from '../fixtures/ask-lifetime-history.mjs';

const reasoningUrl = new URL('../../../app/lib/ai/ask-reasoning.ts', import.meta.url).href;
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
const { buildFurviseContext } = await import('../../../app/lib/intelligence/retrieve-context.ts');
const { runFurviseIntelligence } = await import('../../../app/lib/intelligence/run-intelligence.ts');
const { buildAskContext, ASK_PROMPT_CONTEXT_CHAR_BUDGET } = await import('../../../app/lib/ai/ask-reasoning.ts');
const { selectRelevantCareEntries } = await import('../../../app/lib/intelligence/build-context.ts');
const { resolveAskTurnSubject } = await import('../../../app/lib/intelligence/entities/resolve-turn-subject.ts');
const { rebuildSemanticProjectionsV2 } = await import('../../../app/lib/intelligence/v2/projections/rebuild.ts');
const { classifyFurviseCapabilityQuestion } = await import('../../../app/lib/ai/ask-internal-product-policy.ts');
const { createAskEvidenceContract, evidenceScopeKey } = await import('../../../app/lib/intelligence/ask-evidence.ts');

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
async function exercise(question, { petId = 'milo', rows = decisive, messages, dateRange, failCare, careEpisodes, answer, authoritativePetIds = [petId], prepareEvidence, providerOverrides = {}, prepareContext } = {}) {
  const supabase = database(rows, { messages, failCare, careEpisodes });
  const context = await buildFurviseContext({ supabase, userId: ownerId, petId, conversationId: messages ? 'chat' : null,
    conversationPetId: messages ? 'milo' : null, currentMessage: question, dateRange });
  prepareContext?.(context);
  // Same evidence creation and explicit parameter used by the route callback.
  const evidenceContract = createAskEvidenceContract(context, authoritativePetIds);
  prepareEvidence?.(evidenceContract);
  const requests = [];
  globalThis.__historyAuditClient = { responses: { async create(request) {
    requests.push(request); return { output_text: JSON.stringify({ ...output(answer), ...providerOverrides }) };
  } } };
  const result = await runFurviseIntelligence({ context, evidenceContract, requestId: 'synthetic-audit-request', sourceMessageId: 'current-turn', authoritativePetIds });
  assert.equal(requests.length, 1, 'exactly one mocked answer-provider call');
  return { context, result, prompt: JSON.parse(requests[0].input), serialized: requests[0].input, queries: supabase.queries };
}
const promptHas = (run, id) => run.prompt.contextRecords.some(record => record.id === `care:${id}`);
const clock = t => {
  t.mock.timers.enable({ apis: ['Date'], now });
  t.mock.method(console, 'info', () => {}); // omit synthetic observability chatter only
};


export { exercise, database, clock, promptHas, buildAskContext, selectRelevantCareEntries, resolveAskTurnSubject, rebuildSemanticProjectionsV2, classifyFurviseCapabilityQuestion, ASK_PROMPT_CONTEXT_CHAR_BUDGET, evidenceScopeKey };
