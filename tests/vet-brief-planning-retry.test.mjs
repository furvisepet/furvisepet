import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import {prepareReviewedVetBrief} from '../app/lib/vet-brief/review.ts';

function pipeline({planFailures=0,contentFailures=0,reviewFailures=0}={}) {
 const calls=[];
 const document={pet:{name:'Synthetic'},dateRange:{from:'2026-06-01',to:'2026-09-12'},missingInformation:[]};
 const plan={from:null,to:'2026-09-12',topics:[{label:'History',terms:['history']}],questionsToResolve:[]};
 const mocks={
  'server-only':{},
  './publication-review.ts':{vetBriefPublicationReviewSchema:{},vetBriefDuplicationReviewInstructions:''},
  '../ai/ask-reasoning':{generateStructuredFeatureResponse:async input=>{calls.push(input.schemaName);if(input.schemaName==='vet_brief_evidence_plan'){if(planFailures-->0)throw Error('incomplete');return plan;}if(input.schemaName==='vet_brief_content'){if(contentFailures-->0)throw Error('incomplete');return {document};}if(reviewFailures-->0)throw Error('incomplete');return {factsSupported:true,importantHistoryPreserved:true,categoriesAccurate:true,uncertaintyPreserved:true,noDuplication:true,questionsUseful:true,visitFocused:true,repairInstructions:''};}},
  '../intelligence/feature-failure.ts':{featureFailureDetails:()=>({failureKind:'incomplete_output'})},
  '../intelligence/feature-modes.ts':{getIntelligenceFeatureMode:()=>({promptInstructions:[]})},
  '../intelligence/history-retrieval.ts':{retrieveAskHistory:async c=>c},
  '../intelligence/logging':{logIntelligenceEvent:()=>{}},
  './appointment-plan.ts':{vetBriefAppointmentPlanInstructions:'',vetBriefAppointmentPlanSchema:{}},
  './content.ts':{vetBriefContentSchema:{}},
  './evidence.ts':{vetBriefEvidence:()=>({evidence:{records:[]},allowedIds:[],warnings:[]})},
  './review.ts':{prepareReviewedVetBrief,vetBriefReviewInstructions:''},
  './report.ts':{vetBriefGenerationTemplate:d=>({...d}),vetBriefReviewPublication:d=>d},
  './urgency.ts':{vetBriefUrgency:()=>null},
 };
 const exports={};
 vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../app/lib/vet-brief/prepare.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:name=>{assert.ok(name in mocks,name);return mocks[name];},console});
 return {calls,run:()=>exports.prepareVetBrief({context:{pet:{id:'synthetic',species:'dog'},currentMessage:'Review history',currentTimestamp:'2026-09-12'},supabase:{},baseline:document,requestId:'synthetic'})};
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
