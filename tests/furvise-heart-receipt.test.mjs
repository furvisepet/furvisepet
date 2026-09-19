import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { getFurviseActionPolicy } from '../app/lib/application-actions/policy.ts';

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === 'server-only') return { shortCircuit: true, url: 'data:text/javascript,export {}' };
  if (specifier.endsWith('/security/idempotency/admin-client.ts')) return {
    shortCircuit: true, url: 'data:text/javascript,export const createIdempotencyAdminClient = () => globalThis.__heartTestDatabase;',
  };
  return nextResolve(specifier, context);
} });
globalThis.fetch = async () => { throw new Error('Heart fixture forbids network access'); };
const { executeActionCapability } = await import('../app/lib/application-actions/capabilities.ts');

function fixture(kind, { receipt = true, receiptPet = 'pet', changed = true, terminalStatus = 'succeeded' } = {}) {
  const action = { id: 'capability', kind, petId: 'pet', sourceMessageId: 'source',
    input: { field: null, value: null, title: 'Owner update', detail: 'Appetite was normal.', category: 'general', target: 'specified' },
    evidence: 'Correct the saved note.', explicitIntent: true, ...getFurviseActionPolicy(kind),
    status: 'proposed', label: 'Action', description: '', href: null, resultMessage: null, errorMessage: null };
  const result = { ...action, status: 'succeeded', resultMessage: 'Saved.' };
  let executed = false;
  const reads = [];
  globalThis.__heartTestDatabase = {
    from(table) {
      const filters = {};
      const query = { select() { return query; }, eq(key, value) { filters[key] = value; return query; },
        async maybeSingle() {
          reads.push({ table, filters });
          return { error: null, data: { id: 'capability', assistant_message_id: 'assistant', action_payload: action,
            status: executed ? terminalStatus : 'pending', expires_at: '2099-01-01T00:00:00Z',
            receipt: executed && receipt ? { ...result, petId: receiptPet } : null } };
        } };
      return query;
    },
    rpc() { executed = true; return { maybeSingle: async () => ({ data: { action: result, changed }, error: null }) }; },
  };
  return { run: () => executeActionCapability({ capabilityId: 'capability', assistantMessageId: 'assistant', userId: 'owner', mode: 'confirm' }), reads };
}

for (const [operation, kind] of [['append', 'care_history.add'], ['replace', 'care_history.edit'], ['delete', 'care_history.remove']]) {
  test(`${operation} cannot succeed without a durable receipt`, async () => {
    await assert.rejects(fixture(kind, { receipt: false }).run(), /WRITE_RECEIPT/);
  });
  test(`${operation} returns success only with the matching scoped receipt`, async () => {
    const f = fixture(kind);
    assert.equal((await f.run()).action.status, 'succeeded');
    assert.equal(f.reads.length, 2);
    for (const read of f.reads) assert.deepEqual(read.filters, { id: 'capability', assistant_message_id: 'assistant', user_id: 'owner' });
  });
}
test('replace rejects a receipt belonging to another pet', async () => {
  await assert.rejects(fixture('care_history.edit', { receiptPet: 'other-pet' }).run(), /WRITE_RECEIPT/);
});
test('replace replay accepts its existing receipt without claiming a second mutation', async () => {
  const result = await fixture('care_history.edit', { changed: false }).run();
  assert.equal(result.changed, false);
  assert.equal(result.action.status, 'succeeded');
});
test('replace rejects a success response when durable state is still pending', async () => {
  await assert.rejects(fixture('care_history.edit', { terminalStatus: 'pending' }).run(), /WRITE_RECEIPT/);
});
