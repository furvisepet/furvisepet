import assert from 'node:assert/strict';
import test from 'node:test';
import { observeAuthenticatedBackendBinding } from '../app/lib/operations/authenticated-backend-binding.ts';
import { FURVISE_OWNER_ID } from '../app/lib/operations/owner-access.ts';

const owner = { id: FURVISE_OWNER_ID, is_anonymous: false };
const marker = 'SYNTHETIC_PRIVATE_KEY_MUST_NEVER_APPEAR';
const safe = () => ({
  NEXT_PUBLIC_SUPABASE_URL: 'https://sxavgqzwfahljdvmisyq.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: marker,
});
test('auth destination and verified principal produce only bounded semantic evidence', () => {
  for (const suffix of ['', '/', '/rest/v1', '/rest/v1/']) {
    const result = observeAuthenticatedBackendBinding(owner, owner.id,
      { ...safe(), NEXT_PUBLIC_SUPABASE_URL: safe().NEXT_PUBLIC_SUPABASE_URL + suffix });
    assert.equal(result.status, 'matched');
    assert.equal(result.principalVerifiedByAuthService, true);
    assert.equal(result.deployedRlsAndGrants, 'unknown');
    assert.equal(result.atomicAccounting, 'unknown');
    assert.equal(result.independentlyVerifiedDeployment, false);
    assert.doesNotMatch(JSON.stringify(result), /supabase\.co|SYNTHETIC_PRIVATE|bd23dda6/);
  }
});
test('wrong, injected, malformed and missing destinations cannot attest a match', () => {
  for (const url of [undefined, '', 'http://sxavgqzwfahljdvmisyq.supabase.co',
    'https://foreign.supabase.co', 'https://sxavgqzwfahljdvmisyq.supabase.co.evil.invalid',
    'https://sxavgqzwfahljdvmisyq.supabase.co@evil.invalid',
    'https://user:pass@sxavgqzwfahljdvmisyq.supabase.co',
    'https://sxavgqzwfahljdvmisyq.supabase.co/?override=1',
    'https://sxavgqzwfahljdvmisyq.supabase.co/#fragment',
    'https://sxavgqzwfahljdvmisyq.supabase.co/auth/v1',
    ' https://sxavgqzwfahljdvmisyq.supabase.co', marker]) {
    const result = observeAuthenticatedBackendBinding(owner, owner.id, { ...safe(), NEXT_PUBLIC_SUPABASE_URL: url });
    assert.equal(result.status, 'unverified');
    assert.equal(result.serverAuthDestinationMatchesIntendedProject, false);
    assert.doesNotMatch(JSON.stringify(result), /SYNTHETIC_PRIVATE|user:pass|override/);
  }
});
test('material presence never overrides missing, foreign, anonymous or inconsistent principals', () => {
  for (const [user, userId] of [
    [null, undefined], [{ id: 'foreign', user_metadata: { role: 'owner', id: owner.id } }, owner.id],
    [{ ...owner, is_anonymous: true }, owner.id], [owner, 'foreign'], [owner, undefined],
  ]) {
    const result = observeAuthenticatedBackendBinding(user, userId, safe());
    assert.equal(result.status, 'unverified');
    assert.equal(result.principalVerifiedByAuthService, false);
  }
  assert.equal(observeAuthenticatedBackendBinding(owner, owner.id,
    { ...safe(), NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '' }).status, 'unverified');
});
