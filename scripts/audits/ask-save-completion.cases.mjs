import {exercise,clock} from './helpers/lifetime-harness.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
const { hasDeterministicUserMutationIntent } = await import('../../app/lib/application-actions/planner.ts');
const { containsUnverifiedStateClaim } = await import('../../app/lib/application-actions/state-claims.ts');
const { parseTaskCompletion, reviewTaskCompletion } = await import('../../app/lib/intelligence/review-task-completion.ts');
const { canonicalReviewPurpose } = await import('../../app/lib/ai/usage-guard/provider-call-budget.ts');
const { createAnswerAssessment } = await import('../../app/lib/intelligence/answer-assessment.ts');
const { validateAskRequest } = await import('../../app/lib/intelligence/ask-request-contract.ts');
import { pets, ownerId } from './fixtures/ask-lifetime-history.mjs';

const pet = pets[0];
const detail = '7 minute play session today';
const observation = `${pet.name} had a ${detail}`;
const source = `${observation}. Save this update to care history.`;
const action = {kind:'care_history.add', explicitIntent:true, evidence:'Save this update to care history',
  input:{field:null,value:null,title:null,detail:'a '+detail,category:null,target:'selected'}};
const authorized = (message, savedDetail = action.input.detail) => hasDeterministicUserMutationIntent({
  action:{...action,input:{...action.input,detail:savedDetail}},petName:pet.name,sourceMessage:message});
for (const savedDetail of [observation, 'had a '+detail, 'a '+detail, detail]) test('direct observation save binds detail: '+savedDetail, () => assert.equal(authorized(source,savedDetail),true));
for (const [label,message,savedDetail] of [
  ['foreign pet',source.replace(pet.name,'Unowned Pet')],
  ['conditional','If '+source],
  ['fictional','Fictional: '+source],
  ['quoted',`"${observation}." Save this update to care history.`],
  ['negated save',source.replace('Save','Do not save')],
  ['question',source.replace('Save','Should I save')+'?'],
  ['changed number',source,'a 70 minute play session today'],
  ['changed decimal',source.replace('7 minute','7.5 minute'),'a 75 minute play session today'],
  ['dropped qualifier',source.replace('had','possibly had')],
  ['dropped negation',source.replace('had','did not have')],
  ['second command',source+' Then archive the pet.'],
  ['quoted predicate',`${pet.name} said "${detail}". Save this update to care history.`],
]) test('no automatic save for '+label, () => assert.equal(authorized(message,savedDetail),false));
test('literal save commands do not collapse decimals or signs',()=>{
  assert.equal(authorized('Save a 7.5 minute play session today','a 7.5 minute play session today'),true);
  assert.equal(authorized('Save a 7.5 minute play session today','a 75 minute play session today'),false);
  assert.equal(authorized('Save a -7 minute play session today','a 7 minute play session today'),false);
});
for(const phrase of ["I’m sending that to care history now.","I am saving the update to the care log.","We’re updating the profile now."])
  test('in-progress mutation claim rejected: '+phrase,()=>assert.equal(containsUnverifiedStateClaim(phrase),true));
test('pending card wording remains truthful',()=>assert.equal(containsUnverifiedStateClaim('The action below shows its status.'),false));

const question=`Show ${pet.name}'s profile and explain the fictional calculation: 2 plus 3. Do not change any pet details.`;
const hints=['Open the profile','Explain the sum'];
const context={owner:{userId:ownerId},pet,eligiblePets:pets,currentMessage:question,conversationTurns:[]};
const plan = {version:'ask-request.v2',question,requirements:hints,referenceTurnIds:[],scope:'named',petNames:[pet.name],
 operation:'navigate',mode:'read',selection:'summary',quantity:null,topic:'profile',terms:[],from:null,to:null,episodeTopic:null,ordinal:null,frame:null,
 evidenceBasis:null,premiseQuotes:[]};
context.askInterpretation=validateAskRequest(plan,context);
test('navigation plus general question avoids records-only routing and stays read-only',()=>{
  assert.equal(context.askInterpretation.history,null);
  assert.equal(context.askInterpretation.readOnly,true);
  assert.deepEqual(context.askInterpretation.petIds,[pet.id]);
  assert.deepEqual(context.askInterpretation.request.requirements,hints);
});
test('ordinary owned facts still require history retrieval',()=>{
  const ordinary=validateAskRequest({...plan,operation:'general'},context);
  assert.ok(ordinary.history);
});
test('navigation cannot authorize mutation or a foreign target',()=>{
  assert.throws(()=>validateAskRequest({...plan,mode:'update'},context));
  assert.throws(()=>validateAskRequest({...plan,petNames:['Unowned Pet']},context));
});
test('task review uses the single bounded review and repair allowance',()=>{
  assert.equal(canonicalReviewPurpose('task_review'),'history_review');
  assert.equal(canonicalReviewPurpose('task_repair'),'history_repair');
  assert.equal(canonicalReviewPurpose('task_rereview'),'history_rereview');
});
const nav={kind:'navigation.open_pet_profile',explicitIntent:true,evidence:`Show ${pet.name}'s profile`,input:{field:null,value:null,title:null,detail:null,category:null,target:'selected'}};
const body='Use the profile link below. In the fictional calculation, 2 + 3 = 5.';
const checks={structuralValidity:'passed',evidenceSupport:'not_evaluated',subjectDateCorrectness:'not_evaluated',calculationCorrectness:'not_evaluated',taskCompletion:'not_evaluated'};
const response=(text=body,actions=[nav])=>({answer:{title:'Furvise',summary:text,sections:[],safetyNote:null},applicationActions:actions,intelligenceSafety:{level:'routine'},evidenceContract:null});
const validation=r=>({response:r,valid:true,errors:[],repairs:[],qualityWarnings:[],assessment:createAnswerAssessment({body:r.answer,evidence:r.evidenceContract,checks})});
const review=(text=body)=>({obligations:[0,1,2].map(index=>({index,status:'answered',answerQuote:index===1?'':text,actionIndexes:index===1?[0]:[]})),reason:null});
const mock=(values,seen=[])=>({responses:{create:async request=>{seen.push(request);assert.ok(values.length,'unexpected provider call');return {status:'completed',output_text:JSON.stringify(values.shift()),usage:{input_tokens:10,output_tokens:10}};}}});
const run=(values,r=response(),seen=[])=>reviewTaskCompletion({validation:validation(r),context,requestId:'audit',validate:validation,client:mock(values,seen)});
test('compound answer requires both explanation and the actual navigation card',async()=>{
  const seen=[];const result=await run([review()],response(),seen);
  assert.equal(result.assessment.checks.taskCompletion,'passed');
  const payload=JSON.parse(seen[0].input);assert.equal(payload.obligations[0],question);
  assert.equal(payload.actions[0].href,`/pets/${pet.id}`);
});
for(const [label,change] of [
  ['omitted item',r=>r.obligations.pop()],
  ['duplicate item',r=>r.obligations[2].index=1],
  ['fabricated quotation',r=>r.obligations[0].answerQuote='fabricated'],
  ['nonexistent action',r=>r.obligations[1].actionIndexes=[1]],
  ['empty support',r=>{r.obligations[0].answerQuote='';r.obligations[0].actionIndexes=[];}],
  ['discarded original task',r=>r.obligations[0].status='not_requested'],
]) test('completion receipt rejects '+label,()=>{
  const proposal=review();change(proposal);assert.equal(parseTaskCompletion(proposal,[question,...hints],body,1),null);
});
test('missing second task gets one repair and independent re-review',async()=>{
  const rejected=review('Use the profile link below.');rejected.obligations[0].status='missing';rejected.obligations[2].status='missing';rejected.reason='The requested calculation is absent.';
  const seen=[];const result=await run([rejected,{answer:body,navigation:[nav]},review()],response('Use the profile link below.'),seen);
  assert.equal(seen.length,3);assert.equal(result.response.answer.summary,body);assert.equal(result.assessment.checks.taskCompletion,'passed');
});
test('persistent omission fails after exactly one repair',async()=>{
  const rejected=review();rejected.obligations[0].status='missing';rejected.reason='Calculation missing';
  const seen=[];await assert.rejects(run([rejected,{answer:body,navigation:[nav]},rejected],response(),seen),/ASK_TASK_INCOMPLETE/);assert.equal(seen.length,3);
});
test('review failure is not silently accepted',async()=>{
  await assert.rejects(run([{obligations:[],reason:null}]),/ASK_TASK_REVIEW_INVALID/);
});
test('an explicit limitation is not reported as complete',async()=>{
  const text='I cannot open that page here. The fictional sum is 5.';
  const r=review(text);for(const item of r.obligations){item.status='limited';item.answerQuote=text;item.actionIndexes=[];}
  const result=await run([r],response(text,[]));assert.equal(result.assessment.outcome,'limited');assert.equal(result.assessment.checks.taskCompletion,'failed');
});
test('repair cannot inject a mutation proposal',async()=>{
  const rejected=review();rejected.obligations[0].status='missing';rejected.reason='Repair prose';
  const seen=[];await assert.rejects(run([rejected,{answer:body,navigation:[action]},review()],response(),seen),/ASK_TASK_REVIEW_INVALID/);
  assert.equal(JSON.parse(seen[2].input).actions.length,0);
});

test('real generation, governance, validation and publication preserve both requested parts',async t=>{
  clock(t);
  const r=await exercise(question,{history:true,rows:[],messages:[],interpretationProposal:plan,
    providerOverrides:{answer:body,applicationActions:[nav,action]},taskReviewProviderResponse:async request=>{
      const payload=JSON.parse(request.input);
      assert.equal(payload.obligations[0],question);
      assert.equal(payload.actions.length,1,'read-only governance removes mutation before review');
      assert.equal(payload.actions[0].kind,'navigation.open_pet_profile');
      return {status:'completed',output_text:JSON.stringify(review(payload.answer)),usage:{input_tokens:100,output_tokens:50}};
    }});
  assert.equal(r.publication.failure,null);
  assert.match(r.result.reasoning.answer.summary,/2 \+ 3 = 5/);
  assert.equal(r.result.answerValidation.assessment.checks.taskCompletion,'passed');
  assert.deepEqual(r.result.acceptedCareActions,[]);
});

const {rememberReviewedTaskPresentation,reviewedTaskPresentationFailure} = await import('../../app/lib/intelligence/ask-evidence-presentation.ts');
const {prepareFurviseApplicationActions} = await import('../../app/lib/application-actions/planner.ts');
test('final publication binding detects removed or changed action and answer',()=>{
 const evidence={};const answer=response().answer;
 const actions=prepareFurviseApplicationActions({proposals:[nav],petId:pet.id,petName:pet.name,requestId:'audit',sourceMessage:question});
 rememberReviewedTaskPresentation(evidence,answer,actions);
 assert.equal(reviewedTaskPresentationFailure(evidence,answer,actions),null);
 assert.equal(reviewedTaskPresentationFailure(evidence,answer,[]),'task_action_missing_or_changed');
 assert.equal(reviewedTaskPresentationFailure(evidence,answer,[{...actions[0],petId:'other'}]),'task_action_missing_or_changed');
 assert.match(reviewedTaskPresentationFailure(evidence,{...answer,summary:'Use the profile link.'},actions),/^task_/);
 assert.equal(reviewedTaskPresentationFailure(structuredClone(evidence),answer,[]),null,'stored JSON cannot create a live approval receipt');
});
