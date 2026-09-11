import {exercise,clock} from './helpers/lifetime-harness.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
const { hasDeterministicUserMutationIntent } = await import('../../app/lib/application-actions/planner.ts');
const { containsUnverifiedStateClaim } = await import('../../app/lib/application-actions/state-claims.ts');
const { parseTaskCompletion, reviewTaskCompletion, taskReviewSchema } = await import('../../app/lib/intelligence/review-task-completion.ts');
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
const verification=()=>Object.fromEntries(['evidenceSupport','subjectDateCorrectness','calculationCorrectness'].map(key=>[key,{status:'passed',reason:'Fixture independently checked '+key}]));
const review=()=>({verification:verification(),obligations:[0,1,2].map(index=>({index,status:'answered',answerIndexes:index===1?[]:[0],actionIndexes:index===1?[0]:[]})),reason:null});
const mock=(values,seen=[])=>({responses:{create:async request=>{seen.push(request);assert.ok(values.length,'unexpected provider call');return {status:'completed',output_text:JSON.stringify(values.shift()),usage:{input_tokens:10,output_tokens:10}};}}});
const run=(values,r=response(),seen=[])=>reviewTaskCompletion({validation:validation(r),context,requestId:'audit',validate:validation,client:mock(values,seen)});
test('compound answer requires both explanation and the actual navigation card',async()=>{
  const seen=[];const result=await run([review()],response(),seen);
  assert.equal(result.assessment.checks.taskCompletion,'passed');
  const payload=JSON.parse(seen[0].input);assert.equal(payload.obligations[0].text,question);
  assert.equal(payload.actions[0].href,`/pets/${pet.id}`);
  assert.equal(JSON.stringify(seen[0].text.format.schema).includes('"action_ready"'),false);
});
for(const [label,change] of [
  ['omitted item',r=>r.obligations.pop()],
  ['duplicate item',r=>r.obligations[2].index=1],
  ['nonexistent answer segment',r=>r.obligations[0].answerIndexes=[1]],
  ['nonexistent action',r=>r.obligations[1].actionIndexes=[1]],
  ['empty support',r=>{r.obligations[0].answerIndexes=[];r.obligations[0].actionIndexes=[];}],
  ['discarded original task',r=>r.obligations[0].status='not_requested'],
]) test('completion receipt rejects '+label,()=>{
  const proposal=review();change(proposal);assert.equal(parseTaskCompletion(proposal,[question,...hints],1,1),null);
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
test('a prose-only repair preserves already prepared navigation for independent re-review',async()=>{
  const rejected=review(); rejected.obligations[0].status='missing'; rejected.reason='Repair explanation';
  const seen=[]; const result=await run([rejected,{answer:body,navigation:[],navigationUpdate:'preserve'},review()],response(),seen);
  assert.equal(result.response.applicationActions.length,1);
  assert.equal(JSON.parse(seen[2].input).actions[0].kind,nav.kind);
  assert.equal(result.assessment.checks.taskCompletion,'passed');
});
test('review failure is not silently accepted',async()=>{
  await assert.rejects(run([{obligations:[],reason:null},{answer:body,navigation:[nav]},{obligations:[],reason:null}]),/ASK_TASK_REVIEW_INVALID/);
});
test('an explicit limitation is not reported as complete',async()=>{
  const text='I cannot open that page here. The fictional sum is 5.';
  const r=review(text);for(const item of r.obligations){item.status='limited';item.answerIndexes=[0];item.actionIndexes=[];}
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
      assert.equal(payload.obligations[0].text,question);
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

test('stray navigation search and calculation metadata cannot force historical routing',()=>{
 const result=validateAskRequest({...plan,quantity:'measurement',terms:['profile'],from:'2026-01-01',to:'2026-02-01'},context);
 assert.equal(result.history,null);assert.equal(result.readOnly,true);assert.equal(result.request.quantity,null);
 assert.deepEqual(result.petIds,[pet.id]);
});

test('navigation mode conflict gets one bounded reinterpretation without write authority',async()=>{
 const {interpretAskQuestion}=await import('../../app/lib/intelligence/interpret-ask.ts');
 const {emptyProposedSemanticFrame}=await import('../../app/lib/intelligence/semantic-frame/extract-frame.ts');
 const events=[];const replies=[{...plan,mode:'mixed',frame:emptyProposedSemanticFrame()},plan];
 const result=await interpretAskQuestion({context,model:'gpt-5-mini',onProviderEvent:e=>events.push(e),client:mock(replies)});
 assert.equal(result.readOnly,true);assert.equal(result.history,null);assert.equal(replies.length,0);
 assert.ok(events.some(e=>e.providerErrorCode==='ASK_REQUEST_CONTRACT_NAVIGATION'));
});

for (const hyphen of ['-', '\u2010', '\u2011']) test('duration typography preserves exact save authority: '+hyphen,()=>{
 assert.equal(authorized(source,observation.replace('7 minute','7'+hyphen+'minute')),true);
 assert.equal(authorized(source.replace('7 minute','-7 minute'),observation.replace('7 minute','7'+hyphen+'minute')),false);
 assert.equal(authorized(source.replace('7 minute','7.5 minute'),observation.replace('7 minute','75'+hyphen+'minute')),false);
});
test('invalid limitation references get one repair and an independently valid review',async()=>{
 const invalid=review();invalid.obligations[1].status='limited';
 const seen=[];const result=await run([invalid,{answer:body,navigation:[nav]},review()],response(),seen);
 assert.equal(seen.length,3);assert.equal(result.assessment.checks.taskCompletion,'passed');
 assert.match(JSON.parse(seen[1].input).rejectionReason,/LIMITATION_SUPPORT/);
});
test('action readiness requires a server eligible card and whole-answer support',()=>{
 const verdict={verification:verification(),obligations:[{index:0,status:'action_ready',answerIndexes:[0],actionIndexes:[0]}],reason:null};
 assert.equal(parseTaskCompletion(verdict,[source],1,1),null);
 const accepted=parseTaskCompletion(verdict,[source],1,1,undefined,[0]);
 assert.equal(accepted.accepted,true);assert.equal(accepted.complete,false);
 verdict.obligations[0].answerIndexes=[];
 assert.equal(parseTaskCompletion(verdict,[source],1,1,undefined,[0]),null);
});
test('an exact observation save is reviewed as ready, never falsely completed',async()=>{
 const saveContext={...context,currentMessage:source,askInterpretation:{...context.askInterpretation,request:{...context.askInterpretation.request,requirements:[]}}};
 const seen=[];const verdict={verification:verification(),obligations:[{index:0,status:'action_ready',answerIndexes:[0],actionIndexes:[0]}],reason:null};
 const r=response('The action below shows the status of this update.',[{...action,input:{...action.input,detail:observation.replace('7 minute','7-minute')}}]);
 const result=await reviewTaskCompletion({validation:validation(r),context:saveContext,requestId:'save-ready',validate:validation,client:mock([verdict],seen)});
 assert.equal(JSON.parse(seen[0].input).actions[0].executionDisposition,'automatic_after_persistence');
 assert.equal(JSON.stringify(seen[0].text.format.schema).includes('"action_ready"'),true);
 assert.equal(result.assessment.checks.taskCompletion,'failed');
 assert.equal(result.assessment.outcome,'limited');
});

test('provider schema rejects unsupported references before generation',async()=>{
 const {createRequire}=await import('node:module');const require=createRequire(import.meta.url);const Ajv=require('ajv');
 const validate=new Ajv({strict:false}).compile(taskReviewSchema(3,1,[]));
 assert.equal(validate(review()),true);
 const invalid=review();invalid.obligations[1].status='limited';assert.equal(validate(invalid),false);
 invalid.obligations[1].status='action_ready';assert.equal(validate(invalid),false);
 invalid.obligations[1].status='answered';invalid.obligations[1].actionIndexes=[1];assert.equal(validate(invalid),false);
 const empty=review();empty.obligations[0].answerIndexes=[];assert.equal(validate(empty),false);
 const noActions=new Ajv({strict:false}).compile(taskReviewSchema(1,0,[]));
 assert.equal(noActions({verification:verification(),obligations:[{index:0,status:'limited',answerIndexes:[0],actionIndexes:[]}],reason:null}),true);
 const ready=new Ajv({strict:false}).compile(taskReviewSchema(1,2,[1]));
 const verdict={verification:verification(),obligations:[{index:0,status:'action_ready',answerIndexes:[0],actionIndexes:[1]}],reason:null};
 assert.equal(ready(verdict),true);verdict.obligations[0].actionIndexes=[0];assert.equal(ready(verdict),false);
});

const {planDeterministicAskCommand}=await import('../../app/lib/ai/ask-command-router.ts');
for (const quantity of ['7','12','7.5']) test('literal observation save compiles without model interpretation: '+quantity,()=>{
 const observation=`${pet.name} had a ${quantity} minute play session today`;
 const text=observation+'. Save this update to care history.';
 const command=planDeterministicAskCommand(text,pet.name);
 assert.equal(command.orchestration.handledWithoutAi,true);
 assert.equal(command.proposals[0].input.detail,observation);
 const prepared=prepareFurviseApplicationActions({proposals:command.proposals,petId:pet.id,petName:pet.name,requestId:'literal-save',sourceMessage:text});
 assert.equal(prepared.length,1);assert.equal(prepared[0].explicitIntent,true);
 assert.equal(prepared[0].input.detail,observation);
 assert.equal(containsUnverifiedStateClaim(command.orchestration.answer.summary),false);
});
for(const text of [
 'If '+source,'Fictional: '+source,`"${observation}." Save this update to care history.`,
 source+' Explain whether that is enough exercise.',source.replace('Save','Do not save'),
 source.replace(pet.name,'Unowned Pet'),source.replace('had a','and Pixel had a'),
 source.replace('had a','said he had a'),`${pet.name} ${'a'.repeat(501)}. Save this update to care history.`,
]) test('literal router does not consume ambiguous or compound save: '+text.slice(0,70),()=>{
 assert.equal(planDeterministicAskCommand(text,pet.name),null);
});

for (const key of ['evidenceSupport','subjectDateCorrectness','calculationCorrectness']) test('failed '+key+' requires repair despite complete task checklist',async()=>{
 const rejected=review();rejected.verification[key]={status:'failed',reason:'Independent check found a factual defect'};
 const seen=[];const result=await run([rejected,{answer:body,navigation:[nav]},review()],response(),seen);
 assert.equal(seen.length,3);assert.equal(result.assessment.outcome,'complete');
 assert.equal(JSON.parse(seen[1].input).verificationFindings[key].status,'failed');
 await assert.rejects(run([rejected,{answer:body,navigation:[nav]},rejected]),/ASK_TASK_INCOMPLETE/);
});
test('completion alone cannot stand in for independent verification',()=>{
 const old=review();delete old.verification;assert.equal(parseTaskCompletion(old,[question,...hints],1,1),null);
 const malformed=review();malformed.verification.calculationCorrectness.reason='  ';
 assert.equal(parseTaskCompletion(malformed,[question,...hints],1,1),null);
 malformed.verification.calculationCorrectness={status:'not_evaluated',reason:'Not checked'};
 assert.equal(parseTaskCompletion(malformed,[question,...hints],1,1),null);
});
test('verified navigation without arithmetic may explicitly mark calculation inapplicable',async()=>{
 const noMath={...context,currentMessage:`Show ${pet.name}'s profile`,askInterpretation:{...context.askInterpretation,request:{...context.askInterpretation.request,requirements:[]}}};
 const verdict={...review(),obligations:[{index:0,status:'answered',answerIndexes:[0],actionIndexes:[0]}]};
 verdict.verification.calculationCorrectness={status:'not_applicable',reason:'Neither request nor answer contains arithmetic'};
 const result=await reviewTaskCompletion({validation:validation(response('Use the profile link below.')),context:noMath,requestId:'no-math',validate:validation,client:mock([verdict])});
 assert.equal(result.assessment.outcome,'complete');assert.equal(result.assessment.checks.calculationCorrectness,'not_applicable');
});
test('evidence changed during review invalidates the review capability',async()=>{
 const r=response();r.evidenceContract={represented:[]};
 const client={responses:{async create(){r.evidenceContract.represented.push({text:'Changed while reviewing'});return {status:'completed',output_text:JSON.stringify(review()),usage:{input_tokens:10,output_tokens:10}};}}};
 await assert.rejects(reviewTaskCompletion({validation:validation(r),context,requestId:'evidence-race',validate:validation,client}),/ASK_TASK_REVIEW_BODY_CHANGED/);
});

test('governed health save reaches completion review before its persistence receipt exists',async()=>{
 const text=`${pet.name} started vomiting on 2024-02-01. Please save this to his history.`;
 const ctx={...context,currentMessage:text,askInterpretation:{...context.askInterpretation,request:{...context.askInterpretation.request,requirements:[]}}};
 const event={subject:{type:'pet',id:pet.id,name:pet.name},domain:'health',topic:'vomiting',normalizedTopic:'vomiting',
   eventTitle:'Vomiting started',transition:'started',state:'historical',temporal:{occurredAt:'2024-02-01T00:00:00Z',explicitTime:'2024-02-01'},
   sourceExcerpt:`${pet.name} started vomiting on 2024-02-01`,references:{priorEventIds:[],episodeId:null,concernId:null},importance:'important',confidence:.99};
 const pending=[{event,destination:'care_event',destinations:['care_event','episode_current_state']}];
 const verdict={...review(),obligations:[{index:0,status:'action_ready',answerIndexes:[0],actionIndexes:[0]}]};
 const seen=[];
 const r=await reviewTaskCompletion({validation:validation(response('The update records the vomiting onset as February 1, 2024.',[])),context:ctx,
   pendingCareEvents:pending,requestId:'semantic-ready',validate:validation,client:mock([verdict],seen)});
 const input=JSON.parse(seen[0].input);
 assert.equal(input.actions[0].origin,'server_governed_care_event');
 assert.deepEqual(input.automaticMutationIndexes,[0]);
 assert.equal(input.actions[0].input.temporal.occurredAt,event.temporal.occurredAt);
 assert.equal(input.actions[0].executionDisposition,'automatic_after_persistence');
 assert.equal(r.assessment.outcome,'limited','readiness is not execution success');
 assert.equal(r.response.applicationActions.length,0,'review does not mint a duplicate application save');
 for (const [label,ctxPatch,eventPatch] of [
   ['no explicit save',{currentMessage:`${pet.name} started vomiting on 2024-02-01.`},{}],
   ['foreign subject',{}, {subject:{type:'pet',id:'foreign',name:'Other'}}],
 ]) {
   const calls=[];
   await assert.rejects(reviewTaskCompletion({validation:validation(response('Observation acknowledged.',[])),context:{...ctx,...ctxPatch},
    pendingCareEvents:[{...pending[0],event:{...event,...eventPatch}}],requestId:label,validate:validation,
    client:mock([verdict,{answer:'Observation acknowledged.',navigation:[]},verdict],calls)}),/ASK_TASK_REVIEW_INVALID/);
   assert.equal(JSON.parse(calls[0].input).actions.length,0);
 }
});

test('an owned action target cannot evade subject verification as inapplicable',async()=>{
 const verdict=review();verdict.verification.subjectDateCorrectness={status:'not_applicable',reason:'The prose is hypothetical'};
 assert.equal(parseTaskCompletion(verdict,[question,...hints],1,1),null);
 const {createRequire}=await import('node:module');const Ajv=createRequire(import.meta.url)('ajv');
 assert.equal(new Ajv({strict:false}).compile(taskReviewSchema(3,1,[]))(verdict),false);
});

test('governed save has one presentation owner without dropping distinct or unapproved writes',async()=>{
 const {omitGovernedCareSaveDuplicates}=await import('../../app/lib/intelligence/care-history-policy.ts');
 const event={event:{subject:{type:'pet',id:pet.id},domain:'health',sourceExcerpt:observation},destinations:['care_event']};
 const save={...action,input:{...action.input,category:'health',detail:observation}};
 const input={actions:[save,nav],events:[event],message:source,petId:pet.id};
 assert.deepEqual(omitGovernedCareSaveDuplicates(input),[nav]);
 assert.deepEqual(omitGovernedCareSaveDuplicates({...input,actions:[{...save,input:{...save.input,category:'symptom'}},nav]}),[nav]);
 for(const patch of [{events:[]},{message:observation},{petId:'foreign'},
  {events:[{...event,destinations:['episode_current_state']}]},
  {actions:[{...save,input:{...save.input,detail:observation+' twice'}}]},
  {actions:[{...save,input:{...save.input,target:'last'}}]}]) {
  const value={...input,...patch};assert.deepEqual(omitGovernedCareSaveDuplicates(value),value.actions);
 }
});


test('paraphrased save detail retains the exact value binding; resolved state has one owner',async()=>{
 const {omitGovernedCareSaveDuplicates}=await import('../../app/lib/intelligence/care-history-policy.ts');
 const observation='Sable stopped vomiting completely on 2024-02-03.';
 const message=observation+' Save this resolution to her care history.';
 const event={event:{subject:{type:'pet',id:pet.id},domain:'health',sourceExcerpt:observation,
   transition:'resolved',state:'resolved',references:{episodeId:'owned-episode'}},destinations:['care_event']};
 const save={...action,evidence:message,input:{...action.input,value:observation,detail:'Resolution of the vomiting episode on 2024-02-03.',category:'symptom'}};
 const resolve={...save,kind:'care_state.resolve',input:{...save.input,value:'Vomiting resolved on 2024-02-03.'}};
 const input={actions:[save,resolve,nav],events:[event],message,petId:pet.id};
 assert.deepEqual(omitGovernedCareSaveDuplicates(input),[nav]);
 assert.deepEqual(omitGovernedCareSaveDuplicates({...input,events:[]}),input.actions);
 assert.deepEqual(omitGovernedCareSaveDuplicates({...input,actions:[resolve],message:message+' Sable is coughing now.'}),[resolve]);
 assert.deepEqual(omitGovernedCareSaveDuplicates({...input,actions:[resolve],events:[{...event,event:{...event.event,references:{}}}]}),[resolve]);
});
