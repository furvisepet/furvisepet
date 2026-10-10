// Receipt tooling only. Never opens a browser, reads credentials or calls a provider.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, lstatSync, existsSync } from 'node:fs';
import { resolve, relative, sep, dirname, isAbsolute } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { safeAskProviderErrorDiagnostic } from '../../app/lib/ai/ask-provider-error-diagnostic.ts';

const SHA = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const ID = /^[a-zA-Z0-9_-]{1,100}$/;
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const phases = new Set(['configuration', 'interpretation', 'primary', 'fallback', 'repair', 'verification']);
const rules = new Set(['any_of_first_key_collision', 'additional_properties_false_required', 'required_properties_mismatch', 'unsupported_schema_keyword', 'unrecognized']);
const micro = value => Number.isSafeInteger(value) && value >= 0;
export const digest = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const need = (ok, reason) => { if (!ok) throw Error(reason); };
export function loadJson(path) {
  need(lstatSync(path).isFile() && !lstatSync(path).isSymbolicLink(), 'regular evidence file required');
  const raw = readFileSync(path); need(raw.length <= 2_000_000, 'evidence exceeds bound');
  return { value: JSON.parse(raw.toString('utf8')), sha256: digest(raw) };
}
export function writeOnce(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  for (let parent = resolve(dirname(path));;) {
    need(!lstatSync(parent).isSymbolicLink(), 'evidence directory link refused');
    const next = dirname(parent); if (next === parent) break; parent = next;
  }
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
}
export function sourceSnapshot(root) {
  root = resolve(root);
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { timeout: 30_000, maxBuffer: 8_000_000 });
  const head = git('rev-parse', 'HEAD').toString().trim(); need(COMMIT.test(head), 'invalid source HEAD');
  const paths = [...new Set(git('ls-files', '-co', '--exclude-standard', '-z').toString().split('\0').filter(Boolean))].sort();
  const files = paths.map(path => {
    const absolute = resolve(root, path), rel = relative(root, absolute);
    need(rel && !rel.startsWith('..' + sep) && rel !== '..', 'source path escaped root');
    need(!/(^|\/)\.env(?!\.example$)/.test(path.replaceAll('\\', '/')), 'secret-bearing source file refused');
    if (!existsSync(absolute)) return { path, sha256: null };
    const stat = lstatSync(absolute); need(stat.isFile() && !stat.isSymbolicLink(), 'source links or non-files refused');
    return { path, sha256: digest(readFileSync(absolute)) };
  });
  const gitDir = git('rev-parse', '--absolute-git-dir').toString().trim();
  return { head, files, manifestSha256: digest(files), indexSha256: digest(readFileSync(resolve(gitDir, 'index'))), statusSha256: digest(git('status', '--porcelain=v1', '-uall')), dirty: git('status', '--porcelain=v1', '-uall').length > 0 };
}
export function makePlan({ runId, questionSha256, source, deployment, deploymentEvidenceSha256, jobId, jobScriptSha256 }) {
  need(ID.test(runId) && ID.test(jobId), 'invalid run/job ID');
  need([questionSha256, source.manifestSha256, source.indexSha256, source.statusSha256, deploymentEvidenceSha256, jobScriptSha256].every(x => SHA.test(x)), 'missing source/evidence hash');
  need(COMMIT.test(source.head) && COMMIT.test(deployment.commit), 'missing commit identity');
  need(typeof source.dirty === 'boolean', 'source dirty state required');
  need(/^dpl_[a-zA-Z0-9]+$/.test(deployment.id) && deployment.target === 'production' && deployment.origin === 'https://www.furvise.com' && deployment.state === 'READY', 'unverified production target');
  const target = { id: deployment.id, commit: deployment.commit, origin: deployment.origin, target: deployment.target, state: deployment.state };
  return { schema: 'FurviseAskDiagnosticPlan.v1', runId, questionSha256, source: { head: source.head, manifestSha256: source.manifestSha256, indexSha256: source.indexSha256, statusSha256: source.statusSha256, dirty: source.dirty }, deployment: target, deploymentEvidenceSha256, job: { id: jobId, scriptSha256: jobScriptSha256 }, localIsDeployed: !source.dirty && source.head === deployment.commit, effects: { automaticRequests: 0, retries: 0, adminAccess: 0 } };
}
function validatePlan(plan) {
  const rebuilt = makePlan({ ...plan, jobId: plan.job?.id, jobScriptSha256: plan.job?.scriptSha256 });
  need(digest(plan) === digest(rebuilt), 'frozen plan shape changed');
}
export function checkBudget(budget, now = Date.now()) {
  need(budget.complete === true && budget.uncertainCalls === 0 && budget.unreconciledCalls === 0, 'cumulative accounting unresolved; no live submission');
  need(SHA.test(budget.evidenceSha256), 'accounting evidence pin required');
  need(micro(budget.usedMicrodollars) && micro(budget.reservedMicrodollars) && micro(budget.nextMaximumMicrodollars) && budget.nextMaximumMicrodollars > 0, 'invalid budget amounts');
  // This workflow cannot renew or raise the original live authorization.
  need(micro(budget.capMicrodollars) && budget.capMicrodollars <= 1_000_000 && budget.capMicrodollars > 0, 'original live ceiling exceeded');
  // Null means the reviewed original live authorization specified no expiry.
  // A recovery-policy expiry is separate and must never be renewed here.
  need(budget.authorityExpiresAt === null || Number.isFinite(budget.authorityExpiresAt) && now < budget.authorityExpiresAt, 'live authorization expired');
  need(budget.usedMicrodollars + budget.reservedMicrodollars + budget.nextMaximumMicrodollars <= budget.capMicrodollars, 'live budget exhausted');
  return digest(budget);
}
export function markDispatch(directory, plan, budget, now = Date.now()) {
  validatePlan(plan);
  const budgetSha256 = checkBudget(budget, now);
  need(!existsSync(resolve(directory, plan.runId, 'dispatch.intent.json')), 'existing dispatch intent; never replay');
  need(!existsSync(resolve(directory, 'consumed-prompts', plan.questionSha256 + '.json')), 'consumed question; never reuse');
  const intent = { schema: 'FurviseAskDiagnosticIntent.v1', runId: plan.runId, planSha256: digest(plan), questionSha256: plan.questionSha256, budgetSha256, at: new Date(now).toISOString(), noReplay: true };
  // A crash between either fence and the UI click remains blocked, never retried.
  writeOnce(resolve(directory, 'consumed-prompts', plan.questionSha256 + '.json'), intent);
  writeOnce(resolve(directory, plan.runId, 'dispatch.intent.json'), intent);
  return intent;
}
function schemaProjection(value) {
  if (!value || !SHA.test(value.sha256)) return null;
  need(rules.has(value.rule) && (value.path === null || typeof value.path === 'string' && value.path.length <= 512 && /^#(?:\/(?:properties|\$defs|anyOf|items|\[[0-9]+\]|[0-9]+))*$/.test(value.path)), 'invalid sanitized schema diagnostic');
  // Imported server evidence is pinned data, not recreated WeakMap provenance.
  return { sha256: value.sha256, rule: value.rule, path: value.path };
}
export function reconcileCalls(calls) {
  const seen = new Set(); let total = 0, complete = true;
  const records = calls.map(call => {
    need(Number.isSafeInteger(call.callNumber) && call.callNumber > 0 && !seen.has(call.callNumber), 'duplicate/invalid provider call'); seen.add(call.callNumber);
    need(micro(call.reservedMicrodollars), 'invalid reservation');
    need(['reconciled', 'uncertain', 'pending'].includes(call.state), 'invalid call accounting state');
    if (call.state === 'reconciled') { need(micro(call.actualMicrodollars), 'reconciled cost required'); total += call.actualMicrodollars; need(micro(total), 'accounting overflow'); }
    else complete = false;
    return { callNumber: call.callNumber, reservedMicrodollars: call.reservedMicrodollars, actualMicrodollars: call.state === 'reconciled' ? call.actualMicrodollars : null, state: call.state };
  });
  return { calls: records, complete, knownMicrodollars: total, totalMicrodollars: complete ? total : null };
}
export function buildReceipt(plan, intent, evidence, evidenceSha256) {
  validatePlan(plan);
  need(intent.planSha256 === digest(plan) && intent.runId === plan.runId && intent.questionSha256 === plan.questionSha256, 'dispatch/plan mismatch');
  need(SHA.test(evidenceSha256), 'evidence pin required');
  need(UUID.test(evidence.logicalTurnId) && UUID.test(evidence.attemptId), 'actual request/attempt IDs required');
  need(evidence.deploymentId === plan.deployment.id && evidence.questionSha256 === plan.questionSha256, 'wrong deployment or question');
  const correlated = record => {
    need(record.logicalTurnId === evidence.logicalTurnId && record.attemptId === evidence.attemptId && record.deploymentId === evidence.deploymentId, 'cross-request evidence refused');
  };
  need(Array.isArray(evidence.providerEvents) && evidence.providerEvents.length <= 20, 'provider event bound');
  const events = evidence.providerEvents.map(event => {
    correlated(event); need(phases.has(event.phase) && ['started', 'succeeded', 'failed'].includes(event.outcome), 'invalid provider phase/outcome');
    const safe = safeAskProviderErrorDiagnostic(event.providerError);
    return { phase: event.phase, outcome: event.outcome, providerStatus: safe.status, providerError: { ...safe, ...(schemaProjection(event.providerError?.schema) ? { schema: schemaProjection(event.providerError.schema) } : {}) }, inputTokens: micro(event.inputTokens) ? event.inputTokens : null, outputTokens: micro(event.outputTokens) ? event.outputTokens : null };
  });
  correlated(evidence.response); need(Number.isInteger(evidence.response.httpStatus) && evidence.response.httpStatus >= 100 && evidence.response.httpStatus <= 599, 'actual HTTP status required');
  correlated(evidence.accounting); need(Array.isArray(evidence.accounting.calls) && evidence.accounting.calls.length <= 10, 'accounting call bound');
  const accounting = reconcileCalls(evidence.accounting.calls);
  need(['completed', 'released', 'not_required', 'completion_pending', 'release_pending', 'unknown'].includes(evidence.accounting.creditState), 'invalid credit state');
  need(['reconciled', 'pending', 'conflict', 'unknown'].includes(evidence.accounting.settlementState), 'invalid settlement state');
  need(Number.isSafeInteger(evidence.accounting.providerCallCount) && evidence.accounting.providerCallCount >= 0 && evidence.accounting.providerCallCount <= 10, 'provider call count required');
  need(accounting.calls.length === evidence.accounting.providerCallCount, 'missing accounting calls');
  const schemaFingerprints = [...new Set(events.flatMap(event => event.providerError.schema ? [event.providerError.schema.sha256] : []))];
  const missing = [];
  if (!schemaFingerprints.length && evidence.accounting.providerCallCount > 0) missing.push('schema_fingerprint_not_observed');
  if (!accounting.complete) missing.push('provider_cost_unresolved');
  if (evidence.accounting.settlementState !== 'reconciled') missing.push('credit_settlement_unresolved');
  if (!['completed', 'released', 'not_required'].includes(evidence.accounting.creditState)) missing.push('credit_disposition_unresolved');
  if (events.length === 0 && evidence.accounting.providerCallCount > 0) missing.push('execution_phase_not_observed');
  return { schema: 'FurviseAskDiagnosticReceipt.v1', runId: plan.runId, planSha256: digest(plan), intentSha256: digest(intent), evidenceSha256, source: plan.source, deployment: plan.deployment, deploymentEvidenceSha256: plan.deploymentEvidenceSha256, job: plan.job, localIsDeployed: plan.localIsDeployed, logicalTurnId: evidence.logicalTurnId, attemptId: evidence.attemptId, questionSha256: plan.questionSha256, providerEvents: events, schemaFingerprints, response: { httpStatus: evidence.response.httpStatus, code: /^[A-Z0-9_]{1,96}$/.test(evidence.response.code || '') ? evidence.response.code : null }, accounting: { ...accounting, providerCallCount: evidence.accounting.providerCallCount, creditState: evidence.accounting.creditState, settlementState: evidence.accounting.settlementState }, missing, state: missing.length ? 'diagnostic_incomplete_no_retry' : 'diagnostic_complete', productAcceptance: 'not_assessed', noReplay: true };
}
export function sealReceipt(directory, plan, intent, evidence, evidenceSha256) {
  const receipt = buildReceipt(plan, intent, evidence, evidenceSha256);
  writeOnce(resolve(directory, plan.runId, 'diagnostic.receipt.json'), receipt);
  return receipt;
}
function main(args) {
  const [command, directory, inputPath, expectedSha256] = args;
  need(['prepare', 'mark-dispatched', 'collect'].includes(command) && directory && inputPath && SHA.test(expectedSha256), 'usage: node scripts/audits/ask-live-diagnostic.mjs prepare|mark-dispatched|collect OUT INPUT INPUT_SHA256');
  const outputRelative = relative(process.cwd(), resolve(directory));
  need(outputRelative === '..' || outputRelative.startsWith('..' + sep) || isAbsolute(outputRelative), 'evidence output must be outside the source checkout');
  const input = loadJson(inputPath); need(input.sha256 === expectedSha256, 'input pin changed');
  if (command === 'prepare') {
    const snapshot = sourceSnapshot(process.cwd());
    const plan = makePlan({ ...input.value, source: snapshot });
    writeOnce(resolve(directory, plan.runId, 'source-manifest.json'), snapshot);
    writeOnce(resolve(directory, plan.runId, 'plan.json'), plan);
    console.log(JSON.stringify({ state: 'prepared_not_dispatched', planSha256: digest(plan), manifestSha256: snapshot.manifestSha256, localIsDeployed: plan.localIsDeployed }));
    return;
  }
  const { planPath, planFileSha256 } = input.value;
  const loaded = loadJson(planPath); need(loaded.sha256 === planFileSha256, 'frozen plan changed'); const plan = loaded.value;
  if (command === 'mark-dispatched') {
    const current = sourceSnapshot(process.cwd()); need(current.manifestSha256 === plan.source.manifestSha256 && current.indexSha256 === plan.source.indexSha256 && current.head === plan.source.head, 'source changed since preparation');
    console.log(JSON.stringify(markDispatch(directory, plan, input.value.budget))); return;
  }
  const intent = loadJson(resolve(directory, plan.runId, 'dispatch.intent.json')).value;
  const receipt = sealReceipt(directory, plan, intent, input.value.evidence, digest(input.value.evidence));
  console.log(JSON.stringify({ state: receipt.state, missing: receipt.missing, receiptSha256: digest(receipt), providerCostMicrodollars: receipt.accounting.totalMicrodollars }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
