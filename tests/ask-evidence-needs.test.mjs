import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEvidenceNeeds } from '../app/lib/intelligence/evidence-needs.ts';
import { buildEvidenceNeedCoverage, evidenceRemovalCost } from '../app/lib/intelligence/evidence-need-coverage.ts';
import { compileHistoryReadStrategies } from '../app/lib/intelligence/history-read-strategies.ts';
const need={quote:'bedding change',sourceTurnId:null,terms:['bedding','mat']};
test('evidence needs require exact current or referenced USER text',()=>{
 const turns=[{id:'user',role:'user',text:'bedding change'},{id:'assistant',role:'furvise',text:'bedding change'}];
 assert.equal(validateEvidenceNeeds([need],'Explain the bedding change.',turns,[]).needs.length,1);
 for(const patch of [{quote:'invented diagnosis'},{sourceTurnId:'assistant'},{sourceTurnId:'user'},{terms:['x); DROP TABLE']}])
  assert.equal(validateEvidenceNeeds([{...need,...patch}],'Explain the bedding change.',turns,['assistant']).needs.length,0);
 assert.equal(validateEvidenceNeeds([{...need,sourceTurnId:'user'}],'Explain it.',turns,['user']).needs.length,1);
 assert.equal(validateEvidenceNeeds([{...need,petId:'foreign'}],'bedding change',turns,[]).needs.length,0);
});
test('need strategies preserve a broad query and report excess work inside the page budget',()=>{
 const window={from:'2023-01-01T00:00:00.000Z',to:'2026-01-01T00:00:00.000Z'};
 const needs=Array.from({length:4},(_,i)=>({...need,id:'need:'+i}));
 const r=compileHistoryReadStrategies('Compare April 17, 2024 with now.',2026,window,[{...window,descending:true,lexical:false,terms:[]}],4,needs);
 assert.equal(r.strategies.length,4);
 assert.ok(r.strategies.some(s=>s.target==='2024-04-17'));
 assert.ok(r.strategies.some(s=>s.needId==='need:0'));
 assert.ok(r.strategies.some(s=>!s.target&&!s.needId));
 assert.equal(r.omittedNeeds.length,2);
 assert.ok(r.strategies.every(s=>s.from>=window.from&&s.to<=window.to));
});
const fixture=()=>({scope:{authorizedPetIds:['pet']},interpretation:{request:{evidenceNeeds:[{...need,id:'need:0'}]}},
 sources:[{petId:'pet',status:'loaded',loadedIds:['care:one']}],losses:[],
 history:{needs:[{petId:'pet',needId:'need:0',candidateIds:['care:one'],exhausted:false,status:'partial'}],provenance:[]},
 represented:[{petId:'pet',sourceId:'care:one',sourceType:'care_update',start:0,end:16,text:'Bedding changed.'}]});
test('coverage follows actual representation and never certifies semantic support',()=>{
 const evidence=fixture();
 let coverage=buildEvidenceNeedCoverage(evidence);
 assert.equal(coverage[0].semanticSupport,'unverified');
 assert.equal(coverage[0].pets[0].state,'candidates_available');
 evidence.needCoverage=coverage;
 assert.equal(evidenceRemovalCost(evidence,'care:one'),1);
 assert.equal(evidenceRemovalCost(evidence,'care:unrelated'),0);
 for(const patch of [{represented:[]},{losses:[{sourceId:'care:one',reason:'prompt_budget'}]},
  {sources:[]},{represented:[{...evidence.represented[0],petId:'foreign'}]},
  {history:{...evidence.history,provenance:[{sourceId:'care:one',status:'deleted_or_changed'}]}}]){
  coverage=buildEvidenceNeedCoverage({...evidence,...patch});
  assert.equal(coverage[0].pets[0].state,'not_represented');
  assert.deepEqual(coverage[0].pets[0].representedSourceIds,[]);
 }
});

test('per-need subjects can narrow but never widen the authorized read scope',()=>{
 const scoped=[{id:'a',name:'Aster'},{id:'b',name:'Bramble'}];
 const result=validateEvidenceNeeds([{...need,petNames:['Bramble']}],'Explain the bedding change.',[],[],scoped);
 assert.deepEqual(result.needs[0].petIds,['b']);
 assert.equal(validateEvidenceNeeds([{...need,petNames:['Foreign']}],'bedding change',[],[],scoped).needs.length,0);
 const evidence=fixture(); evidence.scope.authorizedPetIds=['pet','another'];
 evidence.interpretation.request.evidenceNeeds[0].petIds=['pet'];
 assert.deepEqual(buildEvidenceNeedCoverage(evidence)[0].pets.map(p=>p.petId),['pet']);
});
test('missing search and failed retrieval remain distinct from missing representation',()=>{
 const evidence=fixture();evidence.represented=[];
 for(const [queries,state] of [
  [[], 'not_queried'],
  [[{petId:'pet',needId:'need:0',candidateIds:[],exhausted:false,status:'partial',reason:'need_query_budget'}],'not_queried'],
  [[{petId:'pet',needId:'need:0',candidateIds:[],exhausted:false,status:'unavailable'}],'query_unavailable'],
  [[{petId:'pet',needId:'need:0',candidateIds:[],exhausted:true,status:'unknown'}],'no_candidate_match'],
 ]){
  evidence.history.needs=queries;
  const result=buildEvidenceNeedCoverage(evidence)[0];
  assert.equal(result.pets[0].state,state);
  assert.equal(result.semanticSupport,'unverified');
 }
});

test('opposite temporal needs retain separate query directions and last-candidate protection',()=>{
 const window={from:null,to:null};
 const needs=['earliest','latest'].map((order,i)=>({...need,id:'need:'+i,order}));
 const plan=compileHistoryReadStrategies('Compare earliest and latest bedding.',2026,window,
  [{...window,descending:true,lexical:false,terms:[]}],4,needs);
 assert.deepEqual(plan.strategies.filter(s=>s.needId).map(s=>s.descending),[false,true]);
 const evidence=fixture();
 evidence.represented[0].occurredAt='2022-01-01T00:00:00Z';
 evidence.represented.push({...evidence.represented[0],sourceId:'care:two',occurredAt:'2025-01-01T00:00:00Z'});
 evidence.sources[0].loadedIds.push('care:two');
 evidence.interpretation.request.evidenceNeeds=needs;
 evidence.needCoverage=buildEvidenceNeedCoverage(evidence);
 assert.deepEqual(evidence.needCoverage.map(n=>n.pets[0].representedSourceIds),[['care:one'],['care:two']]);
 assert.equal(evidenceRemovalCost(evidence,'care:one'),1);
 assert.equal(evidenceRemovalCost(evidence,'care:two'),1);
});
