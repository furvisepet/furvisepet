import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {buildGovernedAskExecutionPlan} from '../app/lib/intelligence/ask-execution-plan.ts';

// Exercise the production coordinator with isolated stage doubles. No provider
// network, persistence, or alternative coordinator implementation is involved.
registerHooks({resolve(specifier,context,next){
 if(specifier==='server-only')return {shortCircuit:true,url:'data:text/javascript,export default {}'};
 if(context.parentURL?.endsWith('/finalize-ask-answer.ts')){
  const names=specifier.includes('review-history-narrative')?['reviewHistoricalAnswer']
   :specifier.includes('review-task-completion')?['reviewTaskCompletion']
   :specifier.includes('validation/validate-answer')?['validateGeneratedAnswer']
   :specifier.includes('history-review-state')?['readReviewedHistoryAnswer','recordHistoryReview','historyReviewSignature','clearHistoryReview']:[];
  if(names.length)return {shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent(names.map(name=>`export const ${name}=(...args)=>globalThis.__finalizationStages.${name}(...args);`).join('\n'))};
 }
 return next(specifier,context);
}});
const {finalizeAskAnswer}=await import('../app/lib/intelligence/finalize-ask-answer.ts');
function fixture({valid=true,taskStatus='passed',ready=false,tamper=false}={}){
 const calls=[];
 const resolvedSafety={level:"routine",currentMessageEmergency:false,currentMessageEmergencyTags:[]};
 const reasoning={intelligenceSafety:{level:'routine'},answer:{summary:'Draft'},applicationActions:[]};
 const response={...reasoning,answer:{summary:'Reviewed'}};
 const checks={structuralValidity:'passed',evidenceSupport:'passed',subjectDateCorrectness:'passed',calculationCorrectness:'not_applicable',taskCompletion:taskStatus};
 const validation={valid,response,errors:valid?[]:['unsafe_claim'],repairs:[],qualityWarnings:[],assessment:{checks},completion:ready?[{index:0,status:'action_ready'}]:[]};
 const plan=buildGovernedAskExecutionPlan({sourceMessageId:'source',petId:'pet',careActions:[],semanticEvents:[],learnings:[]});
 globalThis.__finalizationStages={
  reviewHistoricalAnswer:async input=>{calls.push('history');assert.equal(input.executionPlan,plan);if(tamper)plan.petId='other';},
  validateGeneratedAnswer:(candidate,context,safety,ids,resolved)=>{assert.strictEqual(resolved,resolvedSafety);calls.push('validate');assert.deepEqual(ids,['pet']);assert.equal(safety,'routine');return validation;},
  reviewTaskCompletion:async input=>{assert.strictEqual(input.resolvedSafety,resolvedSafety);calls.push('task');assert.equal(input.validation,validation);assert.deepEqual(input.pendingCareEvents,plan.semanticEvents);return validation;},
  clearHistoryReview:()=>{throw Error('Unexpected emergency');},readReviewedHistoryAnswer:()=>null,recordHistoryReview:()=>{throw Error('Unexpected review authority');},historyReviewSignature:()=>''
 };
 return {calls,reasoning,validation,input:{reasoning,safety:resolvedSafety,context:{},requestId:'request',executionPlan:plan,authoritativePetIds:['pet']}};
}
test('one finalizer orders historical review, validation and task review once',async()=>{
 const f=fixture();const result=await finalizeAskAnswer(f.input);
 assert.deepEqual(f.calls,['history','validate','task']);assert.equal(result.validation,f.validation);
 assert.equal(result.suppressWrites,false);assert.equal(f.reasoning.answer.summary,'Reviewed');
});
test('invalid core output stops before task review and publication',async()=>{
 const f=fixture({valid:false});await assert.rejects(finalizeAskAnswer(f.input),{code:'ASK_ANSWER_UNSAFE_CLAIM'});
 assert.deepEqual(f.calls,['history','validate']);assert.equal(f.reasoning.answer.summary,'Draft');
});
test('failed completion suppresses writes; reviewed execution readiness is not discarded',async()=>{
 for(const ready of [false,true]){const f=fixture({taskStatus:'failed',ready});assert.equal((await finalizeAskAnswer(f.input)).suppressWrites,!ready);}
});
test('changed or reconstructed plans cannot cross the review boundary',async()=>{
 const f=fixture({tamper:true});await assert.rejects(finalizeAskAnswer(f.input),/ASK_EXECUTION_PLAN_CHANGED/);
 assert.deepEqual(f.calls,['history']);assert.equal(f.reasoning.answer.summary,'Draft');
 const fresh=fixture();fresh.input.executionPlan=structuredClone(fresh.input.executionPlan);
 await assert.rejects(finalizeAskAnswer(fresh.input),/ASK_EXECUTION_PLAN_CHANGED/);assert.deepEqual(fresh.calls,[]);
});
