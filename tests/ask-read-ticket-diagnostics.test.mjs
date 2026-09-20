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


// Exact readTicket from preview dpl_HkM1MM6teemX1vRZzzWBYUrCvH7V,
// 2026-09-20T05:09:38Z request d87dece2-6c5f-4a2c-9758-bc08671c7aac.
// The outer proposal/evidenceNeeds below are fixture scaffolding: the log captured
// the complete readTicket, but only selected outer request fields.
const capturedBrambleTicket = {"subjectScope":"named","needs":[{"needId":"need:0","from":null,"to":null,"target":null,"termGroups":[["food","eating","eating notes","food notes"],["dental visit","dental"],["feed","feeding","meal","diet","appetite","chew"]],"ordering":"asc"}],"operation":"read_since_event","episode":null,"temporal":{"calendar":null,"from":null,"to":null,"anchor":{"concept":"dental visit","relation":"from"}},"searchHints":["every note on food or eating from the dental visit onwards","include the dental one too","oldest first"],"predicates":[{"kind":"text_any","terms":["food","eating","feed","feeding","meal","diet","appetite","chew"]}],"outputs":{"strategy":"chronological","completeness":"exhaustive","ordering":"asc","limit":null}};

test('captured Bramble ticket binds only with needs stripped, through one planner per case', async t => {
  const original = structuredClone(capturedBrambleTicket);
  const bindings = [{ id: 'need:0', petIds: [pet.id], sourceSpanId: 'source-message:0:' + question.length }];
  assert.throws(() => bindReadTicket(original, [pet.id], bindings), error => {
    assert.equal(error.cause.field, 'operation');
    assert.equal(error.cause.rule, 'read_since_event_incompatible_with_needs');
    return true;
  });
  for (const variant of ['retained', 'empty', 'omitted']) {
    await t.test(variant, async t => {
      const candidate = structuredClone(original);
      if (variant === 'empty') candidate.needs = [];
      if (variant === 'omitted') delete candidate.needs;
      const warn = t.mock.method(console, 'warn', () => {});
      t.mock.method(console, 'info', () => {});
      let calls = 0;
      const stages = [];
      const envelope = { ...proposal(candidate), evidenceNeeds: [{
        quote: question, sourceTurnId: null, petNames: ['Bramble'], terms: ['food', 'eating'], order: 'context',
      }] };
      const run = interpretAskQuestion({ context, model: 'fixture',
        onProviderEvent: event => stages.push(event),
        client: { responses: { create: async request => {
          calls++;
          assert.ok(request.instructions.includes('emit readTicket.needs: [] (or omit needs)'));
          return { output_text: JSON.stringify(envelope) };
        } } },
      });
      if (variant === 'retained') {
        await assert.rejects(run, error => {
          assert.equal(error.diagnostics.providerErrorCode, 'ASK_REQUEST_CONTRACT_READ_TICKET');
          return true;
        });
        const logs = warn.mock.calls.filter(call => call.arguments[0] === '[Ask Brain] rejected read ticket');
        assert.equal(logs.length, 1);
        const logged = JSON.parse(logs[0].arguments[1]);
        assert.equal(logged.field, 'operation');
        assert.equal(logged.rule, 'read_since_event_incompatible_with_needs');
        assert.deepEqual(logged.readTicket, original);
      } else {
        const expected = bindReadTicket(candidate, [pet.id], bindings);
        const result = await run;
        assert.deepEqual(result.request.readTicket, expected);
        assert.deepEqual(expected.temporal, original.temporal);
        assert.deepEqual(expected.predicates, original.predicates);
        assert.deepEqual(expected.searchHints, original.searchHints);
        assert.deepEqual(expected.outputs, original.outputs);
        assert.equal(expected.operation, original.operation);
        assert.equal(warn.mock.calls.length, 0);
      }
      assert.equal(calls, 1);
      assert.deepEqual(stages.map(event => [event.stage, event.outcome]), [
        ['interpretation', 'started'], ['interpretation', variant === 'retained' ? 'failed' : 'succeeded'],
      ]);
    });
  }
  assert.deepEqual(capturedBrambleTicket, original);
});


// Exact readTicket from preview 9a128f2, request 57a73f15-a81a-4d0c-84d3-028b403c4651,
// 2026-09-20T05:24:48Z. The outer proposal/evidenceNeeds are fixture scaffolding.
const capturedDuneTicket = {"subjectScope":"selected","needs":[{"needId":"need:0","from":null,"to":null,"target":null,"termGroups":[["weight","weigh","body mass"]],"ordering":"asc"}],"operation":"read","episode":null,"temporal":{"calendar":null,"from":null,"to":null,"anchor":null},"searchHints":["earliest saved weight","date of earliest weight record"],"predicates":[{"kind":"text_any","terms":["weight","weigh","body mass"]}],"outputs":{"strategy":"chronological","completeness":"exhaustive","ordering":"asc","limit":1}};

test('captured Dune ticket binds only with needs stripped, through one planner per case', async t => {
  const question = 'dune whats his earliest weight we got saved and what date was it';
  const pet = { id: '559beba5-9f03-4e55-b8ad-5d3fac105d0a', name: 'Dune', user_id: 'owner', species: 'cat' };
  const context = { owner: { userId: 'owner' }, pet, eligiblePets: [pet], currentMessage: question,
    conversationTurns: [], timeZone: 'UTC',
    currentTurn: { id: '9f2c85c6-cae9-4d43-a3bb-bd89d9f34fed', role: 'user', text: question } };
  const original = structuredClone(capturedDuneTicket);
  const bindings = [{ id: 'need:0', petIds: [pet.id], sourceSpanId: context.currentTurn.id + ':0:' + question.length }];
  assert.throws(() => bindReadTicket(original, [pet.id], bindings), error => {
    assert.equal(error.cause.field, 'predicates');
    assert.equal(error.cause.rule, 'incompatible_with_needs');
    return true;
  });
  for (const variant of ['retained', 'empty', 'omitted']) {
    await t.test(variant, async t => {
      const candidate = structuredClone(original);
      if (variant === 'empty') candidate.needs = [];
      if (variant === 'omitted') delete candidate.needs;
      const warn = t.mock.method(console, 'warn', () => {});
      t.mock.method(console, 'info', () => {});
      let calls = 0;
      const stages = [];
      const envelope = { ...proposal(candidate), question, scope: 'selected', petNames: ['Dune'],
        topic: 'weight', terms: ['weight'], selection: 'earliest', evidenceNeeds: [{
          quote: question, sourceTurnId: null, petNames: ['Dune'], terms: ['weight'], order: 'earliest',
        }] };
      const run = interpretAskQuestion({ context, model: 'fixture',
        onProviderEvent: event => stages.push(event),
        client: { responses: { create: async request => {
          calls++;
          assert.ok(request.instructions.includes('For any single retrieval, including operation read,'));
          assert.ok(request.instructions.includes('needs must be empty or omitted'));
          return { output_text: JSON.stringify(envelope) };
        } } },
      });
      if (variant === 'retained') {
        await assert.rejects(run, error => {
          assert.equal(error.diagnostics.providerErrorCode, 'ASK_REQUEST_CONTRACT_READ_TICKET');
          return true;
        });
        const logs = warn.mock.calls.filter(call => call.arguments[0] === '[Ask Brain] rejected read ticket');
        assert.equal(logs.length, 1);
        const logged = JSON.parse(logs[0].arguments[1]);
        assert.equal(logged.field, 'predicates');
        assert.equal(logged.rule, 'incompatible_with_needs');
        assert.deepEqual(logged.readTicket, original);
      } else {
        const expected = bindReadTicket(candidate, [pet.id], bindings);
        const result = await run;
        assert.deepEqual(result.request.readTicket, expected);
        assert.deepEqual(expected.temporal, original.temporal);
        assert.deepEqual(expected.predicates, original.predicates);
        assert.deepEqual(expected.searchHints, original.searchHints);
        assert.deepEqual(expected.outputs, original.outputs);
        assert.equal(expected.operation, 'read');
        assert.deepEqual(expected.subjects.petIds, [pet.id]);
        assert.equal(warn.mock.calls.length, 0);
      }
      assert.equal(calls, 1);
      assert.deepEqual(stages.map(event => [event.stage, event.outcome]), [
        ['interpretation', 'started'], ['interpretation', variant === 'retained' ? 'failed' : 'succeeded'],
      ]);
    });
  }
  assert.deepEqual(capturedDuneTicket, original);
});


// Captured validated #3/#4 ticket fields on 8afccd7, with server subjects rebound.
// Conversations f16d2bed-1106-4df3-a6ca-ec700c3e5c3b and f9690791-fd3b-4c8d-9a75-a86c50bb406d.
const earliestMeasurementTicket = {
  subjectScope: 'named', needs: [], episode: null, operation: 'read',
  temporal: { calendar: null, from: null, to: null, anchor: null },
  searchHints: ['earliest weight', 'weight record', 'body mass', 'weighed', 'scale reading'],
  predicates: [{ kind: 'text_any', terms: ['weight', 'weigh', 'mass', 'body mass', 'weighed', 'scale'] }],
  outputs: { strategy: 'chronological', completeness: 'exhaustive', ordering: 'asc', limit: 1 },
};
const failedEarliestMeasurementTicket = {
  ...structuredClone(earliestMeasurementTicket), subjectScope: 'selected',
  temporal: { calendar: 'oldest_year', from: null, to: null, anchor: null },
  searchHints: ['earliest weight', 'first recorded weight', 'weight record'],
  predicates: [{ kind: 'text_any', terms: ['weight', 'weigh', 'mass'] }],
};

test('earliest measurement uses one calendar-free planner ticket and retains the earliest event in Lungs', async t => {
  const { retrieveReadTicket } = await import('../app/lib/furvise-brain/lungs.ts');
  const pet = { id: '559beba5-9f03-4e55-b8ad-5d3fac105d0a', name: 'Dune', user_id: 'owner', species: 'cat' };
  const question = 'dune whats his earliest weight we got saved and what date was it';
  const context = { owner: { userId: 'owner' }, pet, eligiblePets: [pet], currentMessage: question,
    conversationTurns: [], timeZone: 'UTC', currentTurn: { id: 'measurement-question', role: 'user', text: question } };
  const scope = { userId: 'owner', ownedPetIds: [pet.id], from: '1900-01-01T00:00:00Z',
    to: '2026-09-20T00:00:00Z', asOf: '2026-09-20T00:00:00Z' };
  const row = (id, at, note) => ({ id, user_id: 'owner', pet_profile_id: pet.id,
    occurred_at: at, created_at: at, updated_at: at, title: null, deleted_at: null, note });
  const earliest = row('9f53b55b-4c32-4d9d-b055-020f29179d94', '2016-10-15T12:00:00Z',
    'Dune weighed 4.81 kg. Monthly care check recorded stable appetite, usual routine, and no new ongoing concern.');
  const later = row('later-measurement', '2017-01-15T12:00:00Z', 'Dune weighed 4.90 kg.');
  const store = rows => ({ page: async ({ offset, limit }) => rows.slice(offset, offset + limit),
    effective: async records => ({ records, reliable: true }) });
  const retrieve = (ticket, rows = [later, earliest]) =>
    retrieveReadTicket(bindReadTicket(ticket, [pet.id]), scope, store(rows));

  await t.test('captured #4 is rejected with a named calendar rule; clearing calendar alone still loses weighed', async () => {
    const original = structuredClone(failedEarliestMeasurementTicket);
    assert.throws(() => bindReadTicket(original, [pet.id]), error => {
      assert.equal(error.cause.field, 'temporal.calendar');
      assert.equal(error.cause.rule, 'calendar_oldest_year_incompatible_with_measurement_limit');
      return true;
    });
    assert.deepEqual(original, failedEarliestMeasurementTicket);
    const result = await retrieve({ ...structuredClone(original),
      temporal: { ...original.temporal, calendar: null } });
    assert.ok(result.coverage.selection.scannedIds.includes(earliest.id));
    assert.deepEqual(result.coverage.selection.matchedIds, []);
    assert.deepEqual(result.records, []);
    assert.equal(result.coverage.status, 'partial');
  });
  await t.test('C053 oldest calendar year without measurement predicates still binds and selects its year', async () => {
    const rows = [row('older-nonmeasurement', '2015-06-01T12:00:00Z', 'Routine visit.'), earliest, later];
    const oldestYear = await retrieve({ ...structuredClone(earliestMeasurementTicket), predicates: [],
      temporal: { ...earliestMeasurementTicket.temporal, calendar: 'oldest_year' },
      outputs: { strategy: null, completeness: 'sufficient', ordering: 'asc', limit: null } }, rows);
    assert.deepEqual(oldestYear.records.map(row => row.id), ['older-nonmeasurement']);
    const canonical = await retrieve(earliestMeasurementTicket, rows);
    assert.deepEqual(canonical.records.map(row => row.id), [earliest.id]);
    assert.equal(canonical.coverage.status, 'partial');
  });
  // Deterministic provider stubs specify the required Brain output. This verifies
  // prompt delivery and downstream behavior, not live-model compliance.
  for (const thread of ['first', 'independent-repeat']) {
    await t.test(thread + ' mocked planner emits the required shape, not captured #4', async t => {
      t.mock.method(console, 'info', () => {});
      let calls = 0;
      const result = await interpretAskQuestion({ context: { ...context,
        currentTurn: { ...context.currentTurn, id: thread } }, model: 'fixture',
        client: { responses: { create: async request => {
          calls++;
          assert.ok(request.instructions.includes('For earliest/first recorded measurement requests, emit operation read'));
          assert.ok(request.instructions.includes('and temporal.calendar null'));
          assert.ok(request.instructions.includes('Reserve oldest_year for an explicit request for the oldest calendar year'));
          assert.ok(request.instructions.includes('weight, weigh, weighed, weighing'));
          return { output_text: JSON.stringify({ ...proposal(structuredClone(earliestMeasurementTicket)),
            question, petNames: ['Dune'], topic: 'weight', terms: ['weight'], selection: 'earliest' }) };
        } } },
      });
      assert.equal(calls, 1);
      const bound = result.request.readTicket;
      assert.deepEqual(bound, bindReadTicket(earliestMeasurementTicket, [pet.id]));
      assert.notDeepEqual(bound.temporal, failedEarliestMeasurementTicket.temporal);
      const read = await retrieveReadTicket(bound, scope, store([later, earliest]));
      assert.deepEqual(read.records.map(row => row.id), [earliest.id]);
      assert.equal(read.records[0].occurred_at, earliest.occurred_at);
      assert.equal(read.records[0].note, earliest.note);
      assert.equal(read.coverage.status, 'partial');
    });
  }
});

test('measurement limit calendar guard covers earliest/latest and preserves nonmeasurement calendar reads', () => {
  const petIds = ['measurement-pet'];
  for (const ordering of ['asc', 'desc']) {
    for (const measurement of ['weight', 'weighed', 'body mass', 'temperature', 'heart rate', 'blood glucose']) {
      const candidate = { ...structuredClone(earliestMeasurementTicket),
        predicates: [{ kind: 'text_any', terms: [measurement] }],
        temporal: { ...earliestMeasurementTicket.temporal, calendar: 'oldest_year' },
        outputs: { ...earliestMeasurementTicket.outputs, ordering } };
      assert.throws(() => bindReadTicket(candidate, petIds), error =>
        error.cause.field === 'temporal.calendar'
        && error.cause.rule === 'calendar_oldest_year_incompatible_with_measurement_limit');
      assert.equal(bindReadTicket({ ...candidate,
        temporal: { ...candidate.temporal, calendar: null } }, petIds).temporal.calendar, null);
      assert.equal(bindReadTicket({ ...candidate,
        outputs: { ...candidate.outputs, limit: null } }, petIds).temporal.calendar, 'oldest_year');
    }
  }
  for (const predicates of [[], [{ kind: 'text_any', terms: ['food'] }]]) {
    assert.equal(bindReadTicket({ ...structuredClone(failedEarliestMeasurementTicket), predicates },
      petIds).temporal.calendar, 'oldest_year');
  }
});

test('captured #4 is rejected after one mocked planner with full named diagnostics', async t => {
  const warn = t.mock.method(console, 'warn', () => {});
  t.mock.method(console, 'info', () => {});
  let calls = 0;
  await assert.rejects(interpretAskQuestion({ context, model: 'fixture',
    client: { responses: { create: async () => {
      calls++;
      return { output_text: JSON.stringify(proposal(structuredClone(failedEarliestMeasurementTicket))) };
    } } },
  }), error => error.diagnostics.providerErrorCode === 'ASK_REQUEST_CONTRACT_READ_TICKET');
  assert.equal(calls, 1);
  const logs = warn.mock.calls.filter(call => call.arguments[0] === '[Ask Brain] rejected read ticket');
  assert.equal(logs.length, 1);
  const diagnostic = JSON.parse(logs[0].arguments[1]);
  assert.equal(diagnostic.field, 'temporal.calendar');
  assert.equal(diagnostic.rule, 'calendar_oldest_year_incompatible_with_measurement_limit');
  assert.deepEqual(diagnostic.readTicket, failedEarliestMeasurementTicket);
});
