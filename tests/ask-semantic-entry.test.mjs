import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === 'server-only') return { url: 'data:text/javascript,export {};', format: 'module', shortCircuit: true };
  return nextResolve(specifier, context);
} });
globalThis.fetch = async () => { throw new Error('Real network calls are forbidden in semantic-entry tests'); };
const { interpretAskQuestion } = await import('../app/lib/intelligence/interpret-ask.ts');
const pet = { id: 'pebble', name: 'Pebble', user_id: 'owner', species: 'cat' };
const source = { id: 'save-turn', role: 'user', text: 'Pebble skipped breakfast. Save that for today.', createdAt: '2026-09-18T20:00:00.000Z',
  operationReceipt: { sourceMessageId: 'save-turn', petId: pet.id, requestText: 'Pebble skipped breakfast. Save that for today.', answerPersisted: true,
    records: [{ id: 'row', note: 'Pebble skipped breakfast.', occurredAt: '2026-09-18T20:00:00.000Z' }] } };
const base = { owner: { userId: 'owner' }, eligiblePets: [pet], pet, conversationTurns: [source], pendingTask: null, timeZone: 'America/Vancouver' };

// These are dispatch/transport tests, not claims about a real model's accuracy.
// With planning unavailable, no familiar phrase may fabricate a semantic plan.
for (const question of [
  'so what u think',
  'What did I just save for Pebble?',
  "Look at Pebble's latest weight.",
  "Since Pebble's dental, what did I write about eating or food? Don't guess months I didn't log.",
  "What is Pebble's current profile weight?",
  "tell me Pebble's last two weights and whether this note includes a weight.",
  'Show me the two most recent body-mass measurements and check the note separately.',
]) test('semantic planner receives the complete request: ' + question, async () => {
  const seen = [];
  await assert.rejects(interpretAskQuestion({
    context: { ...base, currentMessage: question, currentTurn: { id: 'current', role: 'user', text: question, createdAt: '2026-09-18T20:00:01.000Z' },
      ownerNoteAlreadySaved: true, completedOwnerNote: { sourceMessageId: source.id, petId: pet.id, entryIds: ['row'], note: 'Pebble skipped breakfast.' } },
    model: 'test-model', client: { responses: { create: async request => { seen.push(request); throw new Error('Planner unavailable'); } } },
  }), error => error.diagnostics?.providerErrorCode === 'ASK_INTERPRETATION_TRANSPORT');
  assert.equal(seen.length, 1);
  const input = JSON.parse(seen[0].input);
  assert.equal(input.currentMessage, question);
  assert.deepEqual(input.completedOwnerNote.entryIds, ['row']);
  assert.equal(input.recentDialogueForReferencesOnly[0].id, source.id);
});

test('a valid provider proposal still crosses real contract validation', async () => {
  const question = "What was Pebble's weight in 2020?";
  const proposal = { version: 'ask-request.v2', mode: 'read', question, requirements: [], referenceTurnIds: [], scope: 'named', petNames: ['Pebble'],
    operation: 'recall', selection: 'period', quantity: 'measurement', topic: 'weight', terms: ['weight'], from: '2020-01-01', to: '2021-01-01',
    episodeTopic: null, ordinal: null, frame: null, evidenceBasis: 'saved_history', premiseQuotes: [] };
  let calls = 0;
  const result = await interpretAskQuestion({ context: { ...base, currentMessage: question }, model: 'test-model',
    client: { responses: { create: async () => { calls++; return { status: 'completed', output_text: JSON.stringify(proposal), usage: { input_tokens: 1, output_tokens: 1 } }; } } },
  });
  assert.equal(calls, 1);
  assert.equal(result.readOnly, true);
  assert.equal(result.request.evidenceBasis, 'saved_history');
  assert.deepEqual(result.petIds, [pet.id]);
  assert.ok(result.history);
});

test('unknown proposal fields cannot bypass contract validation', async () => {
  await assert.rejects(interpretAskQuestion({ context: { ...base, currentMessage: 'Read the saved history' }, model: 'test-model',
    client: { responses: { create: async () => ({ status: 'completed', output_text: JSON.stringify({ version: 'ask-request.v2', accountId: 'foreign' }) }) } },
  }));
});
