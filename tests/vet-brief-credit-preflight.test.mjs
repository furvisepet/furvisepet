import assert from 'node:assert/strict';
import test from 'node:test';
import { checkAiCreditRequestReplay, AiCreditReplayRequiredError } from '../app/lib/ai/usage-ledger.ts';

function client(rows, error = null) {
  const filters = [];
  const query = { select() { return this; }, eq(key, value) { filters.push([key, value]); return this; }, order() { return this; }, async returns() { return { data: rows, error }; } };
  return { filters, from(table) { assert.equal(table, 'ai_usage_events'); return query; } };
}
const event = status => ({ request_id: 'request-a', logical_request_id: 'request-a', payload_hash: 'hash-a', status, settlement_disposition: status === 'released' ? 'release' : null });
const run = supabase => checkAiCreditRequestReplay({ feature: 'vet_brief', logicalRequestId: 'request-a', payloadHash: 'hash-a', userId: 'owner-a', supabase });

test('terminal released requests are recognized before a provider admission action can run', async () => {
  const supabase = client([event('released')]);
  let providerAdmissionRan = false;
  await assert.rejects(async () => { await run(supabase); providerAdmissionRan = true; }, error => error instanceof AiCreditReplayRequiredError && error.status === 'released');
  assert.equal(providerAdmissionRan, false);
  assert.deepEqual(supabase.filters, [['user_id', 'owner-a'], ['feature', 'vet_brief'], ['logical_request_id', 'request-a']]);
});

test('completed credits remain distinct from released credits; unresolved states are not rotated', async () => {
  await assert.rejects(run(client([event('completed')])), error => error instanceof AiCreditReplayRequiredError && error.status === 'completed');
  await run(client([]));
  await run(client([event('reserved')]));
  await run(client([event('released'), event('reserved')]));
});

test('identity conflicts and failed ledger reads cannot authorize a fresh charged request', async () => {
  await assert.rejects(run(client([{ ...event('released'), payload_hash: 'different' }])), error => !(error instanceof AiCreditReplayRequiredError));
  await assert.rejects(run(client(null, { message: 'unavailable' })), error => !(error instanceof AiCreditReplayRequiredError));
});
