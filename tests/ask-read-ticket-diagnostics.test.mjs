import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
registerHooks({ resolve(s, c, next) { return s === 'server-only'
  ? { url: 'data:text/javascript,export {};', format: 'module', shortCircuit: true } : next(s, c); } });
globalThis.fetch = async () => { throw Error('Read-ticket diagnostics fixtures forbid network access'); };
const { interpretAskQuestion } = await import('../app/lib/intelligence/interpret-ask.ts');
const { bindReadTicket } = await import('../app/lib/furvise-brain/read-ticket.ts');

const question = 'bramble — from that dental visit onwards, can u list every note on food or eating? include the dental one too, oldest first pls';
const pet = { id: 'bramble', name: 'Bramble', user_id: 'owner', species: 'cat', avoid_ingredients: [] };
const context = { owner: { userId: 'owner' }, pet, eligiblePets: [pet], currentMessage: question,
  conversationTurns: [], timeZone: 'UTC', currentTurn: { id: 'source-message', role: 'user', text: question } };
const ticket = () => ({ operation: 'read_since_event', subjectScope: 'named',
  temporal: { from: null, to: null, anchor: { concept: 'dental', relation: 'from' }, calendar: null },
  predicates: [{ kind: 'text_any', terms: ['food', 'eating', 'appetite', 'diet', 'turkey'] }],
  searchHints: null, episode: null, needs: null,
  outputs: { completeness: 'exhaustive', ordering: 'asc', limit: null, strategy: 'chronological' } });
const proposal = readTicket => ({ version: 'ask-request.v2', readTicket, mode: 'read', question,
  requirements: [], referenceTurnIds: [], scope: 'named', petNames: ['Bramble'], operation: 'recall',
  selection: 'summary', quantity: 'records', topic: 'food and eating', terms: ['food', 'eating'],
  from: null, to: null, episodeTopic: null, ordinal: null, frame: null, evidenceBasis: 'saved_history', premiseQuotes: [] });

// Synthetic proposals isolate diagnostics; the failed live proposal was not captured.
test('rejected read_since_event logs the entire ticket and missing-anchor rule, then stops after one planner', async t => {
  const rejected = ticket(); rejected.temporal.anchor = null;
  const before = structuredClone(rejected);
  const warn = t.mock.method(console, 'warn', () => {});
  const stages = []; let calls = 0;
  await assert.rejects(interpretAskQuestion({ context, model: 'fixture',
    onProviderEvent: event => stages.push(event),
    client: { responses: { create: async () => { calls++; return { output_text: JSON.stringify(proposal(rejected)) }; } } },
  }), error => {
    assert.equal(error.diagnostics.providerErrorCode, 'ASK_REQUEST_CONTRACT_READ_TICKET');
    return true;
  });
  assert.equal(calls, 1);
  assert.deepEqual(stages.map(event => [event.stage, event.outcome]), [['interpretation', 'started'], ['interpretation', 'failed']]);
  const logs = warn.mock.calls.filter(call => call.arguments[0] === '[Ask Brain] rejected read ticket');
  assert.equal(logs.length, 1);
  const logged = JSON.parse(logs[0].arguments[1]);
  assert.equal(logged.sourceMessageId, 'source-message');
  assert.equal(logged.errorCode, 'ASK_REQUEST_CONTRACT_READ_TICKET');
  assert.equal(logged.field, 'temporal.anchor');
  assert.equal(logged.rule, 'anchor_iff_read_since_event');
  assert.equal(logged.readTicketPresent, true);
  assert.deepEqual(logged.readTicket, before);
  assert.equal(logged.request.operation, 'recall');
  assert.equal(logged.readTicket.operation, 'read_since_event');
  assert.deepEqual(rejected, before);
});

test('cross-field rejection preserves the complete anchor and reports the incompatible strategy', async t => {
  const rejected = ticket(); rejected.outputs.strategy = 'event_candidates';
  const warn = t.mock.method(console, 'warn', () => {});
  let calls = 0;
  await assert.rejects(interpretAskQuestion({ context, model: 'fixture', client: { responses: {
    create: async () => { calls++; return { output_text: JSON.stringify(proposal(rejected)) }; },
  } } }));
  const logged = JSON.parse(warn.mock.calls.find(call => call.arguments[0] === '[Ask Brain] rejected read ticket').arguments[1]);
  assert.equal(logged.field, 'outputs.strategy');
  assert.equal(logged.rule, 'event_candidates_requires_read_and_predicates');
  assert.deepEqual(logged.readTicket, rejected);
  assert.equal(calls, 1);
});

test('request-envelope rejection identifies the envelope field without changing the proposed ticket', async t => {
  const warn = t.mock.method(console, 'warn', () => {});
  const rejected = proposal(ticket()); rejected.evidenceBasis = 'general';
  await assert.rejects(interpretAskQuestion({ context, model: 'fixture', client: { responses: {
    create: async () => ({ output_text: JSON.stringify(rejected) }),
  } } }));
  const logged = JSON.parse(warn.mock.calls.find(call => call.arguments[0] === '[Ask Brain] rejected read ticket').arguments[1]);
  assert.equal(logged.field, 'request.evidenceBasis');
  assert.equal(logged.rule, 'request.evidenceBasis');
  assert.deepEqual(logged.readTicket, rejected.readTicket);
});

test('missing ticket remains rejected and its absence is explicit in diagnostics', async t => {
  const warn = t.mock.method(console, 'warn', () => {});
  const rejected = proposal(undefined); delete rejected.readTicket;
  await assert.rejects(interpretAskQuestion({ context, model: 'fixture', client: { responses: {
    create: async () => ({ output_text: JSON.stringify(rejected) }),
  } } }));
  const logged = JSON.parse(warn.mock.calls.find(call => call.arguments[0] === '[Ask Brain] rejected read ticket').arguments[1]);
  assert.equal(logged.errorCode, 'ASK_REQUEST_CONTRACT_READ_TICKET_REQUIRED');
  assert.equal(logged.field, 'readTicket');
  assert.equal(logged.rule, 'saved_history_read_requires_ticket');
  assert.equal(logged.readTicketPresent, false);
  assert.equal(logged.readTicket, null);
});

test('field diagnostics keep invalid ordering, dates, predicates and operations rejected', () => {
  for (const [mutate, field] of [
    [value => { value.outputs.ordering = 'oldest'; }, 'outputs.ordering'],
    [value => { value.temporal.from = '2025'; }, 'temporal.from'],
    [value => { value.predicates[0].terms = []; }, 'predicates[0].terms'],
    [value => { value.operation = 'recall'; }, 'operation'],
    [value => { value.temporal.anchor.relation = 'since'; }, 'temporal.anchor.relation'],
  ]) {
    const rejected = ticket(); mutate(rejected);
    assert.throws(() => bindReadTicket(rejected, [pet.id]), error => {
      assert.equal(error.message, 'ASK_REQUEST_INVALID:read_ticket');
      assert.equal(error.cause.field, field);
      assert.ok(error.cause.rule);
      return true;
    });
  }
});

test('a legal dental ticket still binds without rejection or a second planner', async t => {
  const warn = t.mock.method(console, 'warn', () => {});
  let calls = 0;
  const result = await interpretAskQuestion({ context, model: 'fixture', client: { responses: {
    create: async () => { calls++; return { output_text: JSON.stringify(proposal(ticket())) }; },
  } } });
  assert.equal(result.request.readTicket.operation, 'read_since_event');
  assert.deepEqual(result.request.readTicket.temporal.anchor, { concept: 'dental', relation: 'from' });
  assert.deepEqual(result.request.readTicket.subjects.petIds, [pet.id]);
  assert.equal(result.readOnly, true);
  assert.equal(result.request.writeJob, null);
  assert.equal(calls, 1);
  assert.equal(warn.mock.calls.length, 0);
});
