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
const ledgerPath=new URL('../../docs/ask-shared-live-budget.json',import.meta.url);
const ledger=existsSync(ledgerPath)?JSON.parse(readFileSync(ledgerPath,'utf8')):{authorizedUsd:1.5,reservationStopUsd:1.5,priorTrackedUsd:4.421515,reservedUsd:0,measuredUsd:0,calls:[],pricingSource:'https://developers.openai.com/api/docs/models/gpt-5.4-mini',pricing:{inputPerMillion:0.75,outputPerMillion:4.5},syntheticClock:'2026-09-15T12:00:00Z'};
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
  if(ledger.calls.length>=160||ledger.reservedUsd+worst>1.5) throw new Error('LOCAL_TEST_BUDGET_STOP');
  const item={number:ledger.calls.length+1,question:currentQuestion,model,reservedUsd:worst,phase:request.text?.format?.name,status:'reserved'};
  ledger.reservedUsd+=worst;ledger.calls.push(item);save();
  const start=performance.now();
  try {
    const response=await provider.responses.create({...request,store:false},{signal:options?.signal||AbortSignal.timeout(30000)});
    item.elapsedMs=Math.round(performance.now()-start);item.status=response.status;
    item.inputTokens=response.usage?.input_tokens;item.outputTokens=response.usage?.output_tokens;
    if(!Number.isInteger(item.inputTokens)||!Number.isInteger(item.outputTokens)) throw new Error('USAGE_UNAVAILABLE');
    item.measuredUsd=item.inputTokens*0.75/1e6+item.outputTokens*4.5/1e6;
    ledger.measuredUsd+=item.measuredUsd; ledger.reservedUsd-=worst-item.measuredUsd;
    if(item.phase==='furvise_history_review') item.review=response.output_text;
    if(item.phase==='furvise_ask_interpretation') item.syntheticPlan=JSON.parse(response.output_text);
    if(item.phase==='furvise_ask_response') item.syntheticResponse=JSON.parse(response.output_text);
    save();return response;
  } catch(error) {
    item.elapsedMs=Math.round(performance.now()-start);item.status='failed';item.errorClass=error.name;save();throw error;
  }
}
const admission={async beginProviderCall(input){
  const cap=input.purpose==='history_rereview'?5:input.purpose==='history_repair'?4:input.purpose==='history_review'?3:2;
  if(input.purpose==='history_repair'&&turnCalls!==3||input.purpose==='history_rereview'&&turnCalls!==4||turnCalls>=cap)throw new AiAdmissionError('AI_PROVIDER_BUDGET_EXHAUSTED','provider_call_budget_exhausted');
  turnCalls++; return {reservation:{}};
},async recordProviderUsage(){},recordProviderFailure(){}};

const {emptyProposedSemanticFrame}=await import('../../app/lib/intelligence/semantic-frame/extract-frame.ts');
const fixturePets=['Saffron','Basil','Clover'].map((name,index)=>({...pets[index],id:name.toLowerCase(),name}));
const rows=[care('trip-old','saffron','2026-06-15','general','Saffron tolerated a ten-minute car ride calmly.'),
 care('trip-new','saffron','2026-09-01','general','Saffron tolerated a twenty-minute car ride calmly. The cause of any change is unknown.'),
 care('sleep-old','basil','2026-06-15','general','Basil woke twice during the night.'),
 care('sleep-new','basil','2026-08-20','general','Basil slept through the night. The owner does not know why the waking stopped.')];
const question='Compare Saffron travel and Basil sleep in a two-row table with columns Pet, Recorded change, Unknowns.';
const valid='| Pet | Recorded change | Unknowns |\n| --- | --- | --- |\n| Saffron | The saved reports changed from a calm ten-minute car ride to a calm twenty-minute ride. | The cause of any change is unknown. |\n| Basil | The saved reports changed from waking twice at night to sleeping through the night. | The owner does not know why the waking stopped. |';
const proposal={version:'ask-request.v2',mode:'read',question,requirements:['Use a table with two data rows and the requested columns.'],referenceTurnIds:[],scope:'named',petNames:['Saffron','Basil'],operation:'comparison',selection:'comparison',quantity:null,topic:'travel and sleep',terms:[],from:null,to:null,episodeTopic:null,ordinal:null,frame:emptyProposedSemanticFrame()};
const output={realReviewerAndRepair:true,mockedInterpretationAndDraft:true,results:[]};
const file=new URL('../../docs/ask-repair-calibration.json',import.meta.url);if(existsSync(file))throw Error('Already captured');
console.info=()=>{};
mock.timers.enable({apis:['Date'],now:Date.parse(ledger.syntheticClock)});
for(const [id,draft] of [['wrong-format',valid.split('\n').slice(2).join(' ').replaceAll('|',' ')],['unsupported',valid.replace('The cause of any change is unknown.','A veterinarian diagnosed incurable cancer, causing the travel changes.')]]){
 currentQuestion=question;turnCalls=0;turnOrdinary=0;
 const r=await runWithAiAdmission(admission,()=>exercise(question,{fixturePets,rows,messages:[],petId:'saffron',history:true,interpretationProposal:proposal,providerOverrides:{answer:draft,historyNarrative:{sentences:[{text:draft,sourceIds:rows.map(row=>'care:'+row.id),calculations:[]}]}},reviewProviderResponse:liveCall,expectedProviderCalls:null,expectedReviewCalls:null}));
 const item={id,phases:r.reviewRequests.map(request=>request.text.format.name),writeCounts:{care:r.result.acceptedCareActions.length,memory:r.result.acceptedLearnings.length,events:r.result.acceptedSemanticEvents.length},answer:r.result.reasoning.answer.summary,review:ledger.calls.at(-1)?.review,rationale:ledger.calls.at(-1)?.rationale};output.results.push(item);console.log(JSON.stringify(item));writeFileSync(file,JSON.stringify(output,null,2)+'\n');
}
mock.timers.reset();
console.log(JSON.stringify({measuredUsd:ledger.measuredUsd,reservedUsd:ledger.reservedUsd,calls:ledger.calls.length}));
