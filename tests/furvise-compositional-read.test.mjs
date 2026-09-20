import assert from 'node:assert/strict';
import test from 'node:test';
import { bindCompositionalReadTicket, eventOrder } from '../app/lib/furvise-brain/read-selection.ts';
import { bindReadTicket, readTicketSchema } from '../app/lib/furvise-brain/read-ticket.ts';
import { retrieveReadTicket, LUNGS_LIMITS } from '../app/lib/furvise-brain/lungs.ts';
globalThis.fetch = async () => { throw Error('OFFLINE_ONLY'); };
const pets = ['a', 'b', 'c'];
const scope = { userId: 'owner', ownedPetIds: pets, from: '2010-01-01T00:00:00Z',
  to: '2027-01-01T00:00:00Z', asOf: '2026-09-20T00:00:00Z' };
const clause = (direction = 'desc', count = 1) => ({ orderBy: [{ field: 'event_at', direction }], take: { count, per: 'group' } });
const proposal = (union = [clause()], topic = 'weight', outputs = {}) => ({
  operation: 'compare', temporal: { from: null, to: null, anchor: null, calendar: null },
  predicates: [{ kind: 'text_any', terms: [topic] }], needs: [],
  selection: { groupBy: ['subject'], union },
  outputs: { completeness: 'sufficient', ordering: 'desc', limit: null, ...outputs },
});
const row = (pet, i, note = 'weight') => {
  const at = new Date(Date.UTC(2016, 0, i + 1)).toISOString();
  return { id: pet + '-' + i, user_id: 'owner', pet_profile_id: pet, occurred_at: at,
    created_at: at, updated_at: at, deleted_at: null, title: null, category: 'general', note };
};
const fixture = (count = 12, note = 'weight') => pets.flatMap(pet => Array.from({ length: count }, (_, i) => row(pet, i, note)));
function memory(rows, effective = async records => ({ records, reliable: true })) {
  const calls = [];
  return { calls, effective, page: async input => {
    calls.push(input);
    return rows.filter(row => row.pet_profile_id === input.petId)
      .sort((a, b) => input.ordering === 'desc' ? eventOrder(b, a) : eventOrder(a, b))
      .slice(input.offset, input.offset + input.limit);
  } };
}
const ids = result => result.records.map(row => row.id).sort();
async function run(rows, p = proposal(), subjects = pets, store = memory(rows)) {
  return retrieveReadTicket(bindCompositionalReadTicket(p, subjects), scope, store);
}

test('latest per subject: three represented and certified, middle omission stays partial', async () => {
  const r = await run(fixture());
  assert.deepEqual(ids(r), ['a-11', 'b-11', 'c-11']);
  assert.ok(r.coverage.groups.every(g => g.exhausted && !g.blocked));
  assert.equal(r.coverage.status, 'partial');
  assert.equal(r.coverage.selection.omittedIds.length, 33);
});
test('120 rows per subject: directional opportunity before another subject page; fixed row budget', async () => {
  const rows = fixture(120), store = memory(rows);
  const r = await run(rows, proposal(), pets, store);
  assert.deepEqual(ids(r), ['a-119', 'b-119', 'c-119']);
  assert.deepEqual(store.calls.slice(0, 3).map(c => [c.petId, c.offset, c.ordering]),
    pets.map(p => [p, 0, 'desc']));
  assert.ok(store.calls.reduce((n, c) => n + c.limit, 0) <= LUNGS_LIMITS.pages * LUNGS_LIMITS.pageSize);
  assert.ok(r.coverage.groups.every(g => !g.exhausted && g.blocked));
  assert.equal(r.coverage.status, 'partial'); // raw direction alone cannot certify effective endpoints
});
test('rotating subject order changes neither selected IDs nor acquisition nor coverage', async () => {
  const rows = fixture(120), first = memory(rows), rotated = memory(rows);
  const a = await run(rows, proposal(), pets, first);
  const b = await run(rows, proposal(), ['c', 'a', 'b'], rotated);
  assert.deepEqual(ids(a), ids(b));
  assert.deepEqual(first.calls, rotated.calls);
  assert.deepEqual(a.coverage.groups, b.coverage.groups);
});
test('same executor for food, medication and arbitrary measurement predicates', async () => {
  for (const topic of ['food', 'medication', 'temperature', 'walk']) {
    const rows = fixture(9, topic).concat(pets.map(p => row(p, 10, 'unrelated')));
    const r = await run(rows, proposal([clause()], topic));
    assert.deepEqual(ids(r), ['a-8', 'b-8', 'c-8']);
    assert.ok(r.coverage.groups.every(g => !g.blocked));
  }
});
test('earliest is the same primitive with ascending order', async () => {
  const rows = fixture(120), store = memory(rows);
  const r = await run(rows, proposal([clause('asc')]), pets, store);
  assert.deepEqual(ids(r), ['a-0', 'b-0', 'c-0']);
  assert.ok(store.calls.every(c => c.ordering === 'asc'));
});
test('take two per group returns two per eligible subject', async () => {
  const r = await run(fixture(), proposal([clause('desc', 2)]));
  assert.deepEqual(ids(r), ['a-10', 'a-11', 'b-10', 'b-11', 'c-10', 'c-11']);
  assert.ok(r.coverage.groups.every(g => g.selectedIds.length === 2 && !g.blocked));
});
test('missing match is subject-local and cannot erase other evidence', async () => {
  const rows = fixture().map(r => r.pet_profile_id === 'b' ? { ...r, note: 'unrelated' } : r);
  const r = await run(rows);
  assert.deepEqual(ids(r), ['a-11', 'c-11']);
  const empty = r.coverage.groups.find(g => g.petId === 'b');
  assert.equal(empty.status, 'complete_empty');
  assert.equal(empty.exhausted, true);
  assert.deepEqual(empty.selectedIds, []);
  assert.ok(r.coverage.groups.filter(g => g.petId !== 'b').every(g => !g.blocked));
});
test('earliest plus latest is a union of the same clauses with explicit opposite acquisition', async () => {
  const rows = fixture(120), store = memory(rows);
  const r = await run(rows, proposal([clause('asc'), clause('desc')]), pets, store);
  assert.deepEqual(ids(r), ['a-0', 'a-119', 'b-0', 'b-119', 'c-0', 'c-119']);
  assert.deepEqual(store.calls.slice(0, 6).map(c => [c.petId, c.ordering]),
    ['asc', 'desc'].flatMap(direction => pets.map(p => [p, direction])));
  assert.ok(store.calls.reduce((n, c) => n + c.limit, 0) <= 256);
  assert.ok(r.coverage.groups.every(g => g.blocked)); // incomplete scans remain honest
  const complete = await run(fixture(), proposal([clause('asc'), clause('desc')]));
  assert.ok(complete.coverage.groups.every(g => !g.blocked));
});
test('union is idempotent and one-row subjects do not fabricate a second record', async () => {
  const r = await run(fixture(1), proposal([clause('asc'), clause('desc'), clause('desc')]));
  assert.deepEqual(ids(r), ['a-0', 'b-0', 'c-0']);
  assert.ok(r.coverage.groups.every(g => !g.blocked));
});
test('effective truth and predicate/date corrections run before group selection', async () => {
  const rows = fixture(5);
  const store = memory(rows, async records => ({ reliable: true, records: records
    .filter(r => r.id !== 'a-4')
    .map(r => r.id === 'b-4' ? { ...r, note: 'unrelated' }
      : r.id === 'c-0' ? { ...r, occurred_at: '2025-01-01T00:00:00Z' } : r) }));
  const r = await run(rows, proposal(), pets, store);
  assert.deepEqual(ids(r), ['a-3', 'b-3', 'c-0']);
  assert.ok(r.coverage.groups.every(g => !g.blocked));
});
test('unresolved lineage blocks only its subject; selected reports remain attributed', async () => {
  const rows = fixture(5), store = memory(rows, async records => ({ records, reliable: true,
    sourceLineage: [{ eventId: 'b-4', status: 'uncertain', authority: 'attributed_report' }] }));
  const r = await run(rows, proposal(), pets, store);
  assert.deepEqual(r.coverage.groups.map(g => g.blocked), [false, true, false]);
});
test('global publication cap does not redefine take per group or hide missing required rows', async () => {
  const r = await run(fixture(), proposal([clause('desc', 2)], 'weight', { limit: 3 }));
  assert.deepEqual(ids(r), ['a-11', 'b-11', 'c-11']);
  assert.equal(r.coverage.reservedIds.length, 6);
  assert.ok(r.coverage.groups.every(g => g.selectedIds.length === 2 && g.blocked
    && g.reasons.includes('required_selection_not_retained')));
});
test('oversized subject evidence cannot discard affordable evidence for other subjects', async () => {
  const rows = fixture(1).map(r => r.pet_profile_id === 'a' ? { ...r, note: 'weight ' + 'x'.repeat(18000) } : r);
  const r = await run(rows);
  assert.deepEqual(ids(r), ['b-0', 'c-0']);
  assert.equal(r.coverage.groups[0].blocked, true);
  assert.ok(r.coverage.groups.slice(1).every(g => !g.blocked));
});
test('one failed subject query leaves other subjects independently valid', async () => {
  const rows = fixture(2), store = memory(rows), page = store.page;
  store.page = async input => { if (input.petId === 'b') throw Error('fixture_unavailable'); return page(input); };
  const r = await run(rows, proposal(), pets, store);
  assert.deepEqual(ids(r), ['a-1', 'c-1']);
  assert.equal(r.coverage.groups[1].status, 'unavailable');
  assert.ok(!r.coverage.groups[0].blocked && !r.coverage.groups[2].blocked);
});
test('strict binder, immutability, authorization and no accidental Brain rollout', async () => {
  const p = proposal();
  const ticket = bindCompositionalReadTicket(p, pets);
  assert.ok(Object.isFrozen(ticket.selection.union[0].take));
  assert.deepEqual(readTicketSchema.properties.selection.type, ['object', 'null']);
  assert.throws(() => bindReadTicket(p, pets), /read_ticket/);
  for (const selection of [
    { ...p.selection, groupBy: ['petName'] },
    { ...p.selection, union: [{ ...clause(), take: { count: 0, per: 'group' } }] },
    { ...p.selection, union: [{ ...clause(), orderBy: [{ field: 'weight', direction: 'desc' }] }] },
    { ...p.selection, union: [] },
  ]) assert.throws(() => bindCompositionalReadTicket({ ...p, selection }, pets), /read_ticket/);
  const foreign = bindCompositionalReadTicket(p, ['foreign']);
  const store = memory([]);
  assert.equal((await retrieveReadTicket(foreign, scope, store)).coverage.status, 'unavailable');
  assert.equal(store.calls.length, 0);
});
test('hint ranking and publication ordering cannot replace ordering inside groups', async () => {
  const rows = fixture(5).map(r => r.id.endsWith('-0') ? { ...r, note: 'weight favorite' } : r);
  const p = { ...proposal(), searchHints: ['favorite'], outputs: { ...proposal().outputs, ordering: 'asc' } };
  assert.deepEqual(ids(await run(rows, p)), ['a-4', 'b-4', 'c-4']);
});

test('fixed 32-row transport budget allocates across groups before second/optional rows', async () => {
  const r = await run(fixture(30), proposal([clause('desc', 20)]));
  assert.equal(r.records.length, 32);
  const counts = pets.map(p => r.records.filter(row => row.pet_profile_id === p).length);
  assert.ok(Math.max(...counts) - Math.min(...counts) <= 1);
  assert.equal(r.coverage.reservedIds.length, 60);
  assert.ok(r.coverage.groups.every(g => g.blocked));
});
test('scope violation and stale pagination fail closed for their subject', async () => {
  for (const mode of ['foreign', 'repeat']) {
    const rows = fixture(120), store = memory(rows), page = store.page;
    store.page = async input => {
      if (input.petId !== 'b') return page(input);
      if (mode === 'foreign') return [{ ...rows[0], user_id: 'foreign' }];
      return page({ ...input, offset: 0 });
    };
    const r = await run(rows, proposal(), pets, store);
    assert.equal(r.coverage.groups[1].status, 'unavailable');
    assert.ok(!r.records.some(row => row.user_id !== 'owner'));
    assert.ok(r.records.some(row => row.pet_profile_id === 'a'));
    assert.ok(r.records.some(row => row.pet_profile_id === 'c'));
  }
});
