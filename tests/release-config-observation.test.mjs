import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { FURVISE_OWNER_ID } from '../app/lib/operations/owner-access.ts';

let auth = { response: Response.json({}, { status: 401 }) };
let networkCalls = 0;
globalThis.__releaseConfigAuth = () => auth;
registerHooks({ resolve(s, c, next) {
  if (s === 'server-only') return { shortCircuit: true, url: 'data:text/javascript,export default {}' };
  if (s.endsWith('/authenticated-api-server')) return { shortCircuit: true, url: 'data:text/javascript,export const getAuthenticatedApiContext=async()=>globalThis.__releaseConfigAuth()' };
  if (s.startsWith('.')) {
    const u = new URL(s, c.parentURL);
    if (existsSync(new URL(u.href + '.ts'))) return next(u.href + '.ts', c);
  }
  return next(s, c);
}});
const { observeReleaseConfiguration } = await import('../app/lib/operations/release-config-observation.ts');
const { GET } = await import('../app/api/admin/release-config/route.ts');
const marker = 'PRIVATE_SYNTHETIC_MARKER_DO_NOT_PUBLISH';
const safe = () => ({
  NODE_ENV: 'production', VERCEL: '1', VERCEL_ENV: 'preview', VERCEL_DEPLOYMENT_ID: 'dpl_Synthetic123456',
  NEXT_PUBLIC_SUPABASE_URL: 'https://synthetic.supabase.co', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: marker,
  SUPABASE_SECRET_KEY: marker, TURNSTILE_SECRET_KEY: marker, NEXT_PUBLIC_TURNSTILE_SITE_KEY: marker,
  UPSTASH_REDIS_REST_URL: 'https://synthetic.invalid', UPSTASH_REDIS_REST_TOKEN: marker,
  FURVISE_RATE_LIMIT_HASH_SECRET: marker, FURVISE_AUTH_RATE_LIMIT_HASH_SECRET: marker,
  FURVISE_OPERATIONS_HASH_SECRET: marker, FURVISE_READINESS_SECRET: marker,
  STRIPE_SECRET_KEY: marker, STRIPE_WEBHOOK_SECRET: marker, STRIPE_PLUS_PRICE_ID: marker,
  OPENAI_API_KEY: marker, FURVISE_AI_DAILY_CALL_LIMIT: '10', FURVISE_AI_DAILY_COST_LIMIT_USD: '1',
});
const request = (query = '') => new Request('https://synthetic.invalid/api/admin/release-config' + query);
const owner = () => ({ user: { id: FURVISE_OWNER_ID }, userId: FURVISE_OWNER_ID });
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { networkCalls++; throw Error(marker); };
test.after(() => { globalThis.fetch = originalFetch; });
async function withEnv(env, fn) {
  const previous = { ...process.env };
  try { for (const k of Object.keys(process.env)) delete process.env[k]; for (const [k, v] of Object.entries(env)) if (v !== undefined) process.env[k] = v; return await fn(); }
  finally { for (const k of Object.keys(process.env)) delete process.env[k]; Object.assign(process.env, previous); }
}
test('authorization precedes observation; anonymous, forged metadata and anonymous owner deny without probes', async () => {
  for (const context of [
    { response: Response.json({}, { status: 401 }) },
    { user: { id: 'foreign', user_metadata: { id: FURVISE_OWNER_ID, role: 'admin' } }, userId: FURVISE_OWNER_ID },
    { user: { id: FURVISE_OWNER_ID, is_anonymous: true }, userId: FURVISE_OWNER_ID },
  ]) {
    auth = context;
    const res = await withEnv({}, () => GET(request()));
    assert.equal(res.status, 'response' in context ? 401 : 404);
    assert.match(res.headers.get('cache-control'), /private.*no-store/);
    assert.doesNotMatch(await res.text(), /checks|platformIdentity/);
  }
  assert.equal(networkCalls, 0);
});
test('safe owner observes actual consumers, never attests unknown bindings or release readiness', async () => {
  auth = owner();
  const res = await withEnv(safe(), () => GET(request()));
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ready, false);
  assert.equal(data.status, 'observed_incomplete');
  for (const [key, value] of Object.entries(data.checks)) assert.equal(value, key !== 'productionCaptureExcluded', key);
  assert.equal(data.platformIdentity.independentlyVerified, false);
  for (const value of Object.values(data.unresolved)) assert.equal(value, 'unknown');
  assert.doesNotMatch(JSON.stringify(data), new RegExp(marker));
  assert.doesNotMatch(JSON.stringify(data), /supabase.co|synthetic.invalid|OPENAI_API_KEY/);
  assert.match(res.headers.get('vary'), /Authorization, Cookie/);
  assert.equal(networkCalls, 0);
});
test('missing or nondeployment environment identity fails closed, including injected identity strings', async () => {
  for (const change of [
    { VERCEL_DEPLOYMENT_ID: undefined }, { VERCEL_DEPLOYMENT_ID: marker },
    { VERCEL: '0' }, { VERCEL_ENV: 'development' }, { NODE_ENV: 'test' },
    { VERCEL_DEPLOYMENT_ID: 'dpl_' + 'x'.repeat(65) },
  ]) {
    const env = { ...safe(), ...change };
    assert.equal(observeReleaseConfiguration(env), null);
    auth = owner();
    const res = await withEnv(env, () => GET(request()));
    assert.equal(res.status, 503);
    assert.doesNotMatch(await res.text(), /checks|platformIdentity|PRIVATE_/);
  }
});
test('disabled Ask, malformed or missing budgets, bypass and raw flags block without public values', async () => {
  for (const [change, failed] of [
    [{ FURVISE_AI_ENABLED: 'false' }, 'askEnabled'],
    [{ FURVISE_AI_ASK_ENABLED: 'false' }, 'askEnabled'],
    [{ FURVISE_AI_DAILY_CALL_LIMIT: undefined }, 'positiveDailyBudgetsConfigured'],
    [{ FURVISE_AI_DAILY_CALL_LIMIT: '0' }, 'positiveDailyBudgetsConfigured'],
    [{ FURVISE_AI_DAILY_COST_LIMIT_USD: '-1' }, 'positiveDailyBudgetsConfigured'],
    [{ FURVISE_AI_DAILY_COST_LIMIT_USD: 'NaN' }, 'positiveDailyBudgetsConfigured'],
    [{ EARLY_ACCESS_FREE_UNLOCKS: 'true' }, 'serverPaywallBypassOff'],
    [{ NEXT_PUBLIC_EARLY_ACCESS_FREE_UNLOCKS: 'true' }, 'serverPaywallBypassOff'],
    [{ FURVISE_PREVIEW_CAPTURE_ENABLED: 'true' }, 'rawCaptureFlagOff'],
    [{ FURVISE_RATE_LIMIT_ENABLED: 'false' }, 'authAbuseEnabled'],
    [{ UPSTASH_REDIS_REST_TOKEN: undefined }, 'authAbuseMaterialConfigured'],
    [{ SUPABASE_SECRET_KEY: undefined }, 'requiredServerMaterialPresent'],
  ]) {
    const env = { ...safe(), ...change };
    const result = observeReleaseConfiguration(env);
    assert.equal(result.checks[failed], false, failed);
    assert.equal(result.status, 'blocked', failed);
    auth = owner();
    const res = await withEnv(env, () => GET(request()));
    assert.equal(res.status, 503, failed);
    assert.doesNotMatch(await res.text(), new RegExp(marker));
  }
});
test('present but wrong backend material remains explicitly unverified', () => {
  const result = observeReleaseConfiguration({ ...safe(), NEXT_PUBLIC_SUPABASE_URL: marker, SUPABASE_SECRET_KEY: marker });
  assert.equal(result.ready, false);
  assert.equal(result.unresolved.authenticatedBackendBinding, 'unknown');
  assert.equal(result.unresolved.schemaAndGrants, 'unknown');
  assert.equal(result.unresolved.atomicAccountingBinding, 'unknown');
});
test('no caller-selected binding; auth exceptions do not serialize payloads', async () => {
  auth = owner();
  assert.equal((await withEnv(safe(), () => GET(request('?deploymentId=dpl_Attacker123')))).status, 400);
  globalThis.__releaseConfigAuth = () => { throw Error(marker); };
  const res = await withEnv(safe(), () => GET(request()));
  assert.equal(res.status, 503); assert.doesNotMatch(await res.text(), new RegExp(marker));
  globalThis.__releaseConfigAuth = () => auth;
});
test('read-only surface imports no persistence/provider/event sink and exposes only GET', () => {
  const route = readFileSync(new URL('../app/api/admin/release-config/route.ts', import.meta.url), 'utf8');
  const helper = readFileSync(new URL('../app/lib/operations/release-config-observation.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(route + helper, /console\.|\.rpc\(|\.from\(|fetch\(|emitOperationalEvent|createOperationsAdminClient|createClient\(|openai|process\.env\s*=/);
  assert.doesNotMatch(route, /export (?:async )?function (?:POST|PUT|PATCH|DELETE)/);
  assert.equal(networkCalls, 0);
});

test('backend attestation uses only the verified principal and fixed intended destination', async () => {
  auth = owner();
  const env = { ...safe(), NEXT_PUBLIC_SUPABASE_URL: 'https://sxavgqzwfahljdvmisyq.supabase.co' };
  const res = await withEnv(env, () => GET(request()));
  const data = await res.json();
  assert.equal(data.backendBinding.status, 'matched');
  assert.equal(data.backendBinding.principalVerifiedByAuthService, true);
  assert.equal(data.backendBinding.deployedRlsAndGrants, 'unknown');
  assert.equal(data.ready, false);
  assert.doesNotMatch(JSON.stringify(data), /supabase.co|bd23dda6|PRIVATE_SYNTHETIC/);
  const wrong = await withEnv({ ...env, NEXT_PUBLIC_SUPABASE_URL: 'https://foreign.supabase.co' }, () => GET(request()));
  assert.equal((await wrong.json()).backendBinding.status, 'unverified');
  assert.equal(networkCalls, 0);
});
