import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEvidenceNeeds } from '../app/lib/intelligence/evidence-needs.ts';
import { buildEvidenceNeedCoverage } from '../app/lib/intelligence/evidence-need-coverage.ts';
import { compileHistoryReadStrategies } from '../app/lib/intelligence/history-read-strategies.ts';
import { buildHistoryObligations, reviewObligationCompletion } from '../app/lib/intelligence/history-obligations.ts';
import { parseTaskHistoryReview } from '../app/lib/intelligence/history-review-selection.ts';
import { evidenceNeedWindow } from '../app/lib/intelligence/evidence-need-window.ts';
const question='Aster rest in April 2023 and Birch rest in May 2024';
const raw=quote=>({quote,sourceTurnId:null,terms:['rest']});
const need=(quote,id='need:0')=>({...validateEvidenceNeeds([raw(quote)],question,[],[]).needs[0],id});
const span=(id,petId,occurredAt)=>({sourceId:id,petId,occurredAt,sourceType:'care_update',start:0,end:16,text:'Rest was normal.'});
const evidence=()=>({scope:{requestText:question,authorizedPetIds:['a','b']},
 interpretation:{request:{evidenceNeeds:[{...need('Aster rest in April 2023'),petIds:['a']}]}},
 represented:[span('old','a','2023-04-07T12:00:00Z'),span('new','a','2024-05-07T12:00:00Z'),span('other','b','2023-04-07T12:00:00Z')],
 sources:[{petId:'a',status:'loaded',loadedIds:['old','new']},{petId:'b',status:'loaded',loadedIds:['other']}],
 losses:[],history:{needs:[],provenance:[]}});
test('validated USER clauses retain independent temporal windows',()=>{
 const a=need('Aster rest in April 2023'), b=need('Birch rest in May 2024');
 assert.equal(a.window.from,'2023-04-01T00:00:00.000Z');assert.equal(b.window.to,'2024-06-01T00:00:00.000Z');
 assert.equal(validateEvidenceNeeds([{...raw('Aster rest in April 2023'),window:{from:'forged'}}],question,[],[]).needs.length,0);
 for(const quote of ['rest since April 2023','rest in April 2023 compared with now','rest in April','rest on February 30, 2023'])
  assert.equal(evidenceNeedWindow(quote),undefined);
});
test('local need queries intersect authorized windows and report inaccessible work',()=>{
 const needs=[need('Aster rest in April 2023')],window={from:'2023-04-15T00:00:00.000Z',to:'2024-01-01T00:00:00.000Z'};
 const broad={...window,descending:true,lexical:false,terms:[]};
 const r=compileHistoryReadStrategies('',2026,window,[broad],4,needs);
 const local=r.strategies.find(s=>s.needId);assert.equal(local.from,window.from);assert.equal(local.to,'2023-05-01T00:00:00.000Z');
 const outside=compileHistoryReadStrategies('',2026,{from:'2025-01-01T00:00:00.000Z',to:null},[],4,needs);
 assert.deepEqual(outside.strategies,[]);assert.deepEqual(outside.outsideNeeds,['need:0']);
});
test('coverage never substitutes a different month, pet, or undated source',()=>{
 const e=evidence();e.represented.push(span('undated','a',null));e.sources[0].loadedIds.push('undated');
 const c=buildEvidenceNeedCoverage(e)[0];
 assert.deepEqual(c.pets[0].representedSourceIds,['old']);assert.equal(c.window.from,'2023-04-01T00:00:00.000Z');
 e.represented=e.represented.filter(s=>s.sourceId!=='old');
 assert.deepEqual(buildEvidenceNeedCoverage(e)[0].pets[0].representedSourceIds,[]);
});
test('every requested pet gets its own fact obligation without dropping the whole question',()=>{
 const e=evidence();delete e.interpretation.request.evidenceNeeds[0].petIds;
 const obligations=buildHistoryObligations(e);
 assert.equal(obligations[0].text,question);assert.deepEqual(obligations.slice(1).map(o=>o.petId),['a','b']);
 assert.ok(obligations.slice(1).every(o=>o.window.from.startsWith('2023-04')));
});
test('a syntactically approved wrong-pet or wrong-period answer fails completion',()=>{
 const e=evidence(), obligations=buildHistoryObligations(e);
 const review=[{index:0,status:'answered',sentenceIndexes:[0]},{index:1,status:'answered',sentenceIndexes:[0]}];
 for(const id of ['new','other']){
  const result=reviewObligationCompletion(obligations,review,[{sourceIds:[id]}],e.represented);
  assert.deepEqual(result.failures,['obligation_evidence_scope:1']);
 }
 assert.deepEqual(reviewObligationCompletion(obligations,review,[{sourceIds:['old']}],e.represented).failures,[]);
});
test('explicit limited status retains missing-evidence state without inventing a citation',()=>{
 const e=evidence(),obligations=buildHistoryObligations(e);
 const review=[{index:0,status:'limited',sentenceIndexes:[0]},{index:1,status:'limited',sentenceIndexes:[0]}];
 const result=reviewObligationCompletion(obligations,review,[{sourceIds:[]}],[]);
 assert.deepEqual(result.failures,[]);assert.equal(result.completion[1].status,'limited');
 assert.deepEqual(result.completion[1].sourceIds,[]);assert.equal(result.completion[1].petId,'a');
});
test('review parser retains all thirteen completion records and rejects an omitted pet',()=>{
 const obligations=Array.from({length:13},(_,index)=>({index,status:'answered',sentenceIndexes:[0]}));
 const p={approved:true,retainedSentenceIndexes:[0],obligations};
 const parsed=parseTaskHistoryReview(p,1,13);assert.deepEqual(parsed.obligations,obligations);
 p.obligations[0].status='missing';assert.equal(parsed.obligations[0].status,'answered');
 assert.throws(()=>parseTaskHistoryReview({...p,obligations:obligations.slice(1)},1,13));
});

test('undecomposed larger cohorts still require an answer or limitation for each pet',()=>{
 const e=evidence();e.scope.authorizedPetIds=Array.from({length:10},(_,i)=>'pet-'+i);
 e.interpretation.request.evidenceNeeds=[];
 const obligations=buildHistoryObligations(e);
 assert.equal(obligations.length,11);assert.deepEqual(obligations.slice(1).map(o=>o.petId),e.scope.authorizedPetIds);
 const reviews=obligations.map(o=>({index:o.index,status:'answered',sentenceIndexes:[0]}));
 const result=reviewObligationCompletion(obligations,reviews,[{sourceIds:['one']}],[{sourceId:'one',petId:'pet-0'}]);
 assert.equal(result.failures.length,9);
});
