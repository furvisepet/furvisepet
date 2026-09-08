import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { readAskProfiles, classifyAskDatabaseFailure } from '../app/lib/ask-profile-read.ts';

const owner = '11111111-1111-4111-8111-111111111111';
const pet = '22222222-2222-4222-8222-222222222222';
function exercise(fetch, options = {}, all = false) {
  const client = createClient('https://database.invalid', 'test-key', { global: { fetch }, auth: { persistSession: false } });
  return readAskProfiles(signal => {
    let q = client.from('dog_profiles').select('*').eq('user_id', owner).neq('lifecycle_status', 'archived').retry(false).abortSignal(signal);
    if (!all) q = q.eq('id', pet);
    return q;
  }, { backoffMs: 0, ...options });
}
const ok = () => Response.json([{ id: pet, user_id: owner }]);

test('real SDK recovers a connection reset without multiplying retries or changing authority', async () => {
  const urls = [];
  const result = await exercise(async url => {
    urls.push(String(url));
    if (urls.length === 1) throw new TypeError('fetch failed', { cause: Object.assign(new Error('private data'), { code: 'ECONNRESET' }) });
    return ok();
  });
  assert.equal(urls.length, 2);
  assert.equal(urls[0], urls[1]);
  const u = new URL(urls[1]);
  assert.equal(u.searchParams.get('user_id'), `eq.${owner}`);
  assert.equal(u.searchParams.get('id'), `eq.${pet}`);
  assert.equal(u.searchParams.get('lifecycle_status'), 'neq.archived');
  assert.equal(result.data[0].id, pet);
  assert.equal(result.diagnostic.firstFailure, 'network');
  assert.equal(result.diagnostic.networkCode, 'ECONNRESET');
  assert.equal(result.diagnostic.recovered, true);
  assert.doesNotMatch(JSON.stringify(result.diagnostic), /private|11111111|22222222|fetch failed/);
});

for (const status of [502, 503, 504, 520, 522, 524]) test(`gateway ${status} recovers through real SDK`, async () => {
  let calls = 0;
  const r = await exercise(async () => ++calls === 1 ? new Response('gateway unavailable', { status }) : ok());
  assert.equal(calls, 2); assert.equal(r.error, null); assert.equal(r.diagnostic.firstFailure, 'gateway');
});

for (const [status, code] of [[401,''],[403,'42501'],[400,'42703'],[500,'57014'],[400,'PGRST100']]) test(`does not retry authorization/schema/SQL error ${status}/${code}`, async () => {
  let calls = 0;
  const r = await exercise(async () => { calls++; return Response.json({ message: 'sensitive SQL', code, details: '', hint: '' }, { status }); });
  assert.equal(calls, 1); assert.ok(r.error); assert.equal(r.data, null);
});

test('persistent connection failure stops after exactly three SDK fetches', async () => {
  let calls = 0;
  const r = await exercise(async () => { calls++; throw new TypeError('fetch failed'); });
  assert.equal(calls, 3); assert.equal(r.diagnostic.attempts, 3); assert.equal(r.diagnostic.failureClass, 'network');
});

test('empty owned result is final, never retried or substituted', async () => {
  let calls = 0;
  const r = await exercise(async () => { calls++; return Response.json([]); });
  assert.equal(calls, 1); assert.deepEqual(r.data, []);
});

test('all-pets read still retains the owner and archive filters', async () => {
  await exercise(async url => {
    const u = new URL(url);
    assert.equal(u.searchParams.get('user_id'), `eq.${owner}`);
    assert.equal(u.searchParams.get('lifecycle_status'), 'neq.archived');
    assert.equal(u.searchParams.has('id'), false);
    return ok();
  }, {}, true);
});

test('a hung fetch is cancelled by the shared bounded deadline', async () => {
  const started = Date.now(); let calls = 0;
  const r = await exercise((_url, init) => new Promise((_resolve, reject) => {
    calls++;
    const fail = () => reject(init.signal.reason);
    init.signal.addEventListener('abort', fail, { once: true });
    if (init.signal.aborted) fail();
  }), { budgetMs: 70, attemptMs: 40 });
  assert.ok(calls <= 3); assert.equal(r.diagnostic.failureClass, 'timeout');
  assert.ok(Date.now() - started < 500); assert.equal(r.data, null);
});

test('caller cancellation stops retries and cannot accept late success', async () => {
  const controller = new AbortController(); let calls = 0;
  const r = await exercise(async () => { calls++; controller.abort(); return ok(); }, { signal: controller.signal });
  assert.equal(calls, 1); assert.equal(r.data, null); assert.equal(r.diagnostic.failureClass, 'cancelled');
});

test('unknown errors are not guessed to be transient', () => {
  assert.equal(classifyAskDatabaseFailure({message:'unexpected'}, 0), 'unknown');
  assert.equal(classifyAskDatabaseFailure({code:'42501'},503), 'authorization');
});
