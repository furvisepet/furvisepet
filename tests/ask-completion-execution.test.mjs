import * as C from "./helpers/canonical-calculation-retirement.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnswerAssessment, assessmentMatches } from '../app/lib/intelligence/answer-assessment.ts';
// Wait for the full-algebra fixture to install its test-only policy hook before
// this helper loads the public response graph. Production policy is unchanged.
const { assertStoredPublicationUnavailable } = await import('./helpers/unsupported-stored-publication.mjs');
import { OperationDeadline, StageDeadlineError } from '../app/lib/ai/execution-deadline.ts';
import { safeAskDiagnosticStage } from '../app/lib/ai/ask-error-diagnostic.ts';
const checks=()=>({structuralValidity:'passed',evidenceSupport:'passed',subjectDateCorrectness:'passed',calculationCorrectness:'passed',taskCompletion:'passed'});
test('no final outcome can hide failed or unevaluated completion checks',()=>{
 for(const key of Object.keys(checks())) for(const state of ['failed','not_evaluated']){
  const r=createAnswerAssessment({checks:{...checks(),[key]:state},body:'answer',evidence:'source'});
  assert.notEqual(r.outcome,'complete',key+state);
 }
 assert.throws(()=>createAnswerAssessment({checks:{...checks(),taskCompletion:'yes'},body:'x',evidence:[]}));
});
test('assessment is bound to final body and exact evidence; a clone is only diagnostics',()=>{
 const body={summary:'verified'},evidence={source:'one'},r=createAnswerAssessment({checks:checks(),body,evidence});
 assert.equal(r.outcome,'complete');assert.ok(assessmentMatches(r,body,evidence));
 assert.equal(assessmentMatches(r,{summary:'fallback'},evidence),false);
 assert.equal(assessmentMatches(r,body,{source:'changed'}),false);
});
test('an explicit safe limitation does not become unsafe or falsely complete',()=>{
 const r=createAnswerAssessment({checks:{...checks(),calculationCorrectness:'not_evaluated',taskCompletion:'failed'},body:'Only source excerpts',evidence:[]});
 assert.equal(r.outcome,'limited');
 assert.equal(createAnswerAssessment({checks:checks(),body:'x',evidence:[],unsafe:true}).outcome,'failed');
});
test("percentage share consumes original certified records without invented intermediate values",async()=>{
 for(const [active,rest] of [[1,5],[20,1],[31,4]])await C.certified("percent_of_sum",[active+" minutes",rest+" minutes"],"%",active/(active+rest)*100,{unit:"minute",precision:1});C.rejects(c=>c.value=88.6);
});
test("arbitrary programs are rejected and canonical zero denominators fail closed",async()=>{
 for(const expression of [[0,1,"add"],[0,1,"divide"],[4],[0,"add"]])C.rejects(c=>{c.operator="expression";c.expression=expression;});const f=await C.measured("ratio",["0 kg","4 kg"],"scalar");assert.equal(f.response.model,"server-calculation-unavailable");await C.finish(f);
});
function exportEvidence(){
 const ids=Array.from({length:10},(_,i)=>'p'+i);
 return {scope:{authorizedPetIds:ids,status:'resolved',readOnlyRecall:true,requestKind:'record_lookup'},
  interpretation:{history:{from:'2024-04-07T00:00:00.000Z',to:'2024-04-08T00:00:00.000Z'},request:{outputFormat:'csv',
   projection:{nameHeader:'pet',valueHeader:'grams',quantity:'body_mass',unit:'g',order:'name_ascending'}}},
  petNames:Object.fromEntries(ids.map((id,i)=>[id,'Pet'+i])),
  history:{corrections:'complete',provenance:[]},losses:[],
  sources:ids.map(id=>({petId:id,status:'loaded',loadedIds:['care:'+id]})),
  represented:ids.map((id,i)=>{const text='Pet'+i+' body weight was '+(i+1)+' kg without equipment.';
   return {sourceId:'care:'+id,petId:id,sourceType:'care_update',occurredAt:'2024-04-07T12:00:00.000Z',start:0,end:text.length,text};})};
}
test("unsupported export cannot calculate convert or sort profile/history values",async()=>{
 const e=exportEvidence();e.represented.reverse();await assertStoredPublicationUnavailable(e);
 e.interpretation.request.projection.order="value_descending";await assertStoredPublicationUnavailable(e);
});
test('deterministic projection declines missing, ambiguous, unavailable, corrected and out-of-date measurements',async()=>{
 for(const mutate of [
  e=>e.represented.pop(),
  e=>e.represented.push({...e.represented[0],sourceId:'duplicate'}),
  e=>{e.history.corrections='unavailable';},
  e=>{e.represented[0].occurredAt='2024-04-08T12:00:00.000Z';},
  e=>{e.losses.push({sourceId:e.represented[0].sourceId,reason:'prompt_budget'});},
  e=>{e.history.provenance.push({sourceId:e.represented[0].sourceId,status:'unlinked_correction_uncertain'});},
  e=>{const s=e.represented[0];s.text='Pet0 weighed 7 kg including a carrier.';s.end=s.text.length;}
 ]){
  const e=exportEvidence();mutate(e);
  if(e.represented.at(-1)?.sourceId==='duplicate')e.sources[0].loadedIds.push('duplicate');
  await assertStoredPublicationUnavailable(e);
 }
});
test('remaining stage budgets shrink and preserve independent-review reserve',()=>{
 let now=0;const budget=new OperationDeadline(45000,()=>now);
 assert.equal(budget.allocate('answer_generation',25000,8000),25000);
 now=30000;assert.equal(budget.allocate('repair',20000,8000),7000);
 now=38000;assert.throws(()=>budget.allocate('repair',20000,8000),StageDeadlineError);
 now=45001;assert.equal(budget.remainingMs(),0);
 assert.throws(()=>budget.allocate('verification',18000),StageDeadlineError);
});
test('public error taxonomy never includes exception text',()=>{
 assert.equal(safeAskDiagnosticStage('primary_timeout'),'ASK_PRIMARY_TIMEOUT');
 for(const text of ['secret=value','Stack trace at','care note text',null])assert.equal(safeAskDiagnosticStage(text),null);
});

test('admission settlement cannot erase a durable answer or complete a failed persistence',async()=>{
 const {createAskAdmissionSettlement}=await import('../app/lib/ai/ask-admission-settlement.ts');
 const calls=[],logs=[];
 const {finalizeAiAdmissionAfterPersistence}=createAskAdmissionSettlement((stage)=>logs.push(stage));
 const admission={complete:async()=>{calls.push('complete');throw Error('bookkeeping');},fail:async()=>{calls.push('fail');}};
 await finalizeAiAdmissionAfterPersistence({admission,alreadyFinalized:false,assessment:createAnswerAssessment({checks:checks(),body:'answer',evidence:'source'}),requestId:'r',response:new Response('saved')});
 assert.deepEqual(calls,['complete']);assert.deepEqual(logs,['ai_operation_completion']);
 await finalizeAiAdmissionAfterPersistence({admission,alreadyFinalized:false,assessment:createAnswerAssessment({checks:checks(),body:'answer',evidence:'source'}),requestId:'r',response:new Response('failed',{status:503})});
 assert.deepEqual(calls,['complete','fail']);
 await finalizeAiAdmissionAfterPersistence({admission,alreadyFinalized:true,assessment:createAnswerAssessment({checks:checks(),body:'answer',evidence:'source'}),requestId:'r',response:new Response('saved')});
 assert.equal(calls.length,2);
});


test('HTTP delivery never upgrades limited, failed, or missing assessments', async () => {
 const {createAskAdmissionSettlement}=await import('../app/lib/ai/ask-admission-settlement.ts');
 const calls=[];
 const settlement=createAskAdmissionSettlement(()=>{});
 const admission={complete:async()=>calls.push('complete'),fail:async error=>calls.push(error.message)};
 for(const [assessment,expected] of [
  [createAnswerAssessment({checks:{...checks(),taskCompletion:'failed'},body:'limited',evidence:[]}), 'ASK_ANSWER_LIMITED'],
  [createAnswerAssessment({checks:{...checks(),evidenceSupport:'failed'},body:'unsafe',evidence:[]}), 'ASK_ANSWER_FAILED'],
  [null, 'ASK_ANSWER_UNASSESSED'],
 ]) {
  // A delivered action receipt or JSON outcome is not an answer assessment.
  const response=Response.json({success:true,outcome:'complete',applicationActions:[{status:'succeeded'}]});
  await settlement.finalizeAiAdmissionAfterPersistence({admission,alreadyFinalized:false,assessment,requestId:'r',response});
  assert.equal(calls.at(-1),expected);
  assert.equal(response.bodyUsed,false);
  assert.equal((await response.json()).success,true);
 }
 assert.equal(calls.includes('complete'),false);
});

test('failure bookkeeping errors preserve limited answers and finalized admissions are untouched', async () => {
 const {createAskAdmissionSettlement}=await import('../app/lib/ai/ask-admission-settlement.ts');
 const calls=[],logs=[];
 const settlement=createAskAdmissionSettlement(stage=>logs.push(stage));
 const admission={complete:async()=>calls.push('complete'),fail:async()=>{calls.push('fail');throw Error('store unavailable');}};
 const response=new Response('saved fallback');
 const input={admission,alreadyFinalized:false,assessment:null,requestId:'r',response};
 await settlement.finalizeAiAdmissionAfterPersistence(input);
 assert.deepEqual(calls,['fail']);assert.deepEqual(logs,['ai_operation_failure_recording']);
 assert.equal(await response.text(),'saved fallback');
 await settlement.finalizeAiAdmissionAfterPersistence({...input,alreadyFinalized:true});
 await settlement.finalizeAiAdmissionAfterPersistence({...input,admission:null});
 assert.deepEqual(calls,['fail']);
});

test("percentage publication retains source lineage and rejects fabricated provenance",async()=>{
 const closed=await C.measured("percent_of_sum",["2 minutes","7 minutes"],"%",{unit:"minute",precision:1});
 assert.equal(closed.response.model,"server-calculation-labs");
 assert.equal(C.calculationPublicationFailure(closed.response),null);
 assert.deepEqual(closed.response.calculationLabs.execution.results[0].sourceIds,["care:source-0","care:source-1"]);
 closed.response.calculationLabs.execution.results[0].sourceIds=["care:invented-intermediate"];
 assert.equal(C.calculationPublicationFailure(closed.response),"calculation_snapshot_changed");
 assert.equal(closed.calls(),0);
 const open=await C.measured("percent_of_sum",["2 minutes","7 minutes"],"%",{unit:"minute",precision:1,fixture:{closed:false}});
 assert.equal(open.response.model,"server-calculation-unavailable");
 assert.equal(open.response.calculationLabs,undefined);
 assert.deepEqual(open.response.relevantContextIds,[]);
 assert.equal((await C.finish(open)).assessment.outcome,"limited");
 assert.equal(open.calls(),0);
});
