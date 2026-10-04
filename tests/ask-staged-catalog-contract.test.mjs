import assert from 'node:assert/strict';import fs from 'node:fs';
import {fixture,id} from './helpers/ask-staged-route-fixture.mjs';
const R=new URL('../',import.meta.url).href;
const {bindCatalogIntent,assertUnambiguousOwnedIdentity,beginCatalogHydration,sealCatalog,beginCatalogContinuation,consumeCatalogContinuationToken}=await import(R+'app/lib/intelligence/catalog-intent.ts');
const {hydratePlanningCatalog}=await import(R+'app/lib/intelligence/hydrate-planning-catalog.ts');
const {explicitlyNamedOwnedPets}=await import(R+'app/lib/intelligence/entities/resolve-turn-subject.ts');
const {currentLifecycleActions,bindLifecyclePlan}=await import(R+'app/lib/furvise-brain/lifecycle-plan.ts');
const {getFurviseActionPolicy}=await import(R+'app/lib/application-actions/policy.ts');
const {bindStoredRead}=await import(R+'app/lib/furvise-brain/stored-read.ts');
const {admitAiOperation}=await import(R+'app/lib/ai/usage-guard/admission.ts');
const {MemoryAiGuardTestStore}=await import(R+'app/lib/ai/usage-guard/memory-test-store.ts');
const {executeAdmittedProviderCall}=await import(R+'app/lib/ai/usage-guard/provider-call-budget.ts');
const old=JSON.parse(fs.readFileSync(new URL('./fixtures/ask-catalog-proof-seed.json',import.meta.url)));
const template=JSON.parse(old.sent[1].input).intent;
const log={scope:'actual helpers/admission/IO adapter, distinct from full route proof',cases:[],liveProviders:0,network:0,costUSD:0};const record=(name,data={})=>log.cases.push({name,...data});
async function admitted(fn){
 const a=await admitAiOperation({feature:'ask',userId:id(1),payload:{proof:'staged-six'},requestId:crypto.randomUUID(),intendedModel:'gpt-5.4-mini',env:{NODE_ENV:'test',FURVISE_AI_DAILY_CALL_LIMIT:'20',FURVISE_AI_DAILY_COST_LIMIT_USD:'1',FURVISE_RATE_LIMIT_HASH_SECRET:'offline-f-identity-not-credential'},store:new MemoryAiGuardTestStore()});
 try{return await a.run(async()=>{await call(a,undefined,'interpretation');return fn(a);});}finally{await a.release();}
}
async function call(a,purpose,stage=purpose){const c=await a.beginProviderCall({model:'gpt-5.4-mini',maxOutputTokens:100,input:{x:1},stage,purpose});await a.recordProviderUsage(c.reservation,'gpt-5.4-mini',{inputTokens:0,outputTokens:0});return c;}
function context(f,text){const turn={id:id(31),role:'user',text,createdAt:'2026-09-20T12:00:00Z'};f.rows.ask_conversation_messages.push({id:turn.id,user_id:id(1),role:'user',user_text:text,created_at:turn.createdAt,conversation_id:id(21)});return{owner:{userId:id(1)},pet:f.rows.dog_profiles[0],eligiblePets:f.rows.dog_profiles,currentMessage:text,currentTurn:turn,conversationTurns:[turn],conversationId:id(21)};}
function proposal(ctx,purpose,owner=false){const t=structuredClone(template);t.instructionQuote=t.authorizationQuote=ctx.currentMessage;t.purpose=purpose;t.scope=owner?'owner_receipt':'subjects';t.ownerScope=owner?{basis:'explicit_owner_receipts',sourceTurnId:id(31),quote:ctx.currentMessage}:null;t.subjects=owner?[]:[{petName:ctx.pet.name,sourceTurnId:id(31),quote:ctx.currentMessage,basis:'selected'}];Object.assign(t.request,{question:ctx.currentMessage,scope:owner?'none':'selected',petNames:owner?[]:[ctx.pet.name],writeJob:null,mutationIntent:null,lifecyclePlan:null,storedRead:null});return t;}
const receipt=(ctx,owner=true)=>{const t=proposal(ctx,'receipt',owner);t.request.storedRead={operation:'read',domain:'operation_receipt',scope:owner?'owner':'subjects',reference:null,projection:'records'};return t;};
const pendingIntent=ctx=>{const t=proposal(ctx,'lifecycle');t.subjects=[];t.request.scope='none';t.request.petNames=[];t.request.lifecyclePlan={pendingDisposition:{petNames:null,quote:ctx.currentMessage},transition:null,requiredSubjectState:null,authorizationQuote:ctx.currentMessage};return t;};
function seed(f,count,foreignConversation=false){f.rows.dog_profiles.push({...f.rows.dog_profiles[0],id:id(12),name:'Sable'});f.rows.ask_conversation_messages.push({id:id(30),user_id:id(1),conversation_id:foreignConversation?id(22):id(21),role:'user',created_at:'2026-09-18T12:00:00Z'},{id:id(60),user_id:id(1),conversation_id:foreignConversation?id(22):id(21),role:'furvise',created_at:'2026-09-19T12:00:00Z'});
 for(let n=0;n<count;n++){const pet=id(11+n%2),base=structuredClone(old.response.body.response.applicationActions[0]);delete base.replaceJob;const a={...base,...getFurviseActionPolicy('pet.archive'),id:id(71+n),petId:pet,kind:'pet.archive',status:'confirmation_required',sourceMessageId:id(30)};f.rows.ask_action_capabilities.push({id:id(71+n),user_id:id(1),pet_profile_id:pet,assistant_message_id:id(60),source_message_id:id(30),action_kind:'pet.archive',action_payload:a,receipt:null,status:'pending',expires_at:'2099-01-01T00:00:00Z',created_at:'2026-09-19T12:00:00Z'});}
}
try{
 for(const [names,text]of [[['Cedar','Sable'],'Show Cedar receipt.'],[["O'Neil",'O Neil'],'Show O Neil receipt.'],[['ROWAN','rowan'],'Show Rowan receipt.'],[['A  B','A-B'],'Show A B receipt.'],[['\uFF32owan','Rowan'],'Show Rowan receipt.']]){
 for(const reverse of [false,true])await admitted(async()=>{const f=fixture();f.rows.dog_profiles[0].name=names[0];f.rows.dog_profiles.push({...f.rows.dog_profiles[0],id:id(12),name:names[1]});if(reverse)f.rows.dog_profiles.reverse();const ctx=context(f,text);assert.throws(()=>bindCatalogIntent(receipt(ctx),ctx,'named-owner-denied',Date.now()+25000));assert.equal(f.state.queries?.length||0,0);record('owner-scope-cannot-erase-grounded-subject',{names,reverse,sourceCalls:0});});
 if(names[0]!=='Cedar')for(const label of ['named','selected','account','conversation']){const f=fixture();f.rows.dog_profiles[0].name=names[0];f.rows.dog_profiles.push({...f.rows.dog_profiles[0],id:id(12),name:names[1]});const ctx=context(f,text);assert.equal(explicitlyNamedOwnedPets(text,ctx.eligiblePets).length,2);assert.throws(()=>assertUnambiguousOwnedIdentity(ctx));record('shared-collision-veto',{names,label});}
 }
 {const f=fixture();f.rows.dog_profiles.push({...f.rows.dog_profiles[0],id:id(12),name:'Sable'});const ctx=context(f,'Show Cedar and Sable notes.');assert.doesNotThrow(()=>assertUnambiguousOwnedIdentity(ctx));record('distinct-multiple-names-remain-representable');}
 await admitted(async()=>{const f=fixture(),ctx=context(f,'Show all my operation receipts, including those for deleted profiles.');seed(f,1);const row=f.rows.ask_action_capabilities[0];row.pet_profile_id=id(99);row.action_payload.petId=id(99);row.receipt={...row.action_payload,status:'succeeded'};row.status='succeeded';const t=receipt(ctx);const {permit}=bindCatalogIntent(t,ctx,'retained-owner',Date.now()+25000);const h=await hydratePlanningCatalog(permit,ctx,f.db);assert.equal(h.refs.length,1);const bound=bindStoredRead({...t.request.storedRead,reference:h.refs[0]},{ownerId:id(1),subjectIds:[],references:h.context.storedReadReferences});assert.equal(bound.reference.petId,id(99));record('grounded-retained-deleted-subject-receipt',{queries:f.state.queries});});
 for(const variant of ['zero','one','two','foreign-conversation','expired','cancelled','completed','over-limit','malformed','source-missing']){
 await admitted(async()=>{const f=fixture(),ctx=context(f,'Cancel the pending action.');const n=variant==='zero'?0:variant==='two'?2:variant==='over-limit'?13:1;seed(f,n,variant==='foreign-conversation');
 if(variant==='expired')f.rows.ask_action_capabilities[0].expires_at='2020-01-01T00:00:00Z';
 if(['cancelled','completed'].includes(variant))f.rows.ask_action_capabilities[0].status=variant==='completed'?'succeeded':variant;
 if(variant==='malformed')f.rows.ask_action_capabilities[0].action_payload=null;
 if(variant==='source-missing')f.rows.ask_conversation_messages=f.rows.ask_conversation_messages.filter(x=>x.id!==id(30));
 const t=pendingIntent(ctx),{permit}=bindCatalogIntent(t,ctx,'pending-'+variant,Date.now()+25000);
 if(['over-limit','malformed','source-missing'].includes(variant)){await assert.rejects(()=>hydratePlanningCatalog(permit,ctx,f.db));record('pending-'+variant+'-denied',{queries:f.state.queries});return;}
 const h=await hydratePlanningCatalog(permit,ctx,f.db);const list=currentLifecycleActions(h.context),expected=variant==='one'?1:variant==='two'?2:0;assert.equal(list.length,expected);
 if(expected===1)assert.equal(bindLifecyclePlan(t.request.lifecyclePlan,h.context).pendingAction.id,id(71));else assert.throws(()=>bindLifecyclePlan(t.request.lifecyclePlan,h.context));
 record('pending-'+variant,{count:list.length,complete:h.context.lifecycleActionState.complete,provenance:h.context.lifecycleActionState.provenance,queries:f.state.queries});
 });
 }
const {finishDeterministicCatalog}=await import(R+'app/lib/intelligence/catalog-intent.ts');
const {validateAskRequest}=await import(R+'app/lib/intelligence/ask-request-contract.ts');
const {rebindLifecyclePlan,continueLifecyclePlan}=await import(R+'app/lib/intelligence/lifecycle-turn.ts');

for(const selected of [11,12])for(const reversed of [false,true])for(const variant of ['mismatch','match','two','zero','other-conversation','expired','cancelled','malformed','overflow'])await admitted(async()=>{
 const f=fixture();f.rows.dog_profiles[0].name='Rowan';const ctx=context(f,"Cancel Rowan's pending archive action.");seed(f,variant==='zero'?0:variant==='two'?2:variant==='overflow'?13:1,variant==='other-conversation');
 ctx.pet=f.rows.dog_profiles.find(p=>p.id===id(selected));if(reversed)f.rows.dog_profiles.reverse();
 const a=f.rows.ask_action_capabilities[0];if(variant==='mismatch'){a.pet_profile_id=id(12);a.action_payload.petId=id(12);}
 if(variant==='expired')a.expires_at='2020-01-01T00:00:00Z';if(variant==='cancelled')a.status='cancelled';if(variant==='malformed')a.action_payload=null;
 const t=pendingIntent(ctx);t.subjects=[{petName:'Rowan',basis:'named',sourceTurnId:ctx.currentTurn.id,quote:'Rowan'}];t.request.scope='named';t.request.petNames=['Rowan'];t.request.lifecyclePlan.pendingDisposition={petNames:['Rowan'],quote:ctx.currentMessage};
 const {permit}=bindCatalogIntent(t,ctx,'repair-'+selected+'-'+reversed+'-'+variant,Date.now()+25000);assert.deepEqual(permit.subjectIds,[id(11)]);
 let callbacks=0,effects=0,receipt=null,h,plan,error;
 try{h=await hydratePlanningCatalog(permit,ctx,f.db);plan=validateAskRequest(finishDeterministicCatalog(permit,h.catalog),h.context).request.lifecyclePlan;}catch(e){error=e;}
 if(variant!=='match'){assert.ok(error,variant+' must reject');assert.equal(callbacks,0);record('reject-'+variant,{selected,reversed,error:error.message,cause:error.cause,callbacks,queries:f.state.queries});return;}
 assert.equal(error,undefined);assert.deepEqual(plan.pendingSubjectIds,[id(11)]);assert.deepEqual(rebindLifecyclePlan(structuredClone(plan),h.context),plan);
 const input={plan,context:h.context,requestId:'repair',cancel:async()=>{callbacks++;if(!receipt){effects++;receipt={action:{...plan.pendingAction,status:'cancelled'}};}return receipt;}};
 assert.equal((await continueLifecyclePlan(input)).kind,'cancelled');assert.equal((await continueLifecyclePlan(input)).kind,'cancelled');assert.equal(effects,1);
 for(const tamper of [p=>{p.pendingSubjectIds=[id(12)];},p=>{delete p.pendingSubjectIds;}]){const drift=structuredClone(plan);tamper(drift);await assert.rejects(()=>continueLifecyclePlan({...input,plan:drift}));assert.equal(callbacks,2);}
 const changed={...h.context,currentMessage:'different current source',currentTurn:{...h.context.currentTurn,text:'different current source'}};await assert.rejects(()=>continueLifecyclePlan({...input,context:changed}));assert.equal(callbacks,2);
 const other={...h.context,conversationId:id(22)};await assert.rejects(()=>continueLifecyclePlan({...input,context:other}));assert.equal(callbacks,2);
 record('match-rebind-replay-drift-controls',{selected,reversed,pendingSubjectIds:plan.pendingSubjectIds,callbacks,effects,scope:'actual Binder/rebind/callback; in-memory receipt effect, not SQL durability'});
});
 await admitted(async a=>{await call(a,'catalog_continuation');let invocations=0;
 for(const purpose of [undefined,'catalog_continuation','interpretation_repair','generation_repair','history_review','history_repair','history_rereview','task_review','task_repair','task_rereview']){
 await assert.rejects(()=>executeAdmittedProviderCall({purpose,stage:purpose==='catalog_continuation'?'catalog_continuation':'verification',providerInput:{x:1},maxOutputTokens:100,model:'gpt-5.4-mini',invoke:async()=>{invocations++;return{usage:{input_tokens:0,output_tokens:0}};}}));record('terminal-followon-denied',{purpose:purpose??'ordinary'});
 }assert.equal(invocations,0);await assert.rejects(()=>a.reserveNextCall('gpt-5.4-mini','history_review'));record('terminal-direct-reservation-denied');});
 await admitted(async a=>{for(const purpose of [undefined,'history_review','history_repair','history_rereview'])await call(a,purpose);record('normal-noncatalog-review-cycle');});
 await admitted(async a=>{for(const purpose of ['interpretation_repair',undefined,'history_review','history_repair','history_rereview'])await call(a,purpose);record('normal-initial-structural-repair-plus-review');});
 await admitted(async()=>{const f=fixture(),ctx=context(f,'Show all my operation receipts.');const {permit}=bindCatalogIntent(receipt(ctx),ctx,'permit-controls',Date.now()+25000);assert.throws(()=>beginCatalogHydration(structuredClone(permit)));beginCatalogHydration(permit);const catalog=sealCatalog(permit,{evidence:[]});assert.throws(()=>beginCatalogContinuation(permit,{evidence:['substituted']}));const token=beginCatalogContinuation(permit,catalog);assert.throws(()=>consumeCatalogContinuationToken({...token}));consumeCatalogContinuationToken(token);assert.throws(()=>consumeCatalogContinuationToken(token));record('permit-and-continuation-object-identity-single-use');});
 const s=fs.readFileSync(new URL(R+'tests/ask-wire-codec.test.mjs'),'utf8');assert.ok(s.includes('😺')&&s.includes('٩')&&!s.includes('ðŸ˜º')&&!s.includes('Ù©'));record('real-unicode-literals-restored');
 log.result='PASS';
}catch(e){log.result='FAIL';log.error={message:e.message,stack:e.stack};process.exitCode=1;}
finally{if(process.env.FURVISE_CATALOG_PROOF_PATH)fs.writeFileSync(process.env.FURVISE_CATALOG_PROOF_PATH,JSON.stringify(log,null,2),{flag:'wx'});console.log(JSON.stringify(log));}
