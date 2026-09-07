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
  if(ledger.calls.length>=80||ledger.reservedUsd+worst>4.5) throw new Error('LOCAL_TEST_BUDGET_STOP');
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
const fixturePets=[...pets.filter(pet=>["milo","luna"].includes(pet.id)),{...pets[0],id:'oscar',name:'Oscar',species:'dog'}];
const rows=[
 care('m-jun4','milo','2026-06-04','general','Milo weighed 28.4 kg today. He is eating chicken-and-rice adult dry food. His appetite, energy and stools are normal.'),
 care('m-jun12','milo','2026-06-12','food','We started giving Milo new chicken training treats yesterday. His regular food has not changed.'),
 care('m-jun15','milo','2026-06-15','symptom','Milo had two soft stools today. He is still eating and playing normally. I wonder whether the new treats are involved, but I do not know.'),
 care('m-jun16','milo','2026-06-16','food','We stopped the new chicken training treats today. We kept his regular chicken-and-rice food the same.'),
 care('m-jun20','milo','2026-06-20','general','Milo has had normal stools for three days and his energy is normal. The soft stools seem to have ended.'),
 care('m-jul3','milo','2026-07-03','food','We started gradually changing Milo main food to salmon-and-rice adult dry food. The change is our choice; no chicken allergy has been diagnosed.'),
 care('m-aug8','milo','2026-08-08','symptom','Milo had one soft stool after staying with my sister for the weekend. She says he may have eaten some table scraps, but nobody saw exactly what he ate.'),
 care('m-aug10','milo','2026-08-10','general','Milo stools are normal again. There have been no more soft stools since August 8.'),
 care('m-correction','milo','2026-08-20','general','Correction to yesterday vomiting note: that was my sister dog Bruno, not Milo. Milo did not vomit and was acting normally. Please do not treat that report as Milo symptom history.'),
 care('m-sep3','milo','2026-09-03','general','Milo weighed 27.8 kg today. He is still eating salmon-and-rice food. His appetite, energy and stools are normal.'),
 care('l-jul5','luna','2026-07-05','general','We moved Luna litter tray from the spare room to the laundry room and changed to scented litter on the same day.'),
 care('l-jul8','luna','2026-07-08','behavior','Luna urinated on the bath mat once yesterday and once today. I have not noticed straining or repeated trips to the tray. I do not know whether the tray changes are connected.'),
 care('l-jul9','luna','2026-07-09','vet_visit','We took Luna to the vet about the two accidents. The vet asked us to restore her previous litter arrangement and monitor her. I have not entered any test results or diagnosis into Furvise.'),
 care('l-jul10','luna','2026-07-10','general','We moved Luna tray back to the spare room and returned to unscented litter. We changed both things together.'),
 care('l-jul17','luna','2026-07-17','general','Luna has had no more accidents since July 10. She is using the tray normally.'),
 care('l-jun18','luna','2026-06-18','behavior','Luna hid under the bed while a plumber was working in the apartment. She came out and ate normally after he left.'),
 care('l-jun21','luna','2026-06-21','general','Luna has behaved normally since the plumber left. She is not continuing to hide.'),
 care('l-aug15','luna','2026-08-15','behavior','Building work started next door. Luna is hiding more during the noisy periods, but she comes out later and eats her meals.'),
 care('l-aug22','luna','2026-08-22','behavior','Luna is coming out more often even when there is some noise. She still hides during the loud drilling. This has improved but has not completely stopped.'),
 care('l-sep2','luna','2026-09-02','general','Luna still hides during loud drilling. Her appetite and litter tray use are normal. Her weight today was 4.2 kg.'),
 care('o-jun17','oscar','2026-06-17','vet_visit','The vet examined Oscar because of the stiffness. We were given a seven-day medication course and told to return if the problem continued. I have not recorded the medication name, dose or a diagnosis here.'),
 care('o-jun24','oscar','2026-06-24','medication','Oscar finished the seven-day medication course today. He has seemed more comfortable over the last few days.'),
 care('o-jul1','oscar','2026-07-01','general','Oscar is getting up comfortably again and is willing to take his normal walks. I have not noticed stiffness this week.'),
 care('o-aug12','oscar','2026-08-12','symptom','Oscar seemed stiff again after a much longer walk than usual yesterday. This is the first stiffness I have noticed since late June.'),
 care('o-aug27','oscar','2026-08-27','vet_visit','We had a follow-up vet visit for Oscar recurring stiffness. The vet asked us to keep observing his comfort and activity. I have not recorded a diagnosis or any new medication instructions here.'),
 care('o-sep4','oscar','2026-09-04','general','Oscar is now getting onto the sofa without hesitating and has looked comfortable for the last three days.'),
 care('o-sep13','oscar','2026-09-13','general','We shortened Oscar walks after the stiffness returned. He still wants to go outside.'),
 care('o-sep14','oscar','2026-09-14','symptom','Oscar looked stiff when getting up after a long nap. He seemed more comfortable after moving around.'),
];
const questions=[
 'Summarize Milo stomach history.',
 'Were the June and August soft stools definitely caused by chicken?',
 'What about Luna accidents?',
 'And her hiding, is that resolved too?',
 'Now Oscar, was his stiffness continuous?',
 'Is he still taking that medication?',
 'What diagnosis did the vet give him?',
 'How can I make Milo vet visit less stressful?',
 'Milo died today. I feel like I lost part of my life.',
];
const outputPath=new URL('../../docs/ask-composition-live-conversations.json',import.meta.url);
const output={syntheticDatabase:true,realProviders:true,model,clock:ledger.syntheticClock,turns:[]};
let messages=[];
console.info=()=>{};
mock.timers.enable({apis:['Date'],now:Date.parse(ledger.syntheticClock)});
const selection=process.argv.find(arg=>arg.startsWith('--only='));
for(const question of questions.filter((q,index)=>!selection||selection.split('=')[1].split(',').map(Number).includes(index))) {
  currentQuestion=question;turnCalls=0;turnOrdinary=0;
  const start=performance.now();const initial=ledger.calls.length;
  try {
    const r=await runWithAiAdmission(admission,()=>exercise(question,{
      history:true,rows,messages,fixturePets,interpretationModel:model,interpretationProposal:{},
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
