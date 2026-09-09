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
const model='gpt-5.4';
assert.equal(model,'gpt-5.4','Live budget supports only the verified configured model');
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
  const worst=bytes*2.5/1e6+request.max_output_tokens*15/1e6;
  if(ledger.calls.length>=120||ledger.reservedUsd+worst>1.5) throw new Error('LOCAL_TEST_BUDGET_STOP');
  const item={number:ledger.calls.length+1,question:currentQuestion,model,reservedUsd:worst,phase:request.text?.format?.name,status:'reserved'};
  item.reviewInput = JSON.parse(request.input); item.instructions = request.instructions;
  ledger.reservedUsd+=worst;ledger.calls.push(item);save();
  const start=performance.now();
  try {
    const schema=request.text.format.schema;
    const diagnostic={...request,text:{format:{...request.text.format,schema:{...schema,required:[...schema.required,'rationale'],properties:{...schema.properties,rationale:{type:'string',maxLength:1000}}}}},instructions:request.instructions+' Explain the decisive approval or rejection reason briefly in rationale.'};
    const response=await provider.responses.create({...diagnostic,store:false},{signal:options?.signal||AbortSignal.timeout(30000)});
    item.elapsedMs=Math.round(performance.now()-start);item.status=response.status;
    item.inputTokens=response.usage?.input_tokens;item.outputTokens=response.usage?.output_tokens;
    if(!Number.isInteger(item.inputTokens)||!Number.isInteger(item.outputTokens)) throw new Error('USAGE_UNAVAILABLE');
    item.measuredUsd=item.inputTokens*2.5/1e6+item.outputTokens*15/1e6;
    ledger.measuredUsd+=item.measuredUsd; ledger.reservedUsd-=worst-item.measuredUsd;
    if(item.phase==='furvise_history_review') item.review=response.output_text;
    if(item.phase==='furvise_ask_interpretation') item.syntheticPlan=JSON.parse(response.output_text);
    if(item.phase==='furvise_ask_response') item.syntheticResponse=JSON.parse(response.output_text);
    const decision=JSON.parse(response.output_text);item.rationale=decision.rationale;delete decision.rationale;save();return {...response,output_text:JSON.stringify(decision)};
  } catch(error) {
    item.elapsedMs=Math.round(performance.now()-start);item.status='failed';item.errorClass=error.name;save();throw error;
  }
}
const admission={async beginProviderCall(input){
  if(++turnCalls>3||input.purpose!=='history_review'&&++turnOrdinary>2)throw new AiAdmissionError('AI_PROVIDER_BUDGET_EXHAUSTED','provider_call_budget_exhausted');
  return {reservation:{}};
},async recordProviderUsage(){},recordProviderFailure(){}};




const {taskHistoryReviewSchema}=await import('../../app/lib/intelligence/history-review-selection.ts');
const canonical=JSON.parse(readFileSync(new URL('../../docs/ask-shared-canonical-check-live.json',import.meta.url),'utf8')).turns.find(t=>t.id.endsWith('paired-status')).reviewInputs[0];
const prose=JSON.parse(readFileSync(new URL('../../docs/ask-shared-reasoning-check-live.json',import.meta.url),'utf8')).turns.find(t=>t.id.endsWith('paired-status')).reviewInputs[0];
const fabricated=structuredClone(canonical);fabricated.draft.sentences[0].text+=' A veterinarian diagnosed incurable cancer.';
const instructions=ledger.calls.find(call=>call.instructions)?.instructions;
const results=[];
for(const [id,input] of [['canonical-table',canonical],['wrong-format',prose],['fabricated-diagnosis',fabricated]]) {
 currentQuestion=input.question;
 const r=await liveCall({model,instructions,input:JSON.stringify(input),max_output_tokens:1200,reasoning:{effort:'low'},text:{format:{type:'json_schema',name:'furvise_history_review',strict:true,schema:taskHistoryReviewSchema}}});
 const result={id,model,review:JSON.parse(r.output_text),rationale:ledger.calls.at(-1).rationale,costUsd:ledger.calls.at(-1).measuredUsd};results.push(result);console.log(JSON.stringify(result));
}
writeFileSync(new URL('../../docs/ask-strong-review-calibration.json',import.meta.url),JSON.stringify({syntheticCalibration:true,model,pricing:{inputPerMillion:2.5,outputPerMillion:15},results},null,2)+'\n');
console.log(JSON.stringify({measuredUsd:ledger.measuredUsd,reservedUsd:ledger.reservedUsd,calls:ledger.calls.length}));
