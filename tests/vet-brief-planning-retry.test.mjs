import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import {prepareReviewedVetBrief} from '../app/lib/vet-brief/review.ts';

function pipeline({repairRegressions=false,planFailures=0,contentFailures=0,reviewFailures=0,semanticFailures=0,overviewFailures=0,presentationFailures=0,repairContentFails=false,historyUnavailable=false,failureKind='incomplete_output'}={}) {
 const calls=[], inputs=[];
 const document={visitSummary:'Overview',pet:{name:'Synthetic'},dateRange:{from:'2026-06-01',to:'2026-09-12'},missingInformation:[]};
 const plan={from:null,to:'2026-09-12',topics:[{label:'History',terms:['history']}],questionsToResolve:[]};
 const mocks={
  './uncertainty-language.ts':{vetBriefUncertaintyLanguageInstructions:'Apply equal evidence standards in every language.'},
  'server-only':{},
  './publication-review.ts':{vetBriefPublicationReviewSchema:{},vetBriefDuplicationReviewInstructions:''},
  '../ai/ask-reasoning':{generateStructuredFeatureResponse:async input=>{calls.push(input.schemaName);inputs.push(input);if(input.schemaName==='vet_brief_evidence_plan'){if(planFailures-->0)throw Error('incomplete');return plan;}if(input.schemaName==='vet_brief_content'){if(contentFailures-->0||(repairContentFails&&input.input.reviewRepair))throw Error('incomplete');return {document:repairRegressions&&input.input.reviewRepair?{...document,visitSummary:"Drift"}:document};}if(reviewFailures-->0)throw Error('incomplete');const reviewNumber=calls.filter(c=>c==='vet_brief_review').length;const regressionSection=repairRegressions&&reviewNumber<3?(reviewNumber===1?'questions':'overview'):null;const overviewFailed=overviewFailures-->0;return {factsSupported:!regressionSection&&!overviewFailed&&semanticFailures--<=0,factualIssueCodes:regressionSection?[`source_scope:${regressionSection}`]:overviewFailed?['source_scope:overview']:[],repairSections:regressionSection?[regressionSection]:['overview'],importantHistoryPreserved:true,categoriesAccurate:true,uncertaintyPreserved:true,noDuplication:true,questionsUseful:true,visitFocused:presentationFailures--<=0,repairInstructions:'Correct unsupported wording while keeping supported history.'};}},
  '../intelligence/feature-failure.ts':{featureFailureDetails:()=>({failureKind})},
  '../intelligence/feature-modes.ts':{getIntelligenceFeatureMode:()=>({promptInstructions:[]})},
  '../intelligence/history-retrieval.ts':{retrieveAskHistory:async c=>({...c,askHistory:{entries:[],coverage:{retrieval:'unknown',corrections:historyUnavailable?'unavailable':'unknown',reasons:[]}}})},
  '../intelligence/logging':{logIntelligenceEvent:()=>{}},
  './appointment-plan.ts':{vetBriefSearchVocabulary:()=>[],vetBriefAppointmentPlanInstructions:'',vetBriefAppointmentPlanSchema:{}},
  './content.ts':{vetBriefContentSchema:{}},
  './evidence.ts':{vetBriefEvidence:()=>({evidence:{records:[]},allowedIds:[],warnings:[]})},
  './review.ts':{prepareReviewedVetBrief,vetBriefReviewInstructions:''},
  './report.ts':{vetBriefGenerationTemplate:d=>({...d}),vetBriefReviewContent:d=>d},
  './urgency.ts':{vetBriefUrgency:()=>null},
 };
 const exports={};
 vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../app/lib/vet-brief/prepare.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:name=>{assert.ok(name in mocks,name);return mocks[name];},console});
 return {calls,inputs,run:()=>exports.prepareVetBrief({context:{pet:{id:'synthetic',species:'dog'},currentMessage:'Review history',currentTimestamp:'2026-09-12'},supabase:{},baseline:document,requestId:'synthetic'})};
}
test('incomplete planning receives one structural retry, then generation and independent review',async()=>{
 const p=pipeline({planFailures:1}); await p.run();
 assert.deepEqual(p.calls,['vet_brief_evidence_plan','vet_brief_evidence_plan','vet_brief_content','vet_brief_review']);
});
test('planning and content share one structural retry rather than multiplying attempts',async()=>{
 const p=pipeline({planFailures:1,contentFailures:1});await assert.rejects(p.run(),/incomplete/);
 assert.deepEqual(p.calls,['vet_brief_evidence_plan','vet_brief_evidence_plan','vet_brief_content']);
});
test('two incomplete plans stop before retrieval and generation',async()=>{
 const p=pipeline({planFailures:2});await assert.rejects(p.run(),/incomplete/);
 assert.deepEqual(p.calls,['vet_brief_evidence_plan','vet_brief_evidence_plan']);
});

test('incomplete review retries the same generated candidate without another generation',async()=>{
 const p=pipeline({reviewFailures:1});await p.run();
 assert.deepEqual(p.calls,['vet_brief_evidence_plan','vet_brief_content','vet_brief_review','vet_brief_review']);
});
test('a consumed planning retry cannot multiply into another review retry',async()=>{
 const p=pipeline({planFailures:1,reviewFailures:1});await assert.rejects(p.run(),/incomplete/);
 assert.deepEqual(p.calls,['vet_brief_evidence_plan','vet_brief_evidence_plan','vet_brief_content','vet_brief_review']);
});

test('unavailable history authority stops before paid content generation; genuinely sparse history remains allowed',async()=>{
 const failed=pipeline({historyUnavailable:true}); await assert.rejects(failed.run(),/history_verification_unavailable/);
 assert.deepEqual(failed.calls,['vet_brief_evidence_plan']);
 const sparse=pipeline(); await sparse.run(); assert.deepEqual(sparse.calls,['vet_brief_evidence_plan','vet_brief_content','vet_brief_review']);
});

test('a transient review timeout retries the same candidate once without bypassing review',async()=>{
 const p=pipeline({reviewFailures:1,failureKind:'timeout'}); await p.run();
 assert.deepEqual(p.calls,['vet_brief_evidence_plan','vet_brief_content','vet_brief_review','vet_brief_review']);
 const repeated=pipeline({reviewFailures:2,failureKind:'timeout'}); await assert.rejects(repeated.run(),/incomplete/);
 assert.equal(repeated.calls.filter(c=>c==='vet_brief_review').length,2);
});


test('production repair receives the rejected wording separately from unchanged evidence',async()=>{
 const p=pipeline({semanticFailures:1}); await p.run();
 const generations=p.inputs.filter(input=>input.schemaName==='vet_brief_content');
 assert.equal(generations.length,2);
 assert.equal(generations[0].input.reviewRepair,null);
 assert.ok(generations[1].input.reviewRepair.draftToRepair);
 assert.equal(generations[1].input.evidence,generations[0].input.evidence);
 assert.equal('draftToRepair' in generations[1].input.evidence,false);
 for (const review of p.inputs.filter(input=>input.schemaName==='vet_brief_review')) {
   assert.equal('selectionProposals' in review.input,false);
   assert.ok(review.input.draft);
 }
});

test('optional overview recovery uses the unused sixth provider call and cannot add a seventh after a structural retry',async()=>{
 const recovered=pipeline({overviewFailures:2});const result=await recovered.run();
 assert.deepEqual(recovered.calls,['vet_brief_evidence_plan','vet_brief_content','vet_brief_review','vet_brief_content','vet_brief_review','vet_brief_review']);
 assert.equal(result.document.visitSummary,'');
 assert.deepEqual(result.document.reviewWarnings,['overview_omitted']);
 for(const failures of [{planFailures:1},{reviewFailures:1}]){
  const bounded=pipeline({...failures,overviewFailures:2});await assert.rejects(bounded.run(),{name:'FeatureValidationError'});
  assert.equal(bounded.calls.length,6);
 }
});

test('production presentation-edit timeout returns the already reviewed original without another call or a factual bypass',async()=>{
 const p=pipeline({presentationFailures:1,repairContentFails:true,failureKind:'timeout'});
 const result=await p.run();
 assert.deepEqual(p.calls,['vet_brief_evidence_plan','vet_brief_content','vet_brief_review','vet_brief_content']);
 assert.deepEqual(result.document.reviewWarnings,['visit_focus','repair_unavailable']);
 const unsafe=pipeline({semanticFailures:1,repairContentFails:true,failureKind:'timeout'});await assert.rejects(unsafe.run(),/incomplete/);
 const denied=pipeline({presentationFailures:1,repairContentFails:true,failureKind:'admission_denied'});await assert.rejects(denied.run(),/incomplete/);
});

test('all supported repair/retry paths fit the unchanged route and six-call budget with 50-second synthesis',async()=>{
 for(const options of [{},{semanticFailures:1},{planFailures:1,semanticFailures:1},{contentFailures:1,semanticFailures:1},{reviewFailures:1,semanticFailures:1},{overviewFailures:2}]){
  const p=pipeline(options);await p.run();
  assert.ok(p.calls.length<=6);
  for(const input of p.inputs) assert.equal(input.timeoutMs,{vet_brief_evidence_plan:25000,vet_brief_content:50000,vet_brief_review:35000}[input.schemaName]);
  const providerCeiling=p.inputs.reduce((total,input)=>total+input.timeoutMs,0);
  assert.ok(providerCeiling<=245000,`${JSON.stringify(options)}: ${providerCeiling}`);
 }
 const route=readFileSync(new URL('../app/api/vet-briefs/draft/route.ts',import.meta.url),'utf8');
 assert.match(route,/export const maxDuration = 300;/);
});

test('timeout recovery and targeted edits reduce reasoning effort without skipping the independent review',async()=>{
 for(const [options,schema] of [[{contentFailures:1,failureKind:'timeout'},'vet_brief_content'],[{reviewFailures:1,failureKind:'timeout'},'vet_brief_review'],[{semanticFailures:1},'vet_brief_content']]){
  const p=pipeline(options);await p.run();const calls=p.inputs.filter(input=>input.schemaName===schema);
  assert.deepEqual(calls.map(input=>input.reasoningEffort),['medium','low']);
  assert.equal(p.calls.at(-1),'vet_brief_review');
 }
});

 test('production section restoration shares the sixth call with structural retries',async()=>{
 const p=pipeline({repairRegressions:true});await p.run();assert.equal(p.calls.length,6);assert.equal(p.calls.at(-1),'vet_brief_review');
 assert.ok(p.inputs.reduce((n,input)=>n+input.timeoutMs,0)<=245000);
 const consumed=pipeline({repairRegressions:true,planFailures:1});await assert.rejects(consumed.run(),{name:'FeatureValidationError'});assert.equal(consumed.calls.length,6);
 });
