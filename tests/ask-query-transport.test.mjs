import test from 'node:test';
import assert from 'node:assert/strict';
import {compactHistoryQueryCoverage} from '../app/lib/ai/history-source-transport.ts';

test('query transport preserves unknown coverage and nonzero candidates when no candidate is represented',()=>{
 const ids=Array.from({length:64},(_,i)=>`care:00000000-0000-0000-0000-${String(i).padStart(12,'0')}`);
 const evidence={needCoverage:[{needId:'need',semanticSupport:'unverified',pets:[{petId:'pet',state:'not_represented',reasons:['prompt_budget'],candidateSourceIds:ids,representedSourceIds:[]}]}],
 losses:ids.map(sourceId=>({sourceId,reason:'prompt_budget'})),history:{candidateIds:ids,excludedIds:ids,
  retrieval:'partial',corrections:'unknown',reasons:['bounded_search_not_exhaustive'],
  needs:[{petId:'pet',needId:'need',candidateIds:ids,exhausted:false,status:'partial',reason:'query_budget'}],
  periods:[{petId:'pet',from:'2021-01-01',to:'2024-01-01',candidateIds:ids,exhausted:false}],
  targets:[{petId:'pet',day:'2022-01-01',candidateIds:ids,retainedIds:ids.slice(0,2),exhausted:false,status:'partial'}],
  claimSources:[{petId:'pet',sourceIds:ids}],chronology:[{petId:'pet',boundaryIds:[ids[0]],blocked:true}]}};
 const original=structuredClone(evidence),result=compactHistoryQueryCoverage(evidence,new Set());
 assert.equal(result.needCoverage[0].pets[0].candidateSourceCount,64);
 assert.equal(result.needCoverage[0].pets[0].state,'not_represented');
 assert.equal(result.needCoverage[0].semanticSupport,'unverified');
 assert.deepEqual(result.needCoverage[0].pets[0].candidateSourceIds,[]);
 assert.equal(result.history.needs[0].candidateCount,64);assert.equal(result.history.needs[0].exhausted,false);
 assert.equal(result.history.needs[0].reason,'query_budget');assert.equal(result.history.excludedCount,64);
 assert.deepEqual(result.history.chronology,evidence.history.chronology);
 assert.equal(result.lossGroups[0].lossCount,64);assert.equal(result.lossGroups[0].reason,'prompt_budget');
 assert.equal(result.history.targets[0].retainedCount,2);
 assert.ok(JSON.stringify(result).length<JSON.stringify(evidence).length/3);
 assert.deepEqual(evidence,original,'the full server eligibility contract is never compacted');
 const visible=compactHistoryQueryCoverage(evidence,new Set([ids[0]]));
 assert.deepEqual(visible.history.needs[0].candidateIds,[ids[0]]);
 assert.deepEqual(visible.losses,[{sourceId:ids[0],reason:'prompt_budget'}]);
});
