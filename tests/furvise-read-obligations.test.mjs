import assert from 'node:assert/strict';
import test from 'node:test';
import { bindReadTicket } from '../app/lib/furvise-brain/read-ticket.ts';
import { retrieveReadTicket } from '../app/lib/furvise-brain/lungs.ts';
import { bindEvidenceReadTicket } from '../app/lib/intelligence/evidence-read-ticket.ts';

const scope = { userId: 'owner', ownedPetIds: ['a', 'b', 'c'], from: '2020-01-01T00:00:00Z', to: '2027-01-01T00:00:00Z', asOf: '2026-09-20T00:00:00Z' };
const plan = patch => ({ operation: 'read', temporal: { from: null, to: null, anchor: null }, predicates: [],
  outputs: { completeness: 'sufficient', ordering: 'asc', limit: null }, ...patch });
const row = (id, petId, at, note) => ({ id, user_id: 'owner', pet_profile_id: petId, occurred_at: at,
  created_at: at, updated_at: at, deleted_at: null, title: null, category: 'general', note });
const store = rows => ({ page: async ({ petId, offset, limit }) => rows.filter(row => row.pet_profile_id === petId).slice(offset, offset + limit),
  effective: async records => ({ records, reliable: true }) });

test('advisory misses retain context, mandatory misses filter it, neither hint nor model certifies absence', async () => {
  const rows = [row('note', 'a', '2026-01-01T00:00:00Z', 'Slept normally.')];
  const advisory = await retrieveReadTicket(bindReadTicket(plan({ searchHints: ['rest'] }), ['a']), scope, store(rows));
  assert.deepEqual(advisory.records.map(row => row.id), ['note']);
  assert.equal(advisory.coverage.status, 'complete');
  const mandatory = await retrieveReadTicket(bindReadTicket(plan({ predicates: [{ kind: 'text_any', terms: ['rest'] }], searchHints: ['slept'] }), ['a']), scope, store(rows));
  assert.deepEqual(mandatory.records, []);
  assert.equal(mandatory.coverage.status, 'complete_empty');
  assert.deepEqual(mandatory.coverage.selection.scannedIds, ['note']);
  assert.deepEqual(mandatory.coverage.selection.matchedIds, []);
});

test('comparison budget reserves every subject endpoint and accounts for the omitted middle', async () => {
  const rows = ['a', 'b', 'c'].flatMap(petId => Array.from({ length: 16 }, (_, i) => row(`${petId}-${i}`, petId,
    `2026-06-${String(i + 1).padStart(2, '0')}T00:00:00Z`, 'Observation.')));
  const ticket = bindReadTicket(plan({ operation: 'compare', outputs: { completeness: 'sufficient', ordering: 'desc', limit: null, strategy: 'temporal_endpoints' } }), scope.ownedPetIds);
  const result = await retrieveReadTicket(ticket, scope, store(rows));
  assert.equal(result.records.length, 32);
  assert.equal(result.coverage.status, 'partial');
  assert.equal(result.coverage.selection.scannedIds.length, 48);
  assert.equal(result.coverage.selection.matchedIds.length, 48);
  assert.equal(result.coverage.selection.retainedIds.length, 32);
  assert.equal(result.coverage.selection.omittedIds.length, 16);
  assert.ok(result.records.every((row, i, all) => !i || row.occurred_at <= all[i - 1].occurred_at));
  for (const pair of result.coverage.endpointPairs) {
    assert.equal(pair.blocked, false);
    assert.deepEqual(pair.earliestIds, [`${pair.petId}-0`]);
    assert.deepEqual(pair.latestIds, [`${pair.petId}-15`]);
    assert.ok([...pair.earliestIds, ...pair.latestIds].every(id => result.records.some(row => row.id === id)));
  }
  const oversized = rows.map(row => row.id === 'a-15' ? { ...row, note: 'x'.repeat(18001) } : row);
  const limited = await retrieveReadTicket(ticket, scope, store(oversized));
  assert.equal(limited.coverage.status, 'partial');
  assert.equal(limited.coverage.endpointPairs.find(pair => pair.petId === 'a').blocked, true);
  assert.ok(limited.coverage.selection.omittedIds.includes('a-15'));
});

test('oldest year comes from effective event time, and an unexhausted scan cannot certify it', async () => {
  const rows = [row('old', 'a', '2021-01-01T00:00:00Z', 'Note.'), row('current', 'a', '2024-01-01T00:00:00Z', 'Note.')];
  const ticket = bindReadTicket(plan({ temporal: { from: null, to: null, anchor: null, calendar: 'oldest_year' } }), ['a']);
  const healed = { ...store(rows), effective: async () => ({ records: [{ ...rows[0], occurred_at: '2025-01-01T00:00:00Z' }, rows[1]], reliable: true }) };
  const result = await retrieveReadTicket(ticket, scope, healed);
  assert.deepEqual(result.records.map(row => row.id), ['current']);
  assert.equal(result.coverage.windows[0].from, '2024-01-01T00:00:00.000Z');
  const many = Array.from({ length: 300 }, (_, i) => ({ ...rows[0], id: String(i) }));
  const partial = await retrieveReadTicket(ticket, scope, store(many));
  assert.equal(partial.coverage.status, 'partial');
  assert.deepEqual(partial.records, []);
});

test('calendar sampling reports omitted records instead of claiming an exhaustive summary', async () => {
  const rows = [2021, 2022, 2023].flatMap(year => [1, 6].map(month => row(`${year}-${month}`, 'a', `${year}-${String(month).padStart(2, '0')}-01T00:00:00Z`, 'Observation.')));
  const ticket = bindReadTicket(plan({ outputs: { completeness: 'sufficient', ordering: 'asc', limit: null, strategy: 'calendar_samples' } }), ['a']);
  const result = await retrieveReadTicket(ticket, scope, store(rows));
  assert.equal(result.records.length, 3);
  assert.equal(result.coverage.status, 'partial');
  assert.equal(result.coverage.selection.omittedIds.length, 3);
  assert.equal(result.coverage.periods.length, 3);
  assert.ok(result.coverage.periods.every(period => period.exhausted && period.candidateIds.length === 2));
});

test('invalid read strategies and retrieval-only fields cannot bypass Lungs through direct publication', () => {
  for (const patch of [
    { searchHints: ['a\nb'] },
    { outputs: { completeness: 'sufficient', ordering: 'asc', limit: null, strategy: 'temporal_endpoints' } },
    { outputs: { completeness: 'sufficient', ordering: 'asc', limit: null, strategy: 'event_candidates' } },
    { outputs: { completeness: 'exhaustive', ordering: 'asc', limit: null, strategy: 'calendar_samples' } },
  ]) assert.throws(() => bindReadTicket(plan(patch), ['a']), /read_ticket/);
  for (const patch of [
    { searchHints: ['rest'] },
    { temporal: { from: null, to: null, anchor: null, calendar: 'oldest_year' } },
    { outputs: { completeness: 'sufficient', ordering: 'asc', limit: null, strategy: 'chronological' } },
  ]) assert.throws(() => bindEvidenceReadTicket({ read: plan(patch), kind: 'ordinary', topics: [], period: { kind: 'unspecified', surface: null }, status: 'resolved', locator: null }, ['a'], ''), /ASK_EVIDENCE_TICKET_INVALID/);
});
