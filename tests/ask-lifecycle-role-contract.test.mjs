import assert from 'node:assert/strict';import fs from 'node:fs';
import {fixture,id} from './helpers/ask-staged-route-fixture.mjs';
const R=new URL('../',import.meta.url).href;
const {bindCatalogIntent}=await import(R+'app/lib/intelligence/catalog-intent.ts');
const {hydratePlanningCatalog,verifyPlanningCatalogSource}=await import(R+'app/lib/intelligence/hydrate-planning-catalog.ts');
const {getFurviseActionPolicy}=await import(R+'app/lib/application-actions/policy.ts');
const {admitAiOperation}=await import(R+'app/lib/ai/usage-guard/admission.ts');
const {MemoryAiGuardTestStore}=await import(R+'app/lib/ai/usage-guard/memory-test-store.ts');
const old=JSON.parse(fs.readFileSync(new URL(R+'tests/fixtures/ask-catalog-proof-seed.json')));
const template=JSON.parse(old.sent[1].input).intent;template.ownerScope ??= null;
const log={scope:'actual helpers/admission/IO adapter, distinct from full route proof',cases:[],liveProviders:0,network:0,costUSD:0};const record=(name,data={})=>log.cases.push({name,...data});
async function admitted(fn,initial=true){
 const a=await admitAiOperation({feature:'ask',userId:id(1),payload:{proof:'staged-six'},requestId:crypto.randomUUID(),intendedModel:'gpt-5.4-mini',env:{NODE_ENV:'test',FURVISE_AI_DAILY_CALL_LIMIT:'20',FURVISE_AI_DAILY_COST_LIMIT_USD:'1',FURVISE_RATE_LIMIT_HASH_SECRET:'offline-f-identity-not-credential'},store:new MemoryAiGuardTestStore()});
 try{return await a.run(async()=>{if(initial)await call(a,undefined,'interpretation');return fn(a);});}finally{await a.release();}
}
async function call(a,purpose,stage=purpose){const c=await a.beginProviderCall({model:'gpt-5.4-mini',maxOutputTokens:100,input:{x:1},stage,purpose});await a.recordProviderUsage(c.reservation,'gpt-5.4-mini',{inputTokens:0,outputTokens:0});return c;}
function context(f,text){const turn={id:id(31),role:'user',text,createdAt:'2026-09-20T12:00:00Z'};f.rows.ask_conversation_messages.push({id:turn.id,user_id:id(1),role:'user',user_text:text,created_at:turn.createdAt,conversation_id:id(21)});return{owner:{userId:id(1)},pet:f.rows.dog_profiles[0],eligiblePets:f.rows.dog_profiles,currentMessage:text,currentTurn:turn,conversationTurns:[turn],conversationId:id(21)};}
function proposal(ctx,purpose,owner=false){const t=structuredClone(template);t.instructionQuote=t.authorizationQuote=ctx.currentMessage;t.purpose=purpose;t.scope=owner?'owner_receipt':'subjects';t.ownerScope=owner?{basis:'explicit_owner_receipts',sourceTurnId:id(31),quote:ctx.currentMessage}:null;t.subjects=owner?[]:[{petName:ctx.pet.name,sourceTurnId:id(31),quote:ctx.currentMessage,basis:'selected'}];Object.assign(t.request,{question:ctx.currentMessage,scope:owner?'none':'selected',petNames:owner?[]:[ctx.pet.name],writeJob:null,mutationIntent:null,lifecyclePlan:null,storedRead:null});return t;}
const pendingIntent=ctx=>{const t=proposal(ctx,'lifecycle');t.request.lifecyclePlan={pendingDisposition:'cancel',transition:null,requiredSubjectState:null,authorizationQuote:ctx.currentMessage};return t;};
function seed(f,count,foreignConversation=false){f.rows.dog_profiles.push({...f.rows.dog_profiles[0],id:id(12),name:'Sable'});f.rows.ask_conversation_messages.push({id:id(30),user_id:id(1),conversation_id:foreignConversation?id(22):id(21),role:'user',created_at:'2026-09-18T12:00:00Z'},{id:id(60),user_id:id(1),conversation_id:foreignConversation?id(22):id(21),role:'furvise',created_at:'2026-09-19T12:00:00Z'});
 for(let n=0;n<count;n++){const pet=id(11+n%2),base=structuredClone(old.response.body.response.applicationActions[0]);delete base.replaceJob;const a={...base,...getFurviseActionPolicy('pet.archive'),id:id(71+n),petId:pet,kind:'pet.archive',status:'confirmation_required',sourceMessageId:id(30)};f.rows.ask_action_capabilities.push({id:id(71+n),user_id:id(1),pet_profile_id:pet,assistant_message_id:id(60),source_message_id:id(30),action_kind:'pet.archive',action_payload:a,receipt:null,status:'pending',expires_at:'2099-01-01T00:00:00Z',created_at:'2026-09-19T12:00:00Z'});}
}
const {finishDeterministicCatalog}=await import(R+'app/lib/intelligence/catalog-intent.ts');
const {validateAskRequest}=await import(R+'app/lib/intelligence/ask-request-contract.ts');
const {continueLifecyclePlan,rebindLifecyclePlan}=await import(R+'app/lib/intelligence/lifecycle-turn.ts');
const {interpretAskQuestion,prepareAskInterpretationRequest}=await import(R+'app/lib/intelligence/interpret-ask.ts');
const {createAskWirePlan}=await import(R+'app/lib/intelligence/ask-wire-policy.mjs');
const {askRequestProviderSchema,ASK_REQUEST_INSTRUCTIONS}=await import(R+'app/lib/intelligence/ask-request-contract.ts');
const {proposedSemanticFrameJsonSchema}=await import(R+'app/lib/intelligence/semantic-frame/schema.ts');
async function runCase({cancelName='Rowan',selected=11,reverse=false,clauseReverse=false,variant='match',unqualified=false,throughInterpreter=false,selectorCase='exact',groundingReverse=false}){
 return admitted(async admission=>{
 const f=fixture();f.rows.dog_profiles[0].name='Rowan';seed(f,variant==='zero'?0:variant==='two'?2:variant==='overflow'?13:1,variant==='other-conversation');
 const target=cancelName==='Rowan'?'Sable':'Rowan',cancelId=cancelName==='Rowan'?11:12;
 const quote=unqualified?'Cancel the pending action':selectorCase==='implicit'?'Cancel his pending archive action':selectorCase==='multi'?`Cancel ${cancelName}'s or ${target}'s pending archive action`:`Cancel ${cancelName}'s pending archive action`;
 const text=unqualified?quote+'.':selectorCase==='implicit'?`For ${cancelName}, ${quote} and archive ${target} instead.`:clauseReverse?`Archive ${target} instead; ${quote}.`:`${quote} and archive ${target} instead.`;
 const ctx=context(f,text);ctx.pet=f.rows.dog_profiles.find(p=>p.id===id(selected));if(reverse)f.rows.dog_profiles.reverse();
 const a=f.rows.ask_action_capabilities[0];if(a){const pending=unqualified?12:variant==='mismatch'?(cancelId===11?12:11):cancelId;a.pet_profile_id=id(pending);a.action_payload.petId=id(pending);}
 if(variant==='expired')a.expires_at='2020-01-01T00:00:00Z';if(variant==='cancelled')a.status='cancelled';if(variant==='malformed')a.action_payload=null;if(variant==='foreign')a.pet_profile_id=id(99);
 const t=pendingIntent(ctx);t.subjects=unqualified?[]:[cancelName,target].map(petName=>({petName,basis:'named',sourceTurnId:ctx.currentTurn.id,quote:petName}));t.request.scope=unqualified?'none':'named';t.request.petNames=unqualified?[]:[cancelName,target];
 t.request.lifecyclePlan.pendingDisposition={petNames:unqualified?null:[cancelName],quote};t.request.lifecyclePlan.transition=unqualified?null:{targetPetName:target,toState:'archived'};
 if(selectorCase==='superset'||selectorCase==='multi')t.request.lifecyclePlan.pendingDisposition.petNames=[cancelName,target];
 if(selectorCase==='multi')for(const grounding of t.subjects)grounding.quote=quote;
 if(selectorCase==='omission')t.request.lifecyclePlan.pendingDisposition.petNames=[target];
 if(selectorCase==='duplicate')f.rows.dog_profiles.push({...f.rows.dog_profiles.find(p=>p.id===id(cancelId)),id:id(13)});
 if(groundingReverse){t.subjects.reverse();t.request.petNames.reverse();}
 if(variant==='stale-source')t.request.lifecyclePlan.pendingDisposition.quote='not in current source';
 let calls=0,effects=0,stubCalls=0,receipt=null,h,plan,error,permit;
 try{
  if(throughInterpreter){
   const prepared=prepareAskInterpretationRequest(ctx,'gpt-5.4-mini');
   const wire=prepared.wire,begin=admission.beginProviderCall.bind(admission);let admittedSnapshot,dispatches=0;
   admission.beginProviderCall=async x=>{admittedSnapshot=JSON.stringify(x.input);return begin(x);};
   const result=await interpretAskQuestion({context:ctx,model:'gpt-5.4-mini',client:{responses:{create:async request=>{
    dispatches++;stubCalls++;assert.equal(dispatches,1);assert.equal(JSON.stringify(request),admittedSnapshot);assert.deepEqual(request.text.format.schema,prepared.request.text.format.schema);assert.equal(request.instructions,prepared.request.instructions);assert.equal(request.input,prepared.request.input);assert.equal(request.max_output_tokens,8192);
    assert.ok(JSON.stringify(request).length<=58000);f.state.brainCalls++;
    return{status:'completed',output_text:JSON.stringify(wire.encode({request:t})),usage:{input_tokens:0,output_tokens:0}};
   }}},catalogService:{requestId:crypto.randomUUID(),capability:()=>({available:true,reason:'supported'}),verify:p=>verifyPlanningCatalogSource(p,f.db),hydrate:async p=>{h=await hydratePlanningCatalog(p,prepared.context,f.db);return h;}}});
   assert.equal(dispatches,1);plan=result.request?.lifecyclePlan;if(!plan)error={boundary:'typed_rejection',result};
  }else{({permit}=bindCatalogIntent(t,ctx,crypto.randomUUID(),Date.now()+25000));h=await hydratePlanningCatalog(permit,ctx,f.db);plan=validateAskRequest(finishDeterministicCatalog(permit,h.catalog),h.context).request.lifecyclePlan;}
 }
 catch(e){error={message:e.message,cause:e.cause};}
 if(throughInterpreter)assert.equal(stubCalls,1);
 const success=variant==='match'&&!['superset','omission','duplicate'].includes(selectorCase);
 if(!success){assert.ok(error,'Expected rejection '+variant);assert.equal(calls,0);record('reject-'+variant,{cancelName,target,selected,reverse,clauseReverse,unqualified,throughInterpreter,selectorCase,groundingReverse,stubCalls,error,calls,queries:f.state.queries});return;}
 assert.equal(error,undefined);assert.equal(plan.pendingAction.petId,id(unqualified?12:cancelId));assert.deepEqual(plan.pendingSubjectIds,unqualified?null:selectorCase==='multi'?[id(cancelId),id(cancelId===11?12:11)]:[id(cancelId)]);if(!unqualified)assert.equal(plan.transition.petId,id(cancelId===11?12:11));
 const input={plan,context:h.context,requestId:'role-proof',cancel:async x=>{assert.equal(x.capabilityId,plan.pendingAction.id);calls++;if(!receipt){effects++;receipt={action:{...plan.pendingAction,status:'cancelled'}};}return receipt;}};
 assert.deepEqual(rebindLifecyclePlan(structuredClone(plan),h.context),plan);
 for(let n=0;n<2;n++)assert.equal((await continueLifecyclePlan(input)).kind,unqualified?'cancelled':'transition');assert.equal(effects,1);
 if(!unqualified)for(const names of [null,[cancelName,target],[target]].filter(names=>JSON.stringify(names)!==JSON.stringify(plan.cancellation.petNames))){const drift=structuredClone(plan);drift.cancellation.petNames=names;drift.pendingSubjectIds=names===null?null:names.map(n=>id(n==='Rowan'?11:12));await assert.rejects(()=>continueLifecyclePlan({...input,plan:drift}));assert.equal(calls,2);}
 for(const contextChange of [{...h.context,lifecycleActionState:structuredClone(h.context.lifecycleActionState)},{...h.context,conversationId:id(22)},{...h.context,currentTurn:{...h.context.currentTurn,id:id(99)}}]){await assert.rejects(()=>continueLifecyclePlan({...input,context:contextChange}));assert.equal(calls,2);}
 record('accepted-separated-role-or-unqualified',{cancelName,target,selected,reverse,clauseReverse,unqualified,throughInterpreter,selectorCase,groundingReverse,stubCalls,pendingSubjectIds:plan.pendingSubjectIds,cancellation:plan.cancellation,transition:plan.transition,callbacks:calls,effects,provenance:h.context.lifecycleActionState.provenance,queries:f.state.queries});
 },!throughInterpreter);
}
try{
 for(const cancelName of ['Rowan','Sable'])for(const selected of [11,12])for(const reverse of [false,true])for(const clauseReverse of [false,true])for(const variant of ['match','mismatch','two'])await runCase({cancelName,selected,reverse,clauseReverse,variant});
 for(const selected of [11,12])for(const variant of ['match','zero','two','other-conversation','expired','cancelled','malformed','overflow','foreign','stale-source'])await runCase({selected,unqualified:true,variant});
 for(const selected of [11,12])for(const variant of ['match','mismatch'])await runCase({selected,variant,throughInterpreter:true});
 for(const selected of [11,12])await runCase({selected,unqualified:true,throughInterpreter:true});
 for(const cancelName of ['Rowan','Sable'])for(const selected of [11,12])for(const reverse of [false,true])for(const clauseReverse of [false,true])for(const groundingReverse of [false,true])await runCase({cancelName,selected,reverse,clauseReverse,groundingReverse,selectorCase:'superset'});
 for(const cancelName of ['Rowan','Sable'])for(const selected of [11,12])await runCase({cancelName,selected,selectorCase:'superset',throughInterpreter:true});
 for(const selectorCase of ['omission','duplicate','implicit','multi'])for(const selected of [11,12])await runCase({selected,selectorCase});
 const vectors=JSON.parse(fs.readFileSync(new URL(R+'tests/fixtures/ask-lifecycle-role-wire.json')));
 const broad=createAskWirePlan(askRequestProviderSchema(proposedSemanticFrameJsonSchema),ASK_REQUEST_INSTRUCTIONS);
 assert.equal(vectors.fixtures.length,3);
 for(const f of vectors.fixtures){assert.deepEqual(broad.encode(f.canonical),f.wire);assert.deepEqual(broad.decode(f.wire),f.canonical);record('independent-python-staged-wire',{name:f.name});}
 const audit=JSON.parse(fs.readFileSync(new URL(R+'tests/fixtures/ask-wire-policy-audit.json'))),r=audit.lifecycleRoleReview;
 assert.ok(r.sourceAfter.startsWith(r.sourceBefore.replace(...r.sourceLiteralReplacement)));const {createHash}=await import('node:crypto');const digest=t=>createHash('sha256').update(t).digest('hex');
 for(const item of Object.values(r.consolidation.rules)){assert.equal(digest(item.before),item.beforeSha256);assert.equal(digest(item.after),item.afterSha256);}
 assert.ok(audit.compactedPolicy[0].rule.includes(r.consolidation.relocation[0].evidence));
 for(let i=29;i<=47;i++)assert.equal(audit.compactedPolicy[i].rule,audit.priorCompactedPolicy[i].rule);record('policy-prior-clauses-retained');
 log.result='PASS';
}catch(e){log.result='FAIL';log.error={message:e.message,cause:e.cause,stack:e.stack};process.exitCode=1;}
finally{if(process.env.FURVISE_CATALOG_PROOF_PATH)fs.writeFileSync(process.env.FURVISE_CATALOG_PROOF_PATH,JSON.stringify(log,null,2),{flag:'wx'});console.log(JSON.stringify({result:log.result,groups:log.cases.length,error:log.error}));}
