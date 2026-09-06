import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { conversations, decisive, now, ownerId, pets } from '../fixtures/ask-lifetime-history.mjs';

const reasoningUrl = new URL('../../../app/lib/ai/ask-reasoning.ts', import.meta.url).href;
const adapter = `import { generateContextAwareAskResponse as generate } from ${JSON.stringify(reasoningUrl)};
export const generateContextAwareAskResponse = async input => { const result = await generate({...input, client: globalThis.__historyAuditClient}); globalThis.__historyAuditAfterGeneration?.(result); return result; };`;
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

function database(rows, { messages = [], failCare = false, careEpisodes = [], graph = {}, failGraph = false, failHistoryPage = 0, historyPageCap = Infinity, graphAtCall, candidateError, candidateRowsOverride, episodeError, episodeRowsOverride } = {}) {
  const queries = [];
  const tables = { dog_profiles: pets, pet_care_entries: rows, ask_conversations: conversations, ask_conversation_messages: messages, pet_care_episodes: careEpisodes };
  let historyPages = 0;
  let graphCalls = 0;
  return { queries, rpc(name, args) {
    let signal;
    const execute = async () => {
    if (name === 'read_ask_episode_references') {
      queries.push({table:name,args});
      return {data:[...messages].filter(m=>m.user_id===ownerId && m.conversation_id===args.p_conversation_id && m.role==='furvise' && m.response_data?.episodeReferences)
        .sort((a,b)=>b.sequence_number-a.sequence_number)[0]?.response_data.episodeReferences || null,error:episodeError ? {code:episodeError} : null};
    }
    if (name === 'read_ask_episode_sources') {
      queries.push({table:name,args});
      const found=careEpisodes.filter(e=>e.user_id===ownerId && e.pet_profile_id===args.p_pet_id && args.p_keys.includes(e.normalized_key)
        && (!args.p_episode_ids || args.p_episode_ids.includes(e.id))
        && (!args.p_from || e.started_at>=args.p_from && e.started_at<args.p_to)).sort((a,b)=>a.started_at.localeCompare(b.started_at)||a.id.localeCompare(b.id)).slice(0,9);
      const sources=found.slice(0,8).flatMap(e=>rows.filter(r=>r.episode_id===e.id && r.user_id===ownerId && r.pet_profile_id===args.p_pet_id)
        .sort((a,b)=>a.occurred_at.localeCompare(b.occurred_at)||a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id)).slice(0,9)
        .map(r=>({...r,note:r.note.length>2000 ? null : r.note,content_omitted:r.note.length>2000})));
      return {data:episodeRowsOverride || {episodes:found,sources},error:episodeError ? {code:episodeError} : null};
    }
    if (name === 'read_ask_history_candidates' || name === 'read_ask_history_candidates_latest') {
      const descending = name.endsWith('_latest');
      queries.push({ table: name, args, signal });
      if (candidateError === 'THROW_ABORT') throw new DOMException('aborted','AbortError');
      if (candidateError) return { data: null, error: { code: candidateError } };
      if (++historyPages === failHistoryPage) return { data: null, error: { code: 'MOCK_PAGE_OFFLINE' } };
      const data = rows.filter(row => row.user_id === ownerId && row.pet_profile_id === args.p_pet_id && !row.deleted_at
        && (!args.p_from || row.occurred_at >= args.p_from && row.occurred_at < args.p_to)
        && args.p_terms.some(term => `${row.note || ''} ${row.title || ''}`.toLowerCase().includes(term.toLowerCase()))
        && (!args.p_after_time || (descending ? row.occurred_at < args.p_after_time || row.occurred_at === args.p_after_time && row.id < args.p_after_id : row.occurred_at > args.p_after_time || row.occurred_at === args.p_after_time && row.id > args.p_after_id)))
        .sort((a, b) => (descending ? -1 : 1) * (a.occurred_at.localeCompare(b.occurred_at) || a.id.localeCompare(b.id)))
        .slice(0, Math.min(args.p_limit, historyPageCap));
      return { data: candidateRowsOverride ?? data, error: failCare ? { code: 'AUDIT_OFFLINE' } : null };
    }
    assert.equal(name, 'read_ask_history_correction_page');
    queries.push({ table: name, args });
    if (graphAtCall) graph = graphAtCall(++graphCalls);
    if (failGraph) return { data: null, error: { code: 'MOCK_GRAPH_OFFLINE' } };
    const allClaims = graph.claims || [], allEdges = graph.relations || [], allLinks = graph.lineage || [];
    const seeds = allClaims.filter(claim => claim.user_id === ownerId && (args.p_seed_pet_ids || []).includes(claim.subject_id)
      && ['correct', 'supersede'].includes(claim.operation_type)
      && (!args.p_event_from || claim.occurred_at >= args.p_event_from) && (!args.p_event_to || claim.occurred_at < args.p_event_to)
      && (!args.p_terms?.length || args.p_terms.some(term => `${claim.structured_value?.note} ${claim.structured_value?.title} ${claim.canonical_concept_key}`.toLowerCase().includes(term)))
      && allEdges.some(edge => edge.user_id === ownerId && edge.from_claim_id === claim.id && ['corrects', 'supersedes'].includes(edge.relation_type)));
    const roots = new Set([...args.p_claim_ids, ...seeds.map(claim => claim.id), ...allLinks.filter(link => args.p_care_ids.includes(link.legacy_row_id) && link.user_id === ownerId).map(link => link.claim_id)]);
    const edges = allEdges.filter(edge => edge.user_id === ownerId && (roots.has(edge.from_claim_id) || roots.has(edge.to_claim_id)));
    const ids = new Set([...roots, ...edges.flatMap(edge => [edge.from_claim_id, edge.to_claim_id])]);
    const links = allLinks.filter(link => link.user_id === ownerId && ids.has(link.claim_id));
    const sourceIds = new Set([...args.p_care_ids, ...links.map(link => link.legacy_row_id)]);
    return { data: { claims: structuredClone(allClaims.filter(claim => claim.user_id === ownerId && ids.has(claim.id))), relations: edges, lineage: links, withheld_claim_ids: (graph.withheld_claim_ids || []).filter(id => ids.has(id)), withheld_source_ids: (graph.withheld_source_ids || []).filter(id => sourceIds.has(id)),
      sources: [...new Map([...rows, ...(graph.sources || [])].map(row => [row.id, row])).values()].filter(row => row.user_id === ownerId && sourceIds.has(row.id) && !(graph.missingSourceIds || []).includes(row.id)), truncated: Boolean(graph.truncated) }, error: null };
    };
    return { select() { return this; }, abortSignal(value) { signal = value; return this; }, returns() { return this; }, then(resolve, reject) { return execute().then(resolve, reject); } };
  }, from(table) {
    const query = { table, filters: [], orders: [], cap: null, single: false }; queries.push(query);
    const chain = {
      select() { return this; }, returns() { return this; },
      abortSignal() { return this; },
      eq(key, value) { query.filters.push(row => row[key] === value); return this; },
      is(key, value) { query.filters.push(row => (row[key] ?? null) === value); return this; },
      in(key, values) { query.filters.push(row => values.includes(row[key])); return this; },
      not(key, op, value) { assert.equal(op, 'is'); query.filters.push(row => row[key] !== value); return this; },
      gte(key, value) { query.filters.push(row => row[key] >= value); return this; },
      lte(key, value) { query.filters.push(row => row[key] <= value); return this; },
      lt(key, value) { query.filters.push(row => row[key] < value); return this; },
      or(expression) {
        if (table !== 'pet_care_entries') { assert.ok(!tables[table]?.length, 'OR only unused empty memory fixtures'); return this; }
        query.filters.push(row => evaluateFilter(expression, row)); return this;
      },
      order(key, options) { query.orders.push([key, options.ascending]); return this; },
      limit(value) { query.cap = value; return this; },
      maybeSingle() { query.single = true; return this; },
      then(resolve, reject) {
        const historical = table === 'pet_care_entries' && query.orders.some(([key]) => key === 'id');
        if (historical && ++historyPages === failHistoryPage) return Promise.resolve({ data: null, error: { code: 'MOCK_PAGE_OFFLINE' } }).then(resolve, reject);
        let data = (tables[table] || []).filter(row => query.filters.every(filter => filter(row)));
        data = [...data].sort((a, b) => { for (const [key, ascending] of query.orders) {
          const cmp = String(a[key] ?? '').localeCompare(String(b[key] ?? '')); if (cmp) return ascending ? cmp : -cmp;
        } return 0; });
        if (query.cap !== null) data = data.slice(0, historical ? Math.min(query.cap, historyPageCap) : query.cap);
        return Promise.resolve({ data: query.single ? data[0] || null : data, error: failCare && table === 'pet_care_entries' ? { code: 'AUDIT_OFFLINE' } : null }).then(resolve, reject);
      },
    };
    return chain;
  } };
}
function evaluateFilter(expression, row) {
  const parts = []; let depth = 0, start = 0;
  for (let i = 0; i <= expression.length; i++) {
    if (expression[i] === '(') depth++;
    if (expression[i] === ')') depth--;
    if (i === expression.length || expression[i] === ',' && depth === 0) { parts.push(expression.slice(start, i)); start = i + 1; }
  }
  return parts.some(part => {
    if (part.startsWith('and(')) return part.slice(4, -1).split(',').every(term => evaluateFilter(term, row));
    const [, key, op, value] = /^(\w+)\.(ilike|gt|lt|eq)\.(.*)$/.exec(part) || [];
    assert.ok(key, `unsupported mock filter: ${part}`);
    return op === 'ilike' ? String(row[key] || '').toLowerCase().includes(value.replaceAll('%', '').toLowerCase()) : op === 'gt' ? row[key] > value : op === 'lt' ? row[key] < value : row[key] === value;
  });
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
async function exercise(question, { petId = 'milo', rows = decisive, messages, dateRange, failCare, careEpisodes, answer, authoritativePetIds = [petId], prepareEvidence, providerOverrides = {}, authoritativeSemanticFrame, afterGeneration, providerSequence, expectedProviderCalls = 1, prepareContext, history = false, interpretationProposal, interpretationResponse, providerResponse, interpretationModel = "gpt-5-mini", graph, failGraph, failHistoryPage, historyPageCap, graphAtCall, candidateError, candidateRowsOverride, episodeError, episodeRowsOverride } = {}) {
  const supabase = database(rows, { messages, failCare, careEpisodes, graph, failGraph, failHistoryPage, historyPageCap, graphAtCall, candidateError, candidateRowsOverride, episodeError, episodeRowsOverride });
  let context = await buildFurviseContext({ supabase, userId: ownerId, petId, conversationId: messages ? 'chat' : null,
    conversationPetId: messages ? 'milo' : null, currentMessage: question, dateRange });
  prepareContext?.(context);
  const interpretationRequests = [];
  if (interpretationProposal) {
    const { interpretAskQuestion } = await import('../../../app/lib/intelligence/interpret-ask.ts');
    const interpretation = await interpretAskQuestion({ context, model: interpretationModel, client: { responses: { async create(request) {
      interpretationRequests.push(request);
      return interpretationResponse ? await interpretationResponse(request) : { status: 'completed', output_text: JSON.stringify(interpretationProposal), usage: { input_tokens: 500, output_tokens: 200, total_tokens: 700 } };
    } } } });
    if (interpretation.readOnly) {
      authoritativePetIds = interpretation.petIds;
      if (interpretation.petIds[0] && interpretation.petIds[0] !== context.pet.id) context = await buildFurviseContext({ supabase, userId: ownerId,
        petId: interpretation.petIds[0], conversationId: messages ? 'chat' : null, conversationPetId: messages ? 'milo' : null, currentMessage: question });
    }
    if (!interpretation.readOnly) {
      const decision = await resolveAskTurnSubject({ message: question, pets: context.eligiblePets, ownerId,
        selectedPetId: context.pet.id, recentConversation: context.conversationTurns,
        extractFrame: async () => interpretation.frame });
      assert.ok(!decision.resolution.requiresClarification && decision.resolution.petId, 'route subject gate must allow this fixture');
      authoritativePetIds = decision.resolution.petIds;
      authoritativeSemanticFrame = decision.frame;
      if (decision.resolution.petId !== context.pet.id) context = await buildFurviseContext({ supabase, userId: ownerId,
        petId: decision.resolution.petId, conversationId: messages ? 'chat' : null, conversationPetId: petId, currentMessage: question });
    }
    context.askInterpretation = interpretation;
  }
  // Same evidence creation and explicit parameter used by the route callback.
  const evidenceContract = createAskEvidenceContract(context, authoritativePetIds);
  prepareEvidence?.(evidenceContract);
  const requests = [];
  globalThis.__historyAuditAfterGeneration = afterGeneration;
  globalThis.__historyAuditClient = { responses: { async create(request) {
    requests.push(request); if (providerResponse) return providerResponse(request); return { usage: { input_tokens: 1200, output_tokens: 400, total_tokens: 1600 }, output_text: JSON.stringify({ ...output(answer), ...providerOverrides, ...(providerSequence?.[requests.length - 1] || {}) }) };
  } } };
  let result;
  if (history) {
    assert.equal(prepareEvidence, undefined, 'historical evidence authority belongs to the actual callback');
    const { generateAskHistoryAnswer } = await import('../../../app/lib/intelligence/generate-ask-history.ts');
    const generated = await generateAskHistoryAnswer({ supabase, context, requestId: 'synthetic-audit-request', sourceMessageId: 'current-turn', authoritativePetIds, authoritativeSemanticFrame });
    context = generated.context; result = generated.intelligenceResult;
  } else {
    result = await runFurviseIntelligence({ context, evidenceContract, requestId: 'synthetic-audit-request', sourceMessageId: 'current-turn', authoritativePetIds, authoritativeSemanticFrame });
  }
  assert.equal(requests.length, expectedProviderCalls, expectedProviderCalls === 1 ? 'exactly one mocked answer-provider call' : 'explicit bounded mocked provider call count');
  return { context, result, prompt: JSON.parse(requests[0].input), serialized: requests[0].input, queries: supabase.queries, interpretationRequests };
}
const promptHas = (run, id) => run.prompt.contextRecords.some(record => record.id === `care:${id}`);
const clock = t => {
  t.mock.timers.enable({ apis: ['Date'], now });
  t.mock.method(console, 'info', () => {}); // omit synthetic observability chatter only
};


export { exercise, database, clock, promptHas, buildAskContext, selectRelevantCareEntries, resolveAskTurnSubject, rebuildSemanticProjectionsV2, classifyFurviseCapabilityQuestion, ASK_PROMPT_CONTEXT_CHAR_BUDGET, evidenceScopeKey };
