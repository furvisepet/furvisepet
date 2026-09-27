import assert from 'node:assert/strict';
import test from 'node:test';
import {clock,exercise} from '../scripts/audits/helpers/lifetime-harness.mjs';
import {stressProposal} from '../scripts/audits/helpers/current-stress-harness.mjs';
import {stressPets,rows} from '../scripts/audits/fixtures/ask-ten-pet-five-year-stress.mjs';
for(const cohort of [false,true])test('unlinked correction remains an explicit '+(cohort?'cohort':'single-subject')+' acceptance boundary',async t=>{
 clock(t);const p=stressProposal(cohort?{authority:'effective_fact',scope:'account',petNames:[],selection:'latest',from:'2022-01-01',to:'2026-09-01'}:{authority:'effective_fact',petNames:['Birch'],terms:['food','switch','correct'],from:'2022-03-01',to:'2026-09-01'});
 const question=cohort?'Give the current effective fact for each of my ten pets.':'What is the corrected effective food switch for Birch?';
 const run=await exercise(question,{fixturePets:stressPets,rows,petId:stressPets[0].id,messages:[],history:true,interpretationProposal:p,expectedProviderCalls:0,expectedReviewCalls:0});
 const coverage=run.context.askHistory.coverage.ticketCoverage;
 assert.ok(coverage.reasons.includes('unlinked_correction_uncertain'));
 assert.equal(run.result.answerValidation.assessment.outcome,'limited');
 assert.equal(run.requests.length,0);assert.equal(run.reviewRequests.length,0);
 if(cohort){
  assert.equal(run.result.reasoning.model,'server-labs-list');
  assert.equal(new Set(run.result.reasoning.labsList.records.map(row=>row.petId)).size,9);
  assert.equal(coverage.groups.find(g=>g.petId===stressPets[1].id).blocked,true);
  assert.ok(!run.result.reasoning.labsList.records.some(row=>row.petId===stressPets[1].id));
 }else{
  assert.equal(run.result.reasoning.model,'server-history-unavailable');
  assert.deepEqual(run.result.reasoning.relevantContextIds,[]);assert.equal(run.result.reasoning.labsList,undefined);
 }
 assert.deepEqual(run.result.acceptedCareActions,[]);assert.deepEqual(run.result.acceptedSemanticEvents,[]);
});
