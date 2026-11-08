import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
registerHooks({ resolve(s,c,next) { return s === 'server-only'
  ? { url:'data:text/javascript,export {};', format:'module', shortCircuit:true } : next(s,c); } });
const { interpretAskQuestion, prepareAskInterpretationRequest } = await import('../app/lib/intelligence/interpret-ask.ts');
const {makeValidator,expand}=await import("../app/lib/intelligence/ask-wire-codec.mjs");
const { createAskEvidenceContract } = await import('../app/lib/intelligence/ask-evidence.ts');
const { generateContextAwareAskResponse } = await import('../app/lib/ai/ask-reasoning.ts');
const { validateGeneratedAnswer } = await import('../app/lib/intelligence/validation/validate-answer.ts');
const { reviewTaskCompletion } = await import('../app/lib/intelligence/review-task-completion.ts');

test('production-format general proposal and independent review use exactly two provider requests', async () => {
 const question = 'Why does an echo take longer to return from a distant wall?';
 const draft = 'Sound travels at a finite speed, so reaching a more distant wall and returning takes longer.';
 const pet = { id:'pet-scope', user_id:'owner', name:'Pet', species:'dog' };
 const context = { owner:{userId:'owner'},pet,eligiblePets:[pet],currentMessage:question,
   currentTurn:{id:'turn-1',role:'user',text:question},conversationTurns:[],timeZone:'UTC',
   careEntries:[],selectedCareEntries:[],memories:[] };
 const proposal = {version:'ask-request.v2',mode:'conversation',scope:'none',operation:'general',
   selection:'summary',question,requirements:[],referenceTurnIds:[],petNames:[],excludedPetNames:[],
   quantity:null,topic:'weather',terms:[],from:null,to:null,episodeTopic:null,ordinal:null,
   frame:null,evidenceBasis:'general',premiseQuotes:[],outputFormat:null,draftAnswer:draft};
 const prepared=prepareAskInterpretationRequest(context,"fixture");
 const full=fullProposal(proposal);
 const encoded=prepared.transport.encode({request:full},()=>{});
 const physical=[];
 const planner = { responses:{ create:async request => {
   physical.push('interpretation');
   assert.match(JSON.stringify(request.text.format.schema),/draftAnswer/);
   assert.equal(validatesProvider(request.text.format.schema,encoded),true);
   return {output_text:JSON.stringify(encoded)};
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
   assert.match(request.input, /Sound travels/);
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


// Complete actual wire shape, not the legacy abbreviated Node proposal bypass.
function fullProposal(overrides={}) {
 return {
  calculatePlan:null,storedRead:null,removeJob:null,stateTransitionJob:null,
  fieldMutationJob:null,lifecyclePlan:null,appendJob:null,readTicket:null,writeJob:null,
  task:null,temporalScope:null,mutationIntent:null,recordSelection:null,projection:null,
  profileFields:[],evidenceNeeds:[],terms:[],petNames:[],excludedPetNames:[],
  referenceTurnIds:[],requirements:[],premiseQuotes:[],outputFormat:null,
  from:null,to:null,ordinal:null,episodeTopic:null,quantity:null,frame:null,draftAnswer:null,
  version:"ask-request.v2",mode:"conversation",scope:"none",operation:"general",
  selection:"summary",question:"Explain how a hypothetical counter works.",topic:"general",
  evidenceBasis:"general",...overrides
 };
}
function contextFor(text,turns=[]) {
 const pet={id:"owned-pet",user_id:"owner",name:"Pet",species:"dog"};
 return {owner:{userId:"owner"},pet,eligiblePets:[pet],currentMessage:text,
  currentTurn:{id:"current",role:"user",text},conversationTurns:turns,timeZone:"UTC",
  careEntries:[],selectedCareEntries:[],memories:[]};
}
test("actual factored provider grammar rejects empty or null supplied premises and nonempty general premises",()=>{
 const p=prepareAskInterpretationRequest(contextFor("Explain a simple natural phenomenon."),"fixture");
 const good=p.transport.encode({request:fullProposal()},()=>{});
 const schema=expand(p.request.text.format.schema),valid=makeValidator(schema);
 assert.equal(valid(schema,good),true);
 for(const premises of [[],null]) {
  const bad=structuredClone(good);bad.request.evidenceContext.evidenceBasis="supplied_context";bad.request.evidenceContext.premiseQuotes=premises;
  assert.equal(valid(schema,bad),false);
  assert.throws(()=>p.transport.decode(bad,()=>{}));
 }
 const bad=structuredClone(good);bad.request.evidenceContext.premiseQuotes=["Invented factual premise"];
 assert.equal(valid(schema,bad),false);
 assert.throws(()=>p.transport.decode(bad,()=>{}));
});
test("genuine current and prior USER supplied premises survive real grammar and binding without becoming general knowledge",async()=>{
 for(const prior of [false,true]) {
  const premise="In my fictional setting, each room has three doors.";
  const question=prior?"Explain a limitation of that fictional setting.":premise+" Explain one implication.";
  const context=contextFor(question,prior?[{id:"earlier-user",role:"user",text:premise}]:[]);
  const p=prepareAskInterpretationRequest(context,"fixture");
  const request=fullProposal({question,evidenceBasis:"supplied_context",premiseQuotes:[premise],
   referenceTurnIds:prior?["earlier-user"]:[]});
  const encoded=p.transport.encode({request},()=>{});
  assert.equal(validatesProvider(p.request.text.format.schema,encoded),true);
  let calls=0;
  const result=await interpretAskQuestion({context,model:"fixture",client:{responses:{create:async()=>{
   calls++;return {output_text:JSON.stringify(encoded)};
  }}}});
  assert.equal(calls,1);assert.equal(result.request.evidenceBasis,"supplied_context");
  assert.equal(result.provisionalAnswer,undefined);
 }
});
test("valid provider shape does not authenticate a fabricated USER premise",async()=>{
 const context=contextFor("Explain a general concept.");
 const p=prepareAskInterpretationRequest(context,"fixture");
 const encoded=p.transport.encode({request:fullProposal({question:context.currentMessage,
  evidenceBasis:"supplied_context",premiseQuotes:["A fact no USER supplied."]})},()=>{});
 assert.equal(validatesProvider(p.request.text.format.schema,encoded),true);
 let calls=0;
 await assert.rejects(interpretAskQuestion({context,model:"fixture",client:{responses:{create:async()=>{
  calls++;return {output_text:JSON.stringify(encoded)};
 }}}}));
 assert.equal(calls,1,"canonical premise authority is not repaired or relaxed");
});

function validatesProvider(schema,value){const flat=expand(schema);return makeValidator(flat)(flat,value);}
