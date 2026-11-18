import { providerFixturePlan } from "./helpers/provider-wire-fixture.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import {fixture,id} from './helpers/canonical-replace.mjs';
registerHooks({resolve(s,c,next){if(s.endsWith('/care-authority-client.ts'))return{shortCircuit:true,url:'data:text/javascript,export const createCanonicalCareAuthorityClient=()=>globalThis.__replaceCatalog;'};return next(s,c);}});
const {loadReplaceReferences}=await import('../app/lib/intelligence/replace-reference-context.ts');
const {interpretAskQuestion,prepareAskInterpretationRequest}=await import('../app/lib/intelligence/interpret-ask.ts');
const {bindCatalogIntent,beginCatalogHydration}=await import('../app/lib/intelligence/catalog-intent.ts');
const {hydratePlanningCatalog,verifyPlanningCatalogSource}=await import('../app/lib/intelligence/hydrate-planning-catalog.ts');
const {admitAiOperation}=await import('../app/lib/ai/usage-guard/admission.ts');
const {MemoryAiGuardTestStore}=await import('../app/lib/ai/usage-guard/memory-test-store.ts');
const seed=JSON.parse(readFileSync(new URL('./fixtures/ask-catalog-proof-seed.json',import.meta.url),'utf8'));
function setup(){
 const f=fixture('Coat looked clean.');f.context.conversationId=id(8);f.rows.ask_conversation_messages[0].conversation_id=id(8);
 const intent=structuredClone(JSON.parse(seed.sent[1].input).intent);
 Object.assign(intent,{ownerScope:null,sourceTurnId:f.source.id,instructionQuote:f.source.text,authorizationQuote:f.source.text,subjects:[{petName:f.pet.name,sourceTurnId:f.source.id,quote:f.source.text,basis:'selected'}]});
 Object.assign(intent.request,f.request,{writeJob:{...f.proposal,target:null,semantics:{classification:'observation',target:null}}});
 return{f,intent};
}
async function admitted(fn,seedInterpretation=true){
 const a=await admitAiOperation({feature:'ask',userId:id(1),requestId:crypto.randomUUID(),payload:{fixture:'replacement-catalog'},intendedModel:'gpt-5.4-mini',env:{NODE_ENV:'test',FURVISE_AI_DAILY_CALL_LIMIT:'20',FURVISE_AI_DAILY_COST_LIMIT_USD:'1',FURVISE_RATE_LIMIT_HASH_SECRET:'offline-replace-fixture-identity'},store:new MemoryAiGuardTestStore()});
 try{return await a.run(async()=>{if(seedInterpretation){const c=await a.beginProviderCall({model:'gpt-5.4-mini',input:{fixture:'prior interpretation accounting only'},maxOutputTokens:1,stage:'interpretation'});await a.recordProviderUsage(c.reservation,'gpt-5.4-mini',{inputTokens:0,outputTokens:0});}return fn(a);});}finally{await a.release();}
}
test('catalog converts only owned supplied rows to opaque handles after real staged permit',()=>admitted(async()=>{
 const{f,intent}=setup();const calls=[],row={id:id(4),user_id:id(1),pet_profile_id:id(2),note:'Original record.',created_at:'2026-09-20T00:00:00Z',updated_at:'2026-09-20T00:00:00Z',occurred_at:'2026-09-20T00:00:00Z'};
 globalThis.__replaceCatalog={rpc:async(name,args)=>{calls.push({name,args});return{data:[row,{...row,user_id:id(9)},{...row,pet_profile_id:id(9)}],error:null};}};
 const{permit}=bindCatalogIntent(intent,f.context,'owned-catalog',Date.now()+25000);beginCatalogHydration(permit);
 const refs=await loadReplaceReferences(permit);assert.equal(refs.length,1);assert.equal(refs[0].recordId,row.id);assert.notEqual(refs[0].ref,row.id);
 assert.equal(calls[0].name,'list_ask_replace_targets');assert.deepEqual(calls[0].args.p_pet_ids,[id(2)]);
 await assert.rejects(()=>loadReplaceReferences({...permit}));assert.equal(calls.length,1,'forged permit cannot read');
}));
test('unavailable catalog fails closed without guessed exact handles',()=>admitted(async()=>{
 const{f,intent}=setup();let calls=0;globalThis.__replaceCatalog={rpc:async()=>{calls++;return{data:null,error:{message:'Unavailable'}};}};
 const{permit}=bindCatalogIntent(intent,f.context,'unavailable-catalog',Date.now()+25000);beginCatalogHydration(permit);
 await assert.rejects(()=>loadReplaceReferences(permit),/ASK_CATALOG_UNAVAILABLE/);assert.equal(calls,1);
}));
test('same Brain source-free intent then permitted exact selection; Binder owns record/version',()=>admitted(async()=>{
 const{f,intent}=setup();const row={id:id(4),user_id:id(1),pet_profile_id:f.pet.id,note:'Supplied original.',occurred_at:'2026-09-22T00:00:00Z',created_at:'2026-09-22T00:00:00Z',updated_at:'2026-09-22T00:00:00Z'};
 const order=[];let calls=0;globalThis.__replaceCatalog={rpc:async(name)=>{order.push(name);return{data:[row],error:null};}};
 const prepared=prepareAskInterpretationRequest(f.context,'gpt-5.4-mini'),wire=providerFixturePlan(prepared);
 const result=await interpretAskQuestion({context:f.context,model:'gpt-5.4-mini',catalogService:{requestId:'staged-exact',capability:()=>({available:true}),hydrate:permit=>hydratePlanningCatalog(permit,prepared.context,f.db),verify:permit=>verifyPlanningCatalogSource(permit,f.db)},client:{responses:{create:async request=>{
 calls++;order.push('brain-'+calls);const text=JSON.stringify(request);assert.ok(!text.includes(row.id),'opaque provider catalog');
 if(calls===1){assert.ok(!text.includes(row.note));assert.deepEqual(request.text.format.schema,prepared.request.text.format.schema);assert.equal(request.instructions,prepared.request.instructions);assert.equal(request.input,prepared.request.input);return{output_text:JSON.stringify(wire.encode({request:intent})),usage:{input_tokens:0,output_tokens:0}};}
 assert.equal(calls,2);const input=JSON.parse(request.input);assert.equal(input.catalog.evidence[0].body,row.note);assert.notEqual(input.catalog.evidence[0].reference,row.id);
 return{output_text:JSON.stringify({version:'ask-catalog-selection.v1',disposition:'selected',reference:input.catalog.evidence[0].reference}),usage:{input_tokens:0,output_tokens:0}};
 }}}});
 assert.equal(calls,2);assert.deepEqual(order,['brain-1','list_ask_replace_targets','brain-2']);
 assert.equal(result.request.writeJob.target.recordId,id(4));assert.equal(result.request.writeJob.target.updatedAt,row.updated_at);assert.equal(result.request.writeJob.body.text,f.proposal.bodyQuote);
},false));
