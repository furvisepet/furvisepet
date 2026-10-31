import { actualTransportFixturePlan } from "./helpers/recursive-wire-fixture.mjs";
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fixture,id} from './helpers/ask-staged-route-fixture.mjs';
const R=new URL('../',import.meta.url).href;
const {ASK_REQUEST_INSTRUCTIONS,askRequestProviderSchema}=await import(R+'app/lib/intelligence/ask-request-contract.ts');
const {proposedSemanticFrameJsonSchema}=await import(R+'app/lib/intelligence/semantic-frame/schema.ts');
const {prepareAskInterpretationRequest}=await import(R+'app/lib/intelligence/interpret-ask.ts');
const {factorProviderEnumSchemas}=await import(R+'app/lib/ai/provider-enum-schema.ts');
const {factorProviderCompoundSchemas}=await import(R+'app/lib/ai/provider-compound-schema.ts');
const {admitAiOperation}=await import(R+'app/lib/ai/usage-guard/admission.ts');
const {MemoryAiGuardTestStore}=await import(R+'app/lib/ai/usage-guard/memory-test-store.ts');
const {estimateInputTokens}=await import(R+'app/lib/ai/usage-guard/cost-estimator.ts');
const mode=process.env.FURVISE_CATALOG_ROUTE_MODE||'engine-replace';assert.ok(['public-replace','engine-replace'].includes(mode));
const question="For Cedar, replace the saved dinner note with 'He ate supper calmly.' Keep one entry.";
const p={calculatePlan:null,storedRead:null,removeJob:null,stateTransitionJob:null,fieldMutationJob:null,lifecyclePlan:null,appendJob:null,writeJob:{operation:'replace',target:null,petName:'Cedar',instructionQuote:question,bodyQuote:'He ate supper calmly.',constraints:[{kind:'effective_count_one',quote:'Keep one entry.'}],semantics:{classification:'observation',target:null}},task:null,temporalScope:null,mutationIntent:'correct_record',recordSelection:null,profileFields:[],projection:null,evidenceNeeds:[],outputFormat:null,evidenceBasis:null,premiseQuotes:[],excludedPetNames:[],version:'ask-request.v2',mode:'update',question,requirements:[],referenceTurnIds:[],scope:'named',petNames:['Cedar'],operation:'general',selection:'summary',quantity:null,topic:'history',terms:[],from:null,to:null,episodeTopic:null,ordinal:null,frame:null,readTicket:null};
const intent={version:'ask-catalog-intent.v1',sourceTurnId:id(31),instructionQuote:question,authorizationQuote:question,purpose:'replace',scope:'subjects',ownerScope:null,subjects:[{petName:'Cedar',sourceTurnId:id(31),quote:'Cedar',basis:'named'}],request:p};
const trace={mode,assertions:[],admissions:[],sent:[],interpretations:[],io:'isolated in-memory fixture; no SQL/cross-process durability claim',liveProviders:0,costUSD:0};
const check=(name,fn)=>{fn();trace.assertions.push(name);};let wire,admission;
const store=new MemoryAiGuardTestStore(),env={NODE_ENV:'test',FURVISE_AI_DAILY_CALL_LIMIT:'20',FURVISE_AI_DAILY_COST_LIMIT_USD:'1',FURVISE_RATE_LIMIT_HASH_SECRET:'offline-f-identity-not-credential'};
const f=fixture({creditLedger:true,fullCatalogPipeline:true,engineCapabilities:mode==='engine-replace',
 admitAiOperation:async input=>{admission=await admitAiOperation({...input,env,store});const begin=admission.beginProviderCall.bind(admission);admission.beginProviderCall=async x=>{trace.admissions.push({purpose:x.purpose??'ordinary',stage:x.stage,totalChars:JSON.stringify(x.input).length,estimatedTokens:estimateInputTokens(x.input),snapshot:structuredClone(x.input)});return begin(x);};return admission;},
 onContext:ctx=>{wire=actualTransportFixturePlan(prepareAskInterpretationRequest(ctx,'gpt-5.4-mini'));},onInterpretation:x=>trace.interpretations.push(structuredClone(x)),
 providerCreate:async request=>{trace.sent.push(structuredClone(request));if(trace.sent.length===1)return{status:'completed',output_text:JSON.stringify(wire.encode({request:intent})),usage:{input_tokens:0,output_tokens:0}};
 assert.equal(trace.sent.length,2);const input=JSON.parse(request.input);assert.deepEqual(input.intent,intent);const candidates=input.catalog.evidence.filter(x=>x.body==='Cedar declined dinner.');assert.equal(candidates.length,1);return{status:'completed',output_text:JSON.stringify({version:'ask-catalog-selection.v1',disposition:'selected',reference:candidates[0].reference}),usage:{input_tokens:0,output_tokens:0}};
 }});
f.rows.pet_care_entries[0].note='Cedar declined dinner.';const initial=structuredClone(f.rows.pet_care_entries);
const priorTestContext=process.env.NODE_TEST_CONTEXT;
try {
 delete process.env.NODE_TEST_CONTEXT;
 const response=await f.send(question);trace.response={status:response.status,body:await response.json()};trace.errors=f.state.errors.map(x=>({stage:x.stage,message:x.error?.message,stack:x.error?.stack,diagnostics:x.error?.diagnostics}));
 check('actual-admitted-snapshots-equal-sent',()=>assert.deepEqual(trace.sent,trace.admissions.map(x=>x.snapshot)));
 check('no-domain-effects-before-confirmation',()=>assert.deepEqual(f.rows.pet_care_entries,initial));
 if(mode==='public-replace'){
  check('public-policy-before-hydration-and-second-call',()=>{assert.equal(trace.sent.length,1);assert.equal(f.state.permits?.length||0,0);assert.ok(!f.state.events.some(x=>x.startsWith('rpc-attempt:')));assert.ok(!f.state.queries.some(q=>['pet_concerns','ask_action_capabilities','pet_care_entries'].includes(q.table)));assert.equal(f.rows.ask_action_capabilities.length,0);});
  check('actual-limited-publication-and-release',()=>{assert.equal(response.status,200,JSON.stringify(trace.errors));const turn=f.rows.ask_conversation_messages.find(r=>r.role==='furvise')?.response_data?.turn;assert.ok(turn);assert.equal(turn.taskOutcome,'limited');assert.equal(turn.creditDisposition,'release');assert.ok(JSON.stringify(trace.response.body).includes('cannot change records yet'));});
 } else {
  check('one-purpose-after-permit-before-continuation',()=>{assert.equal(trace.sent.length,2,JSON.stringify(trace.errors));assert.equal(trace.admissions[1].purpose,'catalog_continuation');const e=f.state.events;assert.ok(e.indexOf('catalog:permit')<e.indexOf('rpc-attempt:list_ask_replace_targets'));assert.equal(f.state.permits.length,1);});
  check('exact-bound-record-body-and-confirmation',()=>{const plan=trace.interpretations[0]?.request?.writeJob;assert.ok(plan,JSON.stringify(trace.errors));assert.equal(plan.target.recordId,initial[0].id);assert.equal(plan.target.updatedAt,initial[0].updated_at);assert.equal(plan.body.text,'He ate supper calmly.');assert.equal(response.status,200,JSON.stringify(trace.errors));const cap=f.rows.ask_action_capabilities[0];assert.ok(cap,JSON.stringify(trace.errors));assert.equal(cap.status,'pending');assert.equal(cap.action_payload.confirmationPolicy,'explicit_intent');assert.equal(cap.action_payload.explicitIntent,false);assert.equal(trace.response.body.turn.mutationOutcome,'pending');assert.equal(trace.response.body.turn.taskOutcome,'limited');assert.equal(trace.response.body.turn.creditDisposition,'release');});
  const confirmed=await f.confirm();trace.confirmation={status:confirmed.status,body:await confirmed.json()};
  check('actual-confirmation-route-with-fixture-heart-receipt',()=>{assert.equal(confirmed.status,200,JSON.stringify(trace.confirmation));assert.equal(f.rows.pet_care_entries[0].note,'He ate supper calmly.');assert.deepEqual(f.rows.pet_care_entries[1],initial[1]);assert.equal(f.state.events.filter(e=>e==='heart:row').length,1);assert.ok(f.rows.ask_action_capabilities[0].receipt);});
  const replay=await f.confirm();trace.replay={status:replay.status,body:await replay.json()};
  check('actual-replay-no-additional-effect-or-brain',()=>{assert.equal(replay.status,200,JSON.stringify(trace.replay));assert.equal(f.state.events.filter(e=>e==='heart:row').length,1);assert.equal(trace.sent.length,2);});
 }
 if(mode==='engine-replace')check('neutral-exact-target-publication',()=>{assert.equal(trace.response.body.answer,'Review the care-history correction for Cedar below.');assert.ok(!JSON.stringify(trace.response.body.response).includes('latest care-history'));});
 trace.result='PASS';
}catch(error){trace.result='FAIL';trace.failure={name:error.name,message:error.message,stack:error.stack};process.exitCode=1;}
finally{if(priorTestContext===undefined)delete process.env.NODE_TEST_CONTEXT;else process.env.NODE_TEST_CONTEXT=priorTestContext;trace.events=f.state.events;trace.queries=f.state.queries;trace.permits=f.state.permits;trace.credit=f.state.credit;trace.lifecycle=f.state.traces;trace.capabilities=f.rows.ask_action_capabilities;trace.publications=f.state.publications;trace.rowsAfter=f.rows.pet_care_entries;if(admission)await admission.release();if(process.env.FURVISE_CATALOG_PROOF_PATH)fs.writeFileSync(process.env.FURVISE_CATALOG_PROOF_PATH,JSON.stringify(trace,null,2),{flag:'wx'});console.log(JSON.stringify({mode,result:trace.result,assertions:trace.assertions,failure:trace.failure,errors:trace.errors,response:trace.response,events:trace.events}));}
