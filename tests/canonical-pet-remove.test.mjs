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
 const request={draftAnswer:null,calculatePlan:null,storedRead:null,removeJob:null,stateTransitionJob:null,fieldMutationJob:null,lifecyclePlan:null,appendJob:null,readTicket:null,task:null,temporalScope:null,recordSelection:null,profileFields:[],projection:null,evidenceNeeds:[],outputFormat:null,evidenceBasis:null,premiseQuotes:null,excludedPetNames:[],...f.request};
 assert.equal(validate({request}),true,JSON.stringify(validate.errors));
 for(const target of ['last_event_for_subject',{kind:'exact_record',ref:'invented'},id(7)])assert.equal(validate({request:{...request,removeJob:{...f.proposal,target}}}),false);
 assert.equal(validate({request:{...request,removeJob:{...f.proposal,petId:id(7)}}}),false);
});
for(const field of ['target','petName','quote','extra','mixed','foreign','recovered'])test('profile REMOVE Binder rejects '+field,()=>{
 const f=setup();if(field==='target')f.proposal.target=id(9);if(field==='petName')f.proposal.petName='Foreign';if(field==='quote')f.proposal.instructionQuote='Invented';
 if(field==='extra')f.proposal.cleanup=true;if(field==='mixed')f.request.readTicket={};if(field==='foreign')f.pet.user_id=id(9);if(field==='recovered')f.context.currentTurn.recoveredReceiptReference=true;
 assert.throws(f.plan,field==='mixed'?/read_ticket_evidence_domain/:/remove_job/);
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
 const input={capabilityId:cap.id,assistantMessageId:id(6),userId:id(1),mode:'cancel'};
 const cancelled=await executeActionCapability(input);assert.equal(cancelled.action.status,'cancelled');assert.equal(cancelled.changed,false);
 assert.equal(f.authCalls(),0);assert.equal(f.rpcCalls[0][1].p_mode,'cancel');
 const replay=await executeActionCapability({...input,mode:'confirm',recentAuthContext:f.auth});
 assert.deepEqual(replay.action,cancelled.action);assert.equal(replay.changed,false);assert.equal(f.authCalls(),0);
 assert.equal(f.caps[0].status,'cancelled');
});
test('receipt verifier binds pet REMOVE job/source/target and persisted receipt without parent lookup',async()=>{
 const f=setup(),a=await f.action(),r={...a,id:id(5),status:'succeeded'},input={operationId:id(5),authorized:a,returned:r,persistedStatus:'succeeded',persistedReceipt:r};
 assert.equal(confirmFurviseWriteReceipt(input).operation,'remove');
 for(const field of ['petId','sourceMessageId','removeJob','kind','explicitIntent','label','confirmationPolicy']){const changed={...r,[field]:field==='removeJob'?{...r.removeJob,resolvedTarget:{...r.removeJob.resolvedTarget,recordId:id(9)}}:'wrong'};assert.throws(()=>confirmFurviseWriteReceipt({...input,returned:changed,persistedReceipt:changed}),/UNCONFIRMED/);}
 assert.throws(()=>confirmFurviseWriteReceipt({...input,persistedReceipt:null}),/UNCONFIRMED/);
});
test('public action denial does not load private destructive authority',()=>{
 const route=readFileSync(new URL('../app/api/ask/actions/[messageId]/route.ts',import.meta.url),'utf8');
 assert.match(route,/getAuthenticatedApiContext/);assert.match(route,/status:\s*404/);
 assert.doesNotMatch(route,/executeActionCapability|recentAuthContext/);
 const privateAuthority=readFileSync(new URL('../app/lib/application-actions/capabilities.ts',import.meta.url),'utf8');
 assert.match(privateAuthority,/requireRecentInteractiveAuthentication\(input\.recentAuthContext\)/);
 assert.match(privateAuthority,/RECENT_AUTH_REQUIRED/);
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
const {PUBLIC_V1_CAPABILITIES}=await import('../app/lib/public-v1-capabilities.ts');
for(const decision of ['confirm','cancel','tampered'])test('public mutation gate returns 404 with zero effects: '+decision,async()=>{
 assert.equal(PUBLIC_V1_CAPABILITIES.askMutations,false);
 const f=setup(),[cap]=await f.mint(await f.action());globalThis.__petRemoveAuth=f.auth;
 const before=structuredClone(f.rows),queries=f.queries.length;
 const body=decision==='tampered'?{actionId:cap.id,decision:'confirm',kind:'care_history.add',petId:id(99)}:{actionId:cap.id,decision};
 const result=await POST(new Request('https://offline.invalid/api/ask/actions/'+id(6),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),{params:Promise.resolve({messageId:id(6)})});
 assert.equal(result.status,404);assert.deepEqual(await result.json(),{error:'That action is no longer available.'});
 assert.equal(f.rpcCalls.length,0);assert.equal(f.authCalls(),0);assert.equal(f.queries.length,queries);assert.deepEqual(f.rows,before);
});
// Only this distinct route module sees the enabled policy. The real module and
// public default remain frozen and disabled; all authority/SQL code stays real.
const {default:vm}=await import('node:vm');
const {default:ts}=await import('typescript');
const requestBoundary=await import('../app/lib/security/request.ts');
const enabledExports={};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../app/api/ask/actions/[messageId]/route.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
 exports:enabledExports,Response,Error,console,require:name=>{
  const modules={
   'next/cache':{revalidatePath(){}},
   '../../../../lib/authenticated-api-server':{getAuthenticatedApiContext:async()=>globalThis.__petRemoveAuth},
   '../../../../lib/application-actions/capabilities.ts':{executeActionCapability},
   '../../../../lib/intelligence/append-turn.ts':{continueConfirmedAppend:async()=>null},
   '../../../../lib/operations/events':{emitOperationalEvent(){}},
   '../../../../lib/security/request':requestBoundary,
   '../../../../lib/public-v1-capabilities.ts':{PUBLIC_V1_CAPABILITIES:Object.freeze({...PUBLIC_V1_CAPABILITIES,askMutations:true})}
  };
  assert.ok(Object.hasOwn(modules,name),name);return modules[name];
 }
});
const publicPOST=enabledExports.POST;
assert.equal(PUBLIC_V1_CAPABILITIES.askMutations,false);
for(const decision of ['confirm','cancel'])test('public denial retains private destructive authentication: '+decision,async()=>{
 const f=setup(),[cap]=await f.mint(await f.action());
 const missingClaims={...f.auth,supabase:{auth:{getClaims:async()=>({data:{claims:null}})}}};
 globalThis.__petRemoveAuth=missingClaims;
 const request=new Request('https://offline.invalid/api/ask/actions/'+id(6),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({actionId:cap.id,decision})});
 const response=await publicPOST(request,{params:Promise.resolve({messageId:id(6)})});
 assert.equal(response.status,404);assert.equal(f.rpcCalls.length,0);
 const input={capabilityId:cap.id,assistantMessageId:id(6),userId:id(1),mode:decision,recentAuthContext:missingClaims};
 if(decision==='confirm')await assert.rejects(()=>executeActionCapability(input),/RECENT_AUTH_REQUIRED/);
 else {const before=structuredClone([f.rows.dog_profiles,f.rows.pet_care_entries]);const result=await executeActionCapability(input);assert.equal(result.action.status,'cancelled');assert.equal(result.changed,false);assert.equal(f.caps[0].status,'cancelled');assert.deepEqual([f.rows.dog_profiles,f.rows.pet_care_entries],before);}
 assert.equal(f.rpcCalls.length,decision==='confirm'?0:1);
});
test('client kind and target cannot open the public gate or evade private recent authentication',async()=>{
 const f=setup(),[cap]=await f.mint(await f.action());globalThis.__petRemoveAuth=f.auth;
 const request=new Request('https://offline.invalid/api/ask/actions/'+id(6),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({actionId:cap.id,decision:'confirm',kind:'care_history.add',petId:id(99)})});
 const result=await publicPOST(request,{params:Promise.resolve({messageId:id(6)})});assert.equal(result.status,404);assert.equal(f.rpcCalls.length,0);
 await assert.rejects(()=>executeActionCapability({capabilityId:cap.id,assistantMessageId:id(6),userId:id(1),mode:'confirm',
  kind:'care_history.add',petId:id(99),recentAuthContext:{...f.auth,supabase:{auth:{getClaims:async()=>({data:{claims:null}})}}}}),/RECENT_AUTH_REQUIRED/);
 assert.equal(f.rpcCalls.length,0);
});

test('public endpoint stays closed while private fresh authentication replays the durable receipt',async()=>{
 const f=setup(),[cap]=await f.mint(await f.action());globalThis.__petRemoveAuth=f.auth;
 const request=()=>new Request('https://offline.invalid/api/ask/actions/'+id(6),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({actionId:cap.id,decision:'confirm'})});
 const route={params:Promise.resolve({messageId:id(6)})};
 assert.equal((await publicPOST(request(),route)).status,404);assert.equal(f.rpcCalls.length,0);
 const input={capabilityId:cap.id,assistantMessageId:id(6),userId:id(1),mode:'confirm',recentAuthContext:f.auth};
 const first=await executeActionCapability(input);assert.equal(first.action.status,'succeeded');assert.equal(f.authCalls(),1);assert.equal(f.rpcCalls.length,1);
 const replay=await executeActionCapability({...input,recentAuthContext:undefined});assert.deepEqual(replay.action,first.action);
 assert.equal(f.authCalls(),1);assert.equal(f.rpcCalls.length,2);assert.deepEqual(f.rpcCalls[1],f.rpcCalls[0]);
 assert.equal(f.caps[0].receipt.status,'succeeded');assert.equal(PUBLIC_V1_CAPABILITIES.askMutations,false);
});
