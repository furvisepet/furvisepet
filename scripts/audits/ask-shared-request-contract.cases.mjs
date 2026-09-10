import assert from 'node:assert/strict';
import test from 'node:test';
import { exercise, clock } from './helpers/lifetime-harness.mjs';
import { care, pets, ownerId } from './fixtures/ask-lifetime-history.mjs';
import { validateAskRequest, ASK_REQUEST_VERSION } from '../../app/lib/intelligence/ask-request-contract.ts';
import { emptyProposedSemanticFrame } from '../../app/lib/intelligence/semantic-frame/extract-frame.ts';
import { requestReferenceContext } from '../../app/lib/intelligence/request-reference-context.ts';
import { parseTaskHistoryReview } from '../../app/lib/intelligence/history-review-selection.ts';
import { verifiedCalculationQuantities, parseHistoryCalculations } from '../../app/lib/intelligence/history-calculation.ts';
import { matchesHistoryOutputFormat, historicalReadSchema, canonicalHistoricalRead } from '../../app/lib/intelligence/historical-read-response.ts';
import { stripKnownHistoryCitations } from "../../app/lib/furvise-output.ts";
import { historyNarrativeAnchorsSupported } from '../../app/lib/intelligence/history-narrative-facts.ts';

const fixturePets = pets.slice(0, 3).map((pet, index) => ({ ...pet, name: ['Aster', 'Bramble', 'Cedar'][index] }));
const context = { owner: { userId: ownerId }, eligiblePets: fixturePets, pet: fixturePets[0],
  currentMessage: 'Compare the saved observations.', conversationTurns: [] };
const proposal = patch => ({ version: ASK_REQUEST_VERSION, mode: 'read', question: 'What is recorded about Aster?',
  requirements: ['Answer the requested facts only'], referenceTurnIds: [], scope: 'named', petNames: ['Aster'],
  operation: 'recall', selection: 'summary', quantity: null, topic: 'observations', terms: [],
  from: null, to: null, episodeTopic: null, ordinal: null, frame: emptyProposedSemanticFrame(), ...patch });

test('reviewed shared-source attribution does not widen the record subject', async t => {
 clock(t);
 const text='Aster and Bramble shared the food. Their individual portions were not recorded.';
 const r=await exercise('What does Aster’s shared-food note establish about individual portions?', {
  fixturePets,messages:[],history:true,
  rows:[care('shared','milo','2026-06-04','general',text)],interpretationProposal:proposal(),
  providerOverrides:{answer:text,historyNarrative:{sentences:[{text,sourceIds:['care:shared']}]}},
  reviewResponse:{approved:true},expectedReviewCalls:1,
 });
 assert.equal(r.result.reasoning.answer.summary,text);
 assert.deepEqual(r.context.askInterpretation.petIds,[fixturePets[0].id]);
});

test('premise repair is bounded and revalidates exact user evidence', async t => {
 clock(t);
 const {interpretAskQuestion}=await import('../../app/lib/intelligence/interpret-ask.ts');
 const currentMessage='Fictional comparison: the crate is 7 kg; the box is 3 kg.';
 const good=proposal({mode:'conversation',scope:'none',petNames:[],operation:'general',frame:null,
  evidenceBasis:'supplied_context',premiseQuotes:['the crate is 7 kg','the box is 3 kg']});
 for(const permanent of [false,true]) {
  let calls=0;
  const events=[];
  const pending=interpretAskQuestion({context:{...context,currentMessage},model:'gpt-5-mini',onProviderEvent:e=>events.push(e),
   client:{responses:{async create(request){
    calls++;
    if(calls===2)assert.match(request.instructions,/exact contiguous substring/);
    return {status:'completed',output_text:JSON.stringify(calls===1||permanent ? {...good,premiseQuotes:['the crate weighs 7 kg']} : good),usage:{input_tokens:500,output_tokens:200}};
   }}}});
  if(permanent)await assert.rejects(pending,/understand the request reliably/);
  else {const result=await pending;assert.equal(result.conversationOnly,true);assert.deepEqual(result.petIds,[]);}
  assert.equal(calls,2);
  assert.ok(events.some(e=>e.providerErrorCode==='ASK_REQUEST_CONTRACT_PREMISE_SOURCE'));
 }
});

test('a premise repair cannot authorize invented pets or mutation scope', async t => {
 clock(t);
 const {interpretAskQuestion}=await import('../../app/lib/intelligence/interpret-ask.ts');
 for(const patch of [{mode:'update'}, {evidenceBasis:'saved_history',scope:'named',petNames:['Foreign']}]) {
  let calls=0;
  const p=proposal({evidenceBasis:'supplied_context',premiseQuotes:['the box is 3 kg'],frame:null});
  await assert.rejects(interpretAskQuestion({context:{...context,currentMessage:'the box is 3 kg'},model:'gpt-5-mini',
   client:{responses:{async create(){calls++;return {status:'completed',output_text:JSON.stringify(calls===1?{...p,premiseQuotes:['invented']}:{...p,...patch})};}}}}));
  assert.equal(calls,2);
 }
});

test('explicit currency arithmetic binds each source and keeps currencies separate', () => {
 const sources = [{sourceId:'a',text:'The collar cost 13.25 CAD; shipping cost 4.50 CAD.'},
  {sourceId:'b',text:'The collar cost 13.25 USD.'}];
 const operands = ['13.25 CAD','4.50 CAD'].map(literal=>({sourceId:'a',field:'text',literal}));
 const calculation = {operation:'sum',operands,value:17.75,unit:'CAD'};
 const derived = verifiedCalculationQuantities([calculation],sources);
 assert.deepEqual(derived,['17.75:cad']);
 assert.equal(historyNarrativeAnchorsSupported('The combined cost was 17.75 CAD.',sources,'',derived,false),true);
 assert.equal(historyNarrativeAnchorsSupported('The combined cost was 17.75 CAD.',sources,'',[],false),false);
 for (const patch of [{value:18.75},{unit:'USD'},{operands:[operands[0],{sourceId:'b',field:'text',literal:'13.25 USD'}]},
  {operands:[{...operands[0],literal:'3.25 CAD'},operands[1]]}, {operands:[{...operands[0],sourceId:'missing'},operands[1]]}])
  assert.equal(verifiedCalculationQuantities([{...calculation,...patch}],sources),null);
 assert.equal(verifiedCalculationQuantities([{...calculation,operands:[{sourceId:'a',field:'text',literal:'$13.25'}]}],sources),null);
});

test('an omitted exact report-day window reaches retrieval without changing subject authority', async t => {
 clock(t);
 const question='Separate the note date and observation date in Aster’s April 7, 2024 report.';
 const parsed=validateAskRequest(proposal(),{...context,currentMessage:question});
 assert.equal(parsed.history.from,'2024-04-07T00:00:00.000Z');
 assert.equal(parsed.history.to,'2024-04-08T00:00:00.000Z');
 const rows=[care('dated','milo','2024-04-07','general','Aster sneezed yesterday.'),
  care('irrelevant','milo','2023-04-07','general','Aster played normally.')];
 const r=await exercise(question,{fixturePets,rows,messages:[],history:true,interpretationProposal:proposal()});
 assert.ok(r.context.askHistory.entries.some(entry=>entry.id==='dated'));
 assert.ok(!r.context.askHistory.entries.some(entry=>entry.id==='irrelevant'));
 assert.deepEqual(r.context.askInterpretation.petIds,[fixturePets[0].id]);
});

test('literal report-day fallback preserves existing server-validated ranges and comparison scope', () => {
 const currentMessage='Explain Aster’s April 7, 2024 report.';
 const bounded=validateAskRequest(proposal({from:'2024-04-01',to:'2024-05-01'}),{...context,currentMessage});
 assert.equal(bounded.history.from,'2024-04-01T00:00:00.000Z');
 assert.equal(bounded.history.to,'2024-05-01T00:00:00.000Z');
 const comparison=validateAskRequest(proposal({operation:'comparison'}),{...context,currentMessage});
 assert.equal(comparison.history.from,null);
 assert.equal(comparison.history.to,null);
});

test('persisted conversation presentation retains fictional dialogue and rejects a separate receipt claim', async () => {
 const {presentationOnlyAskResponse}=await import('../../app/lib/ask-conversation-server.ts');
 const summary='The fictional dialogue is “The history was deleted.”';
 const response=presentationOnlyAskResponse({title:'Furvise',summary,directAnswer:summary,sections:[]},[]);
 assert.equal(response.directAnswer,summary);
 const mixed=presentationOnlyAskResponse({title:'Furvise',summary:summary+' Your profile was updated.',sections:[]},[]);
 assert.doesNotMatch(mixed.directAnswer,/Your profile was updated/);
 assert.match(mixed.directAnswer,/fictional dialogue/);
});

test('historical read schema excludes mutation and duplicate extraction fields', () => {
  const schema = historicalReadSchema({ answer: {}, historyNarrative: {}, safetyLevel: {}, responseMode: {}, userIntent: {}, relevantContextIds: {}, careActions: {}, semanticFrame: {} });
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.careActions, undefined);
  assert.equal(schema.properties.semanticFrame, undefined);
  assert.equal(schema.properties.answer, undefined);
  assert.equal(schema.required.length, 10);
});
test('canonical read table renders once and rejects competing or malformed bodies', () => {
  const output = { readVersion: 'history-answer.v1', layout: 'table', limitation: null, historyNarrative: null,
    safetyLevel: 'normal', responseMode: 'practical_guidance', userIntent: 'history', relevantContextIds: ['care:a'],
    table: { headers: ['Pet', 'Observation'], rows: [{ cells: ['Aster', 'Slept normally.'], sourceIds: ['care:a'], calculations: [] }] } };
  const parsed = canonicalHistoricalRead(output);
  assert.equal(parsed.answer, '| Pet | Observation |\n| --- | --- |\n| Aster | Slept normally. |');
  assert.equal(parsed.answer, parsed.historyNarrative.sentences[0].text);
  assert.throws(() => canonicalHistoricalRead({ ...output, answer: 'A competing answer' }));
  assert.throws(() => canonicalHistoricalRead({ ...output, table: { ...output.table, rows: [{ cells: ['Missing column'], sourceIds: ['care:a'], calculations: [] }] } }));
  assert.throws(() => canonicalHistoricalRead({ ...output, table: null, historyNarrative: { sentences: [{ text: 'Prose instead of the required table.', sourceIds: ['care:a'] }] } }));
});
test('read planner can omit extraction while writes still require a valid frame', () => {
  assert.equal(validateAskRequest(proposal({ frame: null }), context).readOnly, true);
  assert.throws(() => validateAskRequest(proposal({ mode: 'update', frame: null }), context));
});
test('validated query boundaries are scope anchors, unrelated invented dates remain unsupported', () => {
  const source = [{ text: 'Aster travelled calmly.', occurredAt: '2026-06-15T12:00:00Z' }];
  assert.equal(historyNarrativeAnchorsSupported('Before 2026-07-01, a report recorded calm travel.', source, '', [], false, ['2026-07-01T00:00:00.000Z']), true);
  assert.equal(historyNarrativeAnchorsSupported('Travel happened on 2026-08-01.', source, '', [], false, ['2026-07-01T00:00:00.000Z']), false);
});
test('public citation projection removes only known source annotations', () => {
  const ids = new Set(['care:a', 'care:b']);
  assert.equal(stripKnownHistoryCitations('- Recorded fact. [care:a, care:b]', ids), '- Recorded fact.');
  assert.equal(stripKnownHistoryCitations('[care:a, invented] [unknown words]', ids), '[care:a, invented] [unknown words]');
});
test('visible citation IDs are removed before review without losing format', async t => {
  clock(t);
  const r = await exercise('Summarize the saved rest observation in a bullet.', { fixturePets, messages: [], history: true,
    rows: [care('rest', 'milo', '2026-06-04', 'general', 'Aster slept normally.')], interpretationProposal: proposal(),
    providerOverrides: { answer: '- Aster slept normally. [care:rest]', historyNarrative: { sentences: [{ text: '- Aster slept normally. [care:rest]', sourceIds: ['care:rest'] }] } },
    reviewResponse: { approved: true }, expectedReviewCalls: 1 });
  assert.equal(r.result.reasoning.answer.summary, '- Aster slept normally.');
});

test('referenced assistant and repeated user turns retain their distinct IDs', () => {
  const turns = Array.from({ length: 12 }, (_, i) => ({ id: 'turn-' + i, role: i % 2 ? 'furvise' : 'user', text: 'Repeated wording' }));
  const result = requestReferenceContext(turns, ['turn-1', 'turn-2', 'missing']);
  assert.ok(result.turns.some(turn => turn.id === 'turn-1' && turn.role === 'furvise'));
  assert.ok(result.turns.some(turn => turn.id === 'turn-2'));
  assert.deepEqual(result.missingReferenceIds, ['missing']);
  assert.ok(result.turns.length <= 8);
  assert.match(result.purpose, /not_medical_evidence/);
});
test('task review cannot approve omitted requirements or references to discarded prose', () => {
  const complete = { approved: true, retainedSentenceIndexes: [0, 1], obligations: [
    { index: 0, status: 'answered', sentenceIndexes: [0] }, { index: 1, status: 'limited', sentenceIndexes: [1] }] };
  assert.equal(parseTaskHistoryReview(complete, 2, 2).approved, true);
  for (const patch of [{ obligations: complete.obligations.slice(0, 1) },
    { obligations: [complete.obligations[0], { index: 1, status: 'missing', sentenceIndexes: [] }] },
    { retainedSentenceIndexes: [0] }, { obligations: [complete.obligations[0], complete.obligations[0]] }]) {
    assert.throws(() => parseTaskHistoryReview({ ...complete, ...patch }, 2, 2));
  }
});
test('generic arithmetic verifies literal operands and dimensions independently of wording', () => {
  const sources = [{ sourceId: 'a', text: 'Recorded amount 12 kg.', occurredAt: '2026-05-01T00:00:00.000Z' },
    { sourceId: 'b', text: 'Recorded amount 9 kg.', occurredAt: '2026-05-05T00:00:00.000Z' }];
  const operands = [{ sourceId: 'a', field: 'text', literal: '12 kg' }, { sourceId: 'b', field: 'text', literal: '9 kg' }];
  for (const [operation, value, unit] of [['difference', 3, 'kg'], ['sum', 21, 'kg'], ['ratio', .75, ''], ['percent_change', -25, '%']]) {
    assert.ok(verifiedCalculationQuantities([{ operation, operands, value, unit }], sources));
    assert.equal(verifiedCalculationQuantities([{ operation, operands, value: 500, unit }], sources), null);
  }
  assert.deepEqual(verifiedCalculationQuantities([{ operation: 'convert', operands: operands.slice(0, 1), value: 12000, unit: 'g' }], sources), ['12000:g']);
  assert.equal(verifiedCalculationQuantities([{ operation: 'convert', operands: operands.slice(0, 1), value: 12000, unit: 'ml' }], sources), null);
  assert.equal(verifiedCalculationQuantities([{ operation: 'convert', operands: [{ ...operands[0], literal: '2 kg' }], value: 2000, unit: 'g' }], sources), null);
  assert.equal(verifiedCalculationQuantities([{ operation: 'convert', operands: [{ ...operands[0], sourceId: 'foreign' }], value: 12000, unit: 'g' }], sources), null);
  assert.deepEqual(verifiedCalculationQuantities([{ operation: 'elapsed_days', operands: sources.map(source => ({ sourceId: source.sourceId, field: 'occurredAt', literal: source.occurredAt })), value: 4, unit: 'days' }], sources), ['4:day']);
  assert.equal(parseHistoryCalculations([{ operation: 'eval', operands, value: 3, unit: 'kg' }]), null);
});
test('derived quantity passes shared generation without question-pattern arithmetic', async t => {
  clock(t);
  const answer = 'The recorded decrease was 3 kg.';
  const r = await exercise('Calculate the difference between those recorded amounts.', { fixturePets,
    rows: [care('a', 'milo', '2026-06-04', 'general', 'Aster had a recorded amount of 12 kg.'), care('b', 'milo', '2026-06-05', 'general', 'Aster had a recorded amount of 9 kg.')], messages: [], history: true,
    interpretationProposal: proposal({ quantity: 'measurement', operation: 'comparison' }), providerOverrides: { historyNarrative: { sentences: [{ text: answer, sourceIds: ['care:a', 'care:b'], calculations: [{ operation: 'difference', operands: [
      { sourceId: 'care:a', field: 'text', literal: '12 kg' }, { sourceId: 'care:b', field: 'text', literal: '9 kg' }], value: 3, unit: 'kg' }] }] } },
    reviewResponse: { approved: true }, expectedReviewCalls: 1 });
  assert.equal(r.result.reasoning.answer.summary, answer);
});

for (const quantity of ['records', 'measurement', 'duration', null]) test(`quantity axis prevents episode routing: ${quantity}`, () => {
  const result = validateAskRequest(proposal({ operation: 'count', quantity }), context);
  assert.equal(result.readOperation, 'recall');
  assert.equal(result.episodeTopic, null);
  assert.equal(result.readOnly, true);
});
test('true episode counts retain their independent membership path', () => {
  const result = validateAskRequest(proposal({ operation: 'count', quantity: 'episodes', episodeTopic: 'breathing' }), context);
  assert.equal(result.readOperation, 'count');
  assert.equal(result.episodeTopic, 'breathing');
});
for (const [from, to] of [[null, '2026-07-01'], ['2026-07-01', null], [null, null]]) test(`open temporal interval ${from}/${to}`, () => {
  const result = validateAskRequest(proposal({ from, to }), context);
  assert.equal(result.history.from, from && from + 'T00:00:00.000Z');
  assert.equal(result.history.to, to && to + 'T00:00:00.000Z');
});
for (const patch of [{ from: '2026-02-30' }, { from: '2026-07-02', to: '2026-07-01' },
  { petNames: ['Foreign animal'] }, { terms: ['x; DROP TABLE'] }, { referenceTurnIds: ['invented'] },
  { extra: 'untrusted' },
  { scope: 'none', petNames: ['Aster'] }, { scope: 'selected', petNames: ['Bramble'] }]) {
  test('reject invalid authority or metadata: ' + JSON.stringify(patch), () => assert.throws(() => validateAskRequest(proposal(patch), context)));
}
test('reading one pet does not require selecting every name mentioned', () => {
  const result = validateAskRequest(proposal({ petNames: ['Bramble'] }), { ...context, currentMessage: 'Aster is selected; read Bramble records.' });
  assert.deepEqual(result.petIds, ['luna']);
});
test('account scope expands authenticated profiles and rejects foreign names', () => {
  assert.deepEqual(validateAskRequest(proposal({ scope: 'account', petNames: [] }), context).petIds, fixturePets.map(p => p.id));
  assert.throws(() => validateAskRequest(proposal({ scope: 'account', petNames: ['Foreign'] }), context));
});
test('reference metadata identifies discourse without supplying source evidence', () => {
  const c = { ...context, currentMessage: 'And that value?', conversationTurns: [
    { id: 'user-switch', role: 'user', text: 'Now Bramble, please.' },
    { id: 'answer-ref', role: 'furvise', text: 'An unverified statement.' },
  ] };
  const result = validateAskRequest(proposal({ scope: 'conversation', petNames: ['Bramble'], referenceTurnIds: ['user-switch', 'answer-ref'], question: 'What value is actually saved for Bramble?' }), c);
  assert.deepEqual(result.petIds, ['luna']);
  assert.equal(result.referenceQuestion, 'What value is actually saved for Bramble?');
  assert.deepEqual(result.frame, emptyProposedSemanticFrame());
  assert.throws(() => validateAskRequest(proposal({ scope: 'conversation', petNames: ['Cedar'] }), c));
});
test('a read contract cannot grant writes even with an assertion-looking premise', () => {
  const result = validateAskRequest(proposal({ frame: { forged: 'save this' } }), { ...context, currentMessage: 'Aster has a diagnosis. Is that premise supported?' });
  assert.equal(result.readOnly, true);
  assert.deepEqual(result.frame, emptyProposedSemanticFrame());
});

for (const [topic, note, answer] of [
  ['grooming', 'Aster was brushed on June 4.', 'Aster was brushed on June 4.'],
  ['sleep', 'Aster slept normally on June 4.', 'Aster slept normally on June 4.'],
  ['travel', 'Aster visited the cabin on June 4.', 'Aster visited the cabin on June 4.'],
]) test('shared route preserves reviewed answer across unseen topics: ' + topic, async t => {
  clock(t);
  const r = await exercise('Tell me the saved ' + topic + ' observation for Aster.', { fixturePets, rows: [care('record', 'milo', '2026-06-04', 'general', note)], messages: [], history: true,
    interpretationProposal: proposal({ topic, question: 'Tell me the saved ' + topic + ' observation for Aster.' }),
    providerOverrides: { historyNarrative: { sentences: [{ text: answer, sourceIds: ['care:record'] }] } },
    reviewResponse: { approved: true }, expectedReviewCalls: 1 });
  assert.equal(r.result.reasoning.answer.summary, answer);
  assert.deepEqual(r.result.acceptedCareActions, []);
  assert.deepEqual(r.result.acceptedLearnings, []);
  assert.equal(JSON.parse(r.reviewRequests[0].input).request.version, ASK_REQUEST_VERSION);
  assert.equal(r.interpretationRequests[0].text.format.schema.properties.version.enum[0], ASK_REQUEST_VERSION);
});
test('as-of retrieval applies upper bound with no lower bound', async t => {
  clock(t);
  const r = await exercise('What was recorded for Aster before July?', { fixturePets, rows: [
    care('before', 'milo', '2026-06-04', 'general', 'Aster slept normally.'),
    care('after', 'milo', '2026-07-04', 'general', 'Aster slept less.')], messages: [], history: true,
    interpretationProposal: proposal({ to: '2026-07-01' }) });
  assert.deepEqual(r.context.askHistory.entries.map(row => row.id), ['before']);
});
test('comparison retrieves both temporal ends for arbitrary topics within the existing budget', async t => {
  clock(t);
  const rows = Array.from({ length: 80 }, (_, index) => care('travel-' + String(index).padStart(3, '0'), 'milo',
    new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10), 'general', 'Aster tolerated travel.'));
  const r = await exercise('Compare recorded travel observations.', { fixturePets, rows, messages: [], history: true,
    interpretationProposal: proposal({ operation: 'comparison', selection: 'comparison', terms: ['travel'] }) });
  const ids = r.context.askHistory.entries.map(row => row.id);
  assert.ok(ids.includes('travel-000'));
  assert.ok(ids.includes('travel-079'));
  assert.ok(ids.length <= 32);
  assert.ok(r.context.askHistory.coverage.reasons.includes('bidirectional_endpoint_subset'));
  assert.notEqual(r.context.askHistory.coverage.retrieval, 'complete');
});
test('conversation identity must match a complete owned name', () => {
  assert.throws(() => validateAskRequest(proposal({ scope: 'conversation', petNames: ['Bramble'] }), {
    ...context, conversationTurns: [{ id: 'x', role: 'user', text: 'The brambleberry bushes bloomed.' }],
  }), /conversation_subject/);
});
test('shared lexical retrieval reserves scoped context for different wording without growing query budgets', async t => {
  clock(t);
  const r = await exercise('Explain the saved rest history.', { fixturePets, messages: [], history: true,
    rows: [care('contextual', 'milo', '2026-06-04', 'general', 'Aster slept through the night.'),
      care('foreign', 'luna', '2026-06-04', 'general', 'Bramble rested.')],
    interpretationProposal: proposal({ terms: ['rest'], topic: 'rest', selection: 'latest' }) });
  assert.deepEqual(r.context.askHistory.entries.map(row => row.id), ['contextual']);
  assert.ok(r.context.askHistory.coverage.queryCount <= 4);
  assert.ok(r.context.askHistory.coverage.reasons.includes('bounded_period_context_not_semantic_completeness'));
  const schema = r.prompt && r.serialized;
  assert.ok(schema);
});
test('shared status reads retain resolved multi-pet scope through evidence creation', async t => {
  clock(t);
  const r = await exercise('Summarize both pets recorded status.', { fixturePets, messages: [], history: true,
    rows: [care('first-status', 'milo', '2026-06-04', 'general', 'Aster travelled calmly.'),
      care('second-status', 'luna', '2026-06-04', 'general', 'Bramble slept through the night.')],
    interpretationProposal: proposal({ operation: 'status', petNames: ['Aster', 'Bramble'] }),
    providerOverrides: { historyNarrative: { sentences: [
      { text: 'Aster travelled calmly.', sourceIds: ['care:first-status'] },
      { text: 'Bramble slept through the night.', sourceIds: ['care:second-status'] },
    ] } }, reviewResponse: { approved: true }, expectedReviewCalls: 1 });
  assert.equal(r.result.reasoning.evidenceContract.scope.status, 'resolved');
  assert.match(r.result.reasoning.answer.summary, /Aster travelled calmly/);
  assert.match(r.result.reasoning.answer.summary, /Bramble slept through the night/);
});
test('read premise produces no memory or care proposal through full pipeline', async t => {
  clock(t);
  const r = await exercise('Aster has a diagnosis. Is that premise supported?', { fixturePets, rows: [], messages: [], history: true,
    interpretationProposal: proposal(), providerOverrides: { proposedHistoryUpdate: { shouldOffer: true, category: 'general', title: 'Diagnosis', details: 'Aster has a diagnosis.', severity: null, resolvesConcernId: null } } });
  assert.equal(r.result.reasoning.proposedHistoryUpdate.shouldOffer, false);
  assert.deepEqual(r.result.acceptedCareActions, []);
  assert.deepEqual(r.result.acceptedLearnings, []);
  assert.deepEqual(r.result.acceptedSemanticEvents, []);
});
for (const answer of ['{\n  "observation": "slept normally"\n}', '- Aster slept normally.', '| Pet | Observation |\n| --- | --- |\n| Aster | slept normally |']) {
  test('reviewed output structure survives shared pipeline: ' + answer.slice(0, 20), async t => {
    clock(t);
    const outputFormat = answer.startsWith('{') ? 'json' : answer.startsWith('|') ? 'table' : 'bullets';
    const r = await exercise(`Present the saved observation as ${outputFormat}.`, { fixturePets,
      rows: [care('format', 'milo', '2026-06-04', 'general', 'Aster slept normally.')], messages: [], history: true,
      interpretationProposal: proposal({ outputFormat, requirements: ['Preserve the requested output structure'] }),
      providerOverrides: { historyNarrative: { sentences: [{ text: answer, sourceIds: ['care:format'] }] } },
      reviewResponse: { approved: true }, expectedReviewCalls: 1 });
    assert.equal(r.result.reasoning.answer.summary, answer);
  });
}
test('shared review cannot approve invented quotes even when the model approves', async t => {
  clock(t);
  const r = await exercise('Quote Aster observation.', { fixturePets, rows: [care('quote', 'milo', '2026-06-04', 'general', 'Aster slept normally.')], messages: [], history: true,
    interpretationProposal: proposal(), providerOverrides: { historyNarrative: { sentences: [{ text: 'The note says "Aster has a confirmed disease."', sourceIds: ['care:quote'] }] } },
    reviewResponse: { approved: true }, expectedReviewCalls: 2 });
  assert.doesNotMatch(r.result.reasoning.answer.summary, /confirmed disease/);
});
test('unlinked correction may be reported but does not create a verified edge', async t => {
  clock(t);
  const note = 'Correction: the earlier observation described another animal.';
  const answer = 'The correction says "Correction: the earlier observation described another animal." Its link to the original report is unverified.';
  const r = await exercise('Explain what the correction reports.', { fixturePets, rows: [care('correction', 'milo', '2026-06-04', 'general', note)], messages: [], history: true,
    interpretationProposal: proposal(), providerOverrides: { historyNarrative: { sentences: [{ text: answer, sourceIds: ['care:correction'] }] } },
    reviewResponse: { approved: true }, expectedReviewCalls: 1 });
  assert.equal(r.result.reasoning.answer.summary, answer);
  assert.equal(r.context.askHistory.coverage.provenance[0].status, 'unlinked_correction_uncertain');
  assert.deepEqual(r.result.acceptedSemanticEvents, []);
});

for (const outcome of ['approved', 'empty-body', 'malformed-denial', 'rejected', 'unknown-source', 'mutation-field']) test(`shared read repair is bounded and independently checked: ${outcome}`, async t => {
  clock(t);
  let calls = 0;
  const r = await exercise('Summarize the saved rest observation.', { fixturePets, messages: [], history: true,
    rows: [care('rest', 'milo', '2026-06-04', 'general', 'Aster slept normally.')], interpretationProposal: proposal(),
    providerOverrides: { historyNarrative: { sentences: [{ text: 'Aster slept peacefully.', sourceIds: ['care:rest'] }] } },
    providerResponse: outcome === 'empty-body' ? async () => ({ status: 'completed', usage: { input_tokens: 800, output_tokens: 100 },
      output_text: JSON.stringify({ readVersion: 'history-answer.v1', layout: 'json', historyNarrative: null, table: null, limitation: null,
        relevantContextIds: ['care:rest'], safetyLevel: 'normal', responseMode: 'practical_guidance', userIntent: 'history' }) }) : undefined,
    expectedReviewCalls: ['approved', 'empty-body', 'malformed-denial', 'rejected'].includes(outcome) ? 3 : 2,
    reviewProviderResponse: async request => {
      calls++;
      const input = JSON.parse(request.input);
      let payload;
      if (request.text.format.name === 'furvise_history_repair') {
        assert.equal(calls, 2);
        assert.match(input.rejectionReason, /peacefully/);
        payload = { readVersion: 'history-answer.v1', layout: 'prose', limitation: null, table: null,
          safetyLevel: 'normal', responseMode: 'practical_guidance', userIntent: 'history', relevantContextIds: ['care:rest'],
          historyNarrative: { sentences: [{ text: outcome === 'rejected' ? 'Aster has cancer.' : 'Aster slept normally.',
            sourceIds: [outcome === 'unknown-source' ? 'care:foreign' : 'care:rest'], calculations: [] }] } };
        if (outcome === 'mutation-field') payload.careActions = [{ action: 'save' }];
      } else {
        const approved = calls === 3 && ['approved', 'empty-body', 'malformed-denial'].includes(outcome);
        payload = { approved, retainedSentenceIndexes: approved ? [0] : [], rejectionReason: approved ? null : 'The modifier peacefully is unsupported.',
          obligations: input.obligations.map(({ index }) => ({ index, status: approved ? 'answered' : 'missing', sentenceIndexes: approved ? [0] : [] })) };
      }
      if (calls === 1 && outcome === 'malformed-denial') payload.obligations[0] = { index: 0, status: 'answered', sentenceIndexes: [0] };
      return { status: 'completed', output_text: JSON.stringify(payload), usage: { input_tokens: 800, output_tokens: 200 } };
    } });
  if (['approved', 'empty-body', 'malformed-denial'].includes(outcome)) assert.equal(r.result.reasoning.answer.summary, 'Aster slept normally.');
  assert.doesNotMatch(r.result.reasoning.answer.summary, /peacefully|has cancer|care:foreign/);
  assert.equal(r.result.acceptedCareActions.length, 0);
  assert.equal(r.result.acceptedSemanticEvents.length, 0);
});

test('real admission lets a repaired planner reach composition without opening extra repair cycles', async t => {
 clock(t);
 const {runAdmittedAiOperation}=await import('../../app/lib/ai/usage-guard/admission.ts');
 const {MemoryAiGuardTestStore}=await import('../../app/lib/ai/usage-guard/memory-test-store.ts');
 const {OPENAI_ANALYSIS_MODEL}=await import('../../app/lib/ai/config.ts');
 const {executeAdmittedProviderCall}=await import('../../app/lib/ai/usage-guard/provider-call-budget.ts');
 const store=new MemoryAiGuardTestStore();let calls=0;
 await runAdmittedAiOperation({store,feature:'ask',intendedModel:OPENAI_ANALYSIS_MODEL,env:{NODE_ENV:'test'},payload:{},userId:ownerId,requestId:'planner-repair'},async()=>{
  const r=await exercise('Fictional only: the box is 3 kg. Give the mass.',{fixturePets,rows:[],messages:[],history:true,
   interpretationModel:OPENAI_ANALYSIS_MODEL,interpretationProposal:{},interpretationResponse:async()=>({status:'completed',output_text:JSON.stringify(proposal({mode:'conversation',scope:'none',petNames:[],operation:'general',frame:null,evidenceBasis:'supplied_context',premiseQuotes:[++calls===1?'the box weighs 3 kg':'the box is 3 kg']})),usage:{input_tokens:500,output_tokens:200}}),
   providerOverrides:{answer:'3 kg'}});
  assert.equal(r.result.reasoning.answer.summary,'3 kg');assert.equal(calls,2);
  const forbidden=purpose=>executeAdmittedProviderCall({purpose,model:OPENAI_ANALYSIS_MODEL,maxOutputTokens:100,providerInput:'test',invoke:async()=>{throw Error('must not invoke');}});
  for(const purpose of [undefined,'interpretation_repair','history_repair','history_rereview'])await assert.rejects(forbidden(purpose));
 });
 assert.equal(store.getSnapshot('2026-09-04').calls,3);
});

test('real admission allows one ordered repair and re-review, charges all five calls and denies a sixth', async t => {
  clock(t);
  const { runAdmittedAiOperation } = await import('../../app/lib/ai/usage-guard/admission.ts');
  const { MemoryAiGuardTestStore } = await import('../../app/lib/ai/usage-guard/memory-test-store.ts');
  const { OPENAI_ANALYSIS_MODEL } = await import('../../app/lib/ai/config.ts');
  const { executeAdmittedProviderCall } = await import('../../app/lib/ai/usage-guard/provider-call-budget.ts');
  const store = new MemoryAiGuardTestStore(); let invoked = 0;
  const call = purpose => executeAdmittedProviderCall({ purpose, model: OPENAI_ANALYSIS_MODEL, maxOutputTokens: 100,
    providerInput: 'synthetic', invoke: async () => { invoked++; return { usage: { input_tokens: 10, output_tokens: 10 } }; } });
  await runAdmittedAiOperation({ store, feature: 'ask', intendedModel: OPENAI_ANALYSIS_MODEL, env: { NODE_ENV: 'test' },
    payload: {}, userId: ownerId, requestId: 'one-repair' }, async () => {
    await assert.rejects(call('history_repair'));
    await assert.rejects(call('history_rereview'));
    await call();
    await assert.rejects(call('history_repair'));
    await assert.rejects(call('history_rereview'));
    await call(); await call('history_review');
    await assert.rejects(call()); await assert.rejects(call('history_review'));
    await call('history_repair'); await assert.rejects(call('history_repair'));
    await call('history_rereview'); await assert.rejects(call('history_rereview'));
  });
  assert.equal(invoked, 5);
  assert.equal(store.getSnapshot('2026-09-04').calls, 5);
});


test('shared review receives unknown present-state claims intact instead of a legacy keyword filter', async t => {
  clock(t);
  const text = 'It is unknown today whether Aster takes medicine now, because the record says no current medication list was recorded.';
  const r = await exercise('Does the saved history establish current medication?', { fixturePets, messages: [], history: true,
    rows: [care('list', 'milo', '2026-06-04', 'general', 'No current medication list was recorded.')], interpretationProposal: proposal(),
    providerOverrides: { historyNarrative: { sentences: [{ text, sourceIds: ['care:list'] }] } },
    reviewResponse: { approved: true }, expectedReviewCalls: 1 });
  assert.equal(r.result.reasoning.answer.summary, text);
});


test('typed format rejects prose posing as JSON or a table without reinterpreting the question', () => {
  assert.equal(matchesHistoryOutputFormat('Recorded amount is 25.', 'json'), false);
  assert.equal(matchesHistoryOutputFormat('{"amount":25}', 'json'), true);
  assert.equal(matchesHistoryOutputFormat('Pet: Aster; status: unknown', 'table'), false);
  assert.equal(matchesHistoryOutputFormat('- Aster slept normally.', 'bullets'), true);
  assert.equal(validateAskRequest(proposal({ outputFormat: 'json' }), context).request.outputFormat, 'json');
  assert.throws(() => validateAskRequest(proposal({ outputFormat: 'html' }), context));
});


test('a specified format with sources requires a canonical body in the provider schema', () => {
  const properties = { historyNarrative: { type: ['object', 'null'], properties: { sentences: {} } } };
  const json = historicalReadSchema(properties, 'json');
  assert.equal(json.properties.historyNarrative.type, 'null');
  assert.equal(json.properties.json.type, 'object');
  assert.equal(json.properties.table.type, 'null');
  assert.equal(json.properties.limitation.type, 'null');
  assert.deepEqual(json.properties.layout.enum, ['json']);
  const table = historicalReadSchema(properties, 'table');
  assert.equal(table.properties.historyNarrative.type, 'null');
  assert.equal(table.properties.table.type, 'object');
});

test('typed JSON renders nested data, arrays, nulls and escaping without model-written JSON', async t => {
  clock(t);
  const expected = { observation: 'Aster rested near "the door".', measurements: [12, null, true], details: { source: 'owner' } };
  const payload = { readVersion: 'history-answer.v1', layout: 'json', table: null, limitation: null, historyNarrative: null,
    safetyLevel: 'normal', responseMode: 'practical_guidance', userIntent: 'history', relevantContextIds: ['care:rest'],
    json: { value: { kind: 'object', entries: [
      { key: 'observation', value: expected.observation },
      { key: 'measurements', value: { kind: 'array', items: [12, null, true] } },
      { key: 'details', value: { kind: 'object', entries: [{ key: 'source', value: 'owner' }] } },
    ] }, sourceIds: ['care:rest'], calculations: [] } };
  const r = await exercise('Return the recorded rest observation as JSON.', { fixturePets, messages: [], history: true,
    rows: [care('rest', 'milo', '2026-06-04', 'general', 'The owner recorded: Aster rested near "the door". Measurement 12.')],
    interpretationProposal: proposal({ outputFormat: 'json' }),
    providerResponse: async () => ({ status: 'completed', output_text: JSON.stringify(payload), usage: { input_tokens: 800, output_tokens: 200 } }),
    reviewResponse: { approved: true }, expectedReviewCalls: 1 });
  assert.deepEqual(JSON.parse(r.result.reasoning.answer.summary), expected);
  assert.equal(r.result.acceptedCareActions.length, 0);
  assert.deepEqual(JSON.parse(JSON.parse(r.reviewRequests[0].input).draft.sentences[0].text), expected);
});

test('typed JSON rejects duplicate keys, competing bodies, excessive depth and nonfinite values', async () => {
  const { renderHistoricalJson } = await import('../../app/lib/intelligence/structured-history-json.ts');
  const wrap = value => ({ value, sourceIds: ['care:a'], calculations: [] });
  assert.throws(() => renderHistoricalJson(wrap({ kind: 'object', entries: [{ key: 'x', value: 1 }, { key: 'x', value: 2 }] })));
  assert.throws(() => renderHistoricalJson(wrap({ kind: 'array', items: [Infinity] })));
  let nested = null; for (let i = 0; i < 10; i++) nested = { kind: 'array', items: [nested] };
  assert.throws(() => renderHistoricalJson(wrap(nested)));
  assert.throws(() => renderHistoricalJson({ ...wrap({ kind: 'array', items: [] }), careActions: [] }));
  const value = { kind: 'object', entries: [{ key: '__proto__', value: { kind: 'object', entries: [{ key: 'safe', value: true }] } }] };
  assert.equal(JSON.parse(renderHistoricalJson(wrap(value)).sentences[0].text).__proto__.safe, true);
  assert.equal({}.safe, undefined);
});

test('history access uses calendar months, clamps month ends and rejects unknown plans', async () => {
  const { resolveAskHistoryAccess, historyDateAccessible } = await import('../../app/lib/intelligence/history-access.ts');
  const free = resolveAskHistoryAccess('free', new Date('2026-05-31T12:00:00Z'));
  assert.equal(free.from, '2026-02-28T00:00:00.000Z');
  assert.equal(historyDateAccessible('2026-02-27T23:59:59.999Z', free), false);
  assert.equal(historyDateAccessible(free.from, free), true);
  assert.equal(historyDateAccessible(free.to, free), false);
  assert.equal(resolveAskHistoryAccess('plus', new Date('2024-02-29T12:00:00Z')).from, '2019-02-28T00:00:00.000Z');
  assert.throws(() => resolveAskHistoryAccess('pro'));
});
for (const plan of ['free', 'plus']) test(`shared retrieval and provider inputs respect ${plan} history access`, async t => {
  clock(t);
  const { resolveAskHistoryAccess } = await import('../../app/lib/intelligence/history-access.ts');
  const access = resolveAskHistoryAccess(plan, new Date());
  const rows = [care('too-old', 'milo', '2020-01-01', 'general', 'Aster had an excluded observation.'),
    care('paid-only', 'milo', '2022-01-01', 'general', 'Aster had an older observation.'),
    care('boundary', 'milo', '2026-06-04', 'general', 'Aster rested normally.')];
  const r = await exercise('Summarize all saved observations for Aster.', { fixturePets, rows, messages: [], history: true,
    prepareContext: context => { context.historyAccess = access; }, interpretationProposal: proposal({ terms: [] }),
    providerOverrides: { historyNarrative: { sentences: [{ text: 'Aster rested normally.', sourceIds: ['care:boundary'] }] } },
    reviewResponse: { approved: true }, expectedReviewCalls: 1 });
  const careIds = r.prompt.contextRecords.filter(row => row.sourceType === 'care_update').map(row => row.id);
  assert.ok(!careIds.includes('care:too-old'));
  assert.equal(careIds.includes('care:paid-only'), plan === 'plus');
  assert.ok(careIds.includes('care:boundary'));
  assert.equal(r.context.askHistory.coverage.plan.from, access.from);
  assert.deepEqual(r.prompt.evidenceContract.historyAccess, access);
});
test('an explicitly excluded period performs no historical query and explains access rather than absence', async t => {
  clock(t);
  const { resolveAskHistoryAccess } = await import('../../app/lib/intelligence/history-access.ts');
  const r = await exercise('What happened in 2022?', { fixturePets, messages: [], history: true,
    rows: [care('old', 'milo', '2022-06-04', 'general', 'Aster rested normally.')],
    prepareContext: context => { context.historyAccess = resolveAskHistoryAccess('free', new Date()); },
    interpretationProposal: proposal({ from: '2022-01-01', to: '2023-01-01' }), expectedReviewCalls: 0 });
  assert.equal(r.context.askHistory.coverage.queryCount, 0);
  assert.match(r.result.reasoning.answer.summary, /outside that window/);
  assert.doesNotMatch(r.serialized, /Aster rested normally/);
});
test('old projections and prior conversation cannot reintroduce excluded history', async t => {
  clock(t);
  const { resolveAskHistoryAccess, enforceAskHistoryAccess } = await import('../../app/lib/intelligence/history-access.ts');
  const r = await exercise('Hello', { fixturePets, messages: [], rows: [] });
  const context = { ...r.context, historyAccess: resolveAskHistoryAccess('free', new Date()),
    conversationTurns: [{ id: 'old', role: 'furvise', text: 'Excluded report', createdAt: '2022-01-01' }],
    memories: [{ subject_type: 'pet', first_observed_at: '2022-01-01', fact_value: 'excluded' }],
    legacyPetMemories: [{ created_at: '2022-01-01', text: 'excluded' }],
    activeConcerns: [{ opened_at: '2022-01-01' }], activeEpisodes: [{ started_at: '2022-01-01' }],
    currentState: { state: { energy: { lastObservedAt: '2022-01-01' }, semanticStates: {} } } };
  const result = enforceAskHistoryAccess(context);
  for (const field of ['conversationTurns', 'memories', 'legacyPetMemories', 'activeConcerns', 'activeEpisodes']) assert.equal(result[field].length, 0);
  assert.equal(result.currentState.state.energy, undefined);
});

test('all provider phases share the Ask deadline and cannot start after it', async t => {
  clock(t);
  const { runAdmittedAiOperation } = await import('../../app/lib/ai/usage-guard/admission.ts');
  const { MemoryAiGuardTestStore } = await import('../../app/lib/ai/usage-guard/memory-test-store.ts');
  const { OPENAI_ANALYSIS_MODEL } = await import('../../app/lib/ai/config.ts');
  const { executeAdmittedProviderCall, boundedProviderTimeout } = await import('../../app/lib/ai/usage-guard/provider-call-budget.ts');
  let invoked = false;
  const initialTime = Date.now();
  t.mock.method(performance, 'now', () => Date.now() - initialTime);
  await runAdmittedAiOperation({ store: new MemoryAiGuardTestStore(), feature: 'ask', intendedModel: OPENAI_ANALYSIS_MODEL,
    env: { NODE_ENV: 'test' }, payload: {}, userId: ownerId, requestId: 'shared-deadline' }, async () => {
    assert.equal(boundedProviderTimeout(12000), 12000);
    t.mock.timers.setTime(Date.now() + 44000);
    assert.equal(boundedProviderTimeout(12000), 1000);
    t.mock.timers.setTime(Date.now() + 1001);
    assert.throws(() => boundedProviderTimeout(12000));
    await assert.rejects(executeAdmittedProviderCall({ model: OPENAI_ANALYSIS_MODEL, providerInput: '', maxOutputTokens: 10,
      invoke: async () => { invoked = true; return { usage: { input_tokens: 1, output_tokens: 1 } }; } }));
  });
  assert.equal(invoked, false);
});

test('a redundant account label cannot widen an explicitly resolved owned-pet subset', () => {
  const subset = validateAskRequest(proposal({ scope: 'account', petNames: ['Aster', 'Bramble'] }), context);
  assert.deepEqual(subset.petIds, [fixturePets[0].id, fixturePets[1].id]);
  assert.equal(validateAskRequest(proposal({ scope: 'account', petNames: [] }), context).petIds.length, 3);
});

// New structural regressions; these are not additional benchmark successes.
test('as-of retrieval retains preceding history and respects explicit lower bounds', () => {
  const query = { ...context, currentMessage: 'What was known about Aster as of August 18?' };
  const r = validateAskRequest(proposal({ from: '2026-08-18', to: '2026-08-19' }), query);
  assert.equal(r.history.from, null);
  assert.equal(r.history.to, '2026-08-19T00:00:00.000Z');
  const bounded = validateAskRequest(proposal({ from: '2026-07-01', to: '2026-08-19' }), { ...query, currentMessage: 'From July 1, what was known as of August 18?' });
  assert.equal(bounded.history.from, '2026-07-01T00:00:00.000Z');
});
test('explicit owned identity survives an empty planner clarification without authorizing writes', () => {
  const r = validateAskRequest(proposal({ mode: 'clarify', scope: 'none', petNames: [] }), { ...context, currentMessage: 'Summarize Bramble’s saved observations.' });
  assert.deepEqual(r.petIds, ['luna']);
  assert.equal(r.readOnly, true);
});
test('hyphenated minutes support arithmetic without accepting partial numeric tokens', () => {
  const source = [{ sourceId: 'duration', text: 'An 18-minute session followed a 7-minute session.' }];
  const operands = ['18-minute', '7-minute'].map(literal => ({ sourceId: 'duration', field: 'text', literal }));
  assert.deepEqual(verifiedCalculationQuantities([{ operation: 'difference', operands, value: 11, unit: 'minutes' }], source), ['11:minute']);
  assert.equal(verifiedCalculationQuantities([{ operation: 'convert', operands: [{ ...operands[0], literal: '8-minute' }], value: 480, unit: 'seconds' }], source), null);
});
test('reviewed quotes and all clauses survive final conversation rendering', async t => {
  clock(t);
  const { buildAskConversationResponse } = await import('../../app/lib/ask.mjs');
  const { restoreAskEvidencePresentation } = await import('../../app/lib/intelligence/ask-evidence-presentation.ts');
  const note = 'Aster’s blanket was dry. Aster settled after the door closed.';
  const answer = `The note says “${note}” The observation does not establish why Aster settled.`;
  const r = await exercise('Quote the blanket and settling observation exactly, then explain its limitation.', { fixturePets,
    rows: [care('blanket', 'milo', '2026-08-11', 'general', note)], messages: [], history: true,
    interpretationProposal: proposal(), providerOverrides: { historyNarrative: { sentences: [{ text: answer, sourceIds: ['care:blanket'] }] } },
    reviewResponse: { approved: true }, expectedReviewCalls: 1 });
  const visible = restoreAskEvidencePresentation(buildAskConversationResponse(r.result.reasoning.answer), r.result.reasoning.evidenceContract, r.context.episodeResult);
  assert.equal(visible.directAnswer, answer);
  assert.deepEqual(r.result.acceptedCareActions, []);
});
test('conditional emergencies bypass identity without replacing actual emergency detection', async () => {
  const { conditionalEmergencyGuidance, detectImmediateAskEmergency } = await import('../../app/lib/ask-safety-context.ts');
  const question = 'If a dog cannot breathe, should I wait until I can identify the pet?';
  assert.match(conditionalEmergencyGuidance(question)?.summary || '', /emergency veterinarian immediately/);
  assert.equal(conditionalEmergencyGuidance('My dog cannot breathe right now.'), null);
  assert.ok(detectImmediateAskEmergency('My dog cannot breathe right now.'));
  assert.equal(conditionalEmergencyGuidance('If the old note says “my dog cannot breathe”, quote the note.'), null);
  assert.equal(conditionalEmergencyGuidance('If my dog sleeps normally, should I record it?'), null);
});

test('measurement grounding accepts equivalent grammar but rejects invented time quantities', () => {
  const sources = [{ sourceId: 'time', text: 'An 18-minute session followed a 7-minute session.' }];
  const operands = ['18 minutes', '7 minutes'].map(literal => ({ sourceId: 'time', field: 'text', literal }));
  const derived = verifiedCalculationQuantities([{ operation: 'difference', operands, value: 11, unit: 'minutes' }], sources);
  assert.deepEqual(derived, ['11:minute']);
  assert.equal(historyNarrativeAnchorsSupported('It was 11 minutes longer.', sources, '', derived, false), true);
  assert.equal(historyNarrativeAnchorsSupported('It was 13 minutes longer.', sources, '', derived, false), false);
});

test('reference lookup prioritizes matching evidence over years of period distractors', async t => {
  clock(t);
  const note = 'Cedar’s towel was folded beside the carrier.';
  const rows = Array.from({ length: 110 }, (_, i) => care('noise-'+i, 'oscar', new Date(Date.UTC(2022, 0, 1+i*10)).toISOString().slice(0,10), 'general', 'Cedar had a routine grooming check.'));
  rows.push(care('towel', 'oscar', '2026-08-11', 'general', note));
  const r = await exercise('Quote Cedar’s towel note.', { fixturePets, rows, messages: [], history: true,
    interpretationProposal: proposal({ petNames: ['Cedar'], selection: 'reference', terms: ['towel'], topic: 'towel' }),
    providerOverrides: { historyNarrative: { sentences: [{ text: `“${note}”`, sourceIds: ['care:towel'] }] } },
    reviewResponse: { approved: true }, expectedReviewCalls: 1 });
  assert.equal(r.result.reasoning.answer.summary, `“${note}”`);
});
test('inclusive as-of date is a scope anchor while the event keeps its own date', async t => {
  clock(t);
  const answer = 'As of August 20, the latest saved rest note was August 17: Aster slept normally.';
  const r = await exercise('As of August 20, what was Aster’s latest rest note?', { fixturePets,
    rows: [care('rest', 'milo', '2026-08-17', 'general', 'Aster slept normally.')], messages: [], history: true,
    interpretationProposal: proposal({ selection: 'latest', from: '2026-08-20', to: '2026-08-21' }),
    providerOverrides: { historyNarrative: { sentences: [{ text: answer, sourceIds: ['care:rest'] }] } },
    reviewResponse: { approved: true }, expectedReviewCalls: 1 });
  assert.equal(r.result.reasoning.answer.summary, answer);
});

test('verbatim operand spans retain context and reject multiple measurements', () => {
 const sources = [{ sourceId: 's', text: 'A 22-minute session followed a 6-minute session.' }];
 const operands = ['22-minute session', '6-minute session'].map(literal => ({ sourceId: 's', field: 'text', literal }));
 assert.deepEqual(verifiedCalculationQuantities([{ operation: 'difference', operands, value: 16, unit: 'minutes' }], sources), ['16:minute']);
 assert.equal(verifiedCalculationQuantities([{ operation: 'convert', operands: [{ ...operands[0], literal: sources[0].text }], value: 22, unit: 'minutes' }], sources), null);
});

test('measurement comparisons discard irrelevant episode ordinal hints', () => {
 const r=validateAskRequest(proposal({ operation:'comparison', quantity:'measurement', ordinal:'first' }), context);
 assert.equal(r.ordinal, null);
 assert.equal(r.readOperation, 'comparison');
 assert.equal(r.readOnly, true);
});

test('omitted read subject can use one explicitly named owned pet', () => {
  const result = validateAskRequest(proposal({scope:'named',petNames:[]}), {...context,currentMessage:'What does Bramble’s earlier travel note say?'});
  assert.deepEqual(result.petIds,[fixturePets[1].id]);
  assert.equal(result.clarification,null);
});
test('empty conversational names recover only a unique user-established focus', () => {
  const follow = {...context,currentMessage:'Put the same details in JSON.',conversationTurns:[
    {id:'u',role:'user',text:'What did Cedar’s visit record?'},
    {id:'a',role:'furvise',text:'Bramble had a visit.'},
  ]};
  const result = validateAskRequest(proposal({scope:'conversation',petNames:[],referenceTurnIds:['u','a']}), follow);
  assert.deepEqual(result.petIds,[fixturePets[2].id]);
  for(const turns of [[{id:'a',role:'furvise',text:'Cedar had a visit.'}], [{id:'u',role:'user',text:'Compare Aster and Cedar.'}]]) {
    const ambiguous=validateAskRequest(proposal({scope:'conversation',petNames:[]}),{...follow,conversationTurns:turns});
    assert.equal(ambiguous.clarification,'subject');
    assert.deepEqual(ambiguous.petIds,[]);
  }
});
test('formatted numeric anchors preserve full values and unit names', () => {
  const sources=[{sourceId:'a',text:'The crate weighed 3 kg.',occurredAt:'2026-04-01T00:00:00Z'}];
  const derived=verifiedCalculationQuantities([{operation:'convert',operands:[{sourceId:'a',field:'text',literal:'3 kg'}],value:3000,unit:'g'}],sources);
  for(const text of ['The crate weighed 3,000 g.','The crate weighed 3,000 grams.'])
    assert.equal(historyNarrativeAnchorsSupported(text,sources,'',derived,false),true,text);
  for(const text of ['The crate weighed 4,000 grams.','The crate weighed 3,500 g.'])
    assert.equal(historyNarrativeAnchorsSupported(text,sources,'',derived,false),false,text);
});
test('user claim quotation is distinguishable from invented source quotation', () => {
  const sources=[{text:'No cause was recorded.',occurredAt:'2026-04-01T00:00:00Z'}];
  assert.equal(historyNarrativeAnchorsSupported('The claim “confirmed cause” is not established.',sources,'Check the claim “confirmed cause”.',[],false),true);
  assert.equal(historyNarrativeAnchorsSupported('The note says “confirmed cause”.',sources,'What did the note say?',[],false),false);
});
test('difference converts original operands directly; invented intermediate literals stay invalid', () => {
  const sources=[{sourceId:'a',text:'Aster weighed 8.1 kg.'},{sourceId:'b',text:'Aster weighed 7.7 kg.'}];
  const operands=sources.map((s,i)=>({sourceId:s.sourceId,field:'text',literal:i?'7.7 kg':'8.1 kg'}));
  assert.deepEqual(verifiedCalculationQuantities([{operation:'difference',operands,value:400,unit:'g'}],sources),['400:g']);
  assert.equal(verifiedCalculationQuantities([{operation:'convert',operands:[{sourceId:'a',field:'text',literal:'0.4 kg'}],value:400,unit:'g'}],sources),null);
});

test('general read scope can answer without guessing a pet or retrieving saved facts', () => {
  const result = validateAskRequest(proposal({mode:'read',scope:'none',petNames:[],operation:'general',
    question:'Does one observation establish a cause?'}), {...context,currentMessage:'Does one observation establish a cause?'});
  assert.equal(result.conversationOnly,true);
  assert.equal(result.clarification,null);
  assert.equal(result.history,null);
  assert.deepEqual(result.petIds,[]);
  assert.equal(result.readOnly,true);
});
test('duplicate search hits do not consume independent candidate slots', async t => {
  clock(t);
  const rows=fixturePets.flatMap(pet=>Array.from({length:16},(_,i)=>care(pet.id+'-overlap-'+i,pet.id,
    '2026-06-'+String(i+1).padStart(2,'0'),'general',pet.name+' had a rest observation.')));
  const r=await exercise('Compare the saved observations across the account.',{fixturePets,rows,messages:[],history:true,
    interpretationProposal:proposal({scope:'account',petNames:[],operation:'comparison',selection:'comparison',terms:['rest']})});
  assert.equal(new Set(r.context.askHistory.coverage.candidateIds).size,48);
  assert.ok(r.context.askHistory.coverage.perPet.every(pet=>pet.pages<=4));
  assert.ok(r.context.askHistory.entries.length<=32);
  assert.ok(r.context.askHistory.coverage.reasons.includes('effective_evidence_budget'));
});

test('cohort reads ignore the selected conversation container; explicit named reads stay narrow', () => {
  const cohort=validateAskRequest(proposal({scope:'selected',petNames:[]}), {...context,currentMessage:'Which pet has the saved travel observation?'});
  assert.equal(cohort.petIds.length,3);
  const narrow=validateAskRequest(proposal({scope:'account',petNames:fixturePets.map(x=>x.name)}), {...context,currentMessage:'Compare Aster’s two travel observations.'});
  assert.deepEqual(narrow.petIds,[fixturePets[0].id]);
});
test('question dates can be discussed without becoming source evidence', () => {
  const source=[{text:'Aster rested.',occurredAt:'2026-04-10T00:00:00Z'}];
  assert.equal(historyNarrativeAnchorsSupported('The April 10 report was not available as of April 9.',source,'As of April 9, was the April 10 report available?',[],false),true);
  assert.equal(historyNarrativeAnchorsSupported('The report was available on May 7.',source,'As of April 9, was the April 10 report available?',[],false),false);
});

test('a single report-day comparison keeps preceding context without crossing the upper bound', () => {
 const result=validateAskRequest(proposal({operation:'comparison',selection:'period',from:'2026-04-20',to:'2026-04-21'}),
   {...context,currentMessage:'Did the April 20 update happen before or after the earlier change?'});
 assert.equal(result.history.from,null);
 assert.equal(result.history.to,'2026-04-21T00:00:00.000Z');
});

test('a day number next to an event noun is not a quantity anchor', () => {
 const source=[{text:'No more accidents since April 10.',occurredAt:'2026-04-17T00:00:00Z'}];
 assert.equal(historyNarrativeAnchorsSupported('The April 17 accident-free update followed April 10.',source,'',[],false),true);
 assert.equal(historyNarrativeAnchorsSupported('There were 17 accidents on April 17.',source,'',[],false),false);
});

test('equivalent spelled units share numeric grounding and dimension checks', () => {
 const sources=[{sourceId:'a',text:'Recorded mass 3 kilograms.'},{sourceId:'b',text:'Recorded mass 2 kg.'}];
 const operands=[{sourceId:'a',field:'text',literal:'3 kilograms'},{sourceId:'b',field:'text',literal:'2 kg'}];
 assert.deepEqual(verifiedCalculationQuantities([{operation:'difference',operands,value:1000,unit:'grams'}],sources),['1000:g']);
 assert.equal(verifiedCalculationQuantities([{operation:'difference',operands,value:1000,unit:'milliliters'}],sources),null);
 assert.deepEqual(verifiedCalculationQuantities([{operation:'percent_change',operands,value:-33.33,unit:'percent'}],sources),['33.33:%']);
});
test('empty lexical searches return their unused capacity to bounded period context',async t=>{
 clock(t);
 const rows=fixturePets.flatMap(pet=>Array.from({length:16},(_,i)=>care(pet.id+'-empty-'+i,pet.id,
   '2026-06-'+String(i+1).padStart(2,'0'),'general',pet.name+' slept normally.')));
 const r=await exercise('Compare the saved observations across the account.',{fixturePets,rows,messages:[],history:true,
   interpretationProposal:proposal({scope:'account',petNames:[],operation:'comparison',selection:'comparison',terms:['nonmatchingphrase']})});
 assert.equal(new Set(r.context.askHistory.coverage.candidateIds).size,48);
 assert.ok(r.context.askHistory.coverage.perPet.every(pet=>pet.pages<=4));
 assert.ok(r.context.askHistory.entries.length<=32);
});

test('latest and comparison ordering never reverse source relevance',async()=>{
 const {orderHistoryEvidence}=await import('../../app/lib/intelligence/history-synthesis.ts');
 const rows=[{id:'needed-old',at:'2026-01-01',rank:0},{id:'unrelated-new',at:'2026-03-01',rank:1},{id:'needed-new',at:'2026-02-01',rank:0}];
 for(const selection of ['latest','comparison']) {
  const actual=orderHistoryEvidence(rows,selection,x=>x.at,x=>x.id,undefined,x=>x.rank);
  assert.deepEqual(new Set(actual.slice(0,2).map(x=>x.id)),new Set(['needed-old','needed-new']));
  assert.equal(actual.at(-1).id,'unrelated-new');
 }
});
test('bounded phrase hints match morphological variants without treating them as evidence',async()=>{
 const {historyQueryTerms,historyQueryRelevance}=await import('../../app/lib/intelligence/history-query-relevance.ts');
 const terms=historyQueryTerms(['Aster training-treat change','seven day medication course'],['Aster']);
 assert.ok(terms.length<=6);assert.ok(!terms.includes('aster'));
 assert.ok(historyQueryRelevance('New training treats were stopped.',terms)>historyQueryRelevance('The appetite is normal.',terms));
 assert.ok(historyQueryRelevance('A seven-day medication course was given.',terms)>0);
});

test('wrong arithmetic remains rejected with a server-computed repair hint',()=>{
 const hints=[];const source=[{sourceId:'a',text:'Mass 2 kg.'},{sourceId:'b',text:'Mass 2.5 kg.'}];
 const result=verifiedCalculationQuantities([{operation:'difference',operands:[{sourceId:'a',field:'text',literal:'2 kg'},{sourceId:'b',field:'text',literal:'2.5 kg'}],value:.5,unit:'kg'}],source,h=>hints.push(h));
 assert.equal(result,null);assert.deepEqual(hints,[{operation:'difference',expectedValue:-.5,unit:'kg'}]);
});

test('supplied premises narrow stale owned-history plans without granting writes', () => {
  const plan = validateAskRequest(proposal({ evidenceBasis: 'supplied_context', outputFormat: 'csv',
    petNames: ['An invented animal'], scope: 'selected', from: '2022-01-01', to: '2022-02-01' }), context);
  assert.equal(plan.conversationOnly, true);
  assert.deepEqual(plan.petIds, []);
  assert.equal(plan.history, null);
  assert.equal(plan.readOnly, true);
  assert.equal(plan.request.outputFormat, 'csv');
  for (const mode of ['update', 'mixed']) assert.throws(() => validateAskRequest(proposal({ evidenceBasis: 'supplied_context', mode }), context));
});
test('general clarification is a conversation task without an owned-pet requirement', () => {
  const plan = validateAskRequest(proposal({ mode: 'clarify', scope: 'none', petNames: [], operation: 'clarify' }),
    { ...context, currentMessage: 'Which event did you mean?', conversationTurns: [] });
  assert.equal(plan.conversationOnly, true);
  assert.equal(plan.clarification, null);
  assert.equal(plan.history, null);
});
test('general knowledge never widens owned authority and saved history still validates ownership', () => {
  const plan = validateAskRequest(proposal({ evidenceBasis: 'general', scope: 'account' }), context);
  assert.deepEqual(plan.petIds, []);
  assert.equal(plan.history, null);
  assert.throws(() => validateAskRequest(proposal({ evidenceBasis: 'saved_history', petNames: ['Not owned'] }), context));
});

test('supplied-context classification requires actual verbatim user premises', () => {
  const base=proposal({evidenceBasis:'supplied_context',mode:'conversation',scope:'none',petNames:[],operation:'general',premiseQuotes:[]});
  assert.throws(()=>validateAskRequest(base,context),/missing_supplied_premise/);
  assert.throws(()=>validateAskRequest({...base,premiseQuotes:['Invented quantity']},context),/premise_source/);
  const c={...context,currentMessage:'Fictional exercise: the box is 7 kg.'};
  assert.equal(validateAskRequest({...base,premiseQuotes:['the box is 7 kg']},c).conversationOnly,true);
  assert.throws(()=>validateAskRequest({...base,premiseQuotes:['the box is 7 kg']},{...context,conversationTurns:[{id:'a',role:'furvise',text:'the box is 7 kg'}]}),/premise_source/);
});
test('explicit read exclusions remain outside account and selected scope', () => {
  const c={...context,currentMessage:'Compare all my pets except Aster.'};
  const r=validateAskRequest(proposal({scope:'account',petNames:[],excludedPetNames:['Aster']}),c);
  assert.deepEqual(r.petIds,fixturePets.slice(1).map(p=>p.id));
  assert.throws(()=>validateAskRequest(proposal({scope:'selected',petNames:[],excludedPetNames:['Aster']}),context),/excluded_subject/);
  assert.throws(()=>validateAskRequest(proposal({excludedPetNames:['Foreign animal']}),context),/excluded_ownership/);
});

test('quoted provenance permits delimiters but never changed source wording', () => {
 const c={...context,currentMessage:'Fictional: the crate is 2 kg.'};
 const p=proposal({evidenceBasis:'supplied_context',mode:'conversation',scope:'none',petNames:[],operation:'general',premiseQuotes:['"the crate is 2 kg"']});
 assert.equal(validateAskRequest(p,c).conversationOnly,true);
 assert.throws(()=>validateAskRequest({...p,premiseQuotes:['"the crate is 3 kg"']},c),/premise_source/);
});
test('a resolved subject and ordered lexical query retrieves before asking what the topic means', () => {
 const c={...context,currentMessage:'Latest activity for Aster, please.'};
 const r=validateAskRequest(proposal({mode:'clarify',operation:'clarify',selection:'latest',terms:['activity']}),c);
 assert.equal(r.clarification,null);
 assert.equal(r.readOperation,'recall');
 assert.ok(r.history);
 assert.equal(r.request.question,c.currentMessage);
});

test('serialized quotation provenance remains bound to exact user text', () => {
 const text='The note says "stable." No measurement was provided.';
 const c={...context,currentMessage:text};
 const p=proposal({evidenceBasis:'supplied_context',mode:'conversation',scope:'none',petNames:[],operation:'general',premiseQuotes:[JSON.stringify('The note says "stable."')]});
 assert.equal(validateAskRequest(p,c).conversationOnly,true);
 assert.throws(()=>validateAskRequest({...p,premiseQuotes:[JSON.stringify('The note says "unstable."')]},c),/premise_source/);
 assert.throws(()=>validateAskRequest(p,{...c,currentMessage:'Summarize that.',conversationTurns:[{id:'a',role:'furvise',text}]}),/premise_source/);
});

test('double-escaped source quotes are decoded without relaxing provenance', () => {
 const text='The note says "stable."';
 const c={...context,currentMessage:text};
 const encoded=JSON.stringify('The note says '+JSON.stringify('stable.'));
 const doubleEncoded=JSON.stringify('The note says '+JSON.stringify('"stable."').slice(1,-1));
 for(const quote of [encoded,doubleEncoded]) {
  const p=proposal({evidenceBasis:'supplied_context',mode:'conversation',scope:'none',petNames:[],operation:'general',premiseQuotes:[quote]});
  assert.equal(validateAskRequest(p,c).conversationOnly,true);
  assert.throws(()=>validateAskRequest(p,{...c,currentMessage:'The note says "unstable."'}),/premise_source/);
 }
});

test('ordering hints do not become episode references on ordinary reads',()=>{
 for(const selection of ['latest','earliest','earliest_occurrence']){
  const r=validateAskRequest(proposal({operation:'status',selection,ordinal:'last',quantity:null}),context);
  assert.equal(r.ordinal,null);assert.equal(r.readOperation,'status');assert.ok(r.history);
 }
});
test('measurement and duration quantities override a stale episode operation',()=>{
 for(const quantity of ['measurement','duration','records']){
  const r=validateAskRequest(proposal({operation:'episode',selection:'reference',ordinal:null,quantity}),context);
  assert.equal(r.readOperation,'recall');assert.equal(r.ordinal,null);assert.ok(r.history);
 }
});
test('genuine episode requests still require a valid episode referent',()=>{
 const missing=validateAskRequest(proposal({operation:'episode',quantity:'episodes',ordinal:null}),{...context,currentMessage:'Tell me about that episode.'});
 assert.equal(missing.readOperation,'clarify'); assert.equal(missing.ordinal,null);
 assert.throws(()=>validateAskRequest(proposal({operation:'recall',ordinal:'second'}),{...context,currentMessage:'Tell me about the second episode.'}),/episode_reference/);
 const r=validateAskRequest(proposal({operation:'episode',quantity:'episodes',ordinal:'second'}),context);
 assert.equal(r.readOperation,'episode');assert.equal(r.ordinal,'second');
});

test('standalone task wording cannot be replaced by a planner paraphrase', () => {
 const original = 'Total Aster\'s recorded activity durations, then label each activity.';
 const result = validateAskRequest(proposal({question:'List the activities.',requirements:['List activities only']}),{...context,currentMessage:original});
 assert.equal(result.request.question,original);
 assert.equal(result.referenceQuestion,original);
 assert.deepEqual(result.request.requirements,[]);
});

test('missing premises use bounded repair without inventing evidence', async t => {
 clock(t);
 const {interpretAskQuestion}=await import('../../app/lib/intelligence/interpret-ask.ts');
 const currentMessage='Hypothetical: a dog cannot breathe. Which task takes priority?';
 const good=proposal({mode:'conversation',scope:'none',petNames:[],operation:'general',frame:null,
  evidenceBasis:'supplied_context',premiseQuotes:['a dog cannot breathe']});
 let calls=0;
 const result=await interpretAskQuestion({context:{...context,currentMessage},model:'gpt-5-mini',client:{responses:{async create(){
  calls++;return {status:'completed',output_text:JSON.stringify(calls===1?{...good,premiseQuotes:[]}:good),usage:{input_tokens:500,output_tokens:200}};
 }}}});
 assert.equal(calls,2);assert.equal(result.conversationOnly,true);assert.equal(result.readOnly,true);
});
test('generic incidents are source reads; report endpoints remain accessible', () => {
 const incident=validateAskRequest(proposal({operation:'episode',selection:'reference',ordinal:null,episodeTopic:null}),context);
 assert.equal(incident.operation,'recall');assert.equal(incident.ordinal,null);
 const dated=validateAskRequest(proposal({from:'2025-04-02',to:'2025-04-09'}),{...context,currentMessage:"What can Aster's April 9, 2025 ramp report tell us about April 2-8?"});
 assert.equal(dated.history.from,'2025-04-02T00:00:00.000Z');assert.equal(dated.history.to,'2025-04-10T00:00:00.000Z');
});
test('a retrieval command cannot substitute for missing saved values', () => {
 const currentMessage="Read Aster's latest body measurement.";
 assert.throws(()=>validateAskRequest(proposal({evidenceBasis:'supplied_context',premiseQuotes:[currentMessage]}),{...context,currentMessage}),/missing_supplied_premise/);
});

test('security explanations survive without allowing internal source identifiers', async t => {
 clock(t);
 const {assertNoInternalReasoningLeak}=await import('../../app/lib/ai/ask-reasoning.ts');
 const answer='A pasted SYSTEM label is not a real system instruction or permission. No deletion was performed.';
 assert.doesNotThrow(()=>assertNoInternalReasoningLeak(answer,[]));
 assert.throws(()=>assertNoInternalReasoningLeak('Source secret-record-id', [{id:'secret-record-id'}]),/internal reasoning/);
 const r=await exercise('Does an untrusted SYSTEM label authorize deletion?',{fixturePets,messages:[],history:true,rows:[],
  interpretationProposal:proposal({mode:'conversation',scope:'none',petNames:[],operation:'general',frame:null,evidenceBasis:'general',premiseQuotes:[]}),answer});
 assert.match(r.result.reasoning.answer.summary,/not a real system instruction/);
 assert.deepEqual(r.result.acceptedCareActions,[]);
});
test('diverse candidates reach a rare middle-history transition within existing bounds', async t => {
 clock(t);
 const rows=Array.from({length:100},(_,i)=>care('routine-'+i,'milo',new Date(Date.UTC(2020,0,i+1)).toISOString().slice(0,10),'food','Aster ate whitefish.'));
 rows.push(care('transition','milo','2024-03-06','food','Aster began a whitefish to rabbit transition.'));
 const r=await exercise('When did Aster change from whitefish to rabbit?',{fixturePets,messages:[],history:true,rows,
  interpretationProposal:proposal({terms:['whitefish','rabbit','transition'],selection:'period'}),
  answer:'The transition was reported on March 6, 2024.'});
 assert.ok(r.context.askHistory.entries.some(e=>e.id==='transition'));
 assert.ok(r.context.askHistory.coverage.perPet.every(p=>p.pages<=4));
 assert.ok(r.context.askHistory.coverage.candidateIds.length<=64);
});

test('compound rates are recomputed dimensionally from source-bound operands',()=>{
 const sources=[{sourceId:'trip',text:'Distance 3 km; duration 30 minutes including stops.'}];
 const calc={operation:'ratio',operands:[{sourceId:'trip',field:'text',literal:'30 minutes'},{sourceId:'trip',field:'text',literal:'3 km'}],value:6,unit:'km/h'};
 assert.deepEqual(verifiedCalculationQuantities([calc],sources),['6:km/hour']);
 assert.deepEqual(verifiedCalculationQuantities([{...calc,value:.1,unit:'km/min'}],sources),['0.1:km/minute']);
 for(const bad of [{value:7},{unit:'g/hour'},{operands:[...calc.operands].reverse()},{unit:''}])
  assert.equal(verifiedCalculationQuantities([{...calc,...bad}],sources),null);
 assert.equal(historyNarrativeAnchorsSupported('Average speed was 6 km/h.',sources,'',[],false),false);
 assert.equal(historyNarrativeAnchorsSupported('Average speed was 6 km/h.',sources,'',['6:km/hour'],false),true);
 assert.equal(historyNarrativeAnchorsSupported('The trip was 9 km.',sources,'',[],false),false);
});
test('final presentation preserves negation, uncertainty and exact line breaks',async()=>{
 const {presentationOnlyAskResponse}=await import('../../app/lib/ask-conversation-server.ts');
 for(const summary of ["I can’t say your history was deleted, because no deletion occurred.",
  'Aster was recorded as limping, but the record does not say which limb or what caused it.',
  'No sneeze; play unchanged.\nReason: unknown']){
  const r=presentationOnlyAskResponse({summary},[]);
  assert.equal(r.directAnswer,summary);
 }
 const r=presentationOnlyAskResponse({summary:'Your history was deleted.'},[]);
 assert.doesNotMatch(r.directAnswer,/was deleted/);
});

test('event aliases cannot be starved by newer routine notes or a common alias', async t => {
 clock(t);
 for(const [question,category,eventText,terms] of [
  ['When did Aster switch food?','food','Aster started a gradual transition from food A to food B.',['food']],
  ['When did Aster stop the supplement?','medication','The supplement was discontinued on this date.',['supplement']],
 ]) {
  const rows=Array.from({length:120},(_,i)=>care('noise-'+i,'milo',new Date(Date.UTC(2025,0,i+1)).toISOString().slice(0,10),category,'Routine food and supplement check. Reason for any change unknown.'));
  rows.push(care('decisive-event','milo','2022-04-07',category,eventText));
  const r=await exercise(question,{fixturePets,messages:[],history:true,rows,
   interpretationProposal:proposal({terms,selection:'latest'}),
   answer:'The event was reported on April 7, 2022.'});
  assert.ok(r.context.askHistory.entries.some(e=>e.id==='decisive-event'),question);
  assert.ok(r.context.askHistory.coverage.perPet.every(p=>p.pages<=4));
  assert.ok(r.context.askHistory.coverage.candidateIds.length<=64);
 }
});
test('final persisted presentation retains relative-clause measurements',async()=>{
 const {presentationOnlyAskResponse}=await import('../../app/lib/ask-conversation-server.ts');
 const summary='The earliest weight I have saved for Rowan is 7.21 kg on 2020-03-04. The reason for any change was not established.';
 assert.equal(presentationOnlyAskResponse({summary},[]).directAnswer,summary);
});
test('prose transport envelope is decoded before factual review, not after it',()=>{
 const text='{"answer":"The prior food was offered.","note":"Unobserved meals are unknown."}';
 const response=canonicalHistoricalRead({readVersion:'history-answer.v1',layout:'prose',json:null,table:null,limitation:null,
  historyNarrative:{sentences:[{text,sourceIds:['care:a'],calculations:[]}]},
  safetyLevel:'monitor',responseMode:'direct_answer',userIntent:'general_pet_question',relevantContextIds:[]});
 assert.equal(response.historyNarrative.sentences[0].text,'The prior food was offered.\nUnobserved meals are unknown.');
 assert.deepEqual(response.historyNarrative.sentences[0].sourceIds,['care:a']);
});


test('event evidence survives both budgets among verbose routine observations', async t => {
 clock(t);
 for (const selection of ['period','earliest','latest']) {
  const rows=Array.from({length:120},(_,i)=>care('verbose-'+i,'milo',new Date(Date.UTC(2020,0,i+1)).toISOString().slice(0,10),'food',
   'Aster was offered food A at the routine check. Reason for any change was not established. '+ 'Only this observed meal was recorded; other meals and causes remain unknown. '.repeat(7)));
  rows.push(care('event-start','milo','2024-03-06','food','Aster started a gradual transition from food A to food B. The owner recorded a preference change, not a diagnosed allergy.'));
  rows.push(care('event-end','milo','2024-03-13','food','Aster completed the transition to food B. No other reason was recorded.'));
  const r=await exercise('When did Aster switch to the current food?',{fixturePets,messages:[],history:true,rows,
   interpretationProposal:proposal({terms:['food'],selection}),answer:'The gradual transition started on March 6, 2024 and completed on March 13, 2024.'});
  for(const id of ['event-start','event-end']) {
   assert.ok(r.context.askHistory.coverage.candidateIds.includes('care:'+id),'candidate '+selection+' '+id);
   assert.ok(r.context.askHistory.entries.some(e=>e.id===id),'retained '+selection+' '+id);
   assert.ok(r.prompt.evidenceContract.represented.some(e=>e.sourceId==='care:'+id),'prompt '+selection+' '+id);
  }
  assert.ok(r.context.askHistory.coverage.reasons.includes('effective_evidence_budget'));
  assert.ok(r.context.askHistory.coverage.perPet.every(p=>p.pages<=4));
  assert.ok(r.context.askHistory.coverage.candidateIds.length<=64);
 }
});


test('rejected event answers retain relevant source excerpts instead of the latest profile', async t => {
 clock(t);
 const rows=[care('start','milo','2023-03-06','food','Aster started a transition from food A to food B. The reason was preference, not an allergy diagnosis.'),
  care('end','milo','2023-03-13','food','Aster completed the transition to food B.'),
  care('profile','milo','2026-06-04','food','Aster currently eats food B and weighs 18 kg.')];
 const r=await exercise('When did Aster switch to the current food?',{fixturePets,messages:[],history:true,rows,
  interpretationProposal:proposal({terms:['food'],selection:'latest'}),
  providerOverrides:{answer:'The switch happened yesterday.',historyNarrative:{sentences:[{text:'The switch happened yesterday.',sourceIds:['care:start'],calculations:[]}]}},
  reviewResponse:{approved:false},expectedReviewCalls:1});
 assert.ok(r.prompt.evidenceContract.represented.some(e=>e.sourceId==='care:start'));
 const answer=r.result.reasoning.answer, notes=answer.sections.flatMap(section=>section.items).join('\n');
 assert.match(notes,/2023-03-06/);
 assert.match(notes,/2023-03-13/);
 assert.match(notes,/not an allergy diagnosis/);
 assert.doesNotMatch(JSON.stringify(answer),/happened yesterday/);
 assert.match(answer.summary,/couldn't finish answering/);
 assert.equal(answer.sections[0].heading,'Saved notes');
 assert.equal(r.publication.failure,null);
});


test('review receives correction uncertainty attached to its own source', async t => {
 clock(t);
 const r=await exercise('Summarize the saved observations.',{fixturePets,messages:[],history:true,
  rows:[care('ordinary','milo','2025-03-06','general','Aster rested normally.'),
   care('uncertain-link','milo','2025-03-07','general','Correction: the earlier observation described another animal.')],
  interpretationProposal:proposal({selection:'period'}),
  providerOverrides:{historyNarrative:{sentences:[{text:'Aster rested normally.',sourceIds:['care:ordinary'],calculations:[]}]}},
  reviewResponse:{approved:false},expectedReviewCalls:1});
 const review=JSON.parse(r.reviewRequests[0].input);
 assert.deepEqual(review.sources.find(s=>s.sourceId==='care:ordinary').provenanceStatuses,['unverified_legacy']);
 assert.deepEqual(review.sources.find(s=>s.sourceId==='care:uncertain-link').provenanceStatuses,['unlinked_correction_uncertain']);
 assert.match(review.correctionAuthority,/do not assign that uncertainty to every source/);
 assert.deepEqual(r.result.acceptedSemanticEvents,[]);
});


test('past versus present retrieval preserves both periods despite a narrowed planner range', async t => {
 clock(t);
 const r=await exercise('Was Aster using the same bedding in 2023 as now?',{fixturePets,messages:[],history:true,
  rows:[care('old','milo','2023-05-03','general','Aster used a fleece mat.'),care('now','milo','2026-06-04','general','Aster currently uses a cotton mat.')],
  interpretationProposal:proposal({operation:'comparison',selection:'comparison',terms:['bedding','mat'],from:'2023-01-01',to:'2024-01-01'})});
 assert.ok(r.context.askHistory.entries.some(row=>row.id==='old'));
 assert.ok(r.context.askHistory.entries.some(row=>row.id==='now'));
 assert.ok(r.prompt.evidenceContract.represented.some(row=>row.sourceId==='care:now'));
});

test('event reason retrieval is independent of a summary or comparison planner label', async t => {
 clock(t);
 const rows=Array.from({length:100},(_,i)=>care('routine'+i,'milo',new Date(Date.UTC(2020+Math.floor(i/12),i%12,1)).toISOString().slice(0,10),'general','Aster used the same bedding. The reason for any change was not established.'));
 rows.push(care('decisive','milo','2023-05-03','general','Aster started a transition to a cotton mat. The owner recorded a preference change, not a diagnosis.'));
 for(const selection of ['summary','comparison','latest']) {
  const r=await exercise('Why did we move Aster to a cotton mat?',{fixturePets,messages:[],history:true,rows,
   interpretationProposal:proposal({operation:selection==='comparison'?'comparison':'recall',selection,terms:['bedding','mat']})});
  assert.ok(r.context.askHistory.entries.some(row=>row.id==='decisive'),selection);
  assert.ok(r.prompt.evidenceContract.represented.some(row=>row.sourceId==='care:decisive'),selection);
 }
});

test('ordinary read layouts reject unsolicited JSON while explicit JSON remains supported', () => {
 assert.deepEqual(historicalReadSchema({}).properties.layout.enum,['prose']);
 for(const format of [null,'prose']) assert.equal(matchesHistoryOutputFormat('{"measurement":{"value":7.25,"unit":"kg"}}',format),false);
 assert.equal(matchesHistoryOutputFormat('{"measurement":{"value":7.25,"unit":"kg"}}','json'),true);
});


test('past-present recovery never bypasses plan access or explicit as-of bounds', async t => {
 clock(t);
 const historyAccess={months:3,from:'2026-03-05T00:00:00.000Z',to:'2026-06-06T00:00:00.000Z'};
 const r=await exercise('Was Aster using the same bedding in 2023 as now?',{fixturePets,messages:[],history:true,historyAccess,
  rows:[care('old','milo','2023-05-03','general','Aster used a fleece mat.'),care('now','milo','2026-06-04','general','Aster currently uses a cotton mat.')],
  interpretationProposal:proposal({operation:'comparison',selection:'comparison',terms:['mat'],from:'2023-01-01',to:'2024-01-01'})});
 assert.ok(!r.context.askHistory.entries.some(row=>row.id==='old'));
 assert.ok(r.context.askHistory.entries.some(row=>row.id==='now'));
 const p=validateAskRequest(proposal({operation:'comparison',from:null,to:'2024-01-01'}),{...context,currentMessage:'As of December 2023, was Aster using the same mat as earlier?'});
 assert.equal(p.history.to,'2024-01-01T00:00:00.000Z');
 assert.equal(p.history.from,null);
});

test('unsolicited JSON is repaired once and independently re-reviewed as prose', async t => {
 clock(t);
 const r=await exercise('What does the latest rest note say?',{fixturePets,messages:[],history:true,
  rows:[care('rest','milo','2026-06-04','general','Aster rested normally.')],interpretationProposal:proposal(),
  providerOverrides:{historyNarrative:{sentences:[{text:'{"observation":"Aster rested normally."}',sourceIds:['care:rest'],calculations:[]}]}},
  expectedReviewCalls:3,reviewProviderResponse:async request=>{
   const input=JSON.parse(request.input);
   const payload=request.text.format.name==='furvise_history_repair' ? {readVersion:'history-answer.v1',layout:'prose',json:null,table:null,limitation:null,
    safetyLevel:'normal',responseMode:'practical_guidance',userIntent:'history',relevantContextIds:['care:rest'],
    historyNarrative:{sentences:[{text:'Aster rested normally.',sourceIds:['care:rest'],calculations:[]}]}} :
    {approved:true,retainedSentenceIndexes:[0],obligations:input.obligations.map(({index})=>({index,status:'answered',sentenceIndexes:[0]})),rejectionReason:null};
   return {status:'completed',output_text:JSON.stringify(payload),usage:{input_tokens:500,output_tokens:100}};
  }});
 assert.equal(r.result.reasoning.answer.summary,'Aster rested normally.');
});

test('canonical read limitation cannot smuggle an unrequested output container', () => {
 const read={readVersion:'history-answer.v1',layout:'prose',historyNarrative:null,table:null,json:null,
  limitation:'The requested observation is not available.',safetyLevel:'normal',responseMode:'practical_guidance',userIntent:'history recall',relevantContextIds:[]};
 assert.equal(canonicalHistoricalRead(read).answer,read.limitation);
 assert.throws(()=>canonicalHistoricalRead({...read,limitation:'{"answer":"Unavailable","value":null}'}),/INVALID_READ_LAYOUT/);
});
test('middle date survives retrieval and representation among five years of routine records', async t => {
 clock(t);
 const rows=Array.from({length:60},(_,i)=>care('routine-'+i,'milo',new Date(Date.UTC(2021+Math.floor(i/12),i%12,12)).toISOString().slice(0,10),'weight','Aster weighed 20 kg.'));
 rows.push(care('middle-anchor','milo','2023-04-17','weight','Aster weighed 19.4 kg.'));
 rows.push(care('newest-anchor','milo','2026-09-03','weight','Aster weighed 18.6 kg.'));
 const text='Aster weighed 19.4 kg on April 17, 2023 and 18.6 kg on September 3, 2026.';
 const run=await exercise('Compare Aster’s weight on April 17, 2023 with the latest weight.',{
  fixturePets,messages:[],history:true,rows,interpretationProposal:proposal({operation:'comparison',selection:'comparison',terms:['weight','weighed']}),
  providerOverrides:{answer:text,historyNarrative:{sentences:[{text,sourceIds:['care:middle-anchor','care:newest-anchor']}]}},
  reviewResponse:{approved:true},expectedReviewCalls:1,
 });
 for(const id of ['care:middle-anchor','care:newest-anchor']) assert.ok(run.prompt.contextRecords.some(r=>r.id===id),id);
 assert.ok(run.context.askHistory.coverage.perPet.every(p=>p.pages<=4));
 assert.ok(run.context.askHistory.coverage.targets.some(t=>t.day==='2023-04-17'&&t.retainedIds.includes('care:middle-anchor')));
 assert.equal(run.result.reasoning.answer.summary,text);
});

test('schema-shaped generation repairs an unpublishable draft before API and reload', async t => {
 clock(t);
 const good='The owner reported a transition to the new food because of itching. The underlying cause remains unknown.';
 const bad='I recorded a transition to the new food because of itching. The underlying cause remains unknown.';
 const read=text=>({readVersion:'history-answer.v1',layout:'prose',json:null,table:null,limitation:null,
  safetyLevel:'normal',responseMode:'practical_guidance',userIntent:'history',relevantContextIds:['care:reason'],
  historyNarrative:{sentences:[{text,sourceIds:['care:reason'],calculations:[]}]}});
 let sawPublicationFailure=false;
 const run=await exercise('What reason was reported for the food transition?',{
  fixturePets,messages:[],history:true,rows:[care('reason','milo','2024-04-17','general',good)],
  interpretationProposal:proposal({terms:['food','transition']}),
  providerResponse:async()=>({status:'completed',output_text:JSON.stringify(read(bad)),usage:{input_tokens:500,output_tokens:100}}),
  expectedReviewCalls:3,reviewProviderResponse:async request=>{
   const input=JSON.parse(request.input);
   if(input.deterministicPublicationFailures?.length)sawPublicationFailure=true;
   const payload=request.text.format.name==='furvise_history_repair'?read(good):
    {approved:true,retainedSentenceIndexes:[0],obligations:input.obligations.map(({index})=>({index,status:'answered',sentenceIndexes:[0]})),rejectionReason:null};
   return {status:'completed',output_text:JSON.stringify(payload),usage:{input_tokens:500,output_tokens:100}};
  },
 });
 assert.equal(sawPublicationFailure,true);
 assert.equal(run.publication.failure,null);
 assert.equal(run.publication.displayed.summary,good);
 assert.deepEqual(run.result.acceptedCareActions,[]);
 assert.deepEqual(run.result.acceptedLearnings,[]);
});

test('separate user-grounded needs retrieve rare evidence and reach review and publication',async t=>{
 clock(t);
 const question='Explain Aster’s bedding change and the reason for stopping the supplement.';
 const rawNeeds=[{quote:'bedding change',sourceTurnId:null,terms:['bedding','mat']},
  {quote:'reason for stopping the supplement',sourceTurnId:null,terms:['supplement','stopped']}];
 const rows=Array.from({length:60},(_,i)=>care('routine-'+i,'milo',new Date(Date.UTC(2021+Math.floor(i/12),i%12,12)).toISOString().slice(0,10),'general','Aster rested on a mat.'));
 rows.push(care('bedding','milo','2026-06-04','general','Aster moved from fleece to cotton bedding.'));
 rows.push(care('supplement','milo','2023-04-17','general','The owner stopped the supplement after reporting loose stool. A causal link was not established.'));
 const answer='Aster moved from fleece to cotton bedding. The owner stopped the supplement after reporting loose stool; a causal link was not established.';
 const run=await exercise(question,{fixturePets,messages:[],history:true,rows,
  interpretationProposal:proposal({evidenceNeeds:rawNeeds,terms:['mat','bedding']}),
  providerResponse:async()=>({status:'completed',output_text:JSON.stringify({readVersion:'history-answer.v1',layout:'prose',json:null,table:null,limitation:null,
   safetyLevel:'normal',responseMode:'practical_guidance',userIntent:'history',relevantContextIds:['care:bedding','care:supplement'],
   historyNarrative:{sentences:[{text:answer,sourceIds:['care:bedding','care:supplement'],calculations:[]}]}}),usage:{input_tokens:500,output_tokens:100}}),
  reviewResponse:{approved:true},expectedReviewCalls:1});
 for(const id of ['care:bedding','care:supplement']) assert.ok(run.prompt.contextRecords.some(r=>r.id===id),id);
 const need=run.prompt.evidenceContract.needCoverage.find(n=>n.needId==='need:1');
 assert.ok(need.pets[0].representedSourceIds.includes('care:supplement'));
 assert.equal(need.semanticSupport,'unverified');
 assert.equal(JSON.parse(run.reviewRequests[0].input).obligations.length,3);
 assert.equal(run.publication.failure,null);
 assert.equal(run.publication.displayed.summary,answer);
 assert.ok(run.context.askHistory.coverage.perPet.every(p=>p.pages<=4));
});
test('unsupported planner need is discarded without replacing the original task',()=>{
 const result=validateAskRequest(proposal({evidenceNeeds:[{quote:'invented diagnosis',sourceTurnId:null,terms:['diagnosis']}]}),
  {...context,currentMessage:'What bedding does Aster use?'});
 assert.equal(result.request.question,'What bedding does Aster use?');
 assert.equal(result.request.evidenceNeeds,undefined);
 assert.deepEqual(result.request.evidenceNeedIssues,['ungrounded_evidence_need']);
 assert.deepEqual(result.petIds,['milo']);
});

test('different needs stay attached to their own pets through retrieval and evidence',async t=>{
 clock(t);
 const question='Summarize Aster’s bedding and Bramble’s sleep.';
 const run=await exercise(question,{fixturePets,messages:[],history:true,
  rows:[care('mat','milo','2024-04-17','general','Aster uses cotton bedding.'),care('rest','luna','2024-04-17','general','Bramble slept normally.')],
  interpretationProposal:proposal({petNames:['Aster','Bramble'],terms:['bedding','sleep'],evidenceNeeds:[
   {quote:'Aster’s bedding',sourceTurnId:null,petNames:['Aster'],terms:['bedding']},
   {quote:'Bramble’s sleep',sourceTurnId:null,petNames:['Bramble'],terms:['sleep','slept']}]})});
 assert.deepEqual(run.context.askHistory.coverage.needs.map(n=>[n.petId,n.needId]).sort(),[['luna','need:1'],['milo','need:0']]);
 assert.deepEqual(run.prompt.evidenceContract.needCoverage.map(n=>n.pets.map(p=>p.petId)),[['milo'],['luna']]);
});
test('need candidates survive verbose routine evidence without exceeding the prompt budget',async t=>{
 clock(t);
 const question='Describe Aster’s bedding and the supplement reaction.';
 const rows=Array.from({length:120},(_,i)=>care('pressure-'+i,'milo',new Date(Date.UTC(2020,0,i+1)).toISOString().slice(0,10),'general',
  'Aster rested on bedding. '+ 'This was an ordinary observation with no further conclusion about other days. '.repeat(7)));
 rows.push(care('rare','milo','2024-04-17','general','The supplement reaction was loose stool. The cause remains uncertain.'));
 const run=await exercise(question,{fixturePets,messages:[],history:true,rows,
  interpretationProposal:proposal({terms:['bedding'],evidenceNeeds:[
   {quote:'bedding',sourceTurnId:null,terms:['bedding']},
   {quote:'supplement reaction',sourceTurnId:null,terms:['supplement','reaction']}]})});
 assert.ok(run.prompt.contextRecords.some(r=>r.id==='care:rare'));
 assert.ok(run.prompt.evidenceContract.needCoverage[1].pets[0].representedSourceIds.includes('care:rare'));
 assert.ok(run.context.askHistory.coverage.reasons.includes('effective_evidence_budget'));
 assert.ok(run.context.askHistory.coverage.perPet.every(p=>p.pages<=4));
 assert.ok(run.context.askHistory.coverage.candidateIds.length<=64);
});

test('need coverage records actual query hits without reinterpreting database matching',async t=>{
 clock(t);
 const row=care('matched','milo','2024-04-17','general','The owner reported a dietary transition.');
 const run=await exercise('Explain Aster’s food change.',{fixturePets,messages:[],history:true,rows:[row],candidateRowsOverride:[row],
  interpretationProposal:proposal({terms:['food'],evidenceNeeds:[{quote:'food change',sourceTurnId:null,terms:['food']}]})});
 assert.ok(run.context.askHistory.coverage.needs[0].candidateIds.includes('care:matched'));
 assert.ok(run.prompt.evidenceContract.needCoverage[0].pets[0].representedSourceIds.includes('care:matched'));
 assert.equal(run.prompt.evidenceContract.needCoverage[0].semanticSupport,'unverified');
});

test('ordinary history reads recover irrelevant episode routing without granting references', () => {
 for (const question of ['What happened during Aster’s grooming in April 2022?', 'Does Aster’s January 2025 noise note establish how often that happens?']) {
  for (const patch of [
   {operation:'episode',quantity:null,selection:'period'},
   {operation:'count',quantity:'episodes'},
   {operation:'recall',ordinal:'that'},
  ]) {
   const parsed=validateAskRequest(proposal(patch),{...context,currentMessage:question});
   assert.equal(parsed.operation,'recall');
   assert.equal(parsed.ordinal,null);
   assert.equal(parsed.episodeTopic,null);
   assert.equal(parsed.readOnly,true);
   assert.deepEqual(parsed.petIds,[fixturePets[0].id]);
  }
 }
 const count=validateAskRequest(proposal({operation:'count',quantity:'episodes',episodeTopic:'vomiting'}),{...context,currentMessage:'How many vomiting episodes has Aster had?'});
 assert.equal(count.operation,'count');
 const unspecified=validateAskRequest(proposal({operation:'count',quantity:'episodes'}),{...context,currentMessage:'How many separate episodes has Aster had?'});
 assert.equal(unspecified.operation,'count'); assert.equal(unspecified.episodeTopic,null);
 const follow=validateAskRequest(proposal({operation:'episode',quantity:'episodes',ordinal:'second',episodeTopic:'vomiting'}),{...context,currentMessage:'What happened in the second episode?'});
 assert.equal(follow.operation,'episode'); assert.equal(follow.ordinal,'second');
 const missing=validateAskRequest(proposal({operation:'episode',quantity:'episodes'}),{...context,currentMessage:'What happened in that episode?'});
 assert.equal(missing.operation,'clarify');
 assert.throws(()=>validateAskRequest(proposal({operation:'episode',petNames:['Foreign']}),context),/ownership/);
});

test('a middle-history month survives comparison retrieval among dense unrelated years', async t => {

 clock(t);
 const question='Was there more loose fur at Aster’s February 2023 brushing than the time before?';
 const rows=Array.from({length:120},(_,i)=>care('noise-'+i,'milo',new Date(Date.UTC(2025,0,i+1)).toISOString().slice(0,10),'general','Aster had brushing and loose fur.'));
 rows.push(care('anchor','milo','2023-02-18','general','Aster had a 6-minute brushing session. Morgan noted more loose fur than the previous session.'));
 const p=proposal({operation:'comparison',selection:'comparison',terms:['brushing','loose fur'],evidenceNeeds:[
  {quote:'Aster’s February 2023 brushing',sourceTurnId:null,terms:['brushing','loose fur'],petNames:['Aster'],order:'latest'},
  {quote:'the time before',sourceTurnId:null,terms:['brushing','previous'],petNames:['Aster'],order:'earliest'},
 ]});
 const r=await exercise(question,{fixturePets,rows,messages:[],history:true,interpretationProposal:p});
 assert.ok(r.context.askHistory.entries.some(e=>e.id==='anchor'));
 assert.ok(r.context.askHistory.coverage.targets.some(target=>target.day==='2023-02'&&target.retainedIds.includes('care:anchor')));
 assert.ok(r.context.askHistory.coverage.perPet.every(p=>p.pages<=4));
});

test('a note-frequency question reaches ordinary evidence rather than an unrelated episode clarification', async t => {
 clock(t);
 const question='Does Aster’s January 2025 noise note establish how often that happens?';
 const r=await exercise(question,{fixturePets,messages:[],history:true,
  rows:[care('noise-note','milo','2025-01-21','general','Aster rested in a quieter room. Frequency outside this observation was not established.')],
  interpretationProposal:proposal({operation:'count',quantity:'episodes',episodeTopic:null,terms:['noise']}),
 });
 assert.equal(r.context.askInterpretation.operation,'recall');
 assert.equal(r.context.episodeResult,undefined);
 assert.ok(r.context.askHistory.entries.some(e=>e.id==='noise-note'));
});
