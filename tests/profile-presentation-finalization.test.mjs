import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
let calls=0;
globalThis.__profileFinalizationProvider={responses:{create:async()=>{calls++;throw Error('PROFILE_FINALIZATION_PROVIDER_FORBIDDEN');}}};
registerHooks({resolve(s,c,next){
 if(s==='server-only')return {url:'data:text/javascript,export {};',format:'module',shortCircuit:true};
 if(c.parentURL?.endsWith('/finalize-ask-answer.ts') && s.includes('review-task-completion')){
  const url=new URL('../app/lib/intelligence/review-task-completion.ts',import.meta.url).href;
  return {shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent('import {reviewTaskCompletion as review} from '+JSON.stringify(url)+'; export async function reviewTaskCompletion(input){globalThis.__profileTaskInput=input.validation;const output=await review({...input,client:globalThis.__profileFinalizationProvider});globalThis.__profileTaskOutput=output;return output;}')};
 }
 return next(s,c);
}});
const {generateContextAwareAskResponse}=await import('../app/lib/ai/ask-reasoning.ts');
const {evidenceSource}=await import('../app/lib/intelligence/ask-evidence.ts');
const {finalizeAskAnswer}=await import('../app/lib/intelligence/finalize-ask-answer.ts');
const {buildGovernedAskExecutionPlan}=await import('../app/lib/intelligence/ask-execution-plan.ts');
const {reviewHistoricalAnswer}=await import('../app/lib/intelligence/review-history-narrative.ts');
const {reviewTaskCompletion}=await import('../app/lib/intelligence/review-task-completion.ts');
const {validateGeneratedAnswer}=await import('../app/lib/intelligence/validation/validate-answer.ts');
const {clearHistoryReview,readReviewedHistoryAnswer}=await import('../app/lib/intelligence/history-review-state.ts');
const {derivePublicationAuthority}=await import('../app/lib/intelligence/publication-authority.ts');
const {PROFILE_PRESENTATION_LIMITATION,PROFILE_PRESENTATION_UNAVAILABLE,profilePresentationLimitationFailure}=await import('../app/lib/intelligence/profile-presentation-limitation.ts');
const pet={id:'owned-subject',user_id:'owner',name:'Subject',species:'dog',weight_value:7.23,weight_unit:'kg',updated_at:'2026-01-01T00:00:00Z'};
async function fixture(format){
 calls=0;globalThis.__profileTaskInput=undefined;globalThis.__profileTaskOutput=undefined;
 const interpretation={operation:'recall',readOperation:'recall',petIds:[pet.id],readOnly:true,
  request:{mode:'read',evidenceBasis:'saved_profile',profileFields:['species','weight'],referenceTurnIds:[],requirements:[],readTicket:null,outputFormat:format}};
 const evidence={version:'ask-evidence.v1',petNames:{[pet.id]:pet.name},
  scope:{authorizedPetIds:[pet.id],requestText:'Requested saved profile fields',status:'resolved',readOnlyRecall:true,requestKind:'ordinary'},
  interpretation,sources:[evidenceSource(pet.id,'profile',[pet.id])],represented:[],losses:[],verifiedFacts:[],
  completeness:{retrieval:'unknown',corrections:'unknown',extraction:'unknown',grouping:'unknown'},representation:'complete'};
 const context={owner:{userId:'owner'},pet,eligiblePets:[pet],currentMessage:evidence.scope.requestText,conversationTurns:[],memories:[],careEntries:[],askInterpretation:interpretation};
 const reasoning=await generateContextAwareAskResponse({profiles:[pet],question:context.currentMessage,careEntries:[],recentUpdates:[],memories:[],productFeedback:[],conversationTurns:[],evidenceContract:evidence,client:globalThis.__profileFinalizationProvider});
 const executionPlan=buildGovernedAskExecutionPlan({sourceMessageId:'source',petId:pet.id,careActions:[],semanticEvents:[],learnings:[]});
 return {reasoning,context,requestId:'offline-profile-finalization',authoritativePetIds:[pet.id],executionPlan};
}
for(const format of ['csv','json'])test(format+' source-free limitation is terminal through real finalization',async()=>{
 const f=await fixture(format),authority=derivePublicationAuthority(f.reasoning.evidenceContract);
 assert.equal(f.reasoning.model,PROFILE_PRESENTATION_UNAVAILABLE);
 const {validation:v}=await finalizeAskAnswer(f);
 assert.equal(v,globalThis.__profileTaskInput);assert.equal(v,globalThis.__profileTaskOutput);
 assert.equal(v.valid,true);assert.equal(v.assessment.outcome,'limited');assert.equal(v.assessment.checks.taskCompletion,'failed');
 assert.equal(v.completion,undefined);assert.equal(v.response.answer.summary,PROFILE_PRESENTATION_LIMITATION);
 assert.equal(profilePresentationLimitationFailure(v.response),null);assert.ok(readReviewedHistoryAnswer(v.response));
 for(const key of ['relevantContextIds','referencedRecords','applicationActions','careActions','semanticEvents','learnings'])assert.deepEqual(v.response[key],[]);
 assert.deepEqual(v.response.evidenceContract.answerSourceIds,[]);assert.deepEqual(v.response.evidenceContract.answerContent,[]);
 assert.deepEqual(derivePublicationAuthority(v.response.evidenceContract),authority);
 assert.equal(calls,0);
});
for(const [name,mutate] of [
 ['altered limitation',r=>{r.answer.summary='No saved profile exists.';}],
 ['factual value',r=>{r.answer.summary+=' 7.23 kg';}],
 ['source ID',r=>{r.relevantContextIds.push('profile:'+pet.id+':weight');}],
 ['action',r=>{r.applicationActions.push({kind:'pet.update_profile'});}],
])test('tampered '+name+' fails before terminal task-review bypass',async()=>{
 for(const format of ['csv','json']){
  const f=await fixture(format);assert.equal(await reviewHistoricalAnswer({result:f.reasoning,client:globalThis.__profileFinalizationProvider}),true);
  mutate(f.reasoning);assert.notEqual(profilePresentationLimitationFailure(f.reasoning),null);assert.equal(readReviewedHistoryAnswer(f.reasoning),null);
  assert.equal(validateGeneratedAnswer(f.reasoning,f.context,'routine',[pet.id]).valid,false);
  await assert.rejects(finalizeAskAnswer(f),/FURVISE_ANSWER_VALIDATION_FAILED/);
  assert.equal(globalThis.__profileTaskInput,undefined);assert.equal(calls,0);
 }
});
test('terminal bypass requires the existing review receipt and successful validation',async()=>{
 for(const missing of ['receipt','validation']){
  const f=await fixture('csv');await reviewHistoricalAnswer({result:f.reasoning,client:globalThis.__profileFinalizationProvider});
  const validation=validateGeneratedAnswer(f.reasoning,f.context,'routine',[pet.id]);assert.equal(validation.valid,true);
  if(missing==='receipt')clearHistoryReview(validation.response);else validation.valid=false;
  await assert.rejects(reviewTaskCompletion({validation,context:f.context,requestId:f.requestId,validate:()=>validation,client:globalThis.__profileFinalizationProvider}),/PROFILE_FINALIZATION_PROVIDER_FORBIDDEN/);
  assert.equal(calls,1);
 }
});
test('supported profile factual answers retain their separate task-review behavior',async()=>{
 const f=await fixture('prose');await reviewHistoricalAnswer({result:f.reasoning,client:globalThis.__profileFinalizationProvider});
 const validation=validateGeneratedAnswer(f.reasoning,f.context,'routine',[pet.id]);assert.equal(validation.valid,true);
 await assert.rejects(reviewTaskCompletion({validation,context:f.context,requestId:f.requestId,validate:()=>validation,client:globalThis.__profileFinalizationProvider}),/PROFILE_FINALIZATION_PROVIDER_FORBIDDEN/);
 assert.equal(calls,1);
});
