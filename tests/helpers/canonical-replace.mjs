import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {existsSync,readFileSync,readdirSync} from 'node:fs';
registerHooks({resolve(s,c,next){
 if(s==='server-only')return {shortCircuit:true,url:'data:text/javascript,export {}'};
 if(s.endsWith('/security/idempotency/admin-client.ts'))return {shortCircuit:true,url:'data:text/javascript,export const createIdempotencyAdminClient=()=>globalThis.__fidelityDB;'};
 if(s.startsWith('.')&&c.parentURL?.startsWith('file:'))for(const suffix of ['.ts','/index.ts']){
  const u=new URL(s+suffix,c.parentURL);if(existsSync(u))return next(u.href,c);
 }
 return next(s,c);
}});
const {validateReplaceJob,readBoundReplaceJob,resolveReplaceJob,replaceJobSchema}=await import('../../app/lib/furvise-brain/replace-job.ts');
const {validateAskRequest}=await import('../../app/lib/intelligence/ask-request-contract.ts');
const {prepareBoundReplaceAction,resolveFurviseActionTargetBindings}=await import('../../app/lib/application-actions/planner.ts');
const {parseStoredApplicationActions}=await import('../../app/lib/application-actions/contracts.ts');
const {createActionCapabilities,executeActionCapability}=await import('../../app/lib/application-actions/capabilities.ts');
const {confirmFurviseWriteReceipt}=await import('../../app/lib/furvise-brain/write-contract.ts');
const id=n=>'12300000-0000-4000-8000-'+String(n).padStart(12,'0');
function fixture(body='  Exact  observation.\n\tSecond line.  '){
 const pet={id:id(2),name:'Subject',user_id:id(1),lifecycle_status:'active'};
 const source={id:id(3),text:'Instruction ?'+body+'?',createdAt:'2026-09-23T00:00:00Z'};
 const proposal={operation:'replace',target:'last_event_for_subject',petName:pet.name,instructionQuote:source.text,bodyQuote:body,constraints:[]};
 const context={owner:{userId:id(1)},pet,eligiblePets:[pet],conversationTurns:[],currentMessage:source.text,currentTurn:{...source,role:'user'}};
 const request={version:'ask-request.v2',mode:'update',mutationIntent:'correct_record',task:null,writeJob:proposal,
  question:source.text,requirements:[],referenceTurnIds:[],evidenceBasis:null,scope:'selected',petNames:[pet.name],
  operation:'general',selection:'latest',quantity:null,topic:'',terms:[],from:null,to:null,episodeTopic:null,ordinal:null,frame:null};
 const job=()=>validateAskRequest(request,context).request.writeJob;
 const queries=[],rpcCalls=[],caps=[];
 const rows={dog_profiles:[pet],ask_conversation_messages:[{id:source.id,user_id:id(1),role:'user',user_text:source.text,created_at:source.createdAt}],
  pet_care_entries:[{id:id(4),user_id:id(1),pet_profile_id:pet.id,created_at:'2026-09-22T00:00:00Z',deleted_at:null,updated_at:'v1'}],
  ask_action_capabilities:caps};
 const state={stale:false};
 const db={from(table){
  let filters=[],order=[],limit=Infinity,insert;
  const q={select(){return q},eq(k,v){filters.push(r=>r[k]===v);queries.push([table,'eq',k,v]);return q},
   is(k,v){return q.eq(k,v)},lte(k,v){filters.push(r=>r[k]<=v);queries.push([table,'lte',k,v]);return q},
   order(k,{ascending}){order.push([k,ascending]);queries.push([table,'order',k]);return q},
   limit(n){limit=n;return q},insert(v){insert=v;return q},
   async result(){if(insert){const row={...insert,id:id(5),status:'pending',receipt:null,expires_at:'2099-01-01T00:00:00Z'};caps.push(row);return {data:row,error:null}}
    let found=rows[table].filter(r=>filters.every(f=>f(r)));
    for(const [k,asc]of order.toReversed())found.sort((a,b)=>String(a[k]).localeCompare(String(b[k]))*(asc?1:-1));
    return {data:found.slice(0,limit)[0]||null,error:null}},
   maybeSingle(){return q.result()},single(){return q.result()}};
  return q;
 },rpc(name,args){rpcCalls.push([name,args]);return {maybeSingle:async()=>{
  const cap=caps.find(c=>c.id===args.p_capability_id&&c.assistant_message_id===args.p_assistant_message_id&&c.user_id===args.p_user_id);
  if(!cap)return {data:null,error:null};
  const status=state.stale?'failed':'succeeded';
  const action={...cap.action_payload,id:cap.id,status,resultMessage:status==='succeeded'?'Edited.':null,errorMessage:state.stale?'Target changed.':null};
  cap.status=status;cap.receipt=action;return {data:{action,changed:!state.stale},error:null};
 }};}};
 globalThis.__fidelityDB=db;
 const prepare=async()=>{const j=job(),resolved=await resolveReplaceJob(j,db,id(1));
  return prepareBoundReplaceAction(j,resolved.target,pet.name,'request')};
 const mint=async(action)=>createActionCapabilities({actions:[action],assistantMessageId:id(6),sourceMessageId:source.id,userId:id(1),supabase:db,
  targetBindings:resolveFurviseActionTargetBindings({actions:[action],referencedRecords:[],targetRecords:[{id:'care:'+id(4),petId:pet.id,sourceType:'care_update'}]})});
 return {pet,source,proposal,context,request,job,prepare,mint,rows,queries,rpcCalls,caps,state,db};
}

export {fixture,id};
