import {stressProposal} from './helpers/current-stress-harness.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { exercise, clock } from './helpers/lifetime-harness.mjs';
import { care } from './fixtures/ask-lifetime-history.mjs';
import { buildEvidenceNeedCoverage, completedEmptyEvidenceNeeds } from '../../app/lib/intelligence/evidence-need-coverage.ts';

const noise = Array.from({length: 10000},(_,i)=>care(`background-${i}`,'milo',new Date(Date.parse('1980-01-01')+i*86400000).toISOString().slice(0,10),'general','Ordinary household activity.'));
for(const topic of ['hammock','whistle','ramp']) {
 test(`novel ${topic} need retains century-separated sources behind 10000 records`,async t=>{
  clock(t);
  const a=care(`${topic}-old`,'milo','1926-06-12','general',`Milo used the ${topic} for 3 minutes.`);
  const b=care(`${topic}-new`,'milo','2026-06-12','general',`Milo used the ${topic} for 8 minutes.`);
  const question=`Compare Milo's ${topic} records on June 12, 1926 and June 12, 2026. Save nothing.`;
  const result=await exercise(question,{history:true,rows:[a,b,...noise],messages:[],expectedReviewCalls:null,
   interpretationProposal:stressProposal({petNames:['Milo'],selection:'comparison',topic,terms:[topic]})});
  const retrieved=result.context.askHistory.entries.map(row=>row.id);
  assert.deepEqual(new Set(retrieved),new Set([a.id,b.id]));
  assert.equal(result.result.reasoning.model,'server-labs-list');
  assert.deepEqual(new Set(result.result.reasoning.relevantContextIds),new Set(['care:'+a.id,'care:'+b.id]));
  assert.equal(result.requests.length,0);assert.equal(result.reviewRequests.length,0);
  assert.ok(result.context.askHistory.coverage.queryCount<=20);
  assert.ok(result.context.askHistory.entries.length<=32);
  assert.equal(result.result.acceptedCareActions.length,0);
  assert.equal(result.result.acceptedSemanticEvents.length,0);
 });
}
const evidence=()=>({scope:{authorizedPetIds:['pet']},interpretation:{request:{evidenceNeeds:[{id:'need',quote:'Was the whistle recorded?',terms:['whistle'],sourceTurnId:null}]}},
 represented:[],sources:[],losses:[],history:{needs:[{petId:'pet',needId:'need',candidateIds:[],exhausted:true,status:'complete'}],provenance:[]}});
for(const failure of ['unavailable','bounded','unqueried','omitted','foreign']) test(`missing-history evidence cannot pretend a completed empty search: ${failure}`,()=>{
 const e=evidence();
 if(failure==='unavailable')e.history.needs[0].status='unavailable';
 if(failure==='bounded')e.history.needs[0].exhausted=false;
 if(failure==='unqueried')e.history.needs=[];
 if(failure==='omitted'){e.history.needs[0].candidateIds=['care:a'];e.losses=[{sourceId:'care:a',reason:'prompt_budget'}];}
 if(failure==='foreign')e.history.needs[0].petId='other';
 assert.deepEqual(completedEmptyEvidenceNeeds(e),[]);
 assert.equal(buildEvidenceNeedCoverage(e)[0].semanticSupport,'unverified');
});
test('a completed empty lookup is scoped to its actual need and pet',()=>{
 assert.deepEqual(completedEmptyEvidenceNeeds(evidence()),[JSON.stringify(['need','pet'])]);
});
