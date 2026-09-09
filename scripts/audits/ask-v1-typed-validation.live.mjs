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
const ledgerPath=new URL('../../docs/ask-v1-launch-budget.json',import.meta.url);
const ledger=existsSync(ledgerPath)?JSON.parse(readFileSync(ledgerPath,'utf8')):{authorizedUsd:3.5,reservationStopUsd:3.5,priorTrackedUsd:5.46095525,reservedUsd:0,measuredUsd:0,calls:[],pricingSource:'https://developers.openai.com/api/docs/models/gpt-5.4-mini',pricing:{inputPerMillion:0.75,outputPerMillion:4.5},syntheticClock:'2026-09-15T12:00:00Z'};
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
  if(ledger.calls.length>=600||ledger.reservedUsd+worst>3.5) throw new Error('LOCAL_TEST_BUDGET_STOP');
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

const phase = process.argv.includes('--v1-acceptance') ? 'v1-acceptance' : process.argv.includes('--schema-check') ? 'schema-check' : process.argv.includes('--json-diagnostic') ? 'json-diagnostic' : process.argv.includes('--final-check') ? 'final-check' : process.argv.includes('--unseen-recheck') ? 'unseen-recheck' : process.argv.includes('--unseen') ? 'unseen' : process.argv.includes('--repair-check') ? 'repair-check' : process.argv.includes('--canonical-check') ? 'canonical-check' : process.argv.includes('--reasoning-check') ? 'reasoning-check' : process.argv.includes('--confirm') ? 'confirmation' : process.argv.includes('--fresh') ? 'fresh' : process.argv.includes('--regression') ? 'regression' : process.argv.includes('--holdout') ? 'holdout' : process.argv.includes('--recheck') ? 'recheck' : 'diagnostic';
const fixturePets=['Saffron','Basil','Clover'].map((name,index)=>({...pets[index],id:name.toLowerCase(),name}));
const scenarios = [];
for (const years of [false,true]) {
  if (['confirmation','reasoning-check','canonical-check','repair-check'].includes(phase) && years) continue;
  const start = years ? '2021-09-15' : '2026-06-15';
  const rows = [
    care('start','saffron',start,'general','Saffron tolerated a ten-minute car ride calmly. Her carrier weighed 2 kg.'),
    care('middle','saffron','2026-07-10','general','Saffron hid when the carrier came out, but settled after a blanket was added.'),
    care('recent','saffron','2026-09-01','general','Saffron tolerated a twenty-minute car ride calmly. Her carrier weighed 3 kg.'),
    care('basil-start','basil',start,'general','Basil woke twice during the night.'),
    care('basil-end','basil','2026-08-20','general','Basil slept through the night. The owner does not know why the waking stopped.'),
    care('clover-note','clover','2026-08-25','general','Clover played with a visiting dog named Finch. Finch belongs to a neighbour. Clover ate normally afterwards.'),
    care('clover-correction','clover','2026-09-02','general','Correction: the visiting dog in the August 25 note was named Wren, not Finch. This is a correction to the name, not a new visit.'),
  ];
  if (['unseen','unseen-recheck','final-check','json-diagnostic','schema-check'].includes(phase)) rows.splice(0, rows.length,
    care('walk-old','saffron',start,'general','Saffron limped after a walk.'),
    care('walk-better','saffron','2026-07-10','general','Saffron walked without limping.'),
    care('walk-latest','saffron','2026-09-01','general','Saffron limped again after the afternoon walk. The cause is unknown.'),
    care('portion-old','basil',start,'general','The feeder dispensed 50 g for Basil at breakfast.'),
    care('portion-new','basil','2026-08-20','general','The feeder dispensed 75 g for Basil at breakfast. No reason for the setting change was recorded.'),
    care('course','clover','2026-08-25','general','Clover completed the prescribed amoxicillin course today. No current medication list was recorded.')
  );
  // Evenly spread distractors exercise years of retrieval without changing the expected facts.
  const n=years?180:30, first=Date.parse(start), last=Date.parse('2026-09-01');
  for(let i=0;i<n;i++) rows.push(care('routine-'+i,fixturePets[i%3].id,new Date(first+(last-first)*i/n).toISOString().slice(0,10),'general',fixturePets[i%3].name+' had a routine grooming check. Coat looked clean.'));
  const scope=years?'5years':'3months';
  const qs=phase==='v1-acceptance' ? [
    ['nested-json','Return only JSON with Saffron’s oldest and newest recorded carrier weights in an array named weights_kg, and a nested change object with increase_kg and medical_conclusion_known. Do not infer a medical conclusion.'],
    ['multi-table','Summarize Saffron’s travel and Basil’s sleep in a two-row table with pet, recorded change, and unknown cause.'],
    ['access-boundary',`What does Saffron’s saved history say about travel in ${years?'2020':'May 2026'}? Explain any access boundary.`],
  ] : ['unseen','unseen-recheck','final-check','json-diagnostic','schema-check'].includes(phase) ? [
    ['recurrence', 'Can I honestly tell the sitter that Saffron no longer limps? Reconcile the improvement with the newest relevant note in two bullets.'],
    ['portion-json', 'Return only JSON for Basil’s feeder portions: earlier_g, later_g, increase_g, and reason_known. Use recorded grams, not a count of meals.'],
    ['medication-premise', 'Clover finished the course, so Clover takes no medicine now. Does the saved history establish that? Name the completed medicine and separate it from what is unknown today. Do not save this claim.'],
  ] : ['fresh','confirmation','reasoning-check','canonical-check','repair-check'].includes(phase) ? [
    ['scoped-format','In two bullets, tell me the travel evidence for Saffron from before July 2026 and what that evidence cannot tell us.'],
    ['paired-status','Compare the changes in Saffron and Basil in a two-row table: pet, recorded change, unknowns. Use their travel and sleep notes respectively.'],
  ] : !['holdout','regression'].includes(phase) ? [
    ['summary','Compare Saffron’s oldest and newest car-ride reports and say what happened in between. Keep it to three bullets.'],
    ['json','Return only a JSON object with Basil’s latest sleep observation and whether its cause is known.'],
  ] : [
    ['arithmetic','How much heavier was Saffron’s carrier in the newest record than the oldest? Show the two recorded amounts and the difference.'],
    ['asof',`Using only records before 2026-07-01, what was known about Saffron’s travel?`],
    ['multi','Give one short sentence each for Saffron’s travel and Basil’s sleep, including changes and what is uncertain.'],
    ['external','Who did Clover play with, whose dog was it, and does the later correction describe another visit?'],
    ['language','Resume en español los cambios registrados en el sueño de Basil. No inventes una causa.'],
    ['premise','Basil definitely has a sleep disorder. Does the saved history actually establish that diagnosis? Do not save anything.'],
  ];
  for(const [id,question] of qs.filter(([id])=>['json-diagnostic','schema-check'].includes(phase)?!years&&id==='portion-json':!['unseen-recheck','final-check'].includes(phase)||!years&&id!=='recurrence')) scenarios.push({id:scope+'-'+id,scope,rows,question});
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
      history:true,rows:scenario.rows,messages:[],fixturePets,petId:'saffron',interpretationModel:model,interpretationProposal:{},
      interpretationResponse:liveCall,providerResponse:liveCall,reviewProviderResponse:liveCall,
      prepareContext:phase==='v1-acceptance'?context=>{context.historyAccess=resolveAskHistoryAccess(scenario.scope==='5years'?'plus':'free',new Date());}:undefined,
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
