// Opt-in, real interpreter acceptance with synthetic context and no database.
import assert from 'node:assert/strict';
import {existsSync,writeFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import {fileURLToPath} from 'node:url';
if(!process.argv.includes('--run-live'))throw Error('Explicit --run-live required');
if(process.env.FURVISE_LIVE_ENV_FILE)process.loadEnvFile(process.env.FURVISE_LIVE_ENV_FILE);
assert.ok(process.env.OPENAI_API_KEY,'Model credential required');
registerHooks({resolve(specifier,context,next){
 if(specifier==='server-only')return {shortCircuit:true,url:'data:text/javascript,export default {}'};
 if(specifier.startsWith('.')&&context.parentURL?.startsWith('file:')){
  const url=new URL(specifier,context.parentURL);
  for(const suffix of ['.ts','/index.ts'])if(existsSync(fileURLToPath(url.href+suffix)))return next(url.href+suffix,context);
 }
 return next(specifier,context);
}});
const {interpretAskQuestion}=await import('../../app/lib/intelligence/interpret-ask.ts');
const {getAskModelConfiguration}=await import('../../app/lib/ai/ask-reasoning.ts');
const {runWithAiAdmission}=await import('../../app/lib/ai/usage-guard/context.ts');
const model=getAskModelConfiguration().primary;
assert.equal(model,'gpt-5.4-mini','Review budget before testing a different model');
const {default:OpenAI}=await import('openai');
const provider=new OpenAI({apiKey:process.env.OPENAI_API_KEY,maxRetries:0});
const originalFetch=globalThis.fetch;
globalThis.fetch=(url,options)=>{
 if(new URL(String(url)).origin!=='https://api.openai.com')throw Error('No database or other network access allowed');
 return originalFetch(url,options);
};
const pets=['Sable','Rowan','Atlas','Juniper'].map(name=>({id:name.toLowerCase(),name,user_id:'synthetic-owner',species:'dog',lifecycle_status:'active'}));
const turn=(id,text,role='user')=>({id,text,role,createdAt:'2026-09-16T12:00:00Z'});
const source=turn('source','so i gave him medicine yesterday');
const sourceNamed=turn('source','Sable rested in the hammock for ten minutes.');
const request=turn('request','Save that and compare with his older hammock notes.');
const pending={id:'task',revision:1,kind:'owner_note',status:'awaiting_subject',source:sourceNamed,authorizationMessageId:'request',request,requiresAnswer:false};
const cases=[
 {id:'original-flow',turns:[source,turn('pet','Sable')],text:'idk just save in notes',intent:'save',source:'source',pet:'sable'},
 {id:'paraphrase',turns:[sourceNamed],text:'could you put what I just told you in his care record',intent:'save',source:'source',pet:'sable'},
 {id:'missing-subject',turns:[],text:'One of them ate less this morning. Save that.',intent:'save',source:'current',pet:null},
 {id:'cancel',turns:[sourceNamed,request],pendingTask:pending,text:"Never mind, don't keep it.",intent:'cancel'},
 {id:'unrelated',turns:[sourceNamed,request],pendingTask:pending,text:'How do cats use their whiskers?',intent:null},
 {id:'assistant-fabrication',turns:[sourceNamed,turn('assistant','Sable received 5 mg of invented medicine.','furvise')],text:'Save what I said, without adding details.',intent:'save',source:'source',pet:'sable'},
 {id:'status-not-save',turns:[sourceNamed],text:'Did you save that?',intent:null},
 {id:'hypothetical',turns:[],text:"If I said 'save that', would you keep a note?",intent:null},
 {id:'mixed',turns:[sourceNamed],text:request.text,intent:'save',source:'source',pet:'sable',answer:true},
 {id:'spanish',turns:[turn('source','Sable descansó veinte minutos ayer.')],text:'Guárdalo en sus notas.',intent:'save',source:'source',pet:'sable'},
 {id:'mixed-subject-continuation',turns:[sourceNamed,request],pendingTask:{...pending,requiresAnswer:true},text:'Sable',intent:'resume',source:'source',pet:'sable',answer:true},
 {id:'answer-outage-resume',turns:[sourceNamed,request],pendingTask:{...pending,status:'awaiting_answer',requiresAnswer:true,petId:'sable',entryId:'entry'},text:'Continue the comparison.',intent:'resume',source:'source',pet:'sable',answer:true},
];
const report={scope:'Live interpreter only; not browser, final answer, persistence or billing acceptance',model,maxCalls:24,calls:0,inputTokens:0,outputTokens:0,results:[]};
const save=()=>writeFileSync(new URL('../../docs/architecture/ask-continuation-interpreter-results.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
const ids=process.argv.find(arg=>arg.startsWith('--ids='))?.slice(6).split(',');
const selected=cases.filter(c=>!ids||ids.includes(c.id));
assert.ok(selected.length,'No matching scenarios');
for(const c of selected){
 const result={id:c.id,status:'running',events:[]};report.results.push(result);save();
 const admission={async beginProviderCall(input){assert.ok(report.calls<24);assert.ok(input.maxOutputTokens<=4096);assert.ok(Buffer.byteLength(JSON.stringify(input.input))<60000);report.calls++;save();return {reservation:{}};},async recordProviderUsage(_r,_m,usage){report.inputTokens+=usage.inputTokens;report.outputTokens+=usage.outputTokens;save();},recordProviderFailure(){}};
 try {
  const context={owner:{userId:'synthetic-owner'},eligiblePets:pets,pet:pets[0],currentMessage:c.text,currentTurn:turn('current',c.text),conversationTurns:c.turns,timeZone:'UTC',pendingTask:c.pendingTask||null};
  const output=await runWithAiAdmission(admission,()=>interpretAskQuestion({context,model,client:{responses:{create:(r,o)=>provider.responses.create({...r,store:false},o)}},onProviderEvent:e=>result.events.push(e)}));
  result.output=output;
  const task=output.request?.task;
  assert.equal(task?.intent||null,c.intent);
  if(c.source)assert.equal(task.source.id,c.source);
  if('pet' in c)assert.equal(task.petId,c.pet);
  if(c.source)assert.equal(task.source.text,[context.currentTurn,...c.turns].find(t=>t.id===c.source).text);
  if(c.intent)assert.equal(task.requiresAnswer,Boolean(c.answer));
  result.status='passed';
 }catch(error){result.status='failed';result.error=String(error.message);}
 save();console.log(c.id+': '+result.status);
}
console.log(JSON.stringify({passed:report.results.filter(r=>r.status==='passed').length,total:selected.length,calls:report.calls,inputTokens:report.inputTokens,outputTokens:report.outputTokens}));
process.exitCode=report.results.some(r=>r.status==='failed')?1:0;
