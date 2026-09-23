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
const {validateReplaceJob,readBoundReplaceJob,resolveReplaceJob,replaceJobSchema}=await import('../app/lib/furvise-brain/replace-job.ts');
const {validateAskRequest}=await import('../app/lib/intelligence/ask-request-contract.ts');
const {prepareBoundReplaceAction,resolveFurviseActionTargetBindings}=await import('../app/lib/application-actions/planner.ts');
const {parseStoredApplicationActions}=await import('../app/lib/application-actions/contracts.ts');
const {createActionCapabilities,executeActionCapability}=await import('../app/lib/application-actions/capabilities.ts');
const {confirmFurviseWriteReceipt}=await import('../app/lib/furvise-brain/write-contract.ts');
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
test('1000-character canonical replacement is accepted; provenance bounds stay 1600',()=>{
 const f=fixture('x'.repeat(1000));assert.equal(f.job().body.text.length,1000);
 const schema=replaceJobSchema.anyOf[1].properties;
 assert.equal(schema.bodyQuote.maxLength,1000);assert.equal(schema.instructionQuote.maxLength,1600);
 assert.equal(schema.constraints.items.properties.quote.maxLength,1600);
});
for(const n of [1001,1223])test(String(n)+'-character body rejects before action creation',()=>{
 const f=fixture('x'.repeat(n));assert.throws(f.job,/write_job/);
 assert.throws(()=>validateReplaceJob(f.proposal,f.source,f.pet),/write_job/);assert.equal(f.caps.length,0);
});
for(const [name,body]of [['leading','   Observation.'],['trailing','Observation.   '],['internal','First  line.\n\tSecond   line.'],['unicode',' e\u0301 / \u732b / \u00e9 / \ud83d\udc3e  ']]){
 test(name+' body remains exact through binding, resolution, construction and stored action roundtrip',async()=>{
  const f=fixture(body),action=await f.prepare(),parsed=parseStoredApplicationActions(JSON.parse(JSON.stringify([action])));
  assert.equal(parsed.length,1);assert.equal(parsed[0].input.detail,body);
  assert.deepEqual(parsed[0].replaceJob,f.job());assert.deepEqual(readBoundReplaceJob(parsed[0].replaceJob),f.job());
 });
}
for(const name of ['body','kind','pet','source','other-job','span','selector','constraint']){
 test('stored canonical replacement rejects changed '+name,async()=>{
  const f=fixture(),action=await f.prepare();
  if(name==='body')action.input.detail+='x';
  if(name==='kind')action.kind='care_history.add';
  if(name==='pet')action.petId=id(9);
  if(name==='source')action.sourceMessageId=id(9);
  if(name==='other-job')action.appendJob={};
  if(name==='span')action.replaceJob={...action.replaceJob,body:{...action.replaceJob.body,end:999}};
  if(name==='selector')action.replaceJob={...action.replaceJob,target:'any_record'};
  if(name==='constraint')action.replaceJob={...action.replaceJob,constraints:{...action.replaceJob.constraints,allowAdditionalCopy:true}};
  assert.deepEqual(parseStoredApplicationActions([action]),[]);
 });
}
test('canonical capability rebinds exact source job without English command recognition',async()=>{
 const f=fixture(),action=await f.prepare(),[cap]=await f.mint(action);
 assert.equal(cap.status,'proposed');assert.equal(cap.explicitIntent,false);
 assert.deepEqual(cap.replaceJob,f.job());assert.equal(cap.input.detail,f.proposal.bodyQuote);
 assert.equal(f.caps[0].target_id,id(4));assert.equal(f.caps[0].action_payload.targetSourceId,undefined);
});
test('capability mint rejects an authoritative source change',async()=>{
 const f=fixture(),action=await f.prepare();f.rows.ask_conversation_messages[0].user_text='Different source.';
 await assert.rejects(f.mint(action),/write_job|SOURCE_MISMATCH/);assert.equal(f.caps.length,0);
});
test('capability mint rejects changed source time instead of rebinding meaning',async()=>{
 const f=fixture(),action=await f.prepare();f.rows.ask_conversation_messages[0].created_at='2026-09-24T00:00:00Z';
 await assert.rejects(f.mint(action),/SOURCE_MISMATCH/);assert.equal(f.caps.length,0);
});
test('wrong target binding rejects before mint',async()=>{
 const f=fixture(),action=await f.prepare();
 await assert.rejects(createActionCapabilities({actions:[action],assistantMessageId:id(6),sourceMessageId:f.source.id,userId:id(1),supabase:f.db,
 targetBindings:{[action.id]:id(9)}}),/TARGET_MISMATCH/);assert.equal(f.caps.length,0);
});
test('confirmation uses the existing capability target and never reselects latest',async()=>{
 const f=fixture(),action=await f.prepare(),[cap]=await f.mint(action);
 f.rows.pet_care_entries.push({...f.rows.pet_care_entries[0],id:id(9),created_at:'2026-09-25T00:00:00Z'});
 f.queries.length=0;
 const result=await executeActionCapability({capabilityId:cap.id,assistantMessageId:id(6),userId:id(1),mode:'confirm'});
 assert.equal(result.action.status,'succeeded');assert.equal(result.action.input.detail,f.proposal.bodyQuote);
 assert.equal(f.caps[0].target_id,id(4));assert.ok(f.queries.every(([table])=>table==='ask_action_capabilities'));
 assert.equal(f.rpcCalls[0][1].p_capability_id,cap.id);
});
test('failed stale-target receipt stays failed without selecting a different record',async()=>{
 const f=fixture(),[cap]=await f.mint(await f.prepare());f.state.stale=true;f.queries.length=0;
 const result=await executeActionCapability({capabilityId:cap.id,assistantMessageId:id(6),userId:id(1),mode:'confirm'});
 assert.equal(result.action.status,'failed');assert.equal(result.changed,false);assert.equal(f.caps[0].target_id,id(4));
 assert.ok(f.queries.every(([table])=>table==='ask_action_capabilities'));
});
for(const change of ['body','job','capability','source'])test('receipt rejects changed '+change,async()=>{
 const f=fixture(),authorized={...await f.prepare(),id:id(5)},receipt={...structuredClone(authorized),status:'succeeded'};
 if(change==='body')receipt.input.detail+='x';
 if(change==='job')receipt.replaceJob.asOf='2026-09-24T00:00:00Z';
 if(change==='capability')receipt.id=id(9);
 if(change==='source')receipt.sourceMessageId=id(9);
 assert.throws(()=>confirmFurviseWriteReceipt({operationId:authorized.id,authorized,returned:receipt,persistedStatus:'succeeded',persistedReceipt:receipt}),/UNCONFIRMED/);
});
test('forward SQL preserves governance and append behavior; only exact edit-value semantics change',()=>{
 const dir=new URL('../supabase/migrations/',import.meta.url),files=readdirSync(dir);
 const file=files.find(f=>f.endsWith('_preserve_canonical_replace_body_fidelity.sql'));assert.ok(file);
 assert.ok(file>'20260923035225_canonical_append_items.sql');
 const read=f=>readFileSync(new URL(f,dir),'utf8').replace(/\r\n/g,'\n');
 const sql=read(file),start=sql.indexOf("  elsif v_error is null and v.action_kind in ('care_history.edit', 'care_history.remove') then");
 const end=sql.indexOf("  elsif v_error is null and v.action_kind in ('care_state.resolve', 'care_state.reopen') then",start),edit=sql.slice(start,end);
 assert.match(edit,/v_detail := v\.action_payload#>>'\{input,detail\}';/);
 assert.match(edit,/v_detail is null or btrim\(v_detail\) = ''/);
 assert.match(edit,/elsif char_length\(v_detail\) > 1000 then/);
 assert.match(edit,/note=v_detail,/);assert.doesNotMatch(edit,/note=left|v_detail := .*btrim/);
 assert.match(edit,/v_entry\.updated_at is distinct from v\.target_updated_at/);
 assert.match(edit,/where id=v\.target_id and user_id=v\.user_id and pet_profile_id=v\.pet_profile_id/);
 assert.match(edit,/updated_at = v\.target_updated_at/);
 // Compare the complete remaining function, including ownership, confirmation,
 // receipts and permissions, against the repository predecessor + append branch.
 const marker='create or replace function private.execute_ask_action_capability(';
 const previous=read('20260912042534_authorize_ask_actions_by_validated_turn_subject.sql');
 let expected=previous.slice(previous.indexOf(marker)).trim();
 const append=read('20260923035225_canonical_append_items.sql').match(/new_branch text := \$branch\$\n([\s\S]*?)\$branch\$;/)[1];
 expected=expected.replace("  if v_error is null and v.action_kind = 'care_history.add' then",append);
 const oldStart=expected.indexOf("  elsif v_error is null and v.action_kind in ('care_history.edit', 'care_history.remove') then");
 const oldEnd=expected.indexOf("  elsif v_error is null and v.action_kind in ('care_state.resolve', 'care_state.reopen') then",oldStart);
 const restored=sql.slice(sql.indexOf(marker),start)+expected.slice(oldStart,oldEnd)+sql.slice(end);
 assert.equal(restored.trim(),expected);
});
