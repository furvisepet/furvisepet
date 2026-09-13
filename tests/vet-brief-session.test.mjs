import test from 'node:test';
import assert from 'node:assert/strict';
import { vetBriefSessionToken } from '../app/lib/vet-brief/session.ts';
const session = (token, seconds, owner = 'owner') => ({ access_token: token, expires_at: Date.now() / 1000 + seconds, user: { id: owner } });
const result = value => ({ data: { session: value }, error: null });

test('long generation refreshes a token that would expire inside its execution window', async () => {
  let refreshes = 0;
  const auth = { getSession: async () => result(session('old', 120)), refreshSession: async () => { refreshes++; return result(session('fresh', 3600)); } };
  assert.equal(await vetBriefSessionToken(auth, 60), 'old');
  assert.equal(await vetBriefSessionToken(auth, 360), 'fresh');
  assert.equal(refreshes, 1);
});

test('refresh never changes account or accepts a missing, failed, or short-lived session', async () => {
  for (const value of [null, session('other', 3600, 'other'), session('short', 10)]) {
    await assert.rejects(vetBriefSessionToken({ getSession: async () => result(session('old', 10)), refreshSession: async () => result(value) }, 360), /sign in again/i);
  }
  await assert.rejects(vetBriefSessionToken(null, 360), /sign in again/i);
  await assert.rejects(vetBriefSessionToken({ getSession: async () => result(session('old', 10)), refreshSession: async () => ({ ...result(session('fresh', 3600)), error: new Error('offline') }) }, 360), /sign in again/i);
});
