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
const {resolveAskHistoryAccess}=await import('../../app/lib/intelligence/history-access.ts');
const model=getAskModelConfiguration().primary;
assert.equal(model,'gpt-5.4-mini','Live budget supports only the verified configured model');
assert.ok(process.env.OPENAI_API_KEY,'Existing key required');
const ledgerPath=new URL('../../docs/ask-general-blockers-budget.json',import.meta.url);
const ledger=existsSync(ledgerPath)?JSON.parse(readFileSync(ledgerPath,'utf8')):{authorizedUsd:2.4,reservationStopUsd:2.4,priorTrackedUsd:7.35527075,reservedUsd:0,measuredUsd:0,calls:[],pricingSource:'https://developers.openai.com/api/docs/models/gpt-5.4-mini',pricing:{inputPerMillion:0.75,outputPerMillion:4.5},syntheticClock:'2026-09-15T12:00:00Z'};
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
  if(ledger.calls.length>=600||ledger.reservedUsd+worst>2.4) throw new Error('LOCAL_TEST_BUDGET_STOP');
  const item={number:ledger.calls.length+1,question:currentQuestion,model,reservedUsd:worst,phase:request.text?.format?.name,status:'reserved'};
  ledger.reservedUsd+=worst;ledger.calls.push(item);save();
  const start=performance.now();
  try {
    const response=await provider.responses.create({...request,store:false},{signal:options?.signal||AbortSignal.timeout(30000)});
    item.elapsedMs=Math.round(performance.now()-start);item.status=response.status;
    item.rawOutput=response.output_text;
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

const phase = process.argv.includes('--duration-check') ? 'general-blockers-duration-check' : process.argv.includes('--verification') ? 'general-blockers-verification' : 'general-blockers';
const fixturePets=['Juniper','Maple','Tansy'].map((name,index)=>({...pets[index],id:name.toLowerCase(),name}));
const scenarios=[];
for (const years of [false,true]) {
 const start=years?'2022-02-14':'2026-07-02';
 const rows=[
  care('gear-old','juniper',start,'general','Juniper weighed 14 kg. The travel crate weighed 4 kg. Juniper tolerated a 7-minute ride.'),
  care('gear-new','juniper','2026-08-19','general','Juniper weighed 15 kg. The travel crate weighed 6 kg. Juniper tolerated an 18-minute ride.'),
  care('drink-old','maple',start,'general','A bowl with 320 ml of water was offered to Maple. Drinking was not measured.'),
  care('drink-new','maple','2026-08-23','general','The bowl contained 90 ml of water after a spill. The spilled amount and Maple’s intake are unknown.'),
  care('blanket','tansy','2026-08-11','general','Tansy’s blanket was dry. Tansy settled after the door closed.'),
  care('rest','tansy','2026-09-02','general','Tansy woke three times overnight. No cause was recorded.'),
 ];
 const n=years?180:30, first=Date.parse(start), last=Date.parse('2026-09-10');
 for(let i=0;i<n;i++) rows.push(care('routine-'+i,fixturePets[i%3].id,new Date(first+(last-first)*i/n).toISOString().slice(0,10),'general',fixturePets[i%3].name+' had a routine grooming check. Coat looked clean.'));
 const qs=[
 ['entity-json','Return only JSON with Juniper’s earlier_crate_kg, later_crate_kg and crate_increase_kg. Use the crate measurements.'],
 ['duration','Compare the two recorded ride durations for Juniper, including their difference in minutes.'],
 ['unknown-intake','How much water did Maple drink between the two bowl observations? Explain whether the saved measurements can establish intake.'],
 ['quote','Quote Tansy’s blanket and settling note exactly, then give one limitation of that observation.'],
 ['asof','As of September 5, what was Tansy’s latest recorded overnight waking observation? Include the date and any unknown cause.'],
 ];
 for(const [id,question] of qs) scenarios.push({id:(years?'5years':'3months')+'-'+id,scope:years?'5years':'3months',rows,question});
}
if (phase.endsWith('-verification')) {
  for (const scenario of scenarios) {
    scenario.id += '-new';
    for (const row of scenario.rows) row.note = row.note.replaceAll('7-minute', '9-minute').replaceAll('18-minute', '26-minute').replaceAll('blanket', 'mat').replaceAll('door closed', 'lights dimmed');
    scenario.question = scenario.question.replace('blanket', 'mat').replace('September 5', 'September 7');
  }
}
if (phase.endsWith('-duration-check')) {
  const durationScenarios = scenarios.filter(scenario => scenario.id.endsWith('-duration'));
  scenarios.splice(0, scenarios.length, ...durationScenarios);
  for (const scenario of scenarios) {
    scenario.id += '-final';
    for (const row of scenario.rows) row.note = row.note.replaceAll('7-minute', '8-minute').replaceAll('18-minute', '23-minute');
    scenario.question = 'What are Juniper’s two saved ride lengths, and how many minutes longer was the later one?';
  }
}
const outputPath=new URL('../../docs/ask-typed-'+phase+'-live.json',import.meta.url);
if(existsSync(outputPath)) throw new Error('Refusing to overwrite first attempts');
const output={syntheticDatabase:true,realProviders:true,model,phase,clock:ledger.syntheticClock,turns:[]};
console.info=()=>{};
mock.timers.enable({apis:['Date'],now:Date.parse(ledger.syntheticClock)});
for(const scenario of scenarios) {
  currentQuestion=scenario.question;turnCalls=0;turnOrdinary=0;
  const start=performance.now(),initial=ledger.calls.length;
  try {
    const r=await runWithAiAdmission(admission,()=>exercise(currentQuestion,{
      history:true,rows:scenario.rows,messages:[],fixturePets,petId:'juniper',interpretationModel:model,interpretationProposal:{},
      interpretationResponse:liveCall,providerResponse:liveCall,reviewProviderResponse:liveCall,
      prepareContext:context=>{context.historyAccess=resolveAskHistoryAccess(scenario.scope==='5years'?'plus':'free',new Date());},
      expectedProviderCalls:null,expectedReviewCalls:null,
    }));
    const response=restoreAskEvidencePresentation(buildAskConversationResponse(r.result.reasoning.answer),r.result.reasoning.evidenceContract,r.context.episodeResult);
    const item={id:scenario.id,history:scenario.scope,records:scenario.rows.length,question:currentQuestion,
      plan:r.context.askInterpretation,answer:response.directAnswer,sections:response.sections,
      reviewed:r.reviewRequests.length>0,draft:r.result.reasoning.historyNarrative,reviewInputs:r.reviewRequests.map(request=>JSON.parse(request.input)),
      retainedIds:r.prompt?.contextRecords?.filter(x=>x.sourceType==='care_update').map(x=>x.id),
      review:r.reviewRequests.length ? ledger.calls.at(-1)?.review : null,
      providerCalls:ledger.calls.length-initial,elapsedMs:Math.round(performance.now()-start),
      writeCounts:{care:r.result.acceptedCareActions.length,memory:r.result.acceptedLearnings.length,events:r.result.acceptedSemanticEvents.length}};
    delete item.plan.frame;output.turns.push(item);
    console.log(JSON.stringify({id:item.id,answer:item.answer,review:item.review,elapsedMs:item.elapsedMs}));
  }catch(error){ const item={id:scenario.id,question:currentQuestion,errorClass:error.name,code:error.diagnostics?.providerErrorCode||error.code||null,message:error.message,providerCalls:ledger.calls.length-initial};output.turns.push(item);console.log(JSON.stringify(item)); }
  writeFileSync(outputPath,JSON.stringify(output,null,2)+'\n');
}
mock.timers.reset();
console.log(JSON.stringify({measuredUsd:ledger.measuredUsd,reservedUsd:ledger.reservedUsd,calls:ledger.calls.length}));
