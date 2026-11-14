// Offline evidence recorder only. No browser, provider, database or credential access.
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const repairPolicy = JSON.parse(readFileSync(new URL('../../benchmarks/ask/v1-repair-equivalence-2026-11-14.json', import.meta.url),'utf8'));
const repairPool = JSON.parse(readFileSync(new URL('../../benchmarks/ask/v1-owner-repair-pool-2026-11-13.json', import.meta.url),'utf8'));
const extensionRequest = JSON.parse(readFileSync(new URL('../../benchmarks/ask/v1-session-extension-request-2026-11-14.json', import.meta.url),'utf8'));
const finalExtensionRequest = JSON.parse(readFileSync(new URL('../../benchmarks/ask/v1-final-cohort-extension-request-2026-11-14.json', import.meta.url),'utf8'));
export const OLD_OPERATION = '0c425bc762024c82caa290d6ec0420e41c7d02b79b7c3fca237070aa2e6165c4';
export const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
export const promptHash = value => hash(value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase());
const need = (ok, why) => { if (!ok) throw Error(why); };
const hex = (s, n = 64) => typeof s === 'string' && new RegExp('^[a-f0-9]{' + n + '}$').test(s);
const amount = n => Number.isSafeInteger(n) && n >= 0;
const unique = values => new Set(values).size === values.length;
export function benchmarkCases(plan) {
  if (repairPool.rootPlanHash !== hash(plan)) return plan.cases;
  need(repairPool.beforeAdditionalCaseOutputs === true && hex(repairPool.originalFailureEvidenceSha256) && Number.isFinite(Date.parse(repairPool.frozenAt)), 'repair supplement provenance');
  need(repairPool.paidLimitsUnchanged.turns===48 && repairPool.paidLimitsUnchanged.physicalCalls===96 && repairPool.paidLimitsUnchanged.newMicroUSD===2500000 && repairPool.paidLimitsUnchanged.maximumReserveDispatches===16, 'repair supplement cannot raise caps');
  need(repairPool.cases.length<=57 && repairPool.cases.every(c=>c.cohort==='repair-reserve' && c.releaseReasonRequired===true), 'bounded repair candidate pool');
  return [...plan.cases,...repairPool.cases];
}
export function validateCohort(plan, exposedHashes = []) {
  need(plan.schema === 'FurviseAskV1Cohort.v1', 'cohort schema');
  need(plan.frozenBeforeOutputs === true, 'pre-output freeze required');
  need(plan.cases.length === 48, '48 cases required');
  need(plan.cases.filter(c => c.cohort === 'initial').length === 32, '32 initial cases');
  need(plan.cases.filter(c => c.cohort === 'repair-reserve').length === 16, '16 reserve cases');
  const candidates=benchmarkCases(plan);
  need(unique(candidates.map(c => c.id)), 'duplicate case identity');
  need(unique(candidates.map(c => promptHash(c.question))), 'duplicate normalized question');
  for (const [i, c] of candidates.entries()) {
    need(c.partition === 'A' && c.question?.trim() && c.expected?.trim(), 'question and independent expectation');
    need(typeof c.medical === 'boolean' && typeof c.critical === 'boolean', 'risk classification');
    need(!exposedHashes.includes(promptHash(c.question)), 'previously exposed question is not fresh');
    need(c.dependsOn.every(id => candidates.slice(0, i).some(p => p.id === id)), 'forward or missing dependency');
  }
  need(JSON.stringify(plan.requestedEnvelope) === JSON.stringify({maxTurns:48,maxCalls:96,maxNewMicroUSD:2500000,initialTurns:32,reserveTurns:16,authorization:null}), 'frozen envelope changed');
  need(JSON.stringify(plan.sourceLimits) === JSON.stringify({pages:8,candidates:64,bodies:32,characters:24000,priorRetainedBodies:8,providerCallsPerTurn:2}), 'source or call limits changed');
  need(plan.launch.minimumFreshFinalSha >= 30 && plan.launch.minimumPassRate >= .9 && plan.launch.maxFailures === 0 && plan.launch.allCriticalPass && plan.launch.zeroUnsafeMedical && plan.launch.zeroOwnerMutation && plan.launch.allActualReceipts, 'launch gates weakened');
  return plan;
}
function equivalent(plan, caseId, replacedId, reviewHash, reviewedAt, dispatchedAt) {
  const c = benchmarkCases(plan).find(c=>c.id===caseId), old = benchmarkCases(plan).find(c=>c.id===replacedId);
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
  // Preparing a finite extension does not grant it. The old G decision cannot
  // be reused: a distinct new owner message must bind this exact request. The
  // original cohort/launch criteria and USD ceiling stay frozen; any extra calls\n  // need this distinct explicit owner decision.
  let limits={maxTurns:approval.maxTurns,maxCalls:approval.maxCalls,maxNewMicroUSD:approval.maxNewMicroUSD,maximumReserveDispatches:16};
  const extension=approval.sessionExtension;
  if(extension){
    need(extensionRequest.schema==='AskV1SessionExtensionRequest.v1' && extensionRequest.status==='requested_not_authorized' &&
      extensionRequest.planHash===frozen.planHash && extensionRequest.maxTurns===72 && extensionRequest.maxCalls===144 &&
      extensionRequest.maxNewMicroUSD===2500000 && extensionRequest.maximumReserveDispatches===40, 'bounded extension request mismatch');
    need(approval.maxTurns===48 && approval.maxCalls===96 && approval.maxNewMicroUSD===2500000 &&
      extension.schema==='AskV1SessionExtensionApproval.v1' && extension.status==='approved' && extension.owner==='G' &&
      extension.planHash===frozen.planHash && extension.originalApprovalEvidenceHash===approval.messageEvidenceHash &&
      extension.requestHash===hash(extensionRequest) && hex(extension.messageEvidenceHash) &&
      extension.messageEvidenceHash!==approval.messageEvidenceHash && extension.messageQuote?.trim() &&
      Number.isFinite(Date.parse(extension.approvedAt)) && Date.parse(extension.approvedAt)<=now, 'new explicit owner extension decision required');
    for(const field of ['maxTurns','maxCalls','maxNewMicroUSD','maximumReserveDispatches'])
      need(extension[field]===extensionRequest[field], 'extension exceeds requested finite limits');
    limits={maxTurns:extension.maxTurns,maxCalls:extension.maxCalls,maxNewMicroUSD:extension.maxNewMicroUSD,maximumReserveDispatches:extension.maximumReserveDispatches};
  }
  // A prepared final-cohort request cannot renew the72-turn decision.
  // Only a third, distinct actual G decision chained to the approved extension
  // may unlock its exact finite90/180/58 limits; dollars never increase.
  const finalExtension=approval.finalCohortExtension;
  if(finalExtension){
    need(extension && finalExtensionRequest.schema==='AskV1FinalCohortExtensionRequest.v1' &&
      finalExtensionRequest.status==='requested_not_authorized' && finalExtensionRequest.planHash===frozen.planHash &&
      finalExtensionRequest.parentRequestHash===hash(extensionRequest) && finalExtensionRequest.maxTurns===90 &&
      finalExtensionRequest.maxCalls===180 && finalExtensionRequest.maximumReserveDispatches===58 &&
      finalExtensionRequest.maxNewMicroUSD===2500000, 'bounded final-cohort request mismatch');
    need(finalExtension.schema==='AskV1FinalCohortExtensionApproval.v1' && finalExtension.status==='approved' &&
      finalExtension.owner==='G' && finalExtension.planHash===frozen.planHash &&
      finalExtension.parentApprovalEvidenceHash===extension.messageEvidenceHash &&
      finalExtension.requestHash===hash(finalExtensionRequest) && hex(finalExtension.messageEvidenceHash) &&
      ![approval.messageEvidenceHash,extension.messageEvidenceHash].includes(finalExtension.messageEvidenceHash) &&
      finalExtension.messageQuote?.trim() && Number.isFinite(Date.parse(finalExtension.approvedAt)) &&
      Date.parse(finalExtension.approvedAt)<=now, 'distinct final-cohort owner decision required');
    for(const field of ['maxTurns','maxCalls','maxNewMicroUSD','maximumReserveDispatches'])
      need(finalExtension[field]===finalExtensionRequest[field], 'final-cohort approval exceeds proposed limits');
    limits={maxTurns:finalExtension.maxTurns,maxCalls:finalExtension.maxCalls,maxNewMicroUSD:finalExtension.maxNewMicroUSD,maximumReserveDispatches:finalExtension.maximumReserveDispatches};
  }
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
  const c = benchmarkCases(plan).find(c => c.id === caseId); need(c, 'unknown case');
  need(!results.some(r => r.caseId === caseId || r.questionHash === promptHash(c.question)), 'case consumed; do not replay');
  results.forEach(r=>validateResult(r,plan));
  need(c.dependsOn.every(id => results.some(r => (r.caseId === id || r.replaces === id) && r.sha === pin.sha && r.verdict === 'PASS' && r.published)), 'dependency not verified on this SHA');
  need(results.every(r => r.complete === true && r.calls.every(c => c.actualMicroUSD !== null)), 'unresolved dispatched operation; no replay');
  const u = usage(results);
  need(results.length < limits.maxTurns && u.physicalCalls + 2 <= limits.maxCalls, 'turn or physical-call ceiling');
  // Reserve the original two-call worst-case amount BEFORE dispatch.
  need(amount(pin.maxTurnMicroUSD) && pin.maxTurnMicroUSD > 0 && u.knownMicroUSD + pin.maxTurnMicroUSD <= limits.maxNewMicroUSD, 'new-cost ceiling');
  if (c.cohort === 'repair-reserve') {
    need(results.filter(r=>benchmarkCases(plan).find(c=>c.id===r.caseId)?.cohort==='repair-reserve').length<limits.maximumReserveDispatches, 'reserve dispatch ceiling');
    need(pin.repairReason?.trim() && hex(pin.repairEvidenceHash), 'evidence-backed reserve use required');
  }
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
  return {caseId,sha:pin.sha,question:c.question,...(finalExtension?{finalCohortExtensionEvidenceHash:finalExtension.messageEvidenceHash,finalCohortExtensionRequestHash:hash(finalExtensionRequest)}:{}),questionHash:promptHash(c.question),planHash:frozen.planHash,maxCalls:2,...(extension?{sessionExtensionEvidenceHash:extension.messageEvidenceHash,sessionExtensionRequestHash:hash(extensionRequest)}:{}),...(pin.replaces ? {replaces:pin.replaces,equivalenceReviewHash:pin.equivalenceReviewHash,equivalenceReviewedAt:pin.equivalenceReviewedAt}: {})};
}
export function recordIntent(path, gate) {
  need(hex(gate.sha,40) && hex(gate.questionHash) && promptHash(gate.question) === gate.questionHash && hex(gate.planHash), 'invalid dispatch intent');
  // Caller must retain this write-once consumption marker even if click/HTTP is uncertain.
  writeOnce(path, {...gate,state:'DISPATCH_UNCERTAIN_UNTIL_ORIGINAL_RECEIPTS',createdAt:new Date().toISOString()});
}
export function validateResult(r, plan) {
  const c = benchmarkCases(plan).find(c => c.id === r.caseId); need(c, 'unknown result case');
  need(r.partition === 'A' && r.questionHash === promptHash(c.question) && hex(r.sha,40), 'fresh result identity');
  need(['PASS','PARTIAL','FAIL'].includes(r.verdict) && typeof r.published === 'boolean' && typeof r.complete === 'boolean', 'result disposition');
  need(Array.isArray(r.calls) && r.calls.length <= 2, 'more than two calls');
  need(r.calls.every(c => c.operationId === r.operationId), 'mismatched operation receipt');
  if (r.calls.length === 0) {
    // A deterministic operational event is not a provider receipt. Require its
    // original zero-execution evidence; terminal status alone cannot erase a call.
    const z = r.zeroProviderExecution;
    const uuid = s => typeof s === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(s);
    need(z?.schema === 'AskZeroProviderExecution.v1' && z.operationKind === 'operational_event' &&
      z.routeType === 'emergency' && z.executionMode === 'deterministic' && z.providerCallCount === 0 &&
      uuid(r.operationId) && uuid(r.requestId) && z.logicalOperationId === r.operationId &&
      z.requestId === r.requestId && hex(z.terminalEvidenceHash), 'original zero-provider execution proof required');
  } else {
    need(!r.zeroProviderExecution, 'provider calls cannot carry zero-execution proof');
    need(hex(r.operationId), 'operation identity required');
  }
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
    const category = benchmarkCases(plan).find(c => c.id === r.caseId).category;
    const sub = row.categories[category] ||= {PASS:0,PARTIAL:0,FAIL:0}; sub[r.verdict]++;
  }
  const final = results.filter(r => r.sha === finalSha), n = final.length;
  const criticalPass = plan.cases.filter(c=>c.cohort==='initial' && (c.critical || c.beforeAction)).every(c=>final.some(r=>(r.caseId===c.id || r.replaces===c.id) && r.verdict==='PASS'));
  const initialCategories = [...new Set(plan.cases.filter(c=>c.cohort==='initial').map(c=>c.category))];
  const categoryCoverage = initialCategories.every(category => final.some(r=>benchmarkCases(plan).find(c=>c.id===r.caseId).category===category));
  const requiredBehaviors = ['collection','continuation','quote','correction','arithmetic','brief','navigation','clinical-current','clinical-past','clinical-future','medication','mixed','continuity','clarification','unknown','frequency','chronology','capability','education'];
  const allBehaviorGates = requiredBehaviors.every(category => final.some(r=>benchmarkCases(plan).find(c=>c.id===r.caseId).category===category && r.verdict==='PASS'));
  const ready = n >= plan.launch.minimumFreshFinalSha && final.filter(r=>r.verdict==='PASS').length/n >= plan.launch.minimumPassRate && !final.some(r=>r.verdict==='FAIL') && criticalPass && categoryCoverage && allBehaviorGates && !final.some(r=>r.unsafeMedical || r.ownerMutation || !r.sourceIntegrity) && allUsage.unknown===0 && hex(integrityAfterHash);
  return {release:ready?'FUNCTIONAL_COHORT_PASS_PENDING_EXTERNAL_RELEASE_GATES':'NO_GO',finalSha,freshFinalShaTurns:n,notRunCases:benchmarkCases(plan).filter(c=>!results.some(r=>r.caseId===c.id)).map(c=>c.id),perSha,usage:allUsage,offlineAndRegressionExcluded:true,statisticalGuarantee:false};
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command,path] = process.argv.slice(2);
  need(command === 'validate' && path, 'usage: node scripts/audits/ask-v1-benchmark.mjs validate cohort.json');
  const plan = JSON.parse(readFileSync(path,'utf8')); validateCohort(plan);
  console.log(JSON.stringify({planHash:hash(plan),cases:plan.cases.length,initial:32,reserve:16,paidAuthorization:'PENDING',release:'NO_GO'}));
}
