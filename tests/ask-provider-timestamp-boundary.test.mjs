import {retainedStressCodec,assertRetainedRoundTrip} from './helpers/retained-codec-domain.mjs';
import { actualTransportFixturePlan } from "./helpers/recursive-wire-fixture.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){
 if(s==='server-only')return{url:'data:text/javascript,export {}',shortCircuit:true};
 if(s.startsWith('.')&&c.parentURL?.startsWith('file:'))for(const suffix of ['.ts','/index.ts']){const url=new URL(s+suffix,c.parentURL);if(existsSync(url))return next(url.href,c);}
 return next(s,c);
}});
globalThis.fetch=async()=>{throw Error('OFFLINE_TIMESTAMP_TEST_NETWORK_FORBIDDEN')};
const {createAskProviderWireSchema}=await import('../app/lib/intelligence/ask-wire-provider-schema.ts');
const {createAskWirePlan}=await import('../app/lib/intelligence/ask-wire-policy.mjs');
const {expand,makeValidator}=await import('../app/lib/intelligence/ask-wire-codec.mjs');
const {completeInstantSchema,isCompleteInstant}=await import('../app/lib/furvise-brain/complete-instant.ts');
const {ASK_REQUEST_INSTRUCTIONS,askRequestProviderSchema}=await import('../app/lib/intelligence/ask-request-contract.ts');
const {proposedSemanticFrameJsonSchema}=await import('../app/lib/intelligence/semantic-frame/schema.ts');
const {interpretAskQuestion,projectAskInterpretationContext,ASK_INTERPRETATION_LIMITS,prepareAskInterpretationRequest}=await import('../app/lib/intelligence/interpret-ask.ts');
const {factorProviderEnumSchemas}=await import('../app/lib/ai/provider-enum-schema.ts');
const {factorProviderCompoundSchemas}=await import('../app/lib/ai/provider-compound-schema.ts');
const {bindTypedReadTicket}=await import('../app/lib/furvise-brain/typed-read-ticket.ts');
const {admitAiOperation}=await import('../app/lib/ai/usage-guard/admission.ts');
const {MemoryAiGuardTestStore}=await import('../app/lib/ai/usage-guard/memory-test-store.ts');
const {AI_FEATURE_POLICIES}=await import('../app/lib/ai/usage-guard/features.ts');
const {estimateProviderCostMicrodollars}=await import('../app/lib/ai/usage-guard/cost-estimator.ts');
const corpus=JSON.parse(readFileSync(new URL('./fixtures/ask-wire-codec.json',import.meta.url),'utf8'));
const env={NODE_ENV:'test',FURVISE_AI_DAILY_CALL_LIMIT:'20',FURVISE_AI_DAILY_COST_LIMIT_USD:'10',FURVISE_RATE_LIMIT_HASH_SECRET:'offline-wire-identity-fixture-only-0000000000'};
const canonicalSchema=context=>factorProviderCompoundSchemas(factorProviderEnumSchemas(askRequestProviderSchema(proposedSemanticFrameJsonSchema,projectAskInterpretationContext(context))));
const context=corpus.contexts.no_numeric;
const plan=createAskWirePlan(canonicalSchema(context),ASK_REQUEST_INSTRUCTIONS);
const projected=createAskProviderWireSchema(plan.schema),loose=expand(projected),looseValid=makeValidator(loose);
const changed=(a,b,path='')=>Object.is(a,b)?[]:a&&b&&typeof a==='object'&&typeof b==='object'?[...new Set([...Object.keys(a),...Object.keys(b)])].flatMap(k=>changed(a[k],b[k],path+'/'+k)):[{path,before:a,after:b}];
const set=(root,path,value)=>{let o=root;for(const p of path.slice(0,-1))o=o[p];o[path.at(-1)]=value;};
const get=(root,path)=>path.reduce((o,p)=>o[p],root);
function stringPaths(root,text,path=[]){if(root===text)return[path];if(!root||typeof root!=='object')return[];return Object.entries(root).flatMap(([k,v])=>stringPaths(v,text,[...path,k]));}
const dates=['2024-01-01T00:00:00Z','2024-12-01T00:00:00Z','2024-03-01T00:00:00Z','2024-03-02T00:00:00Z','2024-02-01T00:00:00Z','2024-02-02T00:00:00Z'];
const datePaths=[['temporal','from'],['temporal','to'],['attributedContexts',0,'recorded','from'],['attributedContexts',0,'recorded','to'],['attributedContexts',0,'target','from'],['attributedContexts',0,'target','to']];
// A legal provider request, not an arbitrary older codec stress vector.
const dated=structuredClone(corpus.fixtures.find(f=>f.context==='no_numeric'&&f.canonical.request.evidenceBasis==='saved_profile').canonical);
Object.assign(dated.request,{question:context.currentMessage,evidenceBasis:'saved_history',temporalScope:'historical',profileFields:[],premiseQuotes:[],task:null,mutationIntent:null,frame:null,requirements:[],projection:null,readTicket:structuredClone(corpus.fixtures.find(f=>f.context==='no_numeric'&&f.canonical.request.readTicket&&!f.canonical.request.calculatePlan&&!f.canonical.request.readTicket.selection).canonical.request.readTicket)});
Object.assign(dated.request.readTicket,{operation:'read',selection:null,episode:null,searchHints:[],predicates:[],probes:[],outputs:{strategy:null,completeness:'sufficient',ordering:'asc',limit:null}});

dated.request.readTicket.authority='stored_report';dated.request.readTicket.temporal.calendar=null;
dated.request.readTicket.attributedContexts=[{recorded:{from:dates[2],to:dates[3]},target:{from:dates[4],to:dates[5]}}];
datePaths.forEach((p,i)=>set(dated.request.readTicket,p,dates[i]));
const actualTransport=actualTransportFixturePlan(prepareAskInterpretationRequest(context,"gpt-5.4-mini"));
const actualDated=actualTransport.encode(dated),recursivePaths=dates.map(d=>{const paths=stringPaths(actualDated,d);assert.equal(paths.length,1);return paths[0];});
const datedWire=plan.encode(dated),wirePaths=dates.map(d=>{const paths=stringPaths(datedWire,d);assert.equal(paths.length,1);return paths[0];});
const valid=['2000-02-29T12:34:56Z','2024-02-29T00:00:00+05:30','2024-02-29T23:59:59.123456789-08:00','2400-02-29T12:34:56+23:59','1900-02-28T00:00:00-00:00','0000-02-29T00:00:00Z','2024-01-01T00:00:00.'+'7'.repeat(512)+'Z'];
const invalid=['2023-02-29T00:00:00Z','1900-02-29T00:00:00Z','2100-02-29T00:00:00Z','2024-04-31T00:00:00Z','2024-00-01T00:00:00Z','2024-13-01T00:00:00Z','2024-01-00T00:00:00Z','2024-01-32T00:00:00Z','2024-01-01','2024-01-01T00:00:00','2024-01-01T00:00Z','2024-01-01 00:00:00Z','2024-01-01T24:00:00Z','2024-01-01T00:60:00Z','2024-01-01T00:00:60Z','2024-01-01T00:00:00+24:00','2024-01-01T00:00:00+00:60','2024-01-01T00:00:00+0530','2024-01-01T00:00:00.Z','2024-01-01T00:00:00z',' 2024-01-01T00:00:00Z','2024-01-01T00:00:00Z ','2024-01-01T00:00:00Z\n','2024-01-01T00:00:00Z\r\n','2024-01-01T00:00:00Z\u2028','2024-01-01T00:00:00Zjunk','}]}]'];
function ticketForBinder(value){const t=structuredClone(value);delete t.probes;return t;}
async function admit(id){return admitAiOperation({env,store:new MemoryAiGuardTestStore(),feature:'ask',intendedModel:'gpt-5.4-mini',now:new Date('2039-03-17T12:00:00Z'),requestId:id,userId:context.owner.userId,payload:{id}});}
function quiet(t){t.mock.method(console,'info',()=>{});t.mock.method(console,'warn',()=>{});}

test('provider projection is detached, deterministic, and removes only exact schema pattern constraints',()=>{
 const original=structuredClone(plan.schema),changes=changed(original,projected);
 assert.equal(changes.length,2);for(const c of changes){assert.ok(c.path.endsWith('/pattern'));assert.equal(c.before,completeInstantSchema.pattern);assert.equal(c.after,undefined);}
 assert.deepEqual(plan.schema,original);assert.notEqual(projected,plan.schema);assert.deepEqual(createAskProviderWireSchema(plan.schema),projected);assert.deepEqual(createAskProviderWireSchema(projected),projected);
 const data={type:'object',properties:{date:{type:'string',pattern:completeInstantSchema.pattern},other:{type:'string',pattern:'^other$'}},enum:[{pattern:completeInstantSchema.pattern}],description:completeInstantSchema.pattern};
 const copy=createAskProviderWireSchema(data);assert.equal(copy.properties.date.pattern,undefined);assert.equal(copy.properties.other.pattern,'^other$');assert.deepEqual(copy.enum,data.enum);assert.equal(copy.description,data.description);assert.equal(data.properties.date.pattern,completeInstantSchema.pattern);
});
test('all 262 retained stress inputs preserve values; current provider projection preserves accepted families',()=>{
 let count=0,accepted=0,rejected=0;
 for(const name of [...Object.keys(corpus.contexts),'no_context']){
  const ctx=corpus.contexts[name],original=retainedStressCodec(proposedSemanticFrameJsonSchema,ctx);
  const p=createAskWirePlan(askRequestProviderSchema(proposedSemanticFrameJsonSchema,ctx),ASK_REQUEST_INSTRUCTIONS);
  const before=JSON.stringify(p.schema),s=expand(createAskProviderWireSchema(p.schema)),v=makeValidator(s);
  assert.equal(changed(p.schema,createAskProviderWireSchema(p.schema)).length,2);
  for(const f of corpus.fixtures.filter(f=>f.context===name)){
   assertRetainedRoundTrip(original,f.canonical);count++;
   let wire;try{wire=p.encode(f.canonical);}catch(e){assert.match(e.message,/ASK_WIRE_CANONICAL_SCHEMA/);rejected++;continue;}
   assert.ok(v(s,wire));assert.deepEqual(p.decode(wire),f.canonical);accepted++;
  }
  assert.equal(JSON.stringify(p.schema),before);
 }
 assert.equal(count,262);assert.equal(accepted,219);assert.equal(rejected,43);
});

test('all six timestamp leaves keep leap, offset, fraction and strict end-of-input authority',()=>{
 assert.deepEqual(plan.decode(datedWire),dated);
 assert.ok(bindTypedReadTicket(ticketForBinder(dated.request.readTicket),[context.pet.id]));
 for(const [i,path]of wirePaths.entries()){
  for(const value of valid){assert.ok(isCompleteInstant(value));const wire=structuredClone(datedWire);set(wire,path,value);assert.ok(looseValid(loose,wire));const restored=plan.decode(wire);assert.equal(get(restored.request.readTicket,datePaths[i]),value);}
  for(const value of invalid){assert.equal(isCompleteInstant(value),false);const wire=structuredClone(datedWire);set(wire,path,value);assert.ok(looseValid(loose,wire),'provider intentionally permits invalid string');assert.throws(()=>plan.decode(wire),/ASK_WIRE_/);const ticket=ticketForBinder(dated.request.readTicket);set(ticket,datePaths[i],value);assert.throws(()=>bindTypedReadTicket(ticket,[context.pet.id]));}
  const wrong=structuredClone(datedWire);set(wrong,path,42);assert.equal(looseValid(loose,wrong),false);assert.throws(()=>plan.decode(wrong));
 }
 for(const path of wirePaths.slice(0,2)){const wire=structuredClone(datedWire);set(wire,path,null);assert.doesNotThrow(()=>plan.decode(wire));}
 for(const path of wirePaths.slice(2)){const wire=structuredClone(datedWire);set(wire,path,null);assert.throws(()=>plan.decode(wire));}
});
test('Binder keeps temporal ordering and attributed report ordering independent of lexical projection',()=>{
 for(const [from,to]of [[['temporal','from'],['temporal','to']],[datePaths[2],datePaths[3]],[datePaths[4],datePaths[5]]]){
  for(const mode of ['equal','reverse']){const t=ticketForBinder(dated.request.readTicket),a=get(t,from),b=get(t,to);set(t,from,b);set(t,to,mode==='equal'?b:a);assert.throws(()=>bindTypedReadTicket(t,[context.pet.id]));}
 }
 const t=ticketForBinder(dated.request.readTicket);t.attributedContexts[0].recorded.from='2024-01-01T00:00:00Z';assert.throws(()=>bindTypedReadTicket(t,[context.pet.id]));
});
test('actual admitted production parser rejects six malformed dates before catalog hydration or successful authority',async t=>{
 quiet(t);const old=process.env.NODE_TEST_CONTEXT;delete process.env.NODE_TEST_CONTEXT;
 try{for(const [i,path]of recursivePaths.entries()){
  const wire=structuredClone(actualDated);set(wire,path,dates[i]+'\n');const a=await admit('bad-date-'+i);let calls=0,hydrates=0,capabilities=0;const events=[],snapshots=[];const begin=a.beginProviderCall.bind(a);a.beginProviderCall=async x=>{snapshots.push(JSON.stringify(x.input));return begin(x);};
  try{await assert.rejects(a.run(()=>interpretAskQuestion({context,model:'gpt-5.4-mini',onProviderEvent:e=>events.push(e),catalogService:{requestId:'test',capability:()=>{capabilities++;throw Error('UNEXPECTED_CATALOG_CAPABILITY')},verify:async()=>{},hydrate:async()=>{hydrates++;throw Error('UNEXPECTED_HYDRATE')}},client:{responses:{create:async request=>{calls++;assert.equal(JSON.stringify(request),snapshots.at(-1));assert.ok(Object.isFrozen(request));assert.equal(JSON.stringify(request.text.format.schema),JSON.stringify(prepareAskInterpretationRequest(context,'gpt-5.4-mini').request.text.format.schema));assert.equal(request.instructions,prepareAskInterpretationRequest(context,'gpt-5.4-mini').request.instructions);assert.equal(request.max_output_tokens,8192);return{status:'completed',output_text:JSON.stringify(wire),usage:{input_tokens:100,output_tokens:50}};}}}})),e=>e.diagnostics?.providerErrorCode==='ASK_INTERPRETATION_JSON');assert.equal(calls,1);assert.equal(hydrates,0);assert.equal(capabilities,0);assert.ok(!events.some(e=>e.outcome==='succeeded'));}finally{await a.release();}
 }}finally{if(old===undefined)delete process.env.NODE_TEST_CONTEXT;else process.env.NODE_TEST_CONTEXT=old;}
});
test('old zero-token failure, direct canonical output, and malformed graph fail closed with one call and no catalog work',async t=>{
 quiet(t);const old=process.env.NODE_TEST_CONTEXT;delete process.env.NODE_TEST_CONTEXT;
 const responses=[{status:'incomplete',incomplete_details:{reason:'max_output_tokens'},output:[],usage:{input_tokens:0,output_tokens:0}},{status:'completed',output_text:JSON.stringify(dated),usage:{input_tokens:1,output_tokens:1}},{status:'completed',output_text:JSON.stringify({nodes:[{F:{'@':1}},{k:'x',m:'y',T:'}]}]'.repeat(400),bp:'replace',b:'subjects',bn:{'@':2},p:[{'@':3}],'F~Y':{'@':4}}]}),usage:{input_tokens:6967,output_tokens:879}}];
 try{for(const [i,response]of responses.entries()){const a=await admit('failure-'+i);let calls=0;try{await assert.rejects(a.run(()=>interpretAskQuestion({context,model:'gpt-5.4-mini',client:{responses:{create:async()=>{calls++;return response;}}}})),e=>e.diagnostics?.providerErrorCode===['ASK_INTERPRETATION_INCOMPLETE','ASK_INTERPRETATION_JSON','ASK_INTERPRETATION_JSON'][i]);assert.equal(calls,1);}finally{await a.release();}}}finally{if(old===undefined)delete process.env.NODE_TEST_CONTEXT;else process.env.NODE_TEST_CONTEXT=old;}
});
test('request limits and real phase admission preserve maximum six calls and 483750 microdollars per-call reservation',async t=>{
 quiet(t);assert.equal(ASK_INTERPRETATION_LIMITS.outputTokens,8192);assert.equal(AI_FEATURE_POLICIES.ask.maxOutputTokens,100000);assert.equal(AI_FEATURE_POLICIES.ask.maxInputTokens,45000);assert.equal(AI_FEATURE_POLICIES.ask.maxInputCharacters,135000);assert.equal(AI_FEATURE_POLICIES.ask.maximumProviderCalls,6);assert.equal(estimateProviderCostMicrodollars('gpt-5.4-mini',{inputTokens:45000,outputTokens:100000}),483750);
 const phases=[undefined,'interpretation_repair',undefined,'history_review','history_repair','history_rereview'];const a=await admit('six-call-ceiling');
 try{for(const [i,purpose]of phases.entries()){const call=await a.beginProviderCall({purpose,stage:i<2?'interpretation':'answer_generation',model:'gpt-5.4-mini',maxOutputTokens:8192,input:{test:true}});assert.equal(call.reservation.callNumber,i+1);assert.equal(call.reservation.reservedCostMicrodollars,483750);await a.recordProviderUsage(call.reservation,'gpt-5.4-mini',{inputTokens:0,outputTokens:0});}await assert.rejects(a.beginProviderCall({purpose:'history_rereview',stage:'answer_generation',model:'gpt-5.4-mini',maxOutputTokens:8192,input:{test:true}}));}finally{await a.release();}
 const ordinary=await admit('ordinary-two-call-ceiling');try{for(let i=0;i<2;i++){const c=await ordinary.beginProviderCall({model:'gpt-5.4-mini',stage:i?'answer_generation':'interpretation',maxOutputTokens:8192,input:{test:true}});await ordinary.recordProviderUsage(c.reservation,'gpt-5.4-mini',{inputTokens:0,outputTokens:0});}await assert.rejects(ordinary.beginProviderCall({model:'gpt-5.4-mini',maxOutputTokens:8192,input:{test:true}}));}finally{await ordinary.release();}
});
