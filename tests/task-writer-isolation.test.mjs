import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const digest=s=>createHash('sha256').update(s).digest('hex');
const base='tests/fixtures/task-writer-isolation/';
const identity=JSON.parse(read(base+'identity.json'));
const migration=read('supabase/migrations/20261004233000_guard_canonical_task_writers.sql');
const lock=migration.match(/lock_anchor constant text := \$lock\$([\s\S]*?)\$lock\$/)[1];
const locked=migration.match(/lock_replacement constant text := \$lock\$([\s\S]*?)\$lock\$/)[1];
const branch=migration.match(/branch_anchor constant text := \$branch\$([\s\S]*?)\$branch\$/)[1];
const guarded=migration.match(/branch_replacement constant text := \$branch\$([\s\S]*?)\$branch\$/)[1];
for(const f of identity.functions){
 const before=read(base+f.name+'-before.sql'),after=read(base+f.name+'-after.sql');
 const body=s=>s.split('AS $function$')[1].split('$function$')[0];
 test(f.name+' exact preimage and only two production changes',()=>{
  assert.equal(digest(before),f.beforeSHA256);assert.equal(digest(body(before)),f.beforeBodySHA256);
  assert.equal(before.split(lock).length,2);assert.equal(before.split(branch).length,2);
  assert.equal(before.replace(lock,locked).replace(branch,guarded),after);
  assert.equal(digest(after),f.afterSHA256);assert.equal(digest(body(after)),f.afterBodySHA256);
  for(const h of [f.beforeSHA256,f.afterSHA256,f.beforeBodySHA256,f.afterBodySHA256])assert.ok(migration.includes(h));
 });
 test(f.name+' separate source lock and first non-cancel guard precede every new effect',()=>{
  const veto=after.indexOf('if private.is_canonical_ask_source(p_source_id)');
  assert.ok(after.indexOf(locked)<veto);assert.ok(after.indexOf('if v_task.last_message_id=p_message_id')<veto);
  assert.ok(after.indexOf("if p_intent='cancel' then")<veto);
  for(const effect of ['if p_pet_id is not null then',"set status='superseded'",'insert into public.pet_care_entries','insert into private.ask_tasks'])assert.ok(after.indexOf(effect)>veto,effect);
  assert.equal((after.match(/is_canonical_ask_source\(/g)||[]).length,1);
  assert.ok(after.includes("errcode='42501',message='CANONICAL_ASK_LEGACY_SEMANTICS_FORBIDDEN'"));
  assert.equal(locked,lock.replace('for share;','for update;'));
  assert.doesNotMatch(guarded,/p_message_id|pending|succeeded|action_kind|pet_id\s*=|select/i);
 });
 test(f.name+' whole-source versus selected-span and time contracts remain distinct',()=>{
  const value=f.name.endsWith('v2')?'p_note_text':'p_source_text';
  assert.ok(after.includes('v_entry.note<>'+value));assert.ok(after.includes("'Owner note',"+value));
  if(f.name.endsWith('v2')){
   assert.ok(after.includes("p_intent='cancel' and p_note_text is not null"));
   assert.ok(after.includes('position(p_note_text in p_source_text)=0'));
   assert.ok(after.includes("case when p_explicit_time is null then 'saved_at' else 'explicit' end"));
  }else{assert.ok(after.includes("case when p_occurred_at is null then 'recorded_at' else 'explicit' end"));assert.doesNotMatch(after,/p_note_text/);}
 });
}
test('migration fails closed on absent or unknown signatures and preserves the complete catalog row',()=>{
 assert.equal(identity.functions.length,2);
 for(const key of ['TASK_WRITER_REQUIRED_SIGNATURE_MISSING','TASK_WRITER_UNIQUE_ANCHOR_REQUIRED','TASK_WRITER_EXACT_SOURCE_OR_SECURITY_PRECONDITION','TASK_WRITER_CATALOG_OR_BODY_POSTCONDITION'])assert.ok(migration.includes(key));
 assert.ok(migration.indexOf('TASK_WRITER_REQUIRED_SIGNATURE_MISSING')<migration.indexOf('execute revised'));
 assert.ok(migration.includes("(after_row-array['prosrc','proargdefaults']) is distinct from (before_row-array['prosrc','proargdefaults'])"));
 assert.ok(migration.includes('after_defaults is distinct from before_defaults'));
 assert.ok(migration.includes("has_function_privilege('service_role',fn,'EXECUTE')"));
 assert.ok(migration.includes("has_function_privilege('anon',fn,'EXECUTE')"));
 assert.ok(migration.includes("has_function_privilege('authenticated',fn,'EXECUTE')"));
 assert.doesNotMatch(migration,/create (?:or replace )?function public\.apply_ask_task|grant |revoke |disable trigger|update public\./i);
});
test('native contract has real-role dual dispatch, exact no-effect rejections and independent expiry',()=>{
 const fixture=read('tests/sql/task-writer-isolation-fixture.sql');
 for(const name of ['public.apply_ask_task(','public.apply_ask_task_v2(','execute_ask_action_capability','is_canonical_ask_source'])assert.ok(fixture.includes(name));
 assert.ok(fixture.includes("current_user<>request_role"));assert.ok(fixture.includes('pg_temp.tv2_state()=before'));
 const suite=read('tests/sql/task-writer-isolation-native.sql');
 for(const scenario of ['pending_null_pet','canonical_source_ordinary_current','ordinary_source_canonical_current','later_canonical_resume','later_canonical_replay','later_canonical_cancel','canonical_succeeded','canonical_cancelled','canonical_failed','ordinary_resume','cancelled_replay','owner_negative','role_anon','role_authenticated','source_identity_negative','revision_negative','replay_entry_integrity','v2_cancel_note_negative'])assert.ok(suite.includes("'"+scenario+"'"));
 assert.ok(suite.includes("array['1','2']"));assert.ok(suite.includes('CANONICAL_ASK_LEGACY_SEMANTICS_FORBIDDEN'));
 const expiry=read('tests/sql/task-writer-isolation-expiry.sql');assert.ok(expiry.includes('pg_sleep'));assert.doesNotMatch(expiry,/update public.ask_action_capabilities|set expires_at|disable trigger/i);
 const catalog=read('tests/sql/task-writer-isolation-catalog.sql');assert.ok(catalog.includes('after_catalog=expected_catalog'));assert.ok(catalog.includes('absent V2 no partial patch or invented function'));
});
