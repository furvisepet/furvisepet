import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { makePlan, buildReceipt, markDispatch, sealReceipt, digest, sourceSnapshot, writeOnce } from '../scripts/audits/ask-live-diagnostic.mjs';

const hash = 'a'.repeat(64), request = '11111111-1111-4111-8111-111111111111', attempt = '22222222-2222-4222-8222-222222222222';
const correlation = { logicalTurnId: request, attemptId: attempt, deploymentId: 'dpl_fixture' };
const plan = () => makePlan({ runId: 'fixture-run', questionSha256: hash,
  source: { head: '1'.repeat(40), manifestSha256: hash, indexSha256: hash, statusSha256: hash, dirty: true },
  deployment: { id: 'dpl_fixture', commit: '2'.repeat(40), origin: 'https://www.furvise.com', target: 'production', state: 'READY' },
  deploymentEvidenceSha256: hash, jobId: 'fixture-job', jobScriptSha256: hash });
const intent = p => ({ runId: p.runId, planSha256: digest(p), questionSha256: p.questionSha256 });
const evidence = () => ({ ...correlation, questionSha256: hash,
  providerEvents: [{ ...correlation, phase: 'interpretation', outcome: 'failed',
    providerError: { status: 400, code: 'invalid_json_schema', type: 'invalid_request_error', param: 'text.format.schema',
      schema: { sha256: hash, rule: 'any_of_first_key_collision', path: '#/$defs/[0]' } }, inputTokens: 11, outputTokens: 0 }],
  response: { ...correlation, httpStatus: 503, code: 'AI_UNAVAILABLE' },
  accounting: { ...correlation, calls: [{ callNumber: 1, state: 'reconciled', reservedMicrodollars: 500, actualMicrodollars: 0 }], providerCallCount: 1, creditState: 'released', settlementState: 'reconciled' } });
const build = e => { const p = plan(); return buildReceipt(p, intent(p), e, digest(e)); };
const budget = () => ({ complete: true, uncertainCalls: 0, unreconciledCalls: 0, evidenceSha256: hash,
  usedMicrodollars: 200, reservedMicrodollars: 0, nextMaximumMicrodollars: 500, capMicrodollars: 1_000_000, authorityExpiresAt: 2000 });

test('joins real-shaped schema rejection, phase, HTTP result, job/source/deployment and accounting without claiming product acceptance', () => {
  const result = build(evidence());
  assert.equal(result.state, 'diagnostic_complete'); assert.equal(result.productAcceptance, 'not_assessed');
  assert.equal(result.response.httpStatus, 503); assert.equal(result.providerEvents[0].providerError.code, 'invalid_json_schema');
  assert.deepEqual(result.schemaFingerprints, [hash]); assert.equal(result.accounting.totalMicrodollars, 0);
  assert.equal(result.source.head, '1'.repeat(40)); assert.equal(result.deployment.commit, '2'.repeat(40));
  assert.equal(result.localIsDeployed, false); assert.equal(result.job.scriptSha256, hash);
});
test('does not promote a clean local HEAD with a different deployed commit to production evidence', () => {
  const p = plan(); p.source.dirty = false; const rebuilt = makePlan({ ...p, jobId: p.job.id, jobScriptSha256: p.job.scriptSha256 });
  assert.equal(rebuilt.localIsDeployed, false);
});
test('strips raw body, message, tokens, schema literals and private response text from receipt', () => {
  const e = evidence(), marker = 'PRIVATE_EMAIL_AND_CREDENTIAL';
  Object.assign(e.providerEvents[0].providerError, { message: marker, stack: marker, headers: { authorization: marker }, body: marker });
  e.providerEvents[0].providerError.schema.enum = [marker]; e.response.answer = marker; e.accounting.access_token = marker;
  assert.ok(!JSON.stringify(build(e)).includes(marker));
});
test('rejects mixed attempts, logical turns and deployments in every evidence stream', () => {
  for (const stream of ['providerEvents', 'response', 'accounting']) for (const key of ['logicalTurnId', 'attemptId', 'deploymentId']) {
    const e = evidence(); (stream === 'providerEvents' ? e[stream][0] : e[stream])[key] = 'wrong';
    assert.throws(() => build(e), /cross-request/);
  }
});
test('refuses wrong prompt and deployment and a mismatched immutable intent', () => {
  for (const key of ['questionSha256', 'deploymentId']) { const e = evidence(); e[key] = 'wrong'; assert.throws(() => build(e), /wrong deployment or question/); }
  const p = plan(); assert.throws(() => buildReceipt(p, { ...intent(p), planSha256: 'b'.repeat(64) }, evidence(), hash), /dispatch\/plan/);
});
test('cost uncertainty is null rather than zero and blocks diagnostic completion', () => {
  for (const state of ['uncertain', 'pending']) {
    const e = evidence(); e.accounting.calls[0].state = state; e.accounting.calls[0].actualMicrodollars = 0;
    const r = build(e); assert.equal(r.accounting.totalMicrodollars, null); assert.equal(r.state, 'diagnostic_incomplete_no_retry');
    assert.ok(r.missing.includes('provider_cost_unresolved'));
  }
});
test('credit pending/conflict stays incomplete independently of provider cost', () => {
  for (const state of ['pending', 'conflict', 'unknown']) { const e = evidence(); e.accounting.settlementState = state; const r = build(e); assert.ok(r.missing.includes('credit_settlement_unresolved')); }
  for (const state of ['completion_pending', 'release_pending', 'unknown']) { const e = evidence(); e.accounting.creditState = state; assert.ok(build(e).missing.includes('credit_disposition_unresolved')); }
});
test('preserves original live authority with no expiry without renewing separate recovery authority', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ask-diagnostic-no-expiry-'));
  try { assert.equal(markDispatch(dir, plan(), { ...budget(), authorityExpiresAt: null }, 3000).at, '1970-01-01T00:00:03.000Z'); }
  finally { rmSync(dir, { recursive: true, force: true }); }
});
test('deployment metadata is allowlisted and cannot copy private creator or credential data', () => {
  const p = plan(); p.deployment.creator = 'PRIVATE';
  const clean = makePlan({ ...p, jobId: p.job.id, jobScriptSha256: p.job.scriptSha256 });
  assert.ok(!JSON.stringify(clean).includes('PRIVATE'));
});
test('missing schema fingerprint and phase cannot become a passing live diagnostic', () => {
  const e = evidence(); delete e.providerEvents[0].providerError.schema; assert.ok(build(e).missing.includes('schema_fingerprint_not_observed'));
  e.providerEvents = []; const r = build(e); assert.ok(r.missing.includes('execution_phase_not_observed')); assert.notEqual(r.state, 'diagnostic_complete');
});
test('rejects missing/duplicate/negative accounting, no guessed totals', () => {
  let e = evidence(); e.accounting.providerCallCount = 2; assert.throws(() => build(e), /missing accounting/);
  e = evidence(); e.accounting.calls.push({ ...e.accounting.calls[0] }); assert.throws(() => build(e), /duplicate/);
  e = evidence(); e.accounting.calls[0].actualMicrodollars = -1; assert.throws(() => build(e), /cost required/);
});
test('refuses invalid provider phase/status schema and bounds imported diagnostics', () => {
  let e = evidence(); e.providerEvents[0].phase = 'private-user-message'; assert.throws(() => build(e), /phase/);
  e = evidence(); e.providerEvents[0].providerError.schema.path = '#/private@example.com'; assert.throws(() => build(e), /sanitized schema/);
  e = evidence(); e.providerEvents = Array.from({ length: 21 }, () => e.providerEvents[0]); assert.throws(() => build(e), /event bound/);
  e = evidence(); e.response.httpStatus = 0; assert.throws(() => build(e), /HTTP status/);
});
test('live dispatch gate refuses unresolved accounting, expired authority, raised ceiling and overspend without creating fences', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ask-diagnostic-budget-'));
  try {
    for (const patch of [{ complete: false }, { uncertainCalls: 1 }, { unreconciledCalls: 1 }, { authorityExpiresAt: 500 }, { capMicrodollars: 5_000_000 }, { usedMicrodollars: 999_999 }]) {
      assert.throws(() => markDispatch(dir, plan(), { ...budget(), ...patch }, 1000));
      assert.equal(existsSync(join(dir, 'fixture-run', 'dispatch.intent.json')), false);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('one-shot intent and consumed prompt survive duplicate or renamed attempts', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ask-diagnostic-fence-'));
  try {
    const first = markDispatch(dir, plan(), budget(), 1000); const file = join(dir, 'fixture-run', 'dispatch.intent.json'); const bytes = readFileSync(file);
    assert.throws(() => markDispatch(dir, plan(), budget(), 1001), /existing dispatch/);
    const p = plan(); p.runId = 'renamed-run'; assert.throws(() => markDispatch(dir, p, budget(), 1001), /consumed question/);
    assert.deepEqual(readFileSync(file), bytes); assert.equal(first.at, '1970-01-01T00:00:01.000Z');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('partial prompt fence after crash blocks any further dispatch', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ask-diagnostic-partial-'));
  try { writeOnce(join(dir, 'consumed-prompts', hash + '.json'), { interrupted: true }); assert.throws(() => markDispatch(dir, plan(), budget(), 1000), /consumed/); }
  finally { rmSync(dir, { recursive: true, force: true }); }
});
test('sealed result cannot be overwritten and malformed run IDs cannot escape the evidence root', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ask-diagnostic-seal-'));
  try { const p = plan(); sealReceipt(dir, p, intent(p), evidence(), hash); assert.throws(() => sealReceipt(dir, p, intent(p), evidence(), hash), /EEXIST/);
    p.runId = '../escape'; assert.throws(() => markDispatch(dir, p, budget(), 1000), /invalid run/); }
  finally { rmSync(dir, { recursive: true, force: true }); }
});
test('source manifests include dirty/untracked files and deletion; unchanged HEAD does not hide changed source', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ask-diagnostic-source-'));
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], { stdio: 'pipe' });
  try {
    git('init'); writeFileSync(join(dir, 'code.txt'), 'one'); git('add', 'code.txt');
    git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-m', 'fixture');
    const before = sourceSnapshot(dir); writeFileSync(join(dir, 'code.txt'), 'two'); writeFileSync(join(dir, 'new.txt'), 'three');
    const after = sourceSnapshot(dir); assert.equal(after.head, before.head); assert.notEqual(after.manifestSha256, before.manifestSha256); assert.equal(after.dirty, true);
    rmSync(join(dir, 'code.txt')); assert.equal(sourceSnapshot(dir).files.find(x => x.path === 'code.txt').sha256, null);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('unknown production identity, code pins or tampered plan are refused', () => {
  const p = plan(); assert.throws(() => makePlan({ ...p, jobId: p.job.id, jobScriptSha256: 'wrong' }), /hash/);
  p.effects.retries = 1; assert.throws(() => buildReceipt(p, intent(p), evidence(), hash), /plan shape/);
});
test('receipt tooling has no provider/browser/admin/credential or network dispatch implementation', () => {
  const code = readFileSync(new URL('../scripts/audits/ask-live-diagnostic.mjs', import.meta.url), 'utf8');
  assert.ok(!/\bfetch\s*\(|responses\.create|createClient\(|loadEnvFile|process\.env/.test(code));
});
