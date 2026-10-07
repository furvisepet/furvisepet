import { recursiveFixturePlan } from "./helpers/recursive-wire-fixture.mjs";
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fixture,id} from './helpers/ask-staged-route-fixture.mjs';
const R=new URL('../',import.meta.url).href;
const {ASK_REQUEST_INSTRUCTIONS,askRequestProviderSchema}=await import(R+'app/lib/intelligence/ask-request-contract.ts');
const {proposedSemanticFrameJsonSchema}=await import(R+'app/lib/intelligence/semantic-frame/schema.ts');
const {createAskWirePlan}=await import(R+'app/lib/intelligence/ask-wire-policy.mjs');
const {factorProviderEnumSchemas}=await import(R+'app/lib/ai/provider-enum-schema.ts');
const {factorProviderCompoundSchemas}=await import(R+'app/lib/ai/provider-compound-schema.ts');
const {admitAiOperation}=await import(R+'app/lib/ai/usage-guard/admission.ts');
const {MemoryAiGuardTestStore}=await import(R+'app/lib/ai/usage-guard/memory-test-store.ts');
const {estimateInputTokens}=await import(R+'app/lib/ai/usage-guard/cost-estimator.ts');
const mode=process.env.FURVISE_CATALOG_ROUTE_MODE||'named';assert.ok(['named','unqualified'].includes(mode));
const question=mode==='named'?"Cancel Rowan's pending archive action.":'Cancel the pending action.';
const p={calculatePlan:null,storedRead:null,removeJob:null,stateTransitionJob:null,fieldMutationJob:null,lifecyclePlan:null,appendJob:null,writeJob:{operation:'replace',target:null,petName:'Cedar',instructionQuote:question,bodyQuote:'He ate supper calmly.',constraints:[{kind:'effective_count_one',quote:'Keep one entry.'}],semantics:{classification:'observation',target:null}},task:null,temporalScope:null,mutationIntent:'correct_record',recordSelection:null,profileFields:[],projection:null,evidenceNeeds:[],outputFormat:null,evidenceBasis:null,premiseQuotes:[],excludedPetNames:[],version:'ask-request.v2',mode:'update',question,requirements:[],referenceTurnIds:[],scope:'named',petNames:['Cedar'],operation:'general',selection:'summary',quantity:null,topic:'history',terms:[],from:null,to:null,episodeTopic:null,ordinal:null,frame:null,readTicket:null};
p.writeJob=null;p.mutationIntent=null;p.selection='summary';p.scope=mode==='named'?'named':'none';p.petNames=mode==='named'?['Rowan']:[];p.lifecyclePlan={pendingDisposition:{petNames:mode==='named'?['Rowan']:null,quote:question},transition:null,requiredSubjectState:null,authorizationQuote:question};
const intent={version:'ask-catalog-intent.v1',sourceTurnId:id(31),instructionQuote:question,authorizationQuote:question,purpose:'lifecycle',scope:'subjects',ownerScope:null,subjects:mode==='named'?[{petName:'Rowan',sourceTurnId:id(31),quote:'Rowan',basis:'named'}]:[],request:p};
const trace={mode,assertions:[],admissions:[],sent:[],interpretations:[],io:'isolated in-memory fixture; no SQL/cross-process durability claim',liveProviders:0,costUSD:0};
const check=(name,fn)=>{fn();trace.assertions.push(name);};let wire,admission;
const store=new MemoryAiGuardTestStore(),env={NODE_ENV:'test',FURVISE_AI_DAILY_CALL_LIMIT:'20',FURVISE_AI_DAILY_COST_LIMIT_USD:'1',FURVISE_RATE_LIMIT_HASH_SECRET:'offline-f-identity-not-credential'};
const f=fixture({creditLedger:true,fullCatalogPipeline:true,engineCapabilities:false,
 admitAiOperation:async input=>{admission=await admitAiOperation({...input,env,store});const begin=admission.beginProviderCall.bind(admission);admission.beginProviderCall=async x=>{trace.admissions.push({purpose:x.purpose??'ordinary',stage:x.stage,totalChars:JSON.stringify(x.input).length,estimatedTokens:estimateInputTokens(x.input),snapshot:structuredClone(x.input)});return begin(x);};return admission;},
 onContext:ctx=>{wire=recursiveFixturePlan(createAskWirePlan(factorProviderCompoundSchemas(factorProviderEnumSchemas(askRequestProviderSchema(proposedSemanticFrameJsonSchema,ctx))),ASK_REQUEST_INSTRUCTIONS));},onInterpretation:x=>trace.interpretations.push(structuredClone(x)),
 providerCreate:async request=>{trace.sent.push(structuredClone(request));if(trace.sent.length===1)return{status:'completed',output_text:JSON.stringify(wire.encode({request:intent})),usage:{input_tokens:0,output_tokens:0}};
 throw Error('Public cancellation dispatched an unauthorized second provider call');
 }});
f.rows.dog_profiles[0].name='Rowan';const initial=structuredClone(f.rows.pet_care_entries);
try {
 const response=await f.send(question);trace.response={status:response.status,body:await response.json()};trace.errors=f.state.errors.map(x=>({stage:x.stage,message:x.error?.message,stack:x.error?.stack,diagnostics:x.error?.diagnostics}));
 check('actual-admitted-snapshots-equal-sent',()=>assert.deepEqual(trace.sent,trace.admissions.map(x=>x.snapshot)));
 check('no-domain-effects',()=>assert.deepEqual(f.rows.pet_care_entries,initial));
 check('public-cancel-before-catalog-hydration',()=>{assert.equal(trace.sent.length,1);assert.equal(f.state.permits?.length||0,0);assert.ok(!f.state.events.some(x=>x.startsWith('rpc-attempt:')));assert.ok(!f.state.queries.some(q=>['pet_concerns','ask_action_capabilities','pet_care_entries'].includes(q.table)));assert.equal(f.rows.ask_action_capabilities.length,0);});
 check('mutation-limited-and-release',()=>{assert.equal(response.status,200,JSON.stringify(trace.errors));const turn=f.rows.ask_conversation_messages.find(r=>r.role==='furvise')?.response_data?.turn;assert.ok(turn);assert.equal(turn.taskOutcome,'limited');assert.equal(turn.creditDisposition,'release');assert.ok(JSON.stringify(trace.response.body).includes('cannot change records yet'));assert.deepEqual(trace.response.body.response.applicationActions||[],[]);});
 trace.result='PASS';
}catch(error){trace.result='FAIL';trace.failure={name:error.name,message:error.message,stack:error.stack};process.exitCode=1;}
finally{trace.events=f.state.events;trace.queries=f.state.queries;trace.permits=f.state.permits;trace.credit=f.state.credit;trace.lifecycle=f.state.traces;trace.capabilities=f.rows.ask_action_capabilities;trace.publications=f.state.publications;trace.rowsAfter=f.rows.pet_care_entries;if(admission)await admission.release();if(process.env.FURVISE_CATALOG_PROOF_PATH)fs.writeFileSync(process.env.FURVISE_CATALOG_PROOF_PATH,JSON.stringify(trace,null,2),{flag:'wx'});console.log(JSON.stringify({mode,result:trace.result,assertions:trace.assertions,failure:trace.failure,errors:trace.errors,response:trace.response,events:trace.events,queries:trace.queries,permits:trace.permits}));}
