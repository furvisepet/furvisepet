import assert from 'node:assert/strict';
import test from 'node:test';
import { exercise, clock } from '../scripts/audits/helpers/lifetime-harness.mjs';
import { care, pets } from '../scripts/audits/fixtures/ask-lifetime-history.mjs';
import { assertPublicationCalls } from '../scripts/audits/helpers/publication-call-expectations.mjs';

const question='Show the requested saved observation.';
const proposal=()=>({version:'ask-request.v2',mode:'read',question,requirements:[],referenceTurnIds:[],
 evidenceBasis:'saved_history',scope:'named',petNames:[pets[0].name],operation:'recall',selection:'latest',quantity:'records',
 topic:'observations',terms:[],from:null,to:null,episodeTopic:null,ordinal:null,frame:null,task:null,writeJob:null,
 readTicket:{operation:'read',subjectScope:'named',temporal:{from:null,to:null,anchor:null},
 predicates:[{kind:'text_any',terms:['observation']}],
 selection:{groupBy:['subject'],union:[{orderBy:[{field:'event_at',direction:'desc'}],take:{count:1,per:'group'}}]},
 outputs:{completeness:'sufficient',ordering:'desc',limit:null}}});
for(const supported of [true,false])test(supported?'certified Labs replaces factual call expectations with organ and transport checks':'residual companion work preserves certified facts but cannot claim task completion',async t=>{
 clock(t);const planned=proposal();if(!supported)planned.requirements=['An independent additional explanation'];
 const r=await exercise(question,{history:true,messages:[],rows:[care('saved-observation',pets[0].id,'2026-06-04','general','An observation was recorded.')],
 interpretationProposal:planned,expectedProviderCalls:1,expectedReviewCalls:1});
 assert.equal(r.publicationCallPath,'server-labs-list');
 assert.equal(r.requests.length,0);assert.equal(r.reviewRequests.length,0);
 assert.ok(r.queries.some(query=>query.table==='pet_care_entries'));
 assert.deepEqual(r.context.askInterpretation.request.readTicket.selection,planned.readTicket.selection);
 if(supported){assert.deepEqual(r.result.reasoning.labsList.records.map(row=>row.id),['saved-observation']);
  assert.match(r.result.reasoning.answer.summary,/An observation was recorded/);}
 else {
  assert.deepEqual(r.result.reasoning.labsList.records.map(row=>row.id),['saved-observation']);
  assert.match(r.result.reasoning.answer.summary,/An observation was recorded/);
  const assessment=r.result.answerValidation.assessment;
  assert.equal(assessment.outcome,'limited');
  assert.equal(assessment.checks.evidenceSupport,'passed');
  assert.equal(assessment.checks.taskCompletion,'failed');
  assert.ok(assessment.reasons.includes('residual_requirements_unfulfilled'));
 }
});

const input=(request,extra={})=>({result:{reasoning:{model:'remaining-domain-model',evidenceContract:{interpretation:{request}},...extra}},
 requests:[{}],reviewRequests:[{}],expectedProviderCalls:1,expectedReviewCalls:1});
for(const [name,patch,extra] of [
 ['conversation',{mode:'conversation',evidenceBasis:'general'}],['mixed',{mode:'mixed'}],['update',{mode:'update'}],
 ['profile',{profileFields:['name']}],['saved profile',{evidenceBasis:'saved_profile'}],
 ['episode',{readTicket:{episode:{operation:'membership'}}}],['calculation',{projection:{quantity:'duration'}}],
 ['measurement comparison',{quantity:'measurement',readTicket:{operation:'compare'}}],
 ['urgent safety',{}, {safetyLevel:'urgent'}],
])test(name+' obeys its typed publication-domain call budget',async()=>{
 const i=input({mode:'read',evidenceBasis:'saved_history',...patch},extra);
 const request=i.result.reasoning.evidenceContract.interpretation.request;
 if(request.mode==='read'&&request.evidenceBasis==='saved_history'&&extra?.safetyLevel!=='urgent'){
  await assert.rejects(()=>assertPublicationCalls(i),/authoritative deterministic publication path/);
  return;
 }
 assert.equal(await assertPublicationCalls(i),'existing-domain-expectations');
 await assert.rejects(()=>assertPublicationCalls({...i,requests:[]}),/exactly one mocked answer-provider call/);
 await assert.rejects(()=>assertPublicationCalls({...i,reviewRequests:[]}),/bounded history-review call count/);
});
test('ordinary history cannot disguise factual model fallback as another domain',async()=>{
 await assert.rejects(()=>assertPublicationCalls(input({mode:'read',evidenceBasis:'saved_history'})),/authoritative deterministic publication path/);
});
test('a deterministic model label alone cannot waive an actual factual provider call',async()=>{
 await assert.rejects(()=>assertPublicationCalls(input({mode:'read',evidenceBasis:'saved_history'},{model:'server-history-unavailable'})),/cannot invoke factual generation/);
});
