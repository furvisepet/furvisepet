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
import {fixture,id} from './helpers/canonical-replace.mjs';
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
 assert.equal(f.caps[0].target_id,id(4));assert.equal(f.caps[0].action_payload.targetSourceId,'care:'+id(4));
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
