import * as C from "./helpers/canonical-calculation-retirement.mjs";
import assert from 'node:assert/strict';
import test from 'node:test';
import {completedExplicitHistoryTargets} from '../app/lib/intelligence/evidence-need-coverage.ts';

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
test("certified sufficient calculation publishes without a broad partial-history caveat",async()=>{
 const f=await C.fixture();assert.equal(f.result.coverage.status,"partial");assert.doesNotMatch(f.response.answer.summary,/partial|not exhaustively reviewed|full history/i);await C.finish(f);
});
