// Opt-in, synthetic database / real provider acceptance. Never loaded by node --test.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { mock } from 'node:test';
import OpenAI from 'openai';
const originalFetch = globalThis.fetch;
if (!process.argv.includes('--run-live')) throw new Error('Explicit --run-live required');
const {exercise} = await import('./helpers/lifetime-harness.mjs');
const {care,pets,ownerId}=await import('./fixtures/ask-lifetime-history.mjs');
const {getAskModelConfiguration,ASK_MAX_OUTPUT_TOKENS}=await import('../../app/lib/ai/ask-reasoning.ts');
const {admitAiOperation}=await import('../../app/lib/ai/usage-guard/admission.ts');
const {MemoryAiGuardTestStore}=await import('../../app/lib/ai/usage-guard/memory-test-store.ts');
const guardStore=new MemoryAiGuardTestStore();
const {AiAdmissionError}=await import('../../app/lib/ai/usage-guard/errors.ts');
const {buildAskConversationResponse}=await import('../../app/lib/ask.mjs');
const {restoreAskEvidencePresentation}=await import('../../app/lib/intelligence/ask-evidence-presentation.ts');
const {enforceVerifiedStateClaims}=await import('../../app/lib/application-actions/state-claims.ts');
const {presentationOnlyAskResponse}=await import('../../app/lib/ask-conversation-server.ts');
const {resolveAskHistoryAccess}=await import('../../app/lib/intelligence/history-access.ts');
const model=getAskModelConfiguration().primary;
assert.equal(model,'gpt-5.4-mini','Live budget supports only the verified configured model');
assert.ok(process.argv.includes('--dry-run')||process.env.OPENAI_API_KEY,'Existing key required');
const ledgerPath=new URL('../../docs/ask-five-year-rerun-budget.json',import.meta.url);
if(existsSync(ledgerPath))throw Error('Refusing to overwrite rerun ledger');
const ledger={authorizedUsd:4.60,priorNewAllowanceSpendUsd:0.385623,reservedUsd:0,measuredUsd:0,calls:[],pricing:{inputPerMillion:0.75,outputPerMillion:4.5},syntheticClock:'2026-09-09T12:00:00Z'};
const save=()=>writeFileSync(ledgerPath,JSON.stringify(ledger,null,2)+'\n');
const provider=new OpenAI({apiKey:process.env.OPENAI_API_KEY||'dry-run-unused',maxRetries:0,fetch:(url,options)=>{
  if(new URL(String(url)).origin!=='https://api.openai.com') throw new Error('Only OpenAI API allowed');
  return originalFetch(url,options);
}});
let turnCalls=0,turnOrdinary=0,currentQuestion='';
async function liveCall(request,options={}) {
  assert.equal(request.model,model);
  assert.ok(!request.tools?.length,'No tools or extra paid services allowed');
  assert.ok(Number.isInteger(request.max_output_tokens)&&request.max_output_tokens>0&&request.max_output_tokens<=ASK_MAX_OUTPUT_TOKENS);
  const bytes=Buffer.byteLength(JSON.stringify(request),'utf8')+2048;
  const worst=bytes*0.75/1e6+request.max_output_tokens*4.5/1e6;
  if(ledger.calls.length>=1000||ledger.reservedUsd+worst>ledger.authorizedUsd) throw new Error('LOCAL_TEST_BUDGET_STOP');
  const item={phaseRun:phase,number:ledger.calls.length+1,question:currentQuestion,model,reservedUsd:worst,phase:request.text?.format?.name,status:'reserved'};
  ledger.reservedUsd+=worst;ledger.calls.push(item);save();
  const start=performance.now();
  try {
    const response=await provider.responses.create({...request,store:false},{signal:options?.signal||AbortSignal.timeout(30000)});
    item.elapsedMs=Math.round(performance.now()-start);item.status=response.status;
    item.rawOutput=response.output_text;item.providerInput=JSON.parse(request.input);item.cachedInputTokens=response.usage?.input_tokens_details?.cached_tokens||0;
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
const fixturePets=["Milo","Luna","Oscar"].map((name,index)=>({...pets[index],id:name.toLowerCase(),name}));
let rows=[];
const fixtureFile='ask-five-year-fixture.json';
if(fixtureFile){if(!/^[a-z0-9-]+\.json$/.test(fixtureFile))throw Error('Invalid fixture');const fixture=JSON.parse(readFileSync(new URL('../../docs/'+fixtureFile,import.meta.url),'utf8'));rows=fixture.rows.map(x=>care(x.key,x.pet.toLowerCase(),x.day,x.category,x.note,{title:'Five-year test '+x.key,created_at:x.day+'T12:00:00Z'}));for(const pet of fixturePets)Object.assign(pet,{weight_value:{Milo:29.4,Luna:4.7,Oscar:8.2}[pet.name],weight_unit:'kg',current_food:{Milo:'beef-and-barley adult dry food',Luna:'rabbit complete adult wet food',Oscar:'duck senior dry food'}[pet.name],routine_note:null});}
const selectedIds=process.argv.find(x=>x.startsWith('--ids='))?.slice(6).split(',').map(Number);
const casesFile='ask-five-year-200-frozen.json';
if(!/^[a-z0-9-]+\.json$/.test(casesFile))throw Error('Invalid cases filename');
const allScenarios=JSON.parse(readFileSync(new URL('../../docs/'+casesFile,import.meta.url),'utf8')).cases;
const scenarios=selectedIds?allScenarios.filter(x=>selectedIds.includes(x.id)):allScenarios;
const phase='rerun200';
const outputPath=new URL('../../docs/ask-five-year-'+phase+'.json',import.meta.url);
if(existsSync(outputPath))throw Error('Refusing to overwrite attempts');
if(process.argv.includes('--dry-run')){assert.equal(rows.length,1169);assert.equal(scenarios.length,200);console.log(JSON.stringify({dryRun:true,cases:scenarios.length,rows:rows.length,model,cap:ledger.authorizedUsd}));process.exit(0);}
const output={syntheticDatabase:true,realProviders:true,productionRoute:false,productionBrowser:false,fixtureFile,fixtureRows:rows.length,phase,realAdmissionWithMemoryStore:true,monotonicDeadline:true,turns:[]};let messages=[];
console.info=()=>{};mock.timers.enable({apis:['Date'],now:Date.parse(ledger.syntheticClock)});
for(const scenario of scenarios){
if(!scenario.continuePrevious)messages=[];
currentQuestion=scenario.question;turnCalls=0;const initial=ledger.calls.length;const started=performance.now();
let admission;const operationStart=performance.now();
try{
admission=await admitAiOperation({store:guardStore,feature:'ask',intendedModel:model,env:{NODE_ENV:'test'},payload:{id:scenario.id},userId:ownerId,requestId:'rerun-'+scenario.id});
// Keep evidence time fixed while preserving the production 45-second provider deadline.
Object.defineProperty(admission,'providerDeadlineAt',{get:()=>Date.now()+45000-(performance.now()-operationStart)});
const r=await admission.run(()=>exercise(currentQuestion,{history:true,rows,messages,fixturePets,petId:'milo',interpretationModel:model,interpretationProposal:{},interpretationResponse:liveCall,providerResponse:liveCall,reviewProviderResponse:liveCall,historyAccess:resolveAskHistoryAccess(scenario.plan||'plus',new Date()),expectedProviderCalls:null,expectedReviewCalls:null}));
const rendered=restoreAskEvidencePresentation(buildAskConversationResponse(r.result.reasoning.answer),r.result.reasoning.evidenceContract,r.context.episodeResult);
const response=presentationOnlyAskResponse({...rendered,summary:enforceVerifiedStateClaims(rendered.directAnswer,false)},[]);
const item={id:scenario.id,elapsedMs:Math.round(performance.now()-started),planTier:scenario.plan||'plus',question:currentQuestion,plan:r.context.askInterpretation,answer:response.directAnswer,beforeFinalGuard:rendered.directAnswer,draft:r.result.reasoning.historyNarrative,reviewInputs:r.reviewRequests.map(q=>JSON.parse(q.input)),providerCalls:ledger.calls.length-initial,writeCounts:{care:r.result.acceptedCareActions.length,memory:r.result.acceptedLearnings.length,events:r.result.acceptedSemanticEvents.length}};delete item.plan.frame;output.turns.push(item);
const n=messages.length+1;messages.push({id:'diag-u-'+n,user_id:ownerId,conversation_id:'chat',role:'user',user_text:currentQuestion,sequence_number:n,created_at:ledger.syntheticClock},{id:'diag-a-'+n,user_id:ownerId,conversation_id:'chat',role:'furvise',response_data:response,sequence_number:n+1,created_at:ledger.syntheticClock});
await admission.complete();console.log(JSON.stringify({id:item.id,answer:item.answer.slice(0,180),calls:item.providerCalls,committedUsd:ledger.reservedUsd}));
}catch(error){await admission?.fail(error);output.turns.push({id:scenario.id,error:/^(?:FURVISE_ANSWER_VALIDATION_FAILED:[a-z_,]+|LOCAL_TEST_BUDGET_STOP)$/.test(error.message)?error.message:error.name,elapsedMs:Math.round(performance.now()-started),providerCalls:ledger.calls.length-initial});console.log(JSON.stringify(output.turns.at(-1)));if(/LOCAL_TEST_BUDGET_STOP/.test(error.message)||ledger.calls.at(-1)?.errorClass==='AuthenticationError'){output.stopReason='budget_or_credentials';writeFileSync(outputPath,JSON.stringify(output,null,2)+'\n');break;}}finally{await admission?.release();}
writeFileSync(outputPath,JSON.stringify(output,null,2)+'\n');
}
mock.timers.reset();console.log(JSON.stringify({measuredUsd:ledger.measuredUsd,reservedUsd:ledger.reservedUsd,calls:ledger.calls.length}));
