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
 try{return next(s,c);}catch(error){if(error.code==='ERR_MODULE_NOT_FOUND' && s.startsWith('.') && !/\.[a-z]+$/i.test(s))return next(s+'.ts',c);throw error;}
}});
const {generateContextAwareAskResponse}=await import('../app/lib/ai/ask-reasoning.ts');
const {evidenceSource}=await import('../app/lib/intelligence/ask-evidence.ts');
const {finalizeAskAnswer}=await import('../app/lib/intelligence/finalize-ask-answer.ts');
const {buildGovernedAskExecutionPlan}=await import('../app/lib/intelligence/ask-execution-plan.ts');
const pet={id:'owned-subject',user_id:'owner',name:'Rill',species:'dog',current_food:'oat and hake',age_value:8,age_unit:'months',wellness_goal:'comfortable travel',avoid_ingredients:['fennel','sorghum'],weight_value:7.23,weight_unit:'kg',updated_at:'2026-01-01T00:00:00Z'};
async function fixture(format){
 calls=0;globalThis.__profileTaskInput=undefined;globalThis.__profileTaskOutput=undefined;
 const interpretation={operation:'recall',readOperation:'recall',petIds:[pet.id],readOnly:true,
  request:{mode:'read',evidenceBasis:'saved_profile',profileFields:['current_food','age','care_goal','avoid'],referenceTurnIds:[],requirements:[],readTicket:null,outputFormat:format}};
 const evidence={version:'ask-evidence.v1',petNames:{[pet.id]:pet.name},
  scope:{authorizedPetIds:[pet.id],requestText:'Requested saved profile fields',status:'resolved',readOnlyRecall:true,requestKind:'ordinary'},
  interpretation,sources:[evidenceSource(pet.id,'profile',[pet.id])],represented:[],losses:[],verifiedFacts:[],
  completeness:{retrieval:'unknown',corrections:'unknown',extraction:'unknown',grouping:'unknown'},representation:'complete'};
 const context={owner:{userId:'owner'},pet,eligiblePets:[pet],currentMessage:evidence.scope.requestText,conversationTurns:[],memories:[],careEntries:[],askInterpretation:interpretation};
 const reasoning=await generateContextAwareAskResponse({profiles:[pet],question:context.currentMessage,careEntries:[],recentUpdates:[],memories:[],productFeedback:[],conversationTurns:[],evidenceContract:evidence,client:globalThis.__profileFinalizationProvider});
 const executionPlan=buildGovernedAskExecutionPlan({sourceMessageId:'source',petId:pet.id,careActions:[],semanticEvents:[],learnings:[]});
 return {reasoning,context,requestId:'offline-profile-finalization',authoritativePetIds:[pet.id],executionPlan};
}

const {buildAskConversationResponse}=await import('../app/lib/ask.mjs');
const {inspectAskPublication}=await import('../app/lib/intelligence/inspect-ask-publication.ts');
test('certified mixed profile values survive actual final publication',async()=>{
 const f=await fixture('prose'),v=(await finalizeAskAnswer(f)).validation;
 assert.equal(v.valid,true);
 const response=buildAskConversationResponse(v.response.answer);
 const p=inspectAskPublication(v.response.answer,response,true,v.response.evidenceContract);
 assert.equal(p.failure,null);
 assert.equal(calls,0);
});
