import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OLD_OPERATION, hash, promptHash, validateCohort, freeze, dispatchGate, recordIntent, validateResult, usage, summarize } from '../scripts/audits/ask-v1-benchmark.mjs';
const original=JSON.parse(readFileSync(new URL('../benchmarks/ask/v1-owner-cohort-2026-11-13.json',import.meta.url),'utf8'));
const H='a'.repeat(64), S='b'.repeat(40);
const plan=()=>structuredClone(original);
function fixture() {
 const p=plan(), frozen={planHash:hash(p),privateGoldenHash:H,exposedHash:hash([])};
 return {plan:p,frozen,approval:{status:'approved',owner:'G',messageEvidenceHash:H,messageQuote:'synthetic unit-test fixture; not owner authorization',planHash:frozen.planHash,maxTurns:48,maxCalls:96,maxNewMicroUSD:2500000,acceptedUnknownOperation:OLD_OPERATION,proceedDespiteUnknown:true},pin:{sha:S,clean:true,target:'preview',state:'READY',deploymentSha:S,deploymentId:'dpl_fixture',origin:'https://fixture.vercel.app',aliasReceiptHash:H,accountEvidenceHash:H,sourceEvidenceHash:H,integrityBeforeHash:H,ownerVerified:true,ownedPetsVerified:true,verifiedAt:new Date().toISOString(),maxTurnMicroUSD:60000,safetyReviewedPlanHash:frozen.planHash,independentSafetyReviewHash:H},oldReceipt:{operationId:OLD_OPERATION,actualMicroUSD:null},results:[],pendingIntents:[],caseId:'A01',exposedHashes:[]};
}
function result(id='A01', extra={}) {
 const c=original.cases.find(c=>c.id===id);
 return {caseId:id,partition:'A',questionHash:promptHash(c.question),sha:S,operationId:hash(id),verdict:'PASS',published:true,complete:true,calls:[{operationId:hash(id),number:1,actualMicroUSD:1000,receiptHash:H},{operationId:hash(id),number:2,actualMicroUSD:2000,receiptHash:H}],uiCaptureHash:H,persistedMessagesHash:H,backendExecutionHash:H,sourceReviewHash:H,deploymentEvidenceHash:H,rubricReviewHash:H,uiAnswer:'synthetic test answer, not an app result',unsafeMedical:false,ownerMutation:false,sourceIntegrity:true,interactionEvidenceHash:H,uiElapsedMs:null,providerTimesMs:[1,2],reviewRationale:'synthetic offline fixture only',...extra};
}
test('complete frozen cohort has 32 initial and 16 reserve cases',()=>assert.equal(validateCohort(plan()).cases.length,48));
test('normalization detects cosmetic prompt replay',()=>assert.equal(promptHash('  HELLO\n  world '),promptHash('hello world')));
for(const [name,mutate] of [
 ['duplicate identity',p=>p.cases[1].id=p.cases[0].id],
 ['cosmetic replay',p=>p.cases[1].question='  '+p.cases[0].question.toUpperCase()],
 ['missing dependency',p=>p.cases[0].dependsOn=['ABSENT']],
 ['forward dependency',p=>p.cases[0].dependsOn=['A02']],
 ['missing expected answer',p=>p.cases[0].expected=''],
 ['medical risk omitted',p=>delete p.cases[24].medical],
 ['fixture partition counted as fresh',p=>p.cases[0].partition='B'],
 ['expanded provider calls',p=>p.sourceLimits.providerCallsPerTurn=3],
 ['increased evidence cap',p=>p.sourceLimits.bodies=36],
 ['budget quietly raised',p=>p.requestedEnvelope.maxNewMicroUSD++],
 ['launch failures allowed',p=>p.launch.maxFailures=1],
 ['small sample accepted',p=>p.launch.minimumFreshFinalSha=4],
 ['pass rate weakened',p=>p.launch.minimumPassRate=.5],
]) test(name,()=>{const p=plan();mutate(p);assert.throws(()=>validateCohort(p));});
test('prior exposed question cannot be fresh',()=>assert.throws(()=>validateCohort(plan(),[promptHash(original.cases[0].question)])));
test('freeze creates non-overwritable source/plan/exposure pins',()=>{const d=mkdtempSync(join(tmpdir(),'ask-v1-'));try{const p=join(d,'freeze.json'),f=freeze(plan(),[],H,p);assert.equal(f.planHash,hash(plan()));assert.throws(()=>freeze(plan(),[],H,p));}finally{rmSync(d,{recursive:true});}});
test('synthetic approved fixture can prepare intent without making a call',()=>assert.equal(dispatchGate(fixture()).caseId,'A01'));
for(const [name,mutate] of [
 ['no approval',f=>f.approval=null],
 ['missing original unknown waiver',f=>f.approval.proceedDespiteUnknown=false],
 ['wrong waived operation',f=>f.approval.acceptedUnknownOperation='c'.repeat(64)],
 ['original null not a receipt',f=>f.oldReceipt.actualMicroUSD=0],
 ['wrong original operation',f=>f.oldReceipt.operationId='d'.repeat(64)],
 ['no recorded approval message',f=>f.approval.messageEvidenceHash=null],
 ['approval scope mismatch',f=>f.approval.planHash='d'.repeat(64)],
 ['plan changed after freeze',f=>f.plan.cases[0].expected+=' changed'],
 ['exposure list changed',f=>f.exposedHashes=['e'.repeat(64)]],
 ['production target',f=>f.pin.target='production'],
 ['production host',f=>f.pin.origin='https://www.furvise.com'],
 ['foreign hostname suffix',f=>f.pin.origin='https://fixture.vercel.app.evil.test'],
 ['dirty checkout',f=>f.pin.clean=false],
 ['wrong deployment SHA',f=>f.pin.deploymentSha='c'.repeat(40)],
 ['preview not READY',f=>f.pin.state='BUILDING'],
 ['account unverified',f=>f.pin.ownerVerified=false],
 ['pets unverified',f=>f.pin.ownedPetsVerified=false],
 ['stale pin',f=>f.pin.verifiedAt='2000-01-01T00:00:00Z'],
 ['future pin',f=>f.pin.verifiedAt='2099-01-01T00:00:00Z'],
 ['uncertain intent',f=>f.pendingIntents=[{caseId:'A02'}]],
 ['new unknown receipt',f=>{const r=result();r.calls[1].actualMicroUSD=null;f.results=[r];f.caseId='A02';}],
 ['case reused',f=>f.results=[result()]],
 ['insufficient reserved budget',f=>f.pin.maxTurnMicroUSD=2500001],
 ['call ceiling',f=>f.approval.maxCalls=1],
 ['dependency missing',f=>f.caseId='A07'],
 ['dependency on older SHA',f=>{f.caseId='A07';f.results=[result('A06',{sha:'c'.repeat(40)})];}],
 ['unreviewed clinical lane',f=>{f.caseId='A25';f.pin.independentSafetyReviewHash=null;}],
 ['unsafe clinical candidate',f=>{f.caseId='A25';f.results=[result('A26',{unsafeMedical:true,verdict:'FAIL'})];}],
 ['new medical SHA without repair review',f=>{f.caseId='A25';f.results=[result('A26',{unsafeMedical:true,verdict:'FAIL',sha:'c'.repeat(40)})];}],
 ['reserve without repair evidence',f=>f.caseId='R01'],
]) test(name+' blocks dispatch',()=>{const f=fixture();mutate(f);assert.throws(()=>dispatchGate(f));});
test('settlement cannot turn an unknown actual into zero',()=>{const r=result();r.calls[1].actualMicroUSD=null;r.calls[1].settlement='reconciled';assert.deepEqual(usage([r]),{physicalCalls:2,knownMicroUSD:1000,unknown:1,totalMicroUSD:null});});
test('duplicate physical receipt rejected',()=>assert.throws(()=>usage([result(),result()])));
test('third physical call rejected',()=>{const r=result();r.calls.push({...r.calls[0],number:3});assert.throws(()=>validateResult(r,plan()));});
for(const field of ['uiCaptureHash','persistedMessagesHash','backendExecutionHash','sourceReviewHash','deploymentEvidenceHash','rubricReviewHash'])test('missing '+field+' cannot grade',()=>{const r=result();r[field]=null;assert.throws(()=>validateResult(r,plan()));});
for(const field of ['unsafeMedical','ownerMutation'])test(field+' cannot be partial',()=>assert.throws(()=>validateResult(result('A01',{verdict:'PARTIAL',[field]:true}),plan())));
test('unpublished answer is a failure',()=>assert.throws(()=>validateResult(result('A01',{published:false}),plan())));
test('unknown actual cannot pass',()=>{const r=result();r.calls[1].actualMicroUSD=null;assert.throws(()=>validateResult(r,plan()));});
test('uncertain operation retained as FAIL, not erased',()=>{const r=result('A01',{verdict:'FAIL',complete:false});r.calls[1].actualMicroUSD=null;const s=summarize(plan(),[r],S);assert.equal(s.perSha[S].FAIL,1);assert.equal(s.usage.totalMicroUSD,null);assert.equal(s.release,'NO_GO');});
test('zero live turns never releases',()=>assert.equal(summarize(plan(),[],S).release,'NO_GO'));
test('older SHA passes never transfer',()=>assert.equal(summarize(plan(),[result('A01',{sha:'c'.repeat(40)})],S).freshFinalShaTurns,0));
test('synthetic complete cohort can only pass functional gate, not external launch gates',()=>{const rs=original.cases.filter(c=>c.cohort==='initial').map(c=>result(c.id));assert.equal(summarize(plan(),rs,S,H).release,'FUNCTIONAL_COHORT_PASS_PENDING_EXTERNAL_RELEASE_GATES');});
test('one failure prevents release and remains per SHA',()=>{const rs=original.cases.filter(c=>c.cohort==='initial').map(c=>result(c.id));rs[0].verdict='FAIL';const s=summarize(plan(),rs,S,H);assert.equal(s.release,'NO_GO');assert.equal(s.perSha[S].FAIL,1);});
test('critical partial prevents release',()=>{const rs=original.cases.filter(c=>c.cohort==='initial').map(c=>result(c.id));rs[10].verdict='PARTIAL';assert.equal(summarize(plan(),rs,S,H).release,'NO_GO');});
test('missing integrity after-check prevents functional acceptance',()=>{const rs=original.cases.filter(c=>c.cohort==='initial').map(c=>result(c.id));assert.equal(summarize(plan(),rs,S).release,'NO_GO');});
test('write-once intent blocks physical replay',()=>{const d=mkdtempSync(join(tmpdir(),'ask-v1-'));try{const p=join(d,'intent.json'),g=dispatchGate(fixture());recordIntent(p,g);assert.throws(()=>recordIntent(p,g));}finally{rmSync(d,{recursive:true});}});

test('reload cannot be claimed without an interaction capture',()=>assert.throws(()=>validateResult(result('A10',{interactionEvidenceHash:null}),plan())));

test('omitting a critical initial case cannot hide it in the denominator',()=>{const rs=original.cases.filter(c=>c.cohort==='initial' && c.id!=='A29').map(c=>result(c.id));assert.equal(rs.length,31);assert.equal(summarize(plan(),rs,S,H).release,'NO_GO');});
test('omitting actual reload cannot substitute other continuity turns',()=>{const rs=original.cases.filter(c=>c.cohort==='initial' && c.id!=='A10').map(c=>result(c.id));assert.equal(summarize(plan(),rs,S,H).release,'NO_GO');});
test('a second receipt without its first physical call is rejected',()=>{const r=result();r.calls=[r.calls[1]];r.providerTimesMs=[2];assert.throws(()=>validateResult(r,plan()));});
test('a later safe SHA needs independent medical repair review',()=>{const f=fixture();f.caseId='A25';f.results=[result('A26',{unsafeMedical:true,verdict:'FAIL',sha:'c'.repeat(40)})];f.pin.offlineMedicalRepairReviewHash=H;assert.equal(dispatchGate(f).sha,S);});
test('reserve requires a concrete repair reason and receipt',()=>{const f=fixture();f.caseId='R01';f.pin.repairReason='synthetic evidenced repair';f.pin.repairEvidenceHash=H;assert.equal(dispatchGate(f).caseId,'R01');});

const review={replaces:'A11',equivalenceReviewHash:H,equivalenceReviewedAt:'2026-11-14T00:00:00Z',dispatchedAt:'2026-11-14T01:00:00Z'};
test('frozen fresh analogue qualifies without erasing original failure',()=>{const old=result('A11',{sha:'c'.repeat(40),verdict:'FAIL'}),rs=original.cases.filter(c=>c.cohort==='initial' && c.id!=='A11').map(c=>result(c.id));rs.push(result('R04',review),old);const s=summarize(plan(),rs,S,H);assert.equal(s.release,'FUNCTIONAL_COHORT_PASS_PENDING_EXTERNAL_RELEASE_GATES');assert.equal(s.perSha[old.sha].FAIL,1);assert.equal(s.freshFinalShaTurns,32);});
test('a replacement without its retained original is rejected',()=>assert.throws(()=>summarize(plan(),[result('R04',review)],S,H)));
test('unlisted same-category replacement cannot substitute toxin for breathing',()=>assert.throws(()=>validateResult(result('R12',{...review,replaces:'A29'}),plan())));
test('a post-output equivalence review is rejected',()=>assert.throws(()=>validateResult(result('R04',{...review,equivalenceReviewedAt:'2026-11-15T00:00:00Z'}),plan())));
test('a missing equivalence review cannot grade a replacement',()=>assert.throws(()=>validateResult(result('R04',{...review,equivalenceReviewHash:null}),plan())));
test('dispatch requires retained original and independent prior review',()=>{const f=fixture();f.caseId='R04';f.results=[result('A11',{sha:'c'.repeat(40),verdict:'FAIL'})];Object.assign(f.pin,review,{repairReason:'synthetic bounded continuation fix',repairEvidenceHash:H});assert.equal(dispatchGate(f).replaces,'A11');});
test('new question with unfrozen replacement is blocked before dispatch',()=>{const f=fixture();f.caseId='R04';Object.assign(f.pin,review,{replaces:'A20',repairReason:'fixture',repairEvidenceHash:H});assert.throws(()=>dispatchGate(f));});

test('logic-only duplicate mentions cannot replace saved-source recurrence evidence',()=>assert.throws(()=>validateResult(result('R07',{...review,replaces:'A17'}),plan())));

test('a fresh collection analogue satisfies its downstream continuation dependency',()=>{const f=fixture();f.caseId='A12';f.results=[result('A11',{sha:'c'.repeat(40),verdict:'FAIL'}),result('R04',review)];assert.equal(dispatchGate(f).caseId,'A12');});

test('registered fresh unknown analogue preserves original failure and original48-question freeze',()=>{const rs=original.cases.filter(c=>c.cohort==='initial' && c.id!=='A04').map(c=>result(c.id));const old=result('A04',{sha:'c'.repeat(40),verdict:'FAIL'});const extra=JSON.parse(readFileSync(new URL('../benchmarks/ask/v1-owner-repair-pool-2026-11-13.json',import.meta.url))).cases[0];const r=result('A01',{caseId:extra.id,questionHash:promptHash(extra.question),operationId:hash(extra.id),calls:[{operationId:hash(extra.id),number:1,actualMicroUSD:1,receiptHash:H},{operationId:hash(extra.id),number:2,actualMicroUSD:1,receiptHash:H}],replaces:'A04',equivalenceReviewHash:H,equivalenceReviewedAt:'2026-11-14T00:00:00Z',dispatchedAt:'2026-11-14T01:00:00Z'});rs.push(old,r);const s=summarize(plan(),rs,S,H);assert.equal(s.release,'FUNCTIONAL_COHORT_PASS_PENDING_EXTERNAL_RELEASE_GATES');assert.equal(s.perSha[old.sha].FAIL,1);assert.equal(original.cases.length,48);});
test('an unregistered additional case cannot dispatch',()=>{const f=fixture();f.caseId='R99';assert.throws(()=>dispatchGate(f));});

test('repair pool cannot replay an exposed added question',()=>{const extra=JSON.parse(readFileSync(new URL('../benchmarks/ask/v1-owner-repair-pool-2026-11-13.json',import.meta.url))).cases[0];assert.throws(()=>validateCohort(plan(),[promptHash(extra.question)]));});
test('additional repair candidates do not raise the16-reserve-dispatch ceiling',()=>{const f=fixture();f.caseId='R17';f.results=original.cases.filter(c=>c.cohort==='repair-reserve').map(c=>result(c.id));f.pin.repairReason='synthetic fixture';f.pin.repairEvidenceHash=H;assert.throws(()=>dispatchGate(f),/reserve dispatch ceiling/);});

const zeroLogicalId="99999999-9999-4999-8999-000000000001",zeroRequestId="99999999-9999-4999-8999-000000000002";
function zeroResult(extra={}){
 return result("A25",{operationId:zeroLogicalId,requestId:zeroRequestId,calls:[],providerTimesMs:[],verdict:"FAIL",published:false,zeroProviderExecution:{schema:"AskZeroProviderExecution.v1",operationKind:"operational_event",routeType:"emergency",executionMode:"deterministic",providerCallCount:0,logicalOperationId:zeroLogicalId,requestId:zeroRequestId,terminalEvidenceHash:H},...extra});
}
test("original deterministic zero-provider emergency uses its actual operational UUID without inventing a cost receipt",()=>{
 const r=zeroResult();assert.doesNotThrow(()=>validateResult(r,plan()));assert.deepEqual(usage([r]),{physicalCalls:0,knownMicroUSD:0,unknown:0,totalMicroUSD:0});
});
for(const [field,value] of [["schema","other"],["operationKind","provider"],["routeType","pet_care"],["executionMode","ai"],["providerCallCount",1],["logicalOperationId",zeroRequestId],["requestId",zeroLogicalId],["terminalEvidenceHash",null]]){
 test("zero-provider proof rejects mismatched "+field,()=>{const r=zeroResult();r.zeroProviderExecution[field]=value;assert.throws(()=>validateResult(r,plan()));});
}
test("empty calls without original zero-execution proof cannot hide a dispatched or unreconciled call",()=>{
 const r=zeroResult();delete r.zeroProviderExecution;assert.throws(()=>validateResult(r,plan()));
 const paid=result();paid.zeroProviderExecution=zeroResult().zeroProviderExecution;assert.throws(()=>validateResult(paid,plan()));
});
test("a genuine zero-call mode never reconciles the old unknown actual",()=>{
 const r=result();r.calls[1].actualMicroUSD=null;assert.equal(usage([zeroResult(),r]).unknown,1);assert.equal(usage([zeroResult(),r]).totalMicroUSD,null);
});
test("safe urgent output without publication remains a functional FAIL",()=>{
 assert.throws(()=>validateResult(zeroResult({verdict:"PASS"}),plan()));const r=zeroResult();assert.equal(summarize(plan(),[r],S,H).perSha[S].FAIL,1);
});
test("confirmed durable zero-provider emergency may pass but never adds physical calls or paid turns",()=>{
 const r=zeroResult({published:true,verdict:"PASS"});assert.doesNotThrow(()=>validateResult(r,plan()));assert.equal(usage([r]).physicalCalls,0);
});
