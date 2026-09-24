import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixture,id} from './helpers/canonical-replace.mjs';
const {bindRemovePlan,resolveRemovePlan,readBoundRemoveJob,removeJobSchema}=await import('../app/lib/furvise-brain/remove-job.ts');
const {validateAskRequest,askRequestProviderSchema}=await import('../app/lib/intelligence/ask-request-contract.ts');
const {prepareBoundRemoveAction,prepareFurviseApplicationActions}=await import('../app/lib/application-actions/planner.ts');
const {parseStoredApplicationActions}=await import('../app/lib/application-actions/contracts.ts');
const {executeActionCapability,rebindCanonicalCapabilityAction}=await import('../app/lib/application-actions/capabilities.ts');
const {confirmFurviseWriteReceipt}=await import('../app/lib/furvise-brain/write-contract.ts');
const {canonicalSuggestionJob}=await import('../app/lib/intelligence/canonical-suggestion.ts');
function setup(){const f=fixture();f.pet.updated_at='2026-09-22T00:00:00Z';
 const proposal={operation:'remove',domain:'pet_profile',target:'subject_profile',petName:f.pet.name,instructionQuote:f.source.text.trim()};
 Object.assign(f.request,{writeJob:null,removeJob:proposal,selection:'summary',mutationIntent:null,requirements:[],frame:null});
 const plan=()=>validateAskRequest(f.request,f.context).request.removeJob;
 const action=async()=>prepareBoundRemoveAction(await resolveRemovePlan(plan(),f.db,id(1)),'request');
 let authCalls=0;const auth={userId:id(1),accessToken:null,supabase:{auth:{getClaims:async()=>{authCalls++;return {data:{claims:{sub:id(1),session_id:id(90),amr:[{method:'password',timestamp:Math.floor(Date.now()/1000)}]}}};}}}};
 return {...f,proposal,plan,action,auth,authCalls:()=>authCalls};
}
test('one closed REMOVE schema supports care history and the bound subject profile',async()=>{
 const f=setup(),s=removeJobSchema();assert.deepEqual(s.anyOf.slice(1).map(x=>x.properties.domain.enum[0]),['care_history','pet_profile']);
 const {default:Ajv}=await import('ajv'),validate=new Ajv().compile(askRequestProviderSchema({},f.context));
 const request={storedRead:null,removeJob:null,stateTransitionJob:null,fieldMutationJob:null,lifecyclePlan:null,appendJob:null,readTicket:null,task:null,temporalScope:null,recordSelection:null,profileFields:[],projection:null,evidenceNeeds:[],outputFormat:null,evidenceBasis:null,premiseQuotes:null,excludedPetNames:[],...f.request};
 assert.equal(validate({request}),true,JSON.stringify(validate.errors));
 for(const target of ['last_event_for_subject',{kind:'exact_record',ref:'invented'},id(7)])assert.equal(validate({request:{...request,removeJob:{...f.proposal,target}}}),false);
 assert.equal(validate({request:{...request,removeJob:{...f.proposal,petId:id(7)}}}),false);
});
for(const field of ['target','petName','quote','extra','mixed','foreign','recovered'])test('profile REMOVE Binder rejects '+field,()=>{
 const f=setup();if(field==='target')f.proposal.target=id(9);if(field==='petName')f.proposal.petName='Foreign';if(field==='quote')f.proposal.instructionQuote='Invented';
 if(field==='extra')f.proposal.cleanup=true;if(field==='mixed')f.request.readTicket={};if(field==='foreign')f.pet.user_id=id(9);if(field==='recovered')f.context.currentTurn.recoveredReceiptReference=true;
 assert.throws(f.plan,/remove_job/);
});
test('bound target survives JSON and capability mint without profile facts or an alternate target',async()=>{
 const f=setup(),a=await f.action();assert.equal(a.removeJob.resolvedTarget.recordId,f.pet.id);assert.equal(a.targetSourceId,undefined);
 assert.equal(a.safetyClass,'DESTRUCTIVE');assert.equal(a.confirmationPolicy,'always');assert.equal(a.explicitIntent,false);
 assert.deepEqual(readBoundRemoveJob(JSON.parse(JSON.stringify(a.removeJob))),a.removeJob);
 const [cap]=await f.mint(a);assert.deepEqual(cap.removeJob,a.removeJob);assert.equal(f.caps[0].target_id,null);
 assert.deepEqual(Object.keys(a.removeJob).sort(),['asOf','domain','instruction','operation','petId','resolvedTarget','sourceMessageId','target']);
 assert.equal(canonicalSuggestionJob(a),null);
});
test('model delete and client alternate targets carry no authority',async()=>{
 const f=setup(),a=await f.action(),legacy={...a,explicitIntent:true};delete legacy.removeJob;
 assert.deepEqual(prepareFurviseApplicationActions({proposals:[legacy],petId:f.pet.id,petName:f.pet.name,requestId:'request',sourceMessage:f.source.text}),[]);
 assert.deepEqual(parseStoredApplicationActions([legacy]),[]);
 for(const changed of [{targetSourceId:'care:'+id(4)},{petId:id(8)},{kind:'pet.archive'},{input:{...a.input,target:'specified'}}])assert.deepEqual(parseStoredApplicationActions([{...a,...changed}]),[]);
 assert.throws(()=>rebindCanonicalCapabilityAction(legacy,f.source.id,f.source,f.pet.name,id(1)),/REMOVE_CAPABILITY_JOB_REQUIRED/);
});
for(const state of ['absent','stale','foreign','recovery'])test('server capability requires recent auth before SQL: '+state,async()=>{
 const f=setup(),[cap]=await f.mint(await f.action());let auth=f.auth;
 if(state==='absent')auth=undefined;
 if(state==='foreign')auth={...auth,userId:id(9)};
 if(state==='stale'||state==='recovery')auth={...auth,supabase:{auth:{getClaims:async()=>({data:{claims:{sub:id(1),session_id:id(90),amr:[{method:state==='recovery'?'recovery':'password',timestamp:Math.floor(Date.now()/1000)-3600}]}}})}}};
 await assert.rejects(executeActionCapability({capabilityId:cap.id,assistantMessageId:id(6),userId:id(1),mode:'confirm',recentAuthContext:auth}),/RECENT_AUTH_REQUIRED/);assert.equal(f.rpcCalls.length,0);
});
test('fresh authenticated confirmation reloads receipt after all parent rows are gone; replay never needs them',async()=>{
 const f=setup(),a=await f.action(),[cap]=await f.mint(a),rpc=f.db.rpc;
 f.db.rpc=(...args)=>{const q=rpc(...args);return {maybeSingle:async()=>{const r=await q.maybeSingle();f.rows.dog_profiles=[];f.rows.ask_conversation_messages=[];return r;}}};
 const input={capabilityId:cap.id,assistantMessageId:id(6),userId:id(1),mode:'confirm',recentAuthContext:f.auth};
 const result=await executeActionCapability(input);assert.equal(result.action.status,'succeeded');assert.equal(f.authCalls(),1);assert.deepEqual(result.action.removeJob,a.removeJob);
 const replay=await executeActionCapability({...input,recentAuthContext:undefined});assert.deepEqual(replay.action,result.action);assert.equal(f.authCalls(),1);
});
test('cancellation does not request destructive authentication; auto cannot execute',async()=>{
 const f=setup(),[cap]=await f.mint(await f.action());
 await assert.rejects(executeActionCapability({capabilityId:cap.id,assistantMessageId:id(6),userId:id(1),mode:'auto'}),/AUTO_NOT_AUTHORIZED/);assert.equal(f.rpcCalls.length,0);
 await executeActionCapability({capabilityId:cap.id,assistantMessageId:id(6),userId:id(1),mode:'cancel'});assert.equal(f.authCalls(),0);assert.equal(f.rpcCalls[0][1].p_mode,'cancel');
});
test('receipt verifier binds pet REMOVE job/source/target and persisted receipt without parent lookup',async()=>{
 const f=setup(),a=await f.action(),r={...a,id:id(5),status:'succeeded'},input={operationId:id(5),authorized:a,returned:r,persistedStatus:'succeeded',persistedReceipt:r};
 assert.equal(confirmFurviseWriteReceipt(input).operation,'remove');
 for(const field of ['petId','sourceMessageId','removeJob','kind','explicitIntent','label','confirmationPolicy']){const changed={...r,[field]:field==='removeJob'?{...r.removeJob,resolvedTarget:{...r.removeJob.resolvedTarget,recordId:id(9)}}:'wrong'};assert.throws(()=>confirmFurviseWriteReceipt({...input,returned:changed,persistedReceipt:changed}),/UNCONFIRMED/);}
 assert.throws(()=>confirmFurviseWriteReceipt({...input,persistedReceipt:null}),/UNCONFIRMED/);
});
test('opaque route supplies authenticated context and cannot accept client action semantics',()=>{
 const s=readFileSync(new URL('../app/api/ask/actions/[messageId]/route.ts',import.meta.url),'utf8');assert.match(s,/recentAuthContext: auth/);assert.match(s,/RECENT_AUTH_REQUIRED/);assert.ok(s.includes('hasOnlyKeys(rawBody, ["actionId", "decision"])'));
});

// Exercise the real opaque HTTP handler with only auth/Next infrastructure stubbed.
const {registerHooks}=await import('node:module');
registerHooks({resolve(specifier,context,next){
 const mocks={
  'next/cache':'export const revalidatePath=()=>{};',
  '../../../../lib/authenticated-api-server':'export const getAuthenticatedApiContext=async()=>globalThis.__petRemoveAuth;',
  '../../../../lib/intelligence/append-turn.ts':'export const continueConfirmedAppend=async()=>null;',
  '../../../../lib/operations/events':'export const emitOperationalEvent=()=>{};'
 };
 if(Object.hasOwn(mocks,specifier))return {shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent(mocks[specifier])};
 return next(specifier,context);
}});
const {POST}=await import('../app/api/ask/actions/[messageId]/route.ts');
for(const decision of ['confirm','cancel'])test('opaque route applies destructive auth only to confirmed server capability: '+decision,async()=>{
 const f=setup(),[cap]=await f.mint(await f.action());
 globalThis.__petRemoveAuth={...f.auth,supabase:{auth:{getClaims:async()=>({data:{claims:null}})}}};
 const request=new Request('https://offline.invalid/api/ask/actions/'+id(6),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({actionId:cap.id,decision})});
 const result=await POST(request,{params:Promise.resolve({messageId:id(6)})});
 assert.equal(result.status,decision==='confirm'?401:200);assert.equal(f.rpcCalls.length,decision==='confirm'?0:1);
 if(decision==='confirm')assert.equal((await result.json()).code,'RECENT_AUTH_REQUIRED');
});
test('opaque route rejects client kind and target rather than using them to evade recent auth',async()=>{
 const f=setup(),[cap]=await f.mint(await f.action());globalThis.__petRemoveAuth=f.auth;
 const request=new Request('https://offline.invalid/api/ask/actions/'+id(6),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({actionId:cap.id,decision:'confirm',kind:'care_history.add',petId:id(99)})});
 const result=await POST(request,{params:Promise.resolve({messageId:id(6)})});assert.equal(result.status,400);assert.equal(f.rpcCalls.length,0);
});
