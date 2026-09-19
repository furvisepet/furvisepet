/* Browser-only fixture: real React, page, projection, loaders and mutation client. */
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
const h = React.createElement;
const pet = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const id = '33333333-3333-4333-8333-333333333333';
let user = { id: 'owner' }, selected = pet, version = 0, rows, holdAuth = false, holdFetch = false, holdLoad = false;
let authPending = [], fetchPending = [], loadPending = [];
const writes = [], checks = [], errors = [];
window.addEventListener('error', e => errors.push(e.message));
window.addEventListener('unhandledrejection', e => errors.push(String(e.reason)));
const now = new Date().toISOString();
const canonical = (extra = {}) => ({ id, user_id: 'owner', pet_id: pet, subject_type: 'pet', status: 'active', category: 'preference', fact_key: 'food_preference', fact_value: 'salmon', source_excerpt: 'Prefers salmon food', confidence: .95, durability: 'stable', freshness_class: 'medium_lived', last_confirmed_at: now, created_at: now, expires_at: null, ...extra });
const legacy = (extra = {}) => ({ id, user_id: 'owner', dog_profile_id: pet, status: 'active', type: 'preference', text: 'Enjoys rope toys', confidence: 'high', created_at: now, ...extra });
const db = {
  auth: { getSession: () => holdAuth ? new Promise(r => authPending.push(r)) : Promise.resolve({ data: { session: { access_token: 'synthetic-only', user } } }) },
  from(table) {
    const filters = []; let single = false;
    const q = {
      select() { return q; }, eq(k, v) { filters.push([k, v]); return q; }, or() { return q; }, order() { return q; },
      single() { single = true; return run(); }, returns() { return run(); },
    };
    function run() {
      // Intentionally overreturn memory rows to exercise production defensive filters.
      const data = table === 'dog_profiles' ? rows[table].filter(r => filters.every(([k, v]) => r[k] === v))[0] : rows[table];
      const result = { data: structuredClone(data), error: single && !data ? { message: 'Profile unavailable' } : null };
      return holdLoad ? new Promise(r => loadPending.push(() => r(result))) : Promise.resolve(result);
    }
    return q;
  },
};
const wrapper = ({ children }) => h('div', null, children);
window.fixture = { db, mocks: {
  link: { default: ({ children, href }) => h('a', { href }, children) },
  navigation: { useParams: () => ({ id: selected }) },
  auth: { useRequireConfirmedSupabaseAuth: () => ({ status: 'signedIn', user }) },
  freshness: { useAppDataVersion: () => version },
  petwise: { formatPetDisplayName: n => n },
  ui: { AppPage: wrapper, Notice: wrapper, PageHeader: ({ title }) => h('h1', null, title), LoadingState: ({ label }) => h('p', null, label), EmptyState: ({ title }) => h('p', null, title), SecondaryButton: wrapper },
} };
window.fetch = async (url, init) => {
  if (!/^\/api\/(memories\/|legacy-memories$)/.test(url)) throw Error('Unexpected fixture request: ' + url);
  const body = JSON.parse(init.body);
  writes.push({ url, method: init.method, body, key: new Headers(init.headers).get('Idempotency-Key') });
  if (holdFetch) await new Promise(r => fetchPending.push(r));
  if (init.method === 'DELETE') rows.dog_memories.find(r => r.id === body.memoryIds[0] && r.dog_profile_id === body.petId).status = 'rejected';
  else { const row = rows.furvise_memories.find(r => url.endsWith(r.id)); if (body.action === 'forget') row.status = 'rejected'; else if (body.action === 'edit') row.fact_value = body.value; }
  return new Response(null, { status: 204 });
};
import Page from '../../app/pets/[id]/memories/page.tsx';
const root = createRoot(document.getElementById('root'));
const render = () => flushSync(() => root.render(h(React.StrictMode, null, h(Page))));
const wait = async (condition, label) => { for (let i = 0; i < 200; i++) { if (condition()) return; await new Promise(r => setTimeout(r, 10)); } throw Error('Timeout: ' + label + '\n' + document.body.innerText); };
const cards = () => [...document.querySelectorAll('li')];
const card = text => cards().find(c => c.textContent.includes(text));
const button = (container, text) => [...container.querySelectorAll('button')].find(b => b.textContent === text);
function click(container, text) { const b = button(container, text); if (!b || b.disabled) throw Error('Unavailable button ' + text); b.click(); }
function assert(value, label) { if (!value) throw Error(label); checks.push(label); }
async function reset() {
  holdAuth = holdFetch = holdLoad = false; selected = pet; user = { id: 'owner' }; version++;
  rows = { dog_profiles: [{ id: pet, user_id: 'owner', name: 'Milo' }, { id: other, user_id: 'owner', name: 'Luna' }, { id: other, user_id: 'other-owner', name: 'Nova' }], furvise_memories: [canonical(), canonical({ id: 'other', pet_id: other, fact_value: 'turkey' }), canonical({ id: 'foreign', user_id: 'other-owner', pet_id: other, fact_value: 'duck' }), canonical({ id: 'rejected', status: 'rejected', fact_value: 'secret' })], dog_memories: [legacy()] };
  render(); await wait(() => cards().length === 2, 'two scoped cards');
}
async function run() {
  await reset();
  assert(!!card('salmon') && !!card('rope') && !card('turkey') && !card('secret'), 'Actual loaders/projection filter other pets, accounts and rejected rows');
  assert(!button(card('rope'), 'Edit'), 'Legacy card exposes Forget only');
  click(card('rope'), 'Forget'); await wait(() => !card('rope'), 'legacy forgotten');
  assert(writes.at(-1).url === '/api/legacy-memories' && writes.at(-1).method === 'DELETE' && writes.at(-1).body.petId === pet && writes.at(-1).body.memoryIds[0] === id, 'Legacy Forget captures selected pet and storage ID');
  assert(!!card('salmon'), 'Colliding canonical ID remains after legacy Forget');
  click(card('salmon'), 'Forget'); await wait(() => cards().length === 0, 'canonical forgotten');
  assert(writes.at(-1).url === '/api/memories/' + id && writes.at(-1).method === 'PATCH' && writes.at(-1).body.action === 'forget' && !!writes.at(-1).key, 'Canonical Forget routes PATCH with real idempotency header');
  await reset();
  click(card('salmon'), 'Edit'); await wait(() => document.querySelector('input'), 'editor');
  const input = document.querySelector('input');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'chicken'); input.dispatchEvent(new Event('input', { bubbles: true }));
  await wait(() => input.value === 'chicken', 'typed correction');
  click(input.closest('li'), 'Save'); await wait(() => !!card('chicken') && !document.querySelector('input'), 'correction refresh');
  click(card('chicken'), 'Edit'); await wait(() => document.querySelector('input'), 'reopen');
  assert(document.querySelector('input').value === 'chicken', 'Mounted card reopens corrected value after same-key props refresh');
  await reset(); holdAuth = true; const count = writes.length;
  click(card('rope'), 'Forget'); await wait(() => authPending.length === 1, 'delayed auth');
  selected = other; render(); await wait(() => !!card('turkey'), 'pet switch');
  authPending.splice(0).forEach(r => r({ data: { session: { access_token: 'synthetic-only', user } } }));
  await new Promise(r => setTimeout(r, 50));
  assert(writes.length === count && !!card('turkey') && !card('salmon'), 'Pet switch while auth pending prevents stale dispatch under real unmount');
  await reset(); holdAuth = true; click(card('rope'), 'Forget'); await wait(() => authPending.length === 1, 'account auth');
  authPending.splice(0).forEach(r => r({ data: { session: { access_token: 'synthetic-other', user: { id: 'other-owner' } } } }));
  await wait(() => !!document.querySelector('[role=alert]'), 'principal mismatch');
  assert(writes.length === count, 'Changed session principal before auth UI remount prevents dispatch');
  await reset(); holdFetch = true; click(card('rope'), 'Forget'); await wait(() => fetchPending.length === 1, 'delayed fetch');
  selected = other; user = { id: 'other-owner' }; render(); await wait(() => !!card('duck'), 'account switch');
  fetchPending.splice(0).forEach(r => r()); await new Promise(r => setTimeout(r, 50));
  assert(!!card('duck') && !card('salmon') && !document.body.textContent.includes('Detail forgotten'), 'Dispatched old-account fetch completion cannot refresh new-account DOM');
  await reset(); holdLoad = true; version++; render(); await wait(() => loadPending.length >= 4, 'delayed loaders');
  holdLoad = false; selected = other; render(); await wait(() => !!card('turkey'), 'new pet loaded');
  loadPending.splice(0).forEach(r => r()); await new Promise(r => setTimeout(r, 50));
  assert(!!card('turkey') && !card('salmon'), 'Old loader completion cannot replace newly mounted pet');
  assert(errors.length === 0, 'No uncaught browser errors or unhandled rejections');
  root.unmount();
  window.acceptanceResult = { status: 'passed', checks, writes };
}
run().catch(error => { window.acceptanceResult = { status: 'failed', checks, error: error.stack, errors }; });
