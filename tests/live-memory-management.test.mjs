import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as integrity from '../app/lib/intelligence/memory-integrity.ts';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
function compile(source, mocks = {}, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText,
    { exports, require: name => { assert.ok(name in mocks, name); return mocks[name]; }, Response, Request, console, ...globals });
  return exports;
}
const petId = '11111111-1111-4111-8111-111111111111';
const otherPet = '22222222-2222-4222-8222-222222222222';
const id = '33333333-3333-4333-8333-333333333333';
const user = { id: 'owner' };
const legacy = (overrides = {}) => ({ id, user_id: user.id, dog_profile_id: petId, status: 'active', type: 'preference', text: 'Prefers salmon food', confidence: 'high', ...overrides });
const canonical = (overrides = {}) => ({ id, user_id: user.id, pet_id: petId, subject_type: 'pet', status: 'active', category: 'preference', fact_key: 'food_preference', fact_value: 'salmon', source_excerpt: 'Prefers salmon food', ...overrides });
function database(rows, { ignoreFilters = false, error = null, insertError = null, countOverride } = {}) {
  const calls = [];
  return { calls, from(table) {
    const filters = []; let mutation, values;
    const q = {
      select() { return q; }, eq(k,v) { filters.push(r => r[k] === v); return q; }, in(k,v) { filters.push(r => v.includes(r[k])); return q; },
      or() { return q; }, order() { return q; },
      insert(v) { mutation = 'insert'; values = v; return q; }, update(v) { mutation = 'update'; values = v; return q; }, delete() { mutation = 'delete'; return q; },
      then(resolve, reject) { return Promise.resolve(run()).then(resolve, reject); }, returns() { return Promise.resolve(run()); }, single() { return Promise.resolve(run(true)); }, maybeSingle() { return Promise.resolve(run(true)); },
    };
    function run(single = false) {
      calls.push({ table, mutation, values });
      if (error && table === 'dog_memories') return { data: null, error };
      const selected = (rows[table] || []).filter(r => ignoreFilters || filters.every(f => f(r)));
      if (mutation === 'insert') {
        if (insertError) return { data: null, error: insertError };
        const added = values.map(v => legacy(v)); rows[table].push(...added); return { data: added, error: null };
      }
      if (mutation === 'update') selected.forEach(r => Object.assign(r, values));
      if (mutation === 'delete') rows[table] = rows[table].filter(r => !selected.includes(r));
      return { data: single ? selected[0] || null : selected, count: countOverride === undefined ? selected.length : countOverride, error: null };
    }
    return q;
  } };
}
function loaders(db) {
  const source = read('app/lib/supabase.ts');
  return compile(source.slice(source.indexOf('export async function loadDogProfileWithMemoriesForUser('), source.indexOf('export async function deleteDogProfileForUser(')),
    { './intelligence/memory-integrity.ts': integrity }, { getBrowserSupabase: () => db, friendlyDatabaseError: e => Error(e.message) });
}
function route(db, replay) {
  return compile(read('app/api/legacy-memories/route.ts'), {
    '../../lib/authenticated-api-server': { getAuthenticatedApiContext: async () => ({ supabase: db, userId: user.id }) },
    '../../lib/security/request': { API_BODY_LIMITS: { standard: 10000 }, RequestBoundaryError: class extends Error {}, hasOnlyKeys: (v, keys) => v && typeof v === 'object' && Object.keys(v).every(k => keys.includes(k)), isUuid: v => typeof v === 'string' && /^[a-f0-9-]{36}$/.test(v), readBoundedJson: r => r.json() },
    '../../lib/security/idempotency': { beginIdempotentRateLimitedOperation: async input => replay ? { response: input.reconcilePersistedReplay ? await input.reconcilePersistedReplay({ storedResponse: replay, claimOutcome: 'completed' }) || replay : replay } : { operation: { key: 'key', execute: fn => fn() } } },
    '../../lib/intelligence/memory-integrity.ts': integrity,
  });
}
const request = (method, body) => new Request('http://local/api/legacy-memories', { method, body: JSON.stringify(body) });
test('actual loaders reject foreign owner/pet and inactive rows', async () => {
  const db = database({ dog_profiles: [{ id: petId, user_id: user.id }], dog_memories: [legacy(), legacy({ id: 'foreign', user_id: 'other' }), legacy({ id: 'pet', dog_profile_id: otherPet }), legacy({ id: 'inactive', status: 'rejected' })], furvise_memories: [canonical(), canonical({ id: 'foreign', user_id: 'other' }), canonical({ id: 'inactive', status: 'rejected' }), canonical({ id: 'owner-pet', subject_type: 'owner', pet_id: otherPet })] }, { ignoreFilters: true });
  const api = loaders(db);
  const result = await api.loadCanonicalRememberedDetailsForUser(petId, user);
  assert.deepEqual(Array.from(result.canonical, r => r.id), [id]);
  assert.deepEqual(Array.from(result.legacy, r => r.id), [id]);
  assert.deepEqual(Array.from((await api.loadDogProfileWithMemoriesForUser(petId, user)).dog_memories, r => r.id), [id]);
});
test('actual profile loader rejects returned foreign profile', async () => {
  const api = loaders(database({ dog_profiles: [{ id: otherPet, user_id: user.id }], dog_memories: [] }, { ignoreFilters: true }));
  await assert.rejects(api.loadDogProfileWithMemoriesForUser(petId, user));
});
test('legacy forget retains marker and POST suppresses normalized forgotten text', async () => {
  const rows = { dog_profiles: [{ id: petId, user_id: user.id }], dog_memories: [legacy()] };
  const api = route(database(rows));
  assert.equal((await api.DELETE(request('DELETE', { petId, memoryIds: [id] }))).status, 204);
  assert.equal(rows.dog_memories[0]?.status, 'rejected');
  const res = await api.POST(request('POST', { petId, memories: [{ type: 'preference', confidence: 'high', text: '  PREFERS   salmon food  ' }] }));
  assert.equal((await res.json()).saved.length, 0);
  assert.equal(rows.dog_memories.length, 1);
});
test('POST stored replay cannot advertise a forgotten detail as saved', async () => {
  const db = database({ dog_profiles: [{ id: petId, user_id: user.id }], dog_memories: [legacy({ status: 'rejected' })] });
  const api = route(db, Response.json({ saved: [legacy()], skippedDuplicates: 0 }, { status: 201 }));
  const res = await api.POST(request('POST', { petId, memories: [{ type: 'preference', confidence: 'high', text: 'Prefers salmon food' }] }));
  assert.equal((await res.json()).saved.length, 0);
});


// Runs the actual component functions/callbacks with controlled hook lifetimes.
// This is not a browser renderer; keyed mounting is modeled explicitly below.
function pageHarness({ session } = {}) {
  let params = { id: petId }, appVersion = 0, cursor = 0, states = [], effects = [], cleanup = [], tree, component, props;
  const writes = [], pending = [];
  const react = {
    useState(initial) { const i = cursor++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }]; },
    useRef(initial) { const i = cursor++; return states[i] ||= { current: initial }; },
    useCallback: fn => fn, useMemo: fn => fn(), useEffect(fn) { effects.push(fn); },
  };
  const jsx = (type, props, key) => ({ type, props, key });
  const api = compile(read('app/dogs/[id]/memories/page.tsx'), {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'next/link': { default: 'link' }, 'next/navigation': { useParams: () => params },
    '../../../components/app-page': { AppPage: 'app' }, '../../../components/product-primitives': Object.fromEntries(['EmptyState','LoadingState','Notice','PageHeader','SecondaryButton'].map(k => [k,k])),
    '../../../lib/auth-session': { useRequireConfirmedSupabaseAuth: () => ({ status: 'signedIn', user }) },
    '../../../lib/petwise': { formatPetDisplayName: n => n },
    '../../../lib/navigation/app-data-freshness': { useAppDataVersion: () => appVersion },
    '../../../lib/remembered-details': { buildRememberedDetails: ({ legacy, canonical }) => { const all = [...legacy.map(r => ({ ...r, source: 'legacy' })), ...canonical.map(r => ({ ...r, source: 'canonical' }))]; return { all, pet: all, owner: [] }; } },
    '../../../lib/supabase': {
      loadDogProfileWithMemoriesForUser: async p => ({ id: p, name: p, user_id: user.id }),
      loadCanonicalRememberedDetailsForUser: p => new Promise(resolve => pending.push({ p, resolve })),
      getBrowserSupabase: () => ({ auth: { getSession: () => session || Promise.resolve({ data: { session: { access_token: 'mock', user } } }) } }),
    },
    '../../../lib/security/idempotency/client': { idempotentClientFetch: async (...args) => { writes.push(args); return new Response(null, { status: 204 }); } },
  });
  function render() { cursor = 0; effects = []; tree = component(props); return tree; }
  function mount(p = petId, version = 0) {
    cleanup.forEach(fn => fn?.()); cleanup = []; states = []; params = { id: p }; appVersion = version; component = api.default; props = {};
    const outer = render();
    if (typeof outer.type === 'function') { component = outer.type; props = outer.props; states = []; render(); }
    cleanup = effects.map(fn => fn());
  }
  function nodes(node) { if (!node || typeof node !== 'object') return []; return [node, ...[node.props?.children].flat(Infinity).flatMap(child => nodes(child))]; }
  async function resolve(p, rows = { canonical: [], legacy: [legacy({ dog_profile_id: p })] }) { const item = pending.find(x => x.p === p); pending.splice(pending.indexOf(item), 1); item.resolve(rows); await new Promise(r => setImmediate(r)); render(); }
  function sessionKey(p, version) { params = { id: p }; appVersion = version; return api.default().key; }
  function group() { return nodes(tree).find(n => n.props?.onUpdate && n.props?.memories); }
  return { mountCard(card) { states = []; component = card.type; props = card.props; return render(); }, updateCard(nextProps) { props = nextProps; return render(); }, mount, render, resolve, group, sessionKey, writes, pending, nodes, unmount: () => cleanup.forEach(fn => fn?.()) };
}
test('actual legacy card Forget dispatches a source-aware DELETE', async () => {
  const h = pageHarness(); h.mount(); await h.resolve(petId);
  const g = h.group();
  const list = g.type(g.props).props.children[1];
  const card = list.props.children[0];
  const rendered = card.type(card.props);
  const button = h.nodes(rendered).find(n => n.type === 'button' && n.props.children === 'Forget');
  assert.ok(button, 'eligible legacy detail needs a Forget control');
  button.props.onClick(); await new Promise(r => setImmediate(r));
  assert.equal(h.writes[0]?.[0], '/api/legacy-memories');
  assert.equal(h.writes[0]?.[1].method, 'DELETE');
  assert.deepEqual(JSON.parse(h.writes[0][1].body), { memoryIds: [id], petId });
  await h.resolve(petId);
});
test('old callback after pet switch cannot write a memory', async () => {
  const h = pageHarness(); h.mount(); await h.resolve(petId);
  const old = h.group().props.onUpdate;
  h.mount(otherPet);
  await assert.rejects(old(legacy({ source: 'legacy' }), 'forget'));
  assert.equal(h.writes.length, 0);
  await h.resolve(otherPet);
});


for (const status of ['rejected', 'superseded']) test('POST blocks existing ' + status + ' text without deleting or inserting', async () => {
  const rows = { dog_profiles: [{ id: petId, user_id: user.id }], dog_memories: [legacy({ status })] };
  const db = database(rows);
  const response = await route(db).POST(request('POST', { petId, memories: [{ type: 'preference', confidence: 'high', text: 'PREFERS  salmon food' }] }));
  assert.equal(response.status, 200); assert.equal((await response.json()).saved.length, 0);
  assert.ok(db.calls.every(c => !c.mutation));
});
test('POST allows eligible distinct text and suppresses duplicates within request', async () => {
  const rows = { dog_profiles: [{ id: petId, user_id: user.id }], dog_memories: [] };
  const memory = { type: 'preference', confidence: 'high', text: 'Prefers salmon food' };
  const response = await route(database(rows)).POST(request('POST', { petId, memories: [memory, memory, { ...memory, type: 'status', text: 'active' }] }));
  const body = await response.json(); assert.equal(response.status, 201); assert.equal(body.saved.length, 1); assert.equal(body.skippedDuplicates, 2);
});
test('forget is owner/pet scoped, repeatable, and retains other rows', async () => {
  const rows = { dog_profiles: [{ id: petId, user_id: user.id }], dog_memories: [legacy(), legacy({ id: otherPet, dog_profile_id: otherPet }), legacy({ id: petId, user_id: 'other' })] };
  const api = route(database(rows));
  for (let i = 0; i < 2; i++) assert.equal((await api.DELETE(request('DELETE', { petId, memoryIds: [id, otherPet, petId] }))).status, 204);
  assert.deepEqual(rows.dog_memories.map(r => r.status), ['rejected', 'active', 'active']);
});
for (const method of ['POST', 'DELETE']) test(method + ' fails safely on storage failure', async () => {
  const db = database({ dog_profiles: [{ id: petId, user_id: user.id }], dog_memories: [] }, { error: { message: 'missing status or denied' } });
  const response = await route(db)[method](request(method, { petId, ...(method === 'DELETE' ? { memoryIds: [id] } : { memories: [{ type: 'preference', confidence: 'high', text: 'Prefers salmon food' }] }) }));
  assert.equal(response.status, 503);
});
test('POST unique-conflict recovery excludes inactive, foreign-owner and other-pet rows', async () => {
  const db = database({ dog_profiles: [{ id: petId, user_id: user.id }], dog_memories: [legacy({ status: 'rejected', text: 'Old food', idempotency_key: 'key' }), legacy({ user_id: 'other', idempotency_key: 'key' }), legacy({ dog_profile_id: otherPet, idempotency_key: 'key' })] }, { insertError: { code: '23505' } });
  const res = await route(db).POST(request('POST', { petId, memories: [{ type: 'preference', confidence: 'high', text: 'Prefers salmon food' }] }));
  assert.equal(res.status, 201); assert.equal((await res.json()).saved.length, 0);
});
test('stored POST replay fails closed when current rows cannot be verified', async () => {
  const db = database({ dog_profiles: [{ id: petId, user_id: user.id }] }, { error: { message: 'unavailable' } });
  const res = await route(db, Response.json({ saved: [legacy()] }, { status: 201 })).POST(request('POST', { petId, memories: [] }));
  assert.equal(res.status, 503);
});
test('old initial load resolving after switch never supplies new pet details', async () => {
  const h = pageHarness(); h.mount(); h.mount(otherPet);
  await h.resolve(otherPet); await h.resolve(petId);
  assert.equal(h.group().props.memories[0].dog_profile_id, otherPet);
});
test('in-flight refresh after pet switch cannot replace new pet rows', async () => {
  const h = pageHarness(); h.mount(); await h.resolve(petId);
  const g = h.group(); const updating = g.props.onUpdate(g.props.memories[0], 'forget');
  await new Promise(r => setImmediate(r));
  h.mount(otherPet); await h.resolve(otherPet); await h.resolve(petId); await updating;
  assert.equal(h.group().props.memories[0].dog_profile_id, otherPet);
  assert.equal(JSON.parse(h.writes[0][1].body).petId, petId);
});
test('canonical and legacy colliding IDs keep distinct routes; legacy edit/confirm and unknown IDs are rejected', async () => {
  const h = pageHarness(); h.mount(); await h.resolve(petId, { canonical: [canonical()], legacy: [legacy()] });
  const g = h.group(); const c = g.props.memories.find(m => m.source === 'canonical'); const l = g.props.memories.find(m => m.source === 'legacy');
  for (const action of ['edit', 'confirm']) await assert.rejects(g.props.onUpdate(l, action, 'fish'));
  await assert.rejects(g.props.onUpdate({ ...c, id: otherPet }, 'forget'));
  assert.equal(h.writes.length, 0);
  for (const action of ['edit', 'confirm', 'forget']) {
    const updating = g.props.onUpdate(c, action, action === 'edit' ? 'Prefers trout food' : undefined);
    await new Promise(r => setImmediate(r));
    assert.equal(h.writes.at(-1)[0], '/api/memories/' + id); assert.equal(h.writes.at(-1)[1].method, 'PATCH');
    assert.equal(JSON.parse(h.writes.at(-1)[1].body).action, action);
    await h.resolve(petId); await updating;
  }
});
test('actual wrapper keys change with pet and data version; version refresh starts empty', async () => {
  const h = pageHarness();
  assert.notEqual(h.sessionKey(petId, 0), h.sessionKey(otherPet, 0));
  assert.notEqual(h.sessionKey(petId, 0), h.sessionKey(petId, 1));
  h.mount(); await h.resolve(petId);
  h.mount(petId, 1); assert.equal(h.group(), undefined);
  await h.resolve(petId, { canonical: [], legacy: [] }); assert.equal(h.group(), undefined);
});
test('actual loaders reject expired, malformed-scope and machine rows but retain valid global owner preferences', async () => {
  const owner = canonical({ id: 'owner-pref', subject_type: 'owner', pet_id: null, fact_key: 'preferred_language', fact_value: 'English', source_excerpt: 'I prefer English' });
  const db = database({ furvise_memories: [owner, canonical({ id: 'expired', expires_at: '2000-01-01' }), canonical({ id: 'bad-date', expires_at: 'bad' }), canonical({ subject_type: 'unknown' }), canonical({ subject_type: 'owner' }), canonical({ fact_key: 'status', fact_value: 'active' })], dog_memories: [legacy({ type: 'status', text: 'active' }), legacy({ status: undefined })] }, { ignoreFilters: true });
  const result = await loaders(db).loadCanonicalRememberedDetailsForUser(petId, user);
  assert.deepEqual(Array.from(result.canonical, r => r.id), ['owner-pref']); assert.equal(result.legacy.length, 0);
});
function canonicalRoute(row = canonical(), rpcError = null) {
  const calls = [];
  const db = database({ furvise_memories: row ? [row] : [] });
  db.auth = { getUser: async () => ({ data: { user } }) };
  db.rpc = async (name, args) => { calls.push({ name, args }); return { data: [{ action_status: 'updated', memory_id: id }], error: rpcError }; };
  const api = compile(read('app/api/memories/[id]/route.ts'), {
    '@supabase/supabase-js': { createClient: () => db },
    '../../../lib/security/request': { API_BODY_LIMITS: { standard: 10000 }, RequestBoundaryError: class extends Error {}, hasOnlyKeys: (v, keys) => Object.keys(v).every(k => keys.includes(k)), isUuid: v => v === id, readBoundedJson: r => r.json() },
    '../../../lib/security/logging': { safeErrorForLog: () => ({}) },
    '../../../lib/security/idempotency': { beginIdempotentRateLimitedOperation: async () => ({ operation: { execute: fn => fn() } }) },
    '../../../lib/security/headers/origin-policy': { validateSensitiveRequestOriginResponse: () => null },
    '../../../lib/intelligence/memory-integrity.ts': integrity,
  }, { process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'http://unused.invalid', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'mock' } }, console: { error() {} } });
  return { calls, run: body => api.PATCH(new Request('http://local/api/memories/' + id, { method: 'PATCH', headers: { authorization: 'Bearer mock' }, body: JSON.stringify(body) }), { params: Promise.resolve({ id }) }) };
}
for (const action of ['confirm', 'edit', 'forget']) test('unchanged actual canonical ' + action + ' delegates to lifecycle authority', async () => {
  const h = canonicalRoute(); const response = await h.run({ action, ...(action === 'edit' ? { value: 'Prefers salmon food' } : {}) });
  assert.equal(response.status, 200); assert.equal(h.calls[0].name, 'manage_furvise_memory'); assert.equal(h.calls[0].args.p_memory_id, id); assert.equal(h.calls[0].args.p_action, action);
});
test('unchanged canonical route rejects foreign memory and ineligible correction without RPC', async () => {
  const foreign = canonicalRoute(canonical({ user_id: 'foreign' })); assert.equal((await foreign.run({ action: 'forget' })).status, 404); assert.equal(foreign.calls.length, 0);
  const edit = canonicalRoute(); assert.equal((await edit.run({ action: 'edit', value: 'active' })).status, 422); assert.equal(edit.calls.length, 0);
  const conflict = canonicalRoute(canonical(), { code: '40001', message: 'MEMORY_CONFLICT' }); assert.equal((await conflict.run({ action: 'confirm' })).status, 409);
});
test('actual optional compatibility loader rejects foreign owner/pet and inactive rows', async () => {
  const db = database({ dog_memories: [legacy(), legacy({ user_id: 'other' }), legacy({ dog_profile_id: otherPet }), legacy({ status: 'rejected' })] }, { ignoreFilters: true });
  const source = read('app/lib/supabase.ts');
  const api = compile('export ' + source.slice(source.indexOf('async function loadOptionalDogMemories('), source.indexOf('async function loadOptionalDogProductFeedback(')), { './intelligence/memory-integrity.ts': integrity }, { getBrowserSupabase: () => db });
  assert.equal((await api.loadOptionalDogMemories([petId], user)).length, 1);
});
test('pet switching while session lookup awaits prevents dispatch', async () => {
  let resolveSession;
  const h = pageHarness({ session: new Promise(resolve => { resolveSession = resolve; }) });
  h.mount(); await h.resolve(petId);
  const g = h.group(); const updating = g.props.onUpdate(g.props.memories[0], 'forget');
  const rejected = assert.rejects(updating);
  h.mount(otherPet); assert.equal(h.group(), undefined);
  resolveSession({ data: { session: { access_token: 'mock', user } } });
  await rejected; assert.equal(h.writes.length, 0); await h.resolve(otherPet);
});
for (const countOverride of [null, 2]) test('POST fails closed for unavailable or truncated suppression inventory: ' + countOverride, async () => {
  const db = database({ dog_profiles: [{ id: petId, user_id: user.id }], dog_memories: [] }, { countOverride });
  const res = await route(db).POST(request('POST', { petId, memories: [{ type: 'preference', confidence: 'high', text: 'Prefers salmon food' }] }));
  assert.equal(res.status, 503); assert.ok(db.calls.every(c => c.mutation !== 'insert'));
});

test('review: stored replay only returns receipt IDs even if storage overreturns', async () => {
  const db = database({ dog_profiles: [{ id: petId, user_id: user.id }], dog_memories: [legacy({ id: otherPet })] }, { ignoreFilters: true });
  const res = await route(db, Response.json({ saved: [legacy()], skippedDuplicates: 0 }, { status: 201 })).POST(request('POST', { petId, memories: [] }));
  const body = await res.json();
  assert.deepEqual(body.saved, []);
  assert.equal(body.skippedDuplicates, 1);
});

test('review: malformed persisted receipt fails closed without throwing', async () => {
  const db = database({ dog_profiles: [{ id: petId, user_id: user.id }], dog_memories: [] });
  const res = await route(db, Response.json({ saved: [null] }, { status: 201 })).POST(request('POST', { petId, memories: [] }));
  assert.equal(res.status, 503);
});

test('review: session owner changing before auth render prevents dispatch', async () => {
  const h = pageHarness({ session: Promise.resolve({ data: { session: { access_token: 'mock', user: { id: 'different-owner' } } } }) });
  h.mount(); await h.resolve(petId);
  const g = h.group();
  const updating = g.props.onUpdate(g.props.memories[0], 'forget');
  const rejected = assert.rejects(updating, /sign in again/i);
  await new Promise(r => setImmediate(r));
  // Resolve an erroneously dispatched refresh so the pre-fix failure is an assertion, not a hung test.
  if (h.pending.length) await h.resolve(petId);
  await rejected;
  assert.equal(h.writes.length, 0);
});

test('review: reopening editor after refreshed canonical value uses current value', async () => {
  const h = pageHarness(); h.mount(); await h.resolve(petId, { canonical: [canonical({ editableValue: 'salmon' })], legacy: [] });
  const g = h.group();
  const card = g.type(g.props).props.children[1].props.children[0];
  let tree = h.mountCard(card);
  // React preserves card state when refresh returns the same source and ID.
  tree = h.updateCard({ ...card.props, memory: { ...card.props.memory, editableValue: 'trout' } });
  h.nodes(tree).find(n => n.type === 'button' && n.props.children === 'Edit').props.onClick();
  tree = h.render();
  assert.equal(h.nodes(tree).find(n => n.type === 'input').props.value, 'trout');
});
