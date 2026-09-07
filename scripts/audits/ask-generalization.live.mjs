// Opt-in, synthetic database / real provider acceptance. Never loaded by node --test.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { mock } from 'node:test';
import OpenAI from 'openai';
const originalFetch = globalThis.fetch;
if (!process.argv.includes('--run-live')) throw new Error('Explicit --run-live required');
const {exercise} = await import('./helpers/lifetime-harness.mjs');
const {care,pets,ownerId}=await import('./fixtures/ask-lifetime-history.mjs');
const {getAskModelConfiguration}=await import('../../app/lib/ai/ask-reasoning.ts');
const {runWithAiAdmission}=await import('../../app/lib/ai/usage-guard/context.ts');
const {AiAdmissionError}=await import('../../app/lib/ai/usage-guard/errors.ts');
const {buildAskConversationResponse}=await import('../../app/lib/ask.mjs');
const {restoreAskEvidencePresentation}=await import('../../app/lib/intelligence/ask-evidence-presentation.ts');
const model=getAskModelConfiguration().primary;
assert.equal(model,'gpt-5.4-mini','Live budget supports only the verified configured model');
assert.ok(process.env.OPENAI_API_KEY,'Existing key required');
const ledgerPath=new URL('../../docs/ask-composition-live-budget.json',import.meta.url);
const ledger=existsSync(ledgerPath)?JSON.parse(readFileSync(ledgerPath,'utf8')):{authorizedUsd:5,reservationStopUsd:4.5,reservedUsd:0,measuredUsd:0,calls:[],pricingSource:'https://developers.openai.com/api/docs/models/gpt-5.4-mini',pricing:{inputPerMillion:0.75,outputPerMillion:4.5},syntheticClock:'2026-09-15T12:00:00Z'};
const save=()=>writeFileSync(ledgerPath,JSON.stringify(ledger,null,2)+'\n');
const provider=new OpenAI({apiKey:process.env.OPENAI_API_KEY,maxRetries:0,fetch:(url,options)=>{
  if(new URL(String(url)).origin!=='https://api.openai.com') throw new Error('Only OpenAI API allowed');
  return originalFetch(url,options);
}});
let turnCalls=0,turnOrdinary=0,currentQuestion='';
async function liveCall(request,options={}) {
  assert.equal(request.model,model);
  assert.ok(!request.tools?.length,'No tools or extra paid services allowed');
  assert.ok(Number.isInteger(request.max_output_tokens)&&request.max_output_tokens>0&&request.max_output_tokens<=4096);
  const bytes=Buffer.byteLength(JSON.stringify(request),'utf8')+2048;
  const worst=bytes*0.75/1e6+request.max_output_tokens*4.5/1e6;
  if(ledger.calls.length>=100||ledger.reservedUsd+worst>4.5) throw new Error('LOCAL_TEST_BUDGET_STOP');
  const item={number:ledger.calls.length+1,question:currentQuestion,model,reservedUsd:worst,phase:request.text?.format?.name,status:'reserved'};
  ledger.reservedUsd+=worst;ledger.calls.push(item);save();
  const start=performance.now();
  try {
    const response=await provider.responses.create({...request,store:false},{signal:options?.signal||AbortSignal.timeout(30000)});
    item.elapsedMs=Math.round(performance.now()-start);item.status=response.status;
    item.inputTokens=response.usage?.input_tokens;item.outputTokens=response.usage?.output_tokens;
    if(!Number.isInteger(item.inputTokens)||!Number.isInteger(item.outputTokens)) throw new Error('USAGE_UNAVAILABLE');
    item.measuredUsd=item.inputTokens*0.75/1e6+item.outputTokens*4.5/1e6;
    ledger.measuredUsd+=item.measuredUsd;
    if(item.phase==='furvise_history_review') item.review=response.output_text;
    if(item.phase==='furvise_ask_interpretation') item.syntheticPlan=JSON.parse(response.output_text);
    if(item.phase==='furvise_ask_response') item.syntheticResponse=JSON.parse(response.output_text);
    save();return response;
  } catch(error) {
    item.elapsedMs=Math.round(performance.now()-start);item.status='failed';item.errorClass=error.name;save();throw error;
  }
}
const admission={async beginProviderCall(input){
  if(++turnCalls>3||input.purpose!=='history_review'&&++turnOrdinary>2)throw new AiAdmissionError('AI_PROVIDER_BUDGET_EXHAUSTED','provider_call_budget_exhausted');
  return {reservation:{}};
},async recordProviderUsage(){},recordProviderFailure(){}};
const fixturePets=['Nori','Juniper','Pip'].map((name,index)=>({...pets[index],id:name.toLowerCase(),name}));
const rows=[
 care('drink-july','juniper','2026-07-03','general','Juniper was drinking more water during a hot week. I do not know whether the heat explains it.'),
 care('drink-aug','juniper','2026-08-02','general','Juniper drinking seems back to usual this week. Her appetite is normal. No diagnosis of diabetes or another cause has been recorded here.'),
 care('stairs-may','pip','2026-05-01','symptom','Pip hesitated on the stairs after a long walk.'),
 care('stairs-june','pip','2026-06-01','general','Pip was using the stairs comfortably again.'),
 care('stairs-aug','pip','2026-08-01','symptom','Pip hesitated on the stairs again yesterday. I have not recorded a diagnosis.'),
];
const questions=[
 "Catch me up on Juniper's drinking. Keep it short.",
 "Does Juniper drinking history mean she definitely has diabetes?",
 "And Pip, has the stair problem gone away?",
 "Could you turn that into two points for my partner?",
 "Can we just talk for a minute?",
 "I feel overwhelmed by everything that comes with having a pet.",
];
const outputPath=new URL('../../docs/ask-generalization-live-conversations.json',import.meta.url);
const output={syntheticDatabase:true,realProviders:true,model,clock:ledger.syntheticClock,turns:[]};
let messages=[];
console.info=()=>{};
mock.timers.enable({apis:['Date'],now:Date.parse(ledger.syntheticClock)});
if(process.argv.includes('--partial-review') || process.argv.includes('--plain-review')) {
  const plain=process.argv.includes('--plain-review');
  currentQuestion=plain ? 'Does Juniper drinking history mean she definitely has diabetes?' : 'Brief Juniper drinking history summary.';
  const initial=ledger.calls.length;
  const {emptyProposedSemanticFrame}=await import('../../app/lib/intelligence/semantic-frame/extract-frame.ts');
  const r=await runWithAiAdmission(admission,()=>exercise(currentQuestion,{
    history:true,rows,messages:[],fixturePets,petId:'juniper',interpretationModel:model,
    interpretationProposal:{operation:'overview',readOperation:'overview',selection:'summary',subject:'explicit',petNames:['Juniper'],topic:'drinking',terms:['drinking'],from:null,to:null,episodeTopic:null,ordinal:null,frame:emptyProposedSemanticFrame()},
    providerOverrides:plain ? [...ledger.calls].reverse().find(call=>call.syntheticResponse&&call.question.includes('Juniper drinking history'))?.syntheticResponse : {historyNarrative:{sentences:[
      {text:'Juniper was drinking more water during a hot week in July, but the owner did not know whether heat explained it.',sourceIds:['care:drink-july']},
      {text:'This proves Juniper can never become seriously ill.',sourceIds:['care:drink-july','care:drink-aug']},
      {text:'In August, her drinking seemed back to usual and her appetite was normal.',sourceIds:['care:drink-aug']},
    ]}},
    reviewProviderResponse:liveCall,expectedReviewCalls:1
  }));
  const answer=r.result.reasoning.answer.summary;
  const result={syntheticDatabase:true,mockedInterpretationAndDraft:true,realReview:true,question:currentQuestion,answer,
    providerCalls:ledger.calls.length-initial,passed:!answer.includes('never become')&&!answer.includes('report:')&&(plain ? /diabetes/i.test(answer) : answer.includes('July')&&answer.includes('August'))};
  writeFileSync(new URL(plain ? '../../docs/ask-generalization-plain-review-live.json' : '../../docs/ask-generalization-partial-review-live.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result));
  mock.timers.reset();
  assert.equal(result.passed,true);
  process.exit(0);
}
const selection=process.argv.find(arg=>arg.startsWith('--only='));
for(const question of questions.filter((q,index)=>!selection||selection.split('=')[1].split(',').map(Number).includes(index))) {
  currentQuestion=question;turnCalls=0;turnOrdinary=0;
  const start=performance.now();const initial=ledger.calls.length;
  try {
    const r=await runWithAiAdmission(admission,()=>exercise(question,{
      history:true,rows,messages,fixturePets,petId:'nori',interpretationModel:model,interpretationProposal:{},
      interpretationResponse:liveCall,providerResponse:liveCall,reviewProviderResponse:liveCall,
      expectedProviderCalls:null,expectedReviewCalls:null,
    }));
    const response=restoreAskEvidencePresentation(buildAskConversationResponse(r.result.reasoning.answer),r.result.reasoning.evidenceContract,r.context.episodeResult);
    const item={question,petId:r.context.pet.id,plan:r.context.askInterpretation,answer:response.directAnswer,sections:response.sections,
      reviewed:r.reviewRequests.length>0,draft:r.result.reasoning.historyNarrative,providerCalls:ledger.calls.length-initial,elapsedMs:Math.round(performance.now()-start),
      writeCounts:{care:r.result.acceptedCareActions.length,memory:r.result.acceptedLearnings.length,events:r.result.acceptedSemanticEvents.length}};
    delete item.plan.frame;output.turns.push(item);
    const n=messages.length+1;
    messages.push({id:'live-user-'+n,user_id:ownerId,conversation_id:'chat',role:'user',user_text:question,sequence_number:n,created_at:ledger.syntheticClock},
      {id:'live-answer-'+n,user_id:ownerId,conversation_id:'chat',role:'furvise',response_data:response,sequence_number:n+1,created_at:ledger.syntheticClock});
    console.log(JSON.stringify({question,answer:item.answer,providerCalls:item.providerCalls,elapsedMs:item.elapsedMs}));
  } catch(error) {
    const item={question,errorClass:error.name,code:error.diagnostics?.providerErrorCode||error.code||null,elapsedMs:Math.round(performance.now()-start),providerCalls:ledger.calls.length-initial};
    output.turns.push(item);console.log(JSON.stringify(item));
  }
  writeFileSync(outputPath,JSON.stringify(output,null,2)+'\n');
}
mock.timers.reset();
console.log(JSON.stringify({measuredUsd:ledger.measuredUsd,reservedUsd:ledger.reservedUsd,calls:ledger.calls.length}));
