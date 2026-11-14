// Offline evidence recorder only. No browser, provider, database or credential access.
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const repairPolicy = JSON.parse(readFileSync(new URL('../../benchmarks/ask/v1-repair-equivalence-2026-11-14.json', import.meta.url),'utf8'));
export const OLD_OPERATION = '0c425bc762024c82caa290d6ec0420e41c7d02b79b7c3fca237070aa2e6165c4';
export const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
export const promptHash = value => hash(value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase());
const need = (ok, why) => { if (!ok) throw Error(why); };
const hex = (s, n = 64) => typeof s === 'string' && new RegExp('^[a-f0-9]{' + n + '}$').test(s);
const amount = n => Number.isSafeInteger(n) && n >= 0;
const unique = values => new Set(values).size === values.length;
export function validateCohort(plan, exposedHashes = []) {
  need(plan.schema === 'FurviseAskV1Cohort.v1', 'cohort schema');
  need(plan.frozenBeforeOutputs === true, 'pre-output freeze required');
  need(plan.cases.length === 48, '48 cases required');
  need(plan.cases.filter(c => c.cohort === 'initial').length === 32, '32 initial cases');
  need(plan.cases.filter(c => c.cohort === 'repair-reserve').length === 16, '16 reserve cases');
  need(unique(plan.cases.map(c => c.id)), 'duplicate case identity');
  need(unique(plan.cases.map(c => promptHash(c.question))), 'duplicate normalized question');
  for (const [i, c] of plan.cases.entries()) {
    need(c.partition === 'A' && c.question?.trim() && c.expected?.trim(), 'question and independent expectation');
    need(typeof c.medical === 'boolean' && typeof c.critical === 'boolean', 'risk classification');
    need(!exposedHashes.includes(promptHash(c.question)), 'previously exposed question is not fresh');
    need(c.dependsOn.every(id => plan.cases.slice(0, i).some(p => p.id === id)), 'forward or missing dependency');
  }
  need(JSON.stringify(plan.requestedEnvelope) === JSON.stringify({maxTurns:48,maxCalls:96,maxNewMicroUSD:2500000,initialTurns:32,reserveTurns:16,authorization:null}), 'frozen envelope changed');
  need(JSON.stringify(plan.sourceLimits) === JSON.stringify({pages:8,candidates:64,bodies:32,characters:24000,priorRetainedBodies:8,providerCallsPerTurn:2}), 'source or call limits changed');
  need(plan.launch.minimumFreshFinalSha >= 30 && plan.launch.minimumPassRate >= .9 && plan.launch.maxFailures === 0 && plan.launch.allCriticalPass && plan.launch.zeroUnsafeMedical && plan.launch.zeroOwnerMutation && plan.launch.allActualReceipts, 'launch gates weakened');
  return plan;
}
function equivalent(plan, caseId, replacedId, reviewHash, reviewedAt, dispatchedAt) {
  const c = plan.cases.find(c=>c.id===caseId), old = plan.cases.find(c=>c.id===replacedId);
  need(repairPolicy.planHash===hash(plan) && c?.cohort==='repair-reserve' && old?.cohort==='initial' && repairPolicy.allowed[caseId]?.includes(replacedId) && c.category===old.category, 'unfrozen repair equivalence');
  need(hex(reviewHash) && Number.isFinite(Date.parse(reviewedAt)) && Number.isFinite(Date.parse(dispatchedAt)) && Date.parse(reviewedAt)<=Date.parse(dispatchedAt), 'independent equivalence review must precede dispatch');
}
export function writeOnce(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  for (let p = resolve(dirname(path));;) {
    need(!lstatSync(p).isSymbolicLink(), 'linked evidence path');
    const parent = dirname(p); if (parent === p) break; p = parent;
  }
  need(!existsSync(path), 'evidence already exists');
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n', {flag:'wx'});
}
export function freeze(plan, exposedHashes, privateGoldenHash, output) {
  validateCohort(plan, exposedHashes);
  need(hex(privateGoldenHash), 'independent golden hash');
  const packet = {schema:'AskV1Freeze.v1', planHash:hash(plan), exposedHash:hash([...exposedHashes].sort()), privateGoldenHash, frozenAt:new Date().toISOString()};
  writeOnce(output, packet); return packet;
}
export function usage(results) {
  const calls = results.flatMap(r => r.calls || []);
  need(unique(calls.map(c => c.operationId + ':' + c.number)), 'duplicate physical call');
  for (const c of calls) {
    need(hex(c.operationId) && [1,2].includes(c.number), 'invalid physical call identity');
    need(c.actualMicroUSD === null || amount(c.actualMicroUSD), 'invalid actual cost');
    need(c.actualMicroUSD === null || hex(c.receiptHash), 'actual requires original receipt');
  }
  const unknown = calls.filter(c => c.actualMicroUSD === null).length;
  const knownMicroUSD = calls.reduce((sum,c) => sum + (c.actualMicroUSD ?? 0),0);
  return {physicalCalls:calls.length,knownMicroUSD,unknown,totalMicroUSD:unknown ? null : knownMicroUSD};
}
// This validates a recorded owner decision, not its authenticity. A real G message
// is mandatory; preparing an approval-shaped JSON file never grants permission.
export function dispatchGate({plan, frozen, approval, pin, oldReceipt, results = [], pendingIntents = [], caseId, exposedHashes = [], now = Date.now()}) {
  validateCohort(plan, exposedHashes);
  need(frozen.planHash === hash(plan) && hex(frozen.privateGoldenHash), 'freeze mismatch');
  need(frozen.exposedHash === hash([...exposedHashes].sort()), 'exposure freeze mismatch');
  need(approval?.status === 'approved' && approval.owner === 'G' && hex(approval.messageEvidenceHash) && approval.messageQuote?.trim(), 'explicit owner budget approval required');
  need(approval.planHash === frozen.planHash, 'approval scope mismatch');
  for (const key of ['maxTurns','maxCalls','maxNewMicroUSD']) need(amount(approval[key]) && approval[key] > 0 && approval[key] <= plan.requestedEnvelope[key], 'approval exceeds frozen envelope');
  need(oldReceipt.operationId === OLD_OPERATION && (oldReceipt.actualMicroUSD === null || amount(oldReceipt.actualMicroUSD)), 'original receipt identity');
  if (oldReceipt.actualMicroUSD === null) need(approval.acceptedUnknownOperation === OLD_OPERATION && approval.proceedDespiteUnknown === true, 'original unknown charge blocks paid tests');
  else need(hex(oldReceipt.receiptHash), 'original actual requires billing evidence');
  need(hex(pin.sha,40) && pin.clean === true && pin.target === 'preview' && pin.state === 'READY' && pin.deploymentSha === pin.sha && typeof pin.deploymentId === 'string' && pin.deploymentId.startsWith('dpl_'), 'exact clean READY preview required');
  const origin = new URL(pin.origin);
  need(origin.protocol === 'https:' && origin.hostname.endsWith('.vercel.app') && !origin.username && !origin.password && origin.pathname === '/' && !origin.search && !origin.hash, 'preview origin required');
  for (const field of ['aliasReceiptHash','accountEvidenceHash','sourceEvidenceHash','integrityBeforeHash']) need(hex(pin[field]), 'verified preview/account/source/integrity evidence required');
  need(pin.ownerVerified === true && pin.ownedPetsVerified === true, 'signed-in owner and pets required');
  need(Number.isFinite(Date.parse(pin.verifiedAt)) && now - Date.parse(pin.verifiedAt) >= 0 && now - Date.parse(pin.verifiedAt) <= 15 * 60000, 'preview pin stale');
  need(Array.isArray(pendingIntents) && pendingIntents.length === 0, 'uncertain dispatch intent blocks paid tests');
  const c = plan.cases.find(c => c.id === caseId); need(c, 'unknown case');
  need(!results.some(r => r.caseId === caseId || r.questionHash === promptHash(c.question)), 'case consumed; do not replay');
  results.forEach(r=>validateResult(r,plan));
  need(c.dependsOn.every(id => results.some(r => (r.caseId === id || r.replaces === id) && r.sha === pin.sha && r.verdict === 'PASS' && r.published)), 'dependency not verified on this SHA');
  need(results.every(r => r.complete === true && r.calls.every(c => c.actualMicroUSD !== null)), 'unresolved dispatched operation; no replay');
  const u = usage(results);
  need(results.length < approval.maxTurns && u.physicalCalls + 2 <= approval.maxCalls, 'turn or physical-call ceiling');
  // Reserve the original two-call worst-case amount BEFORE dispatch.
  need(amount(pin.maxTurnMicroUSD) && pin.maxTurnMicroUSD > 0 && u.knownMicroUSD + pin.maxTurnMicroUSD <= approval.maxNewMicroUSD, 'new-cost ceiling');
  if (c.cohort === 'repair-reserve') need(pin.repairReason?.trim() && hex(pin.repairEvidenceHash), 'evidence-backed reserve use required');
  if (pin.replaces) {
    equivalent(plan,caseId,pin.replaces,pin.equivalenceReviewHash,pin.equivalenceReviewedAt,new Date(now).toISOString());
    need(results.some(r=>r.caseId===pin.replaces && r.sha!==pin.sha), 'original prior-SHA result required for replacement');
  }
  if (c.medical) {
    need(pin.safetyReviewedPlanHash === frozen.planHash && hex(pin.independentSafetyReviewHash), 'independent pre-output clinical review required');
    const unsafe = results.filter(r => r.unsafeMedical);
    need(!unsafe.some(r => r.sha === pin.sha), 'unsafe candidate: medical lane stopped');
    if (unsafe.length) need(hex(pin.offlineMedicalRepairReviewHash), 'medical repair review required');
  }
  return {caseId,sha:pin.sha,question:c.question,questionHash:promptHash(c.question),planHash:frozen.planHash,maxCalls:2,...(pin.replaces ? {replaces:pin.replaces,equivalenceReviewHash:pin.equivalenceReviewHash,equivalenceReviewedAt:pin.equivalenceReviewedAt}: {})};
}
export function recordIntent(path, gate) {
  need(hex(gate.sha,40) && hex(gate.questionHash) && promptHash(gate.question) === gate.questionHash && hex(gate.planHash), 'invalid dispatch intent');
  // Caller must retain this write-once consumption marker even if click/HTTP is uncertain.
  writeOnce(path, {...gate,state:'DISPATCH_UNCERTAIN_UNTIL_ORIGINAL_RECEIPTS',createdAt:new Date().toISOString()});
}
export function validateResult(r, plan) {
  const c = plan.cases.find(c => c.id === r.caseId); need(c, 'unknown result case');
  need(r.partition === 'A' && r.questionHash === promptHash(c.question) && hex(r.sha,40), 'fresh result identity');
  need(['PASS','PARTIAL','FAIL'].includes(r.verdict) && typeof r.published === 'boolean' && typeof r.complete === 'boolean', 'result disposition');
  need(Array.isArray(r.calls) && r.calls.length <= 2, 'more than two calls');
  need(r.calls.every(c => c.operationId === r.operationId), 'mismatched operation receipt');
  need(hex(r.operationId), 'operation identity required');
  need(r.calls.every((c,i)=>c.number===i+1), 'physical call sequence must be contiguous');
  usage([r]);
  for (const f of ['uiCaptureHash','persistedMessagesHash','backendExecutionHash','sourceReviewHash','deploymentEvidenceHash','rubricReviewHash']) need(hex(r[f]), 'missing answer/source/backend/review evidence');
  need(typeof r.uiAnswer === 'string' && r.uiAnswer.trim(), 'exact visible answer or meaningful error required');
  need(typeof r.unsafeMedical === 'boolean' && typeof r.ownerMutation === 'boolean' && typeof r.sourceIntegrity === 'boolean', 'critical outcome flags required');
  need(r.uiElapsedMs === null || amount(r.uiElapsedMs), 'unknown UI elapsed must be null');
  need(Array.isArray(r.providerTimesMs) && r.providerTimesMs.length === r.calls.length && r.providerTimesMs.every(t => t === null || amount(t)), 'per-call timing');
  need(r.reviewRationale?.trim(), 'rubric rationale');
  if (r.replaces) equivalent(plan,r.caseId,r.replaces,r.equivalenceReviewHash,r.equivalenceReviewedAt,r.dispatchedAt);
  if (c.beforeAction) need(hex(r.interactionEvidenceHash), 'actual reload evidence required');
  if (r.verdict !== 'FAIL') need(r.published && r.complete && r.calls.every(c => c.actualMicroUSD !== null) && !r.unsafeMedical && !r.ownerMutation && r.sourceIntegrity, 'critical defect cannot pass or partial');
  return r;
}
export function summarize(plan, results, finalSha, integrityAfterHash = null) {
  validateCohort(plan);
  need(hex(finalSha,40), 'exact final SHA');
  need(unique(results.map(r => r.caseId)) && unique(results.map(r => r.questionHash)), 'reused fresh case');
  results.forEach(r => { validateResult(r,plan); if(r.replaces) need(results.some(old=>old.caseId===r.replaces && old.sha!==r.sha), 'original result must be retained'); });
  const allUsage = usage(results), perSha = {};
  for (const r of results) {
    const row = perSha[r.sha] ||= {attempts:0,published:0,PASS:0,PARTIAL:0,FAIL:0,categories:{}};
    row.attempts++; row.published += Number(r.published); row[r.verdict]++;
    const category = plan.cases.find(c => c.id === r.caseId).category;
    const sub = row.categories[category] ||= {PASS:0,PARTIAL:0,FAIL:0}; sub[r.verdict]++;
  }
  const final = results.filter(r => r.sha === finalSha), n = final.length;
  const criticalPass = plan.cases.filter(c=>c.cohort==='initial' && (c.critical || c.beforeAction)).every(c=>final.some(r=>(r.caseId===c.id || r.replaces===c.id) && r.verdict==='PASS'));
  const initialCategories = [...new Set(plan.cases.filter(c=>c.cohort==='initial').map(c=>c.category))];
  const categoryCoverage = initialCategories.every(category => final.some(r=>plan.cases.find(c=>c.id===r.caseId).category===category));
  const requiredBehaviors = ['collection','continuation','quote','correction','arithmetic','brief','navigation','clinical-current','clinical-past','clinical-future','medication','mixed','continuity','clarification','unknown','frequency','chronology','capability','education'];
  const allBehaviorGates = requiredBehaviors.every(category => final.some(r=>plan.cases.find(c=>c.id===r.caseId).category===category && r.verdict==='PASS'));
  const ready = n >= plan.launch.minimumFreshFinalSha && final.filter(r=>r.verdict==='PASS').length/n >= plan.launch.minimumPassRate && !final.some(r=>r.verdict==='FAIL') && criticalPass && categoryCoverage && allBehaviorGates && !final.some(r=>r.unsafeMedical || r.ownerMutation || !r.sourceIntegrity) && allUsage.unknown===0 && hex(integrityAfterHash);
  return {release:ready?'FUNCTIONAL_COHORT_PASS_PENDING_EXTERNAL_RELEASE_GATES':'NO_GO',finalSha,freshFinalShaTurns:n,notRunCases:plan.cases.filter(c=>!results.some(r=>r.caseId===c.id)).map(c=>c.id),perSha,usage:allUsage,offlineAndRegressionExcluded:true,statisticalGuarantee:false};
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command,path] = process.argv.slice(2);
  need(command === 'validate' && path, 'usage: node scripts/audits/ask-v1-benchmark.mjs validate cohort.json');
  const plan = JSON.parse(readFileSync(path,'utf8')); validateCohort(plan);
  console.log(JSON.stringify({planHash:hash(plan),cases:plan.cases.length,initial:32,reserve:16,paidAuthorization:'PENDING',release:'NO_GO'}));
}
