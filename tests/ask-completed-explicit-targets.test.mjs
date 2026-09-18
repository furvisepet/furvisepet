import assert from 'node:assert/strict';
import test from 'node:test';
import {completedExplicitHistoryTargets} from '../app/lib/intelligence/evidence-need-coverage.ts';
import {stripCompletedTargetCoverageCaution} from '../app/lib/intelligence/historical-read-response.ts';

const base=()=>({
  interpretation:{request:{}},
  losses:[],
  represented:[{sourceId:'care:one',petId:'pet',sourceType:'care_update',field:'value',start:0,end:12,text:'stool normal',occurredAt:'2021-10-15T12:00:00Z'}],
  history:{targets:[{petId:'pet',day:'2021-10',candidateIds:['care:one'],retainedIds:['care:one'],exhausted:true,status:'unknown'}]},
});

test('exhausted explicit target with every candidate represented is certified complete',()=>{
  assert.deepEqual(completedExplicitHistoryTargets(base()),[
    {petId:'pet',target:'2021-10',sourceIds:['care:one']},
  ]);
});

test('sampled, lost, or unrepresented explicit targets are never certified complete',()=>{
  for(const mutate of [
    e=>{e.history.targets[0].exhausted=false;},
    e=>{e.history.targets[0].status='partial';},
    e=>{e.history.targets[0].retainedIds=[];},
    e=>{e.losses.push({sourceId:'care:one',reason:'budget'});},
    e=>{e.represented=[];},
  ]){
    const evidence=base(); mutate(evidence);
    assert.deepEqual(completedExplicitHistoryTargets(evidence),[]);
  }
});
test('completed-target presentation removes generic partial-summary caveats without changing facts',()=>{
  assert.equal(
    stripCompletedTargetCoverageCaution('Partial summary: In April 2019, Echo started a food trial. The transition took seven days.'),
    'In April 2019, Echo started a food trial. The transition took seven days.'
  );
  assert.equal(
    stripCompletedTargetCoverageCaution('Dune had firmer stool for two days, then returned to the usual pattern. I only see one October note here, so this is a partial summary of that month.'),
    'Dune had firmer stool for two days, then returned to the usual pattern.'
  );
});
