import test from 'node:test';
import assert from 'node:assert/strict';
import { exceedsSelectedPetRead } from '../app/lib/intelligence/selected-pet-read.ts';
import { historicalAgeCutoff, oldestCalendarUnit, calendarPeriodContaining } from '../app/lib/intelligence/history-periods.ts';
import { compileHistoryReadStrategies } from '../app/lib/intelligence/history-read-strategies.ts';
import { completedEmptyEvidenceNeeds, historyCompletionLimits } from '../app/lib/intelligence/evidence-need-coverage.ts';

test('interactive read scope rejects foreign selected subjects across every read channel, not general conversation or writes',()=>{
 const read={petIds:['a'],request:{evidenceBasis:'saved_history'}};
 assert.equal(exceedsSelectedPetRead(read,'a'),false);
 for(const patch of [{petIds:['a','b']},{petIds:['b']},{readPetIds:['b']},{request:{...read.request,evidenceNeeds:[{petIds:['b']}]}}])
  assert.equal(exceedsSelectedPetRead({...read,...patch},'a'),true);
 for(const evidenceBasis of ['general','supplied_context',null]) assert.equal(exceedsSelectedPetRead({petIds:['b'],request:{evidenceBasis}},'a'),false);
 assert.equal(exceedsSelectedPetRead({...read,request:{evidenceBasis:'saved_profile'},petIds:['b']},'a'),true);
 const multi={petIds:['a','b'],readPetIds:['a','b'],readOnly:true,request:{evidenceBasis:'saved_history',mode:'read',evidenceNeeds:[{petIds:['a']},{petIds:['b']}]}};
 assert.equal(exceedsSelectedPetRead(multi,'a',['a','b']),false,'explicit owned multi-pet reads may widen read scope');
 const alternate={petIds:['b'],readOnly:true,request:{evidenceBasis:'saved_history',mode:'read'}};
 assert.equal(exceedsSelectedPetRead(alternate,'a',['a','b'],['b']),false,'current USER explicit owned alternate read may widen scope');
 assert.equal(exceedsSelectedPetRead(alternate,'a',['a','b'],[]),true,'model-only alternate pet cannot widen scope');
 assert.equal(exceedsSelectedPetRead(multi,'a',['a']),true,'unowned subjects still fail closed');
 assert.equal(exceedsSelectedPetRead({...multi,readOnly:false},'a',['a','b'],['b']),true,'writes never inherit widened read scope');
});

test('relative history cutoffs use the local calendar, clamp month endpoints, and do not guess ambiguous ages',()=>{
 assert.equal(historicalAgeCutoff('Changes recorded more than 2 years ago.',new Date('2026-09-16T06:00:00Z'),'America/Vancouver'),'2024-09-15');
 assert.equal(historicalAgeCutoff('Notes older than 1 month',new Date('2024-03-31T12:00:00Z')),'2024-02-29');
 assert.equal(historicalAgeCutoff('Records over 1 year ago',new Date('2024-02-29T12:00:00Z')),'2023-02-28');
 assert.equal(historicalAgeCutoff('Possibly two years ago'),null);
 assert.equal(oldestCalendarUnit('List the oldest year of history.'),'year');
 assert.equal(oldestCalendarUnit('Summarize the earliest recorded month of notes.'),'month');
 assert.equal(oldestCalendarUnit('What happened last year?'),null);
 assert.deepEqual(calendarPeriodContaining('2021-09-18T12:00:00Z','year'),{from:'2021-01-01T00:00:00.000Z',to:'2022-01-01T00:00:00.000Z'});
});

test('temporal sampling spans the authorized window without more query slots or losing facets',()=>{
 const window={from:'2021-09-16T00:00:00.000Z',to:'2024-09-16T00:00:00.000Z'};
 const proposed=[{...window,descending:false,lexical:false,terms:[]}];
 const needs=[{id:'need:0',quote:'changes',terms:['transition'],order:'context'}];
 const result=compileHistoryReadStrategies('Summarize older history',2026,window,proposed,4,needs,'UTC',true);
 assert.equal(result.strategies.length,4);
 assert.equal(result.strategies[0].needId,'need:0');
 const periods=result.strategies.filter(s=>s.period);
 assert.equal(periods.length,3);
 assert.equal(periods[0].from,window.from);assert.equal(periods.at(-1).to,window.to);
 for(let i=1;i<periods.length;i++)assert.equal(periods[i-1].to,periods[i].from);
});

test('an empty lexical search cannot override differently worded in-window observations',()=>{
 const text='Hesitated before stepping up.';
 const evidence={scope:{authorizedPetIds:['a']},interpretation:{request:{evidenceNeeds:[{id:'need:0',quote:'mobility history',terms:['mobility']}]}},
  history:{needs:[{petId:'a',needId:'need:0',candidateIds:[],exhausted:true,status:'unknown'}],provenance:[]},
  sources:[{petId:'a',status:'loaded',loadedIds:['care:one']}],losses:[],
  represented:[{petId:'a',sourceType:'care_update',sourceId:'care:one',text,start:0,end:text.length}]};
 assert.deepEqual(completedEmptyEvidenceNeeds(evidence),[]);
 assert.deepEqual(completedEmptyEvidenceNeeds({...evidence,represented:[]}),['["need:0","a"]']);
});

test('a positive model verdict cannot make incomplete periods or missing transitions billable',()=>{
 const evidence={interpretation:{request:{}},history:{periods:[{exhausted:false,candidateIds:['care:a']}]},losses:[],represented:[{sourceId:'care:a'}]};
 assert.deepEqual(historyCompletionLimits(evidence),['requested_period_sampled_not_complete']);
 evidence.history.periods[0].exhausted=true;
 assert.deepEqual(historyCompletionLimits(evidence),[]);
 evidence.losses.push({sourceId:'care:a',reason:'prompt_budget'});
 assert.deepEqual(historyCompletionLimits(evidence),['requested_period_sampled_not_complete']);
 evidence.history={eventCandidateIds:[]};evidence.losses=[];
 assert.deepEqual(historyCompletionLimits(evidence),['requested_transition_not_retrieved']);
 evidence.history.eventCandidateIds=['care:a'];
 assert.deepEqual(historyCompletionLimits(evidence),[]);
});
