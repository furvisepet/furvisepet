import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

for (const status of [409, 429]) test(`actual Vet Brief route abandons ${status} admission so the same request can retry`, async () => {
  let capturedReason;
  let blocked = true, abandoned = 0, completed = 0, generated = 0, charged = 0, released = 0;
  class RateLimitRejection extends Error { constructor() { super('Denied'); this.response = Response.json({code: status === 409 ? 'AI_REQUEST_ALREADY_ACTIVE' : 'RATE_LIMITED'}, {status}); } }
  const document = {pet:{name:'Synthetic'},excludedSections:[],missingInformation:[]};
  const mocks = {
    '../../../lib/vet-brief/prepare': {prepareVetBrief: async () => { generated++; return {document,sourceRecordIds:[]}; }},
    '../../../lib/vet-brief/appointment-plan': {validBriefDay: s => /^\d{4}-\d{2}-\d{2}$/.test(s)},
    'node:crypto': {randomUUID: () => '11111111-1111-4111-8111-111111111111'},
    '../../../lib/intelligence/feature-failure.ts': {featureFailureDetails: () => ({})},
    '../../../lib/ai/ask-reasoning': {getAskModelConfiguration: () => ({primary:'test'})},
    '../../../lib/ai/usage-ledger': {AiCreditLimitReachedError: class extends Error {},AiCreditReplayRequiredError: class extends Error {},checkAiCreditRequestReplay: async () => {},hashAiCreditPayload: () => 'hash',runWithAiCredit: async ({generate}) => { charged++; return {value:await generate()}; }},
    '../../../lib/ai/usage-guard/admission': {runAdmittedAiOperation: async (_,fn) => fn()},
    '../../../lib/ai/usage-guard/errors': {AiAdmissionError: class extends Error {}},
    '../../../lib/intelligence': {buildFurviseContext: async input => (capturedReason=input.currentMessage, {pet:{lifecycle_status:'active'},conversationTurns:[],legacyPetMemories:[],memories:[],careEntries:[],selectedCareEntries:[]}),logIntelligenceEvent: () => {}},
    '../../../lib/vet-brief/builder': {buildVetBriefDraft: () => ({document})},
    '../../../lib/vet-brief/schema': {parseVetBriefDocument: () => null},
    '../../../lib/vet-brief/server': {getVetBriefRequestContext: async () => ({supabase:{},userId:'owner'})},
    '../../../lib/security/request': {API_BODY_LIMITS:{vetBrief:10000},RequestBoundaryError: class extends Error {},hasOnlyKeys: () => true,inclusiveDateSpanDays: () => 2,isUuid: () => true,readBoundedJson: r => r.json()},
    '../../../lib/security/rate-limit': {RateLimitRejection,requireRateLimitedRequest: async () => { if(blocked) throw new RateLimitRejection(); return {release: async () => {released++;}}; }},
    '../../../lib/security/idempotency': {claimIdempotentOperation: async () => ({operation:{abandon:async () => {abandoned++;},execute:async fn => {const r=await fn();completed++;return r;}}})},
    '../../../lib/vet-brief/review': {addVetBriefCoverage: d => d},
  };
  const exports = {};
  const source = readFileSync(new URL('../app/api/vet-briefs/draft/route.ts',import.meta.url),'utf8');
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:name => {assert.ok(name in mocks,name);return mocks[name];},Response,Request,URL,console});
  const request = (reasonForVisit = "Synthetic appointment") => new Request('https://test/api/vet-briefs/draft',{method:'POST',body:JSON.stringify({petId:'11111111-1111-4111-8111-111111111111',requestId:'22222222-2222-4222-8222-222222222222',from:'2026-09-01',to:'2026-09-12',reasonForVisit})});
  assert.equal((await exports.POST(request())).status,status);
  assert.equal(abandoned,1); assert.equal(completed,0); assert.equal(generated,0); assert.equal(charged,0);
  blocked=false;
  assert.equal((await exports.POST(request())).status,200);
  assert.equal(completed,1); assert.equal(generated,1); assert.equal(charged,1); assert.equal(released,1);
  const tail=' Final dose was NOT given.';
  const longReason='x'.repeat(12000-tail.length)+tail;
  assert.equal((await exports.POST(request(longReason))).status,200);
  assert.equal(capturedReason,longReason);
  const chargedBefore=charged;
  assert.equal((await exports.POST(request(longReason+'x'))).status,400);
  assert.equal(charged,chargedBefore);
  assert.equal(capturedReason,longReason);
});
