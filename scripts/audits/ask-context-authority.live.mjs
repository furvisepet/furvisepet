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
const {enforceVerifiedStateClaims}=await import('../../app/lib/application-actions/state-claims.ts');
const {presentationOnlyAskResponse}=await import('../../app/lib/ask-conversation-server.ts');
const {resolveAskHistoryAccess}=await import('../../app/lib/intelligence/history-access.ts');
const model=getAskModelConfiguration().primary;
assert.equal(model,'gpt-5.4-mini','Live budget supports only the verified configured model');
assert.ok(process.env.OPENAI_API_KEY,'Existing key required');
const ledgerPath=new URL('../../docs/ask-context-authority-budget.json',import.meta.url);
const ledger=existsSync(ledgerPath)?JSON.parse(readFileSync(ledgerPath,'utf8')):{authorizedUsd:15,reservationStopUsd:3,priorAdditionalUsd:8.422958,reservedUsd:0,measuredUsd:0,calls:[],pricingSource:'https://developers.openai.com/api/docs/models/gpt-5.4-mini',pricing:{inputPerMillion:0.75,outputPerMillion:4.5},syntheticClock:'2026-09-09T12:00:00Z'};
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
  if(ledger.calls.length>=600||ledger.reservedUsd+worst>3) throw new Error('LOCAL_TEST_BUDGET_STOP');
  const item={number:ledger.calls.length+1,question:currentQuestion,model,reservedUsd:worst,phase:request.text?.format?.name,status:'reserved'};
  ledger.reservedUsd+=worst;ledger.calls.push(item);save();
  const start=performance.now();
  try {
    const response=await provider.responses.create({...request,store:false},{signal:options?.signal||AbortSignal.timeout(30000)});
    item.elapsedMs=Math.round(performance.now()-start);item.status=response.status;
    item.rawOutput=response.output_text;item.providerInput=JSON.parse(request.input);
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


const fixturePets=["Milo","Luna","Oscar"].map((name,index)=>({...pets[index],id:name.toLowerCase(),name}));
const rows=[{"name": "Luna", "day": "2021-10-06", "note": "Synthetic benchmark 2026-09-09 water-filled: Luna\u2019s bowl was filled with 250 mL of water. The amount Luna drank was not measured."}, {"name": "Luna", "day": "2023-03-12", "note": "Synthetic benchmark 2026-09-09 water-remaining: There were 100 mL of water remaining in Luna\u2019s bowl. The amount spilled was unknown. Water intake was not measured."}, {"name": "Luna", "day": "2026-05-21", "note": "Synthetic benchmark 2026-09-09 brushing: Luna tolerated 6 minutes of brushing calmly."}, {"name": "Luna", "day": "2026-06-04", "note": "Note: Luna weighed 4.2 kg today. She eats chicken complete adult wet food. She normally uses her uncovered litter tray in the quiet spare room."}, {"name": "Luna", "day": "2026-06-18", "note": "Note: Luna hid under the bed while a plumber was working in the apartment. She came out and ate normally after he left."}, {"name": "Luna", "day": "2026-06-21", "note": "Note: Luna has behaved normally since the plumber left. She is not continuing to hide."}, {"name": "Luna", "day": "2026-07-05", "note": "Note: We moved Luna's litter tray from the spare room to the laundry room and changed to scented litter on the same day."}, {"name": "Luna", "day": "2026-07-08", "note": "Note: Luna urinated on the bath mat once yesterday and once today. I have not noticed straining or repeated trips to the tray. I do not know whether the tray changes are connected."}, {"name": "Luna", "day": "2026-07-09", "note": "Note: We took Luna to the vet about the two accidents. The vet asked us to restore her previous litter arrangement and monitor her. I have not entered any test results or diagnosis into Furvise."}, {"name": "Luna", "day": "2026-07-10", "note": "Note: We moved Luna's tray back to the spare room and returned to unscented litter. We changed both things together."}, {"name": "Luna", "day": "2026-07-17", "note": "Note: Luna has had no more accidents since July 10. She is using the tray normally."}, {"name": "Luna", "day": "2026-08-02", "note": "Note: We gradually changed Luna from chicken wet food to turkey complete adult wet food because she seemed to prefer it. No food allergy has been diagnosed."}, {"name": "Luna", "day": "2026-08-15", "note": "Note: Building work started next door. Luna is hiding more during the noisy periods, but she comes out later and eats her meals."}, {"name": "Luna", "day": "2026-08-22", "note": "Note: Luna is coming out more often even when there is some noise. She still hides during the loud drilling. This has improved but has not completely stopped."}, {"name": "Luna", "day": "2026-09-02", "note": "Note: Luna still hides during loud drilling. Her appetite and litter tray use are normal. Her weight today was 4.2 kg."}, {"name": "Milo", "day": "2021-10-05", "note": "Synthetic benchmark 2026-09-09 carrier-old: Milo tolerated a 10-minute car ride calmly. The empty carrier weighed 2 kg. This was the carrier weight, not Milo\u2019s weight."}, {"name": "Milo", "day": "2023-04-11", "note": "Synthetic benchmark 2026-09-09 carrier-later: Milo tolerated a 20-minute car ride calmly. The empty carrier weighed 2.5 kg. No reason for the weight difference was recorded."}, {"name": "Milo", "day": "2026-05-20", "note": "Synthetic benchmark 2026-09-09 nail-trim: During a nail trim Milo withdrew his right forepaw once. No injury or diagnosis was recorded."}, {"name": "Milo", "day": "2026-06-04", "note": "Note: Milo weighed 28.4 kg today. He is eating chicken-and-rice adult dry food. His appetite, energy and stools are normal."}, {"name": "Milo", "day": "2026-06-12", "note": "Note: We started giving Milo new chicken training treats yesterday. His regular food has not changed."}, {"name": "Milo", "day": "2026-06-15", "note": "Note: Milo had two soft stools today. He is still eating and playing normally. I wonder whether the new treats are involved, but I do not know."}, {"name": "Milo", "day": "2026-06-16", "note": "Note: We stopped the new chicken training treats today. We kept his regular chicken-and-rice food the same."}, {"name": "Milo", "day": "2026-06-20", "note": "Note: Milo has had normal stools for three days and his energy is normal. The soft stools seem to have ended."}, {"name": "Milo", "day": "2026-07-03", "note": "Note: We started gradually changing Milo's main food to salmon-and-rice adult dry food. The change is our choice; no chicken allergy has been diagnosed."}, {"name": "Milo", "day": "2026-07-10", "note": "Note: Milo has finished the food transition. He now eats only the salmon-and-rice adult dry food for meals. His stools are normal."}, {"name": "Milo", "day": "2026-07-24", "note": "Note: Milo weighed 27.9 kg today. His appetite and activity are normal."}, {"name": "Milo", "day": "2026-08-08", "note": "Note: Milo had one soft stool after staying with my sister for the weekend. She says he may have eaten some table scraps, but nobody saw exactly what he ate."}, {"name": "Milo", "day": "2026-08-10", "note": "Note: Milo's stools are normal again. There have been no more soft stools since August 8."}, {"name": "Milo", "day": "2026-09-03", "note": "Note: Milo weighed 27.8 kg today. He is still eating salmon-and-rice food. His appetite, energy and stools are normal."}, {"name": "Oscar", "day": "2021-10-07", "note": "Synthetic benchmark 2026-09-09 walk-old: Oscar completed a 12-minute walk with one sniffing pause and no observed limp."}, {"name": "Oscar", "day": "2023-03-13", "note": "Synthetic benchmark 2026-09-09 walk-later: Oscar completed an 18-minute walk with two sniffing pauses. No cause for the difference in walk length was recorded."}, {"name": "Oscar", "day": "2026-05-22", "note": "Synthetic benchmark 2026-09-09 travel-bag: Oscar\u2019s travel bag weighed 6 lb. This was not Oscar\u2019s body weight."}, {"name": "Oscar", "day": "2026-06-04", "note": "Note: Oscar weighed 7.2 kg today. He eats chicken-and-rice senior dry food and usually enjoys two 20-minute walks."}, {"name": "Oscar", "day": "2026-06-11", "note": "Note: Oscar hesitated before jumping onto the sofa twice this week. He is still willing to walk. I do not know why he hesitated."}, {"name": "Oscar", "day": "2026-06-17", "note": "Note: The vet examined Oscar because of the stiffness. We were given a seven-day medication course and told to return if the problem continued. I have not recorded the medication name, dose or a diagnosis here."}, {"name": "Oscar", "day": "2026-06-24", "note": "Note: Oscar finished the seven-day medication course today. He has seemed more comfortable over the last few days."}, {"name": "Oscar", "day": "2026-07-01", "note": "Note: Oscar is getting up comfortably again and is willing to take his normal walks. I have not noticed stiffness this week."}, {"name": "Oscar", "day": "2026-07-20", "note": "Note: Oscar weighed 7.1 kg today. His appetite is normal and he is still eating chicken-and-rice senior food."}, {"name": "Oscar", "day": "2026-08-12", "note": "Note: Oscar seemed stiff again after a much longer walk than usual yesterday. This is the first stiffness I have noticed since late June."}, {"name": "Oscar", "day": "2026-08-18", "note": "Note: Oscar is moving more comfortably on the shorter walks, but he still hesitates before jumping onto the sofa."}, {"name": "Oscar", "day": "2026-08-27", "note": "Note: We had a follow-up vet visit for Oscar's recurring stiffness. The vet asked us to keep observing his comfort and activity. I have not recorded a diagnosis or any new medication instructions here."}, {"name": "Oscar", "day": "2026-09-03", "note": "Note: Oscar still enjoys two shorter walks each day. He occasionally hesitates at the sofa. His appetite is normal and he weighs 7.1 kg."}, {"name": "Oscar", "day": "2026-09-04", "note": "Note: Oscar is now getting onto the sofa without hesitating and has looked comfortable for the last three days."}].map((x,i)=>care("diag-"+i,x.name.toLowerCase(),x.day,"general",x.note));

const selectedIds=process.argv.find(x=>x.startsWith('--ids='))?.slice(6).split(',').map(Number);
const casesFile=process.argv.find(x=>x.startsWith('--cases='))?.slice(8)||'ask-v1-benchmark7-frozen.json';
if(!/^[a-z0-9-]+\.json$/.test(casesFile))throw Error('Invalid cases filename');
const allScenarios=JSON.parse(readFileSync(new URL('../../docs/'+casesFile,import.meta.url),'utf8')).cases;
const scenarios=selectedIds?allScenarios.filter(x=>selectedIds.includes(x.id)):allScenarios;
const phase=process.argv.find(x=>x.startsWith('--phase='))?.slice(8)||'baseline';
const outputPath=new URL('../../docs/ask-context-authority-'+phase+'.json',import.meta.url);
if(existsSync(outputPath))throw Error('Refusing to overwrite attempts');
const output={syntheticDatabase:true,realProviders:true,phase,turns:[]};let messages=[];
console.info=()=>{};mock.timers.enable({apis:['Date'],now:Date.parse(ledger.syntheticClock)});
for(const scenario of scenarios){
if(!scenario.continuePrevious)messages=[];
currentQuestion=scenario.question;turnCalls=0;const initial=ledger.calls.length;
try{
const r=await runWithAiAdmission(admission,()=>exercise(currentQuestion,{history:true,rows,messages,fixturePets,petId:'milo',interpretationModel:model,interpretationProposal:{},interpretationResponse:liveCall,providerResponse:liveCall,reviewProviderResponse:liveCall,prepareContext:context=>{context.historyAccess=resolveAskHistoryAccess('plus',new Date());},expectedProviderCalls:null,expectedReviewCalls:null}));
const rendered=restoreAskEvidencePresentation(buildAskConversationResponse(r.result.reasoning.answer),r.result.reasoning.evidenceContract,r.context.episodeResult);
const response=presentationOnlyAskResponse({...rendered,summary:enforceVerifiedStateClaims(rendered.directAnswer,false)},[]);
const item={id:scenario.id,question:currentQuestion,plan:r.context.askInterpretation,answer:response.directAnswer,beforeFinalGuard:rendered.directAnswer,draft:r.result.reasoning.historyNarrative,reviewInputs:r.reviewRequests.map(q=>JSON.parse(q.input)),providerCalls:ledger.calls.length-initial,writeCounts:{care:r.result.acceptedCareActions.length,memory:r.result.acceptedLearnings.length,events:r.result.acceptedSemanticEvents.length}};delete item.plan.frame;output.turns.push(item);
const n=messages.length+1;messages.push({id:'diag-u-'+n,user_id:ownerId,conversation_id:'chat',role:'user',user_text:currentQuestion,sequence_number:n,created_at:ledger.syntheticClock},{id:'diag-a-'+n,user_id:ownerId,conversation_id:'chat',role:'furvise',response_data:response,sequence_number:n+1,created_at:ledger.syntheticClock});
console.log(JSON.stringify({id:item.id,answer:item.answer.slice(0,180),calls:item.providerCalls}));
}catch(error){output.turns.push({id:scenario.id,error:error.message});console.log(JSON.stringify(output.turns.at(-1)));}
writeFileSync(outputPath,JSON.stringify(output,null,2)+'\n');
}
mock.timers.reset();console.log(JSON.stringify({measuredUsd:ledger.measuredUsd,reservedUsd:ledger.reservedUsd,calls:ledger.calls.length}));
