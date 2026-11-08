import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,appendFileSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root=process.env.FURVISE_TEST_ROOT||process.cwd();
const load=p=>import(pathToFileURL(path.join(root,p)).href);
const {generateStructuredFeatureResponse,getAskProviderCooldown}=await load('app/lib/ai/ask-reasoning.ts');
const {readOnlyProvider}=await load('app/lib/ask-read-only/provider.ts');
const {readOnlyToolsForPets,readOnlyAnswerSchemaForSources}=await load('app/lib/ask-read-only/core.mjs');
const {admitAiOperation}=await load('app/lib/ai/usage-guard/admission.ts');
const {MemoryAiGuardTestStore}=await load('app/lib/ai/usage-guard/memory-test-store.ts');
const {estimateProviderCostMicrodollars}=await load('app/lib/ai/usage-guard/cost-estimator.ts');
const model='gpt-5.4-mini',day='2038-06-17';
const env={NODE_ENV:'test',FURVISE_AI_DAILY_CALL_LIMIT:'20',FURVISE_AI_DAILY_COST_LIMIT_USD:'1',FURVISE_RATE_LIMIT_HASH_SECRET:'offline-retry-identity-fixture-000000'};
const usage={input_tokens:23,output_tokens:11};

const response=value=>new Response(JSON.stringify({id:'offline-response',object:'response',status:'completed',output:[{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:JSON.stringify(value),annotations:[]}]}],usage}),{status:200,headers:{'content-type':'application/json'}});
for(const fn of ['read_selection','read_answer','structured'])for(const failure of ['transport',408,429,500,503,'success'])test(`${fn}: exact SDK physical fetch ${failure}`,async t=>{
 assert.equal(JSON.parse(readFileSync(path.join(root,'node_modules/openai/package.json'),'utf8')).version,'6.44.0');
 assert.equal(JSON.parse(readFileSync(path.join(root,'package-lock.json'),'utf8')).packages['node_modules/openai'].version,'6.44.0');
 t.mock.method(console,'info',()=>{});t.mock.method(console,'warn',()=>{});
 const saved={OPENAI_API_KEY:process.env.OPENAI_API_KEY,OPENAI_ASK_PRIMARY_MODEL:process.env.OPENAI_ASK_PRIMARY_MODEL,OPENAI_ASK_FALLBACK_MODEL:process.env.OPENAI_ASK_FALLBACK_MODEL};
 process.env.OPENAI_API_KEY='offline-physical-test-key';process.env.OPENAI_ASK_PRIMARY_MODEL=model;process.env.OPENAI_ASK_FALLBACK_MODEL='';
 t.after(()=>{for(const [k,v]of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v;}});
 getAskProviderCooldown(model,Infinity);
 const physical=[],events=[],accounting=[];let admitted;
 const store=new MemoryAiGuardTestStore();
 for(const method of ['reserveCall','markCallStarted','reconcileCall','releaseUnstartedCall']){const original=store[method].bind(store);store[method]=async value=>{accounting.push({method,...value});return original(value);};}
 const admission=await admitAiOperation({env,store,feature:'ask',intendedModel:model,now:new Date(day+'T12:00:00Z'),requestId:`retry-${fn}-${failure}`,userId:'offline-owner',payload:{fn,failure}});
 const reserve=store.getSnapshot(day),begin=admission.beginProviderCall.bind(admission);
 admission.beginProviderCall=async value=>{assert.equal(admitted,undefined,'duplicate admission');admitted=value.input;return begin(value);};
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  // The offline endpoint accepts the complete body before failing; no socket is opened.
  physical.push({url:String(url),body:JSON.parse(options.body),accepted:true});
  assert.equal(JSON.stringify(physical.at(-1).body),JSON.stringify(admitted),'admitted snapshot must equal physical request');
  assert.equal(accounting.filter(x=>x.method==='markCallStarted').length,1);
  if(failure==='transport')throw new TypeError('offline accepted request: connection lost');
  if(failure!=='success')return new Response(JSON.stringify({error:{message:'offline injected status',type:failure===429?'requests':'server_error',code:failure===429?'rate_limit_exceeded':'offline_status'}}),{status:failure,headers:{'content-type':'application/json','retry-after-ms':'1'}});
  return response(fn==='structured'?{value:'ok'}:fn==='read_selection'?'A general explanation.':
   {answer:'A general explanation.',quotes:[],sources:[],calculations:[],replyType:'answer'});
 });
 const call=()=>fn==='structured'?generateStructuredFeatureResponse({apiKey:'offline-not-a-credential',input:{question:'Synthetic structured response'},instructions:'Return the structured response.',schemaName:'retry_contract',schema:{type:'object',properties:{value:{type:'string'}},required:['value'],additionalProperties:false},parse:v=>v?.value==='ok'?v:null,onProviderEvent:e=>events.push(e)}):readOnlyProvider(model,event=>events.push(event))(
   fn==='read_selection'?{instructions:'Explain the supplied question or select an authorized read.',context:{question:'An offline question.'},tools:readOnlyToolsForPets([{handle:'p1'}])}:
   {instructions:'Review the general draft.',context:{question:'An offline question.'},draft:'A general explanation.',TOOL_DATA:[],schema:readOnlyAnswerSchemaForSources([])},
   fn==='read_selection'?'read_selection':'read_answer');
 let result,error;
 try{result=await admission.run(call);}catch(e){error=e;}
 if(error)await admission.fail(error);else await admission.complete();
 await admission.release();
 const after=store.getSnapshot(day);
 const trace={fn,failure,sdk:'6.44.0',physicalAttempts:physical.length,physical,events,accounting,reserve,after,error:error?{name:error.name,stage:error.stage,reason:error.reason,message:error.message,diagnostics:error.diagnostics}:null,result,liveProviderCalls:0,networkAttempts:0};
 if(process.env.FURVISE_RETRY_TRACE)appendFileSync(process.env.FURVISE_RETRY_TRACE,JSON.stringify(trace)+'\n');
 assert.equal(physical.length,1,'exactly one physical attempt, including an accepted/uncertain failure');
 assert.equal(events.filter(e=>e.outcome==='started').length,1);
 assert.equal(accounting.filter(e=>e.method==='reserveCall').length,1);
 assert.equal(accounting.filter(e=>e.method==='releaseUnstartedCall').length,0,'started liability must never be released');
 assert.equal(after.calls,1);
 if(failure==='success'){
  assert.ifError(error);assert.ok(result);
  assert.equal(accounting.filter(e=>e.method==='reconcileCall').length,1);
  assert.equal(after.costMicrodollars,estimateProviderCostMicrodollars(model,{inputTokens:23,outputTokens:11}));
 }else{
  assert.ok(error);assert.match(error.stage,/primary_(provider_failed|timeout)/);
  assert.equal(accounting.filter(e=>e.method==='reconcileCall').length,0);
  assert.deepEqual(after,reserve,'absent usage retains full started reservation');
 }
});
