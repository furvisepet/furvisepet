import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {existsSync,readFileSync} from 'node:fs';
registerHooks({resolve(s,c,next){
 if(s==='server-only')return {shortCircuit:true,url:'data:text/javascript,export {}'};
 if(s.endsWith('/security/idempotency/admin-client.ts'))return {shortCircuit:true,url:'data:text/javascript,export const createIdempotencyAdminClient=()=>globalThis.__suggestionDb;'};
 if(s.startsWith('.')&&c.parentURL?.startsWith('file:'))for(const ext of ['.ts','.mjs']){const u=new URL(s+ext,c.parentURL);if(existsSync(u))return next(u.href,c);}
 return next(s,c);
}});
const {validateAppendJob}=await import('../../app/lib/furvise-brain/append-job.ts');
const {validateReplaceJob}=await import('../../app/lib/furvise-brain/replace-job.ts');
const {bindStateTransitionJob}=await import('../../app/lib/furvise-brain/state-transition-job.ts');
const {bindFieldMutationJob}=await import('../../app/lib/furvise-brain/field-mutation-job.ts');
const {getFurviseActionPolicy}=await import('../../app/lib/application-actions/policy.ts');
const {canonicalSuggestionJob,suggestionMatchesCapability,canonicalSuggestionSucceeded}=await import('../../app/lib/intelligence/canonical-suggestion.ts');
const {continueCanonicalSuggestion,persistCanonicalSuggestions}=await import('../../app/lib/intelligence/canonical-suggestion-continuation.ts');
const {reconcileAskSuggestions}=await import('../../app/lib/ask-conversation-server.ts');
const {persistPendingSuggestion}=await import('../../app/lib/intelligence/persist-pending-suggestion.ts');
const id=n=>'c2000000-0000-4000-8000-'+String(n).padStart(12,'0'),owner=id(1),pet=id(2),cap=id(3),assistant=id(4),sourceId=id(5),conversation=id(6);
function fixture(kind='append'){
 const text=kind==='append'?'Record:  2024-02-03: Exact observation.  ':kind==='replace'?'Replace the selected record with:  Exact replacement.  ':kind==='state_transition'?'Resolve the selected concern.':'Prefer metric units.';
 const source={id:sourceId,role:'user',text,createdAt:'2026-09-20T12:00:00Z'},pets=[{id:pet,user_id:owner,name:'Subject'}];
 const job=kind==='append'?validateAppendJob({operation:'append',petName:'Subject',items:[{bodyQuote:'  2024-02-03: Exact observation.  ',dateQuote:'2024-02-03',occurredAt:'2024-02-03T00:00:00Z'}],companionQuote:null},source,pets,owner):
 kind==='replace'?validateReplaceJob({operation:'replace',target:'last_event_for_subject',petName:'Subject',instructionQuote:text.trim(),bodyQuote:'  Exact replacement.  ',constraints:[]},source,pets[0]):
 kind==='state_transition'?bindStateTransitionJob({domain:'care_concern',operation:'transition',targetRef:'owned-handle',petName:'Subject',toState:'resolved',authorizationQuote:text},{source,pets,ownerId:owner,references:[{ref:'owned-handle',ownerId:owner,petId:pet,concernId:id(10),status:'active',title:'Existing concern'}]}):
 bindFieldMutationJob({domain:'owner_preference',operation:'set_field',petName:null,field:'preferred_units',instructionQuote:text,valueQuote:'metric'},source,pets,owner);
 const actionKind={append:'care_history.add',replace:'care_history.edit',state_transition:'care_state.resolve',owner_preference:'memory.set_preference'}[kind];
 const key={append:'appendJob',replace:'replaceJob',state_transition:'stateTransitionJob',owner_preference:'fieldMutationJob'}[kind];
 const action={...getFurviseActionPolicy(actionKind),id:id(20)+':action',kind:actionKind,petId:pet,sourceMessageId:sourceId,
 [key]:job,input:{field:kind==='owner_preference'?'preferred_units':null,value:kind==='owner_preference'?'metric':null,title:null,detail:kind==='replace'?job.body.text:null,category:null,target:'specified'},
 evidence:text,explicitIntent:kind==='state_transition',status:'proposed',label:'Prepared action',description:'Exact canonical operation',href:null,resultMessage:null,errorMessage:null};
 const c={id:cap,user_id:owner,pet_profile_id:pet,assistant_message_id:assistant,source_message_id:sourceId,
 target_id:kind==='state_transition'?id(10):kind==='replace'?id(11):null,target_updated_at:['replace','state_transition'].includes(kind)?'2026-09-19T00:00:00+00:00':null,
 action_payload:action,status:'pending',receipt:null,terminal_at:null,expires_at:'2099-01-01T00:00:00Z'};
 const s={id:id(7),user_id:owner,pet_profile_id:pet,conversation_id:conversation,source_message_id:assistant,
 canonical_capability_id:cap,canonical_payload:{version:1,kind,job,capabilityId:cap,sourceMessageId:sourceId,targetId:c.target_id,targetUpdatedAt:c.target_updated_at},
 invalidated_at:null,type:kind==='state_transition'?'concern_resolution':'history',title:'Display',details:'Display only',status:'pending'};
 return JSON.parse(JSON.stringify({source,pets,c,s}));
}
const response=data=>({maybeSingle:async()=>({data,error:null}),single:async()=>({data,error:null}),then:resolve=>Promise.resolve({data,error:null}).then(resolve)});
function harness(f){
 const calls=[],queries=[];
 const db={from(table){const filters=[];const q={select(){return q},eq(k,v){filters.push([k,v]);return q},in(){return q},
 maybeSingle:async()=>{queries.push({table,filters});return {data:table==='ask_action_capabilities'?f.c:table==='ask_conversation_messages'?{user_text:f.source.text,created_at:f.source.createdAt}:table==='dog_profiles'?{name:'Subject'}:null,error:null}},
 returns:async()=>({data:[f.c],error:null})};return q;},
 rpc(name,args){calls.push({name,args});
 if(name==='persist_ask_canonical_suggestion')return response(f.s);
 assert.equal(name,'execute_ask_canonical_suggestion');
 assert.equal(args.p_capability_id,f.c.id);
 assert.equal(args.p_suggestion_id,f.s.id);
 const changed=f.c.status==='pending'&&canonicalSuggestionJob(f.c.action_payload).kind!=='owner_preference';
 if(f.c.status==='pending'){f.c.status=changed?'succeeded':'failed';f.c.terminal_at='2026-09-23T00:00:00Z';
 f.c.receipt={...structuredClone(f.c.action_payload),id:f.c.id,status:f.c.status,resultMessage:changed?'Executed.':null,errorMessage:changed?null:'That action is not available yet.'};}
 return response({action:f.c.receipt,changed});
 }};
 globalThis.__suggestionDb=db;
 return {db,calls,queries,run:()=>continueCanonicalSuggestion({suggestion:f.s,supabase:db,authority:db,userId:owner})};
}

export {fixture,harness,id,owner,pet,cap,sourceId,continueCanonicalSuggestion,persistCanonicalSuggestions,canonicalSuggestionSucceeded,reconcileAskSuggestions,persistPendingSuggestion};
