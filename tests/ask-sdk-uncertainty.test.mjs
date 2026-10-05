import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,appendFileSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root=process.env.FURVISE_TEST_ROOT||process.cwd();
const load=p=>import(pathToFileURL(path.join(root,p)).href);
const {generateContextAwareAskResponse,generateStructuredFeatureResponse,getAskProviderCooldown}=await load('app/lib/ai/ask-reasoning.ts');
const {admitAiOperation}=await load('app/lib/ai/usage-guard/admission.ts');
const {MemoryAiGuardTestStore}=await load('app/lib/ai/usage-guard/memory-test-store.ts');
const {estimateProviderCostMicrodollars}=await load('app/lib/ai/usage-guard/cost-estimator.ts');
const {OperationDeadline}=await load('app/lib/ai/execution-deadline.ts');
const fallback='gpt-5.4';
const model='gpt-5.4-mini',day='2038-06-17';
const env={NODE_ENV:'test',FURVISE_AI_DAILY_CALL_LIMIT:'20',FURVISE_AI_DAILY_COST_LIMIT_USD:'5',FURVISE_RATE_LIMIT_HASH_SECRET:'offline-retry-identity-fixture-000000'};
const usage={input_tokens:23,output_tokens:11};
const general={answer:'Brush gently in short sessions and choose a brush suited to the coat.',answerSections:[],safetyLevel:'normal',responseMode:'practical_guidance',userIntent:'general coat care',relevantContextIds:[],historyNarrative:null,applicationActions:[],semanticEvents:[],messageUnderstanding:{primaryIntent:'question',secondaryIntents:[],userIsAskingQuestion:true,userIsProvidingUpdate:false,userIsCorrectingPriorInformation:false,userIsResolvingConcern:false,userIsProvidingPreference:false,recoveryStatus:'none',recoveryConfidence:1,recoveryEvidence:{outcome:'none',surfaceText:null,targetConcept:null,confidence:1},userIsMakingSmallTalk:false,requestedTopic:'coat care',referencedPet:null,safetyRelevance:'none',needsClarification:false,canAnswerDirectly:true}};
const response=value=>new Response(JSON.stringify({id:'offline-response',object:'response',status:'completed',output:[{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:JSON.stringify(value),annotations:[]}]}],usage}),{status:200,headers:{'content-type':'application/json'}});

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const unicode='It’s steady – “café” 🐾.';
for(const fn of ['context','structured'])for(const mode of ['disconnected','http408','http429requests','http500','http503','abort','late-success','late-rejection','missing-usage','reconcile-failure','uncertain-start','success','eligible-fallback'])test(`${fn}: distinct fallback uncertainty ${mode}`,async t=>{
 assert.equal(JSON.parse(readFileSync(path.join(root,'node_modules/openai/package.json'),'utf8')).version,'6.44.0');
 assert.equal(JSON.parse(readFileSync(path.join(root,'package-lock.json'),'utf8')).packages['node_modules/openai'].version,'6.44.0');
 t.mock.method(console,'info',()=>{});t.mock.method(console,'warn',()=>{});
 const saved={OPENAI_ASK_PRIMARY_MODEL:process.env.OPENAI_ASK_PRIMARY_MODEL,OPENAI_ASK_FALLBACK_MODEL:process.env.OPENAI_ASK_FALLBACK_MODEL};
 process.env.OPENAI_ASK_PRIMARY_MODEL=model;process.env.OPENAI_ASK_FALLBACK_MODEL=fallback;
 t.after(()=>{for(const[k,v]of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v;}});
 getAskProviderCooldown(model,Infinity);getAskProviderCooldown(fallback,Infinity);
 const physical=[],events=[],accounting=[],admitted=[],timing=[];let late=false,aborted=false,seed=false;
 const store=new MemoryAiGuardTestStore();
 for(const method of ['reserveCall','markCallStarted','reconcileCall','releaseUnstartedCall']){const original=store[method].bind(store);store[method]=async value=>{
  accounting.push({method,...value,seed});
  if(!seed&&mode==='reconcile-failure'&&method==='reconcileCall')throw new Error('offline reconciliation unavailable');
  const result=await original(value);
  if(!seed&&mode==='uncertain-start'&&method==='markCallStarted')throw new Error('offline start recorded, acknowledgment lost');
  return result;
 };}
 const timed=['abort','late-success','late-rejection'].includes(mode);
 const admission=await admitAiOperation({env,store,feature:'ask',intendedModel:model,deadline:timed?new OperationDeadline(12600):undefined,now:new Date(day+'T12:00:00Z'),requestId:`uncertainty-${fn}-${mode}`,userId:'offline-owner',payload:{fn,mode}});
 // The fallback phase requires the real preceding interpretation slot. This
 // explicit accounting-only fixture seed is NOT an SDK/provider invocation.
 if(mode==='eligible-fallback'){
  seed=true;const{reservation}=await admission.beginProviderCall({input:{fixture:'prior interpretation'},maxOutputTokens:1,model,stage:'interpretation'});
  await admission.recordProviderUsage(reservation,model,{inputTokens:1,outputTokens:1});seed=false;
 }
 const reserve=store.getSnapshot(day),begin=admission.beginProviderCall.bind(admission);
 admission.beginProviderCall=async value=>{admitted.push(value);return begin(value);};
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  const body=JSON.parse(options.body);physical.push({url:String(url),body,accepted:true});
  timing.push({event:'accepted',at:performance.now()});
  assert.equal(JSON.stringify(body),JSON.stringify(admitted.at(-1).input),'admitted exact sent snapshot');
  if(mode.startsWith('http')){const status=Number(mode.slice(4,7));return new Response(JSON.stringify({error:{message:'explicit offline HTTP status',type:status===429?'requests':'server_error',code:status===429?'rate_limit_exceeded':'offline_status'}}),{status,headers:{'content-type':'application/json','retry-after-ms':'1'}});}
  if(mode==='disconnected')throw new TypeError('offline accepted then disconnected');
  if(mode==='abort')return await new Promise((resolve,reject)=>{const fail=()=>{aborted=true;timing.push({event:'aborted',at:performance.now()});reject(new DOMException('offline fetch aborted','AbortError'));};if(options.signal.aborted)fail();else options.signal.addEventListener('abort',fail,{once:true});});
  if(mode.startsWith('late-')){options.signal.addEventListener('abort',()=>{aborted=true;timing.push({event:'abort observed; endpoint ignores cancellation',at:performance.now()});},{once:true});await sleep(1050);late=true;timing.push({event:mode,at:performance.now()});if(mode==='late-rejection')throw new TypeError('offline late endpoint rejection');}
  if(mode==='eligible-fallback'&&physical.length===1)return new Response(JSON.stringify({error:{message:'explicit eligible rate limit rejection',type:'tokens',code:'rate_limit_exceeded'}}),{status:429,headers:{'content-type':'application/json'}});
  const result=response(fn==='context'?general:{value:'ok'});
  if(mode==='missing-usage'){const value=await result.json();delete value.usage;return new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json'}});}
  return result;
 });
 const call=()=>fn==='context'?generateContextAwareAskResponse({apiKey:'offline-not-a-credential',profiles:[],careEntries:[],memories:[],productFeedback:[],conversationTurns:[],recentUpdates:[],question:`How can routine coat brushing be comfortable? ${unicode}`,requestId:`uncertainty-${fn}-${mode}`,onProviderEvent:e=>events.push(e)}):generateStructuredFeatureResponse({apiKey:'offline-not-a-credential',input:{question:unicode},instructions:'Return the structured response.',schemaName:'uncertainty_contract',schema:{type:'object',properties:{value:{type:'string'}},required:['value'],additionalProperties:false},parse:v=>v?.value==='ok'?v:null,onProviderEvent:e=>events.push(e)});
 let result,error;try{result=await admission.run(call);}catch(e){error=e;}
 timing.push({event:'caller settled',at:performance.now()});
 if(error)await admission.fail(error);else await admission.complete();await admission.release();
 const settled=store.getSnapshot(day),settledAccounting=accounting.length;
 if(timed)await sleep(1200); // Observe completion AFTER timeout and settlement.
 const after=store.getSnapshot(day);
 const trace={fn,mode,unicode,sdk:'6.44.0',fallback,fixtureInterpretationSeed:mode==='eligible-fallback',physicalAttempts:physical.length,physical,admitted,events,accounting,timing,aborted,late,reserve,settled,after,error:error?{name:error.name,stage:error.stage,reason:error.reason,message:error.message,diagnostics:error.diagnostics}:null,result,liveProviderCalls:0,networkAttempts:0};
 if(process.env.FURVISE_RETRY_TRACE)appendFileSync(process.env.FURVISE_RETRY_TRACE,JSON.stringify(trace)+'\n',{encoding:'utf8'});
 const expected=mode==='uncertain-start'?0:mode==='eligible-fallback'?2:1;
 assert.equal(physical.length,expected,'physical fetch count');
 assert.equal(admitted.length,mode==='eligible-fallback'?2:1,'no duplicate admission');
 assert.equal(accounting.filter(e=>e.method==='releaseUnstartedCall'&&!e.seed).length,0,'no started liability refund');
 assert.deepEqual(after,settled,'late completion cannot change settlement');assert.equal(accounting.length,settledAccounting,'no late accounting');
 if(mode==='success'||mode==='eligible-fallback'){
  assert.ifError(error);assert.ok(result);
  assert.equal(accounting.filter(e=>e.method==='reconcileCall'&&!e.seed).length,1,'one successful response reconciled');
  if(mode==='success')assert.equal(after.costMicrodollars,estimateProviderCostMicrodollars(model,{inputTokens:23,outputTokens:11}));
  else {assert.equal(after.calls,3,'one fixture interpretation + two separately admitted physical calls');assert.deepEqual(physical.map(x=>x.body.model),[model,fallback]);assert.equal(admitted[1].purpose,'generation_repair');assert.equal(accounting.filter(e=>e.method==='reserveCall').length,3);}
 }else{
  assert.ok(error,'uncertain invocation must fail');assert.deepEqual(after,reserve,'full started liability retained');
  assert.equal(accounting.filter(e=>e.method==='reconcileCall'&&!e.seed).length,mode==='reconcile-failure'?1:0);
 }
 if(timed){assert.equal(aborted,true,'real production AbortSignal fired');assert.match(error.stage,/timeout/);}
 if(mode.startsWith('late-'))assert.equal(late,true,'late completion observed before ending fixture');
 if(mode==='uncertain-start')assert.equal(events.filter(e=>e.outcome==='started').length,0,'failed accounting blocks physical dispatch');
});
