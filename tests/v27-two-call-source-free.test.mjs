import {assertNativeSchemaField} from "./helpers/direct-protocol.mjs";
import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
registerHooks({ resolve(s,c,next) { return s === 'server-only'
  ? { url:'data:text/javascript,export {};', format:'module', shortCircuit:true } : next(s,c); } });
const { interpretAskQuestion } = await import('../app/lib/intelligence/interpret-ask.ts');
const { createAskEvidenceContract } = await import('../app/lib/intelligence/ask-evidence.ts');
const { generateContextAwareAskResponse } = await import('../app/lib/ai/ask-reasoning.ts');
const { validateGeneratedAnswer } = await import('../app/lib/intelligence/validation/validate-answer.ts');
const { reviewTaskCompletion } = await import('../app/lib/intelligence/review-task-completion.ts');

test('interpretation draft and independent review use exactly two provider requests for an unseen general question', async () => {
 const question = 'How does fog form over a lake in the morning?';
 const draft = 'Fog can form when moist air near a lake cools enough for water vapor to condense into tiny droplets.';
 const pet = { id:'pet-scope', user_id:'owner', name:'Pet', species:'dog' };
 const context = { owner:{userId:'owner'},pet,eligiblePets:[pet],currentMessage:question,
   currentTurn:{id:'turn-1',role:'user',text:question},conversationTurns:[],timeZone:'UTC',
   careEntries:[],selectedCareEntries:[],memories:[] };
 const proposal = {version:'ask-request.v2',mode:'conversation',scope:'none',operation:'general',
   selection:'summary',question,requirements:[],referenceTurnIds:[],petNames:[],excludedPetNames:[],
   quantity:null,topic:'weather',terms:[],from:null,to:null,episodeTopic:null,ordinal:null,
   frame:null,evidenceBasis:'general',premiseQuotes:[],outputFormat:null,draftAnswer:draft};
 const physical=[];
 const planner = { responses:{ create:async request => {
   physical.push('interpretation');
   assertNativeSchemaField(request,"draftAnswer");
   return {output_text:JSON.stringify(proposal)};
 } } };
 const interpretation=await interpretAskQuestion({context,model:'fixture',client:planner});
 assert.equal(interpretation.conversationOnly,true);
 assert.equal(interpretation.provisionalAnswer,draft);
 const planned={...context,askInterpretation:interpretation};
 const evidence=createAskEvidenceContract(planned,[]);
 const noGenerator={responses:{create:async()=>{physical.push('unexpected-generation');throw Error('GENERATION_CALL_FORBIDDEN');}}};
 const answer=await generateContextAwareAskResponse({
   question,requestId:'turn-1',locale:'en-CA',conversationOnly:true,
   provisionalAnswer:interpretation.provisionalAnswer,evidenceContract:evidence,
   profiles:[],careEntries:[],memories:[],productFeedback:[],conversationTurns:[],recentUpdates:[],client:noGenerator
 });
 const validate=x=>validateGeneratedAnswer(x,planned,'routine',[]);
 const validation=validate(answer);
 assert.equal(validation.valid,true,JSON.stringify(validation.errors));
 const reviewer={responses:{create:async request=>{
   physical.push('independent-review');
   assert.match(request.input, /Fog can form/);
   return {output_text:JSON.stringify({
     obligations:[{index:0,status:'answered',answerIndexes:[0],actionIndexes:[]}],reason:null,
     verification:{evidenceSupport:{status:'passed',reason:'The general explanation is scientifically sound.'},
       subjectDateCorrectness:{status:'not_applicable',reason:'No personal subject or date.'},
       calculationCorrectness:{status:'not_applicable',reason:'No calculation requested.'}}
   })};
 } } };
 const reviewed=await reviewTaskCompletion({validation,context:planned,requestId:'turn-1',validate,client:reviewer});
 assert.equal(reviewed.valid,true,JSON.stringify(reviewed.errors));
 assert.deepEqual(physical,['interpretation','independent-review']);
 assert.equal(reviewed.response.answer.summary,draft);
 assert.deepEqual(reviewed.response.referencedRecords,[]);
});
