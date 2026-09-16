// Run with FURVISE_PGLITE_MODULE pointing to @electric-sql/pglite's dist/index.js.
// Disposable PostgreSQL engine; never connects to a hosted project.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const modulePath=process.env.FURVISE_PGLITE_MODULE || '@electric-sql/pglite';
const native=process.argv.includes('--docker');
const fullSchema=native || process.argv.includes('--full-schema');
const extensions={};
if(fullSchema && !native) {
 const {pathToFileURL}=await import('node:url');
 const base=modulePath.startsWith('/') ? pathToFileURL(modulePath) : import.meta.resolve(modulePath);
 for(const name of ['pgcrypto','pg_trgm','uuid_ossp']) extensions[name]=(await import(new URL(`contrib/${name}.js`,base)))[name];
}
const db = native ? (await import('./helpers/docker-postgres.mjs')).dockerPostgres() : new (await import(modulePath)).PGlite({extensions});
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
if(fullSchema) {
 const {initializeAskSchema}=await import('./helpers/ask-schema.mjs');
 console.log(`${await initializeAskSchema(db,{existingRoles:native})} repository migrations applied; hosted scheduler excluded`);
 await db.exec("set request.jwt.claim.role='service_role'");
} else {
await db.exec(`create role anon; create role authenticated; create role service_role;
create schema auth; create schema private;
create table auth.users(id uuid primary key);
create table public.dog_profiles(id uuid primary key,user_id uuid,name text,lifecycle_status text default 'active');
create table public.ask_conversations(id uuid primary key,user_id uuid,pet_profile_id uuid,title text);
create table public.ask_conversation_messages(id uuid primary key,conversation_id uuid,user_id uuid,role text,user_text text,response_data jsonb,created_at timestamptz default now(),request_id uuid,sequence_number bigint);
create table public.pet_care_entries(id uuid primary key default gen_random_uuid(),user_id uuid,pet_profile_id uuid,category text,title text,note text,occurred_at timestamptz,created_at timestamptz default now(),deleted_at timestamptz,deletion_reason text,intelligence_source_message_id uuid,intelligence_request_id uuid,intelligence_source_type text,care_event_metadata jsonb);
create function private.require_service_role_request() returns void language plpgsql as $$ begin
if current_setting('request.jwt.claim.role',true) is distinct from 'service_role' then raise exception using errcode='42501',message='SERVICE_ONLY'; end if; end $$;
set request.jwt.claim.role='service_role';`);
await db.exec(readFileSync(new URL('../../supabase/migrations/20260915063244_decouple_owner_note_persistence.sql', import.meta.url), 'utf8'));
await db.exec(readFileSync(new URL('../../supabase/migrations/20260916020025_ask_task_continuation.sql', import.meta.url), 'utf8'));
}
await db.query('insert into auth.users(id) values ($1),($2)', [id(1),id(2)]);
await db.query('insert into dog_profiles(id,user_id,name) values ($1,$2,$3),($4,$5,$6)',[id(10),id(1),'Sable',id(11),id(2),'Other owner']);
await db.query("insert into ask_conversations(id,user_id,pet_profile_id,title) values ($1,$2,$3,'Task continuation audit')",[id(20),id(1),id(10)]);
async function message(n,text) { await db.query('insert into ask_conversation_messages(id,conversation_id,user_id,role,user_text,created_at,request_id,sequence_number) values($1,$2,$3,\'user\',$4,\'2026-09-15T20:00:00Z\',$1,$5)',[id(n),id(20),id(1),text,n]); }
async function apply(n,source,text,{intent='save',pet=null,task=null,revision=null,user=id(1),requiresAnswer=false}={}) {
 return (await db.query('select apply_ask_task($1,$2,$3,$4,$5,$6,$7,$8,$9,null,null,$10) as result',[user,id(20),id(n),intent,id(source),text,pet,task,revision,requiresAnswer])).rows[0].result;
}
let checks=0;
await message(30,'so i gave him medicine yesterday');
await message(31,'put that in notes');
const pending=await apply(31,30,'so i gave him medicine yesterday');
assert.equal(pending.status,'awaiting_subject');checks++;
assert.equal((await db.query('select count(*)::int as n from pet_care_entries')).rows[0].n,0);checks++;
const loaded=(await db.query('select read_ask_task_context($1,$2) as task',[id(1),id(20)])).rows[0].task.pendingTask;
assert.equal(loaded.source.text,'so i gave him medicine yesterday');checks++;
// More turns than the interpreter's ordinary dialogue window cannot erase a task.
for(let n=32;n<43;n++)await message(n,'Unrelated discussion');
await message(43,'Sable');
await assert.rejects(apply(43,30,'so i gave him medicine yesterday',{intent:'resume',pet:id(11),task:pending.id,revision:1}),/ASK_TASK_PET_NOT_OWNED/);checks++;
await assert.rejects(apply(43,30,'Invented dose',{intent:'resume',pet:id(10),task:pending.id,revision:1}),/ASK_TASK_SOURCE_MISMATCH/);checks++;
await assert.rejects(apply(43,30,'so i gave him medicine yesterday',{intent:'resume',pet:id(10),task:pending.id,revision:2}),/ASK_TASK_REVISION_CONFLICT/);checks++;
const saved=await apply(43,30,'so i gave him medicine yesterday',{intent:'resume',pet:id(10),task:pending.id,revision:1});
assert.equal(saved.status,'completed');checks++;
const replay=await apply(43,30,'so i gave him medicine yesterday',{intent:'resume',pet:id(10),task:pending.id,revision:1});
assert.equal(replay.entryId,saved.entryId);checks++;
assert.equal((await db.query('select count(*)::int as n from pet_care_entries')).rows[0].n,1);checks++;
const row=(await db.query('select * from pet_care_entries')).rows[0];
assert.equal(row.note,'so i gave him medicine yesterday');assert.equal(row.intelligence_source_message_id,id(30));
assert.equal(row.care_event_metadata.authorizationMessageId,id(31));checks++;
const receiptContext=(await db.query('select read_ask_task_context($1,$2,$3::uuid[]) as result',[id(1),id(20),[id(31),id(43)]])).rows[0].result;
assert.equal(receiptContext.receipts.length,2);assert.ok(receiptContext.receipts.every(r=>r.record.id===saved.entryId));checks++;

assert.equal((await db.query('select count(*)::int as n from owner_note_jobs')).rows[0].n,1);checks++;
await message(44,'another owner observation');await message(45,'retain the previous observation');
const second=await apply(45,44,'another owner observation');
await message(46,'forget it');
const cancelled=await apply(46,44,'another owner observation',{intent:'cancel',task:second.id,revision:1});
assert.equal(cancelled.status,'cancelled');checks++;
await message(47,'Sable');
await assert.rejects(apply(47,44,'another owner observation',{intent:'resume',pet:id(10),task:second.id,revision:1}),/ASK_TASK_REVISION_CONFLICT/);checks++;
await assert.rejects(apply(45,44,'another owner observation'),/ASK_TASK_STALE_TURN/);checks++;
await assert.rejects(apply(47,44,'another owner observation',{pet:id(10),user:id(2)}),/ASK_TASK_NOT_OWNED/);checks++;
await db.query("update pet_care_entries set deleted_at=now(),deletion_reason='Owner deleted test entry' where id=$1",[saved.entryId]);
await assert.rejects(apply(43,30,'so i gave him medicine yesterday',{intent:'resume',pet:id(10),task:pending.id,revision:1}),/ASK_TASK_SOURCE_CHANGED/);checks++;
// Supersession binds the new source to its own authorization, not the old task.
await message(50,'first pending source');await message(51,'save it');
const superseded=await apply(51,50,'first pending source');
await message(52,'replacement source');await message(53,'save the replacement');
const replacement=await apply(53,52,'replacement source',{pet:id(10),task:superseded.id,revision:1});
assert.equal((await db.query('select care_event_metadata from pet_care_entries where id=$1',[replacement.entryId])).rows[0].care_event_metadata.authorizationMessageId,id(53));checks++;
assert.equal((await db.query('select status from private.ask_tasks where id=$1',[superseded.id])).rows[0].status,'superseded');checks++;
// Ownership must be current even on exact replay and receipt reads.
await db.query('update dog_profiles set user_id=$1 where id=$2',[id(2),id(10)]);
await assert.rejects(apply(53,52,'replacement source',{pet:id(10),task:superseded.id,revision:1}),/ASK_TASK_SOURCE_CHANGED/);checks++;
assert.equal((await db.query('select read_ask_task_context($1,$2,$3::uuid[]) as result',[id(1),id(20),[id(53)]])).rows[0].result.receipts.length,0);checks++;
await db.query('update dog_profiles set user_id=$1 where id=$2',[id(1),id(10)]);
// Saving does not complete a mixed request; both obligations survive restart.
await message(54,'he rested in the hammock');await message(55,'save it and compare with his old notes');
const mixed=await apply(55,54,'he rested in the hammock',{requiresAnswer:true});
const mixedContext=(await db.query('select read_ask_task_context($1,$2) as result',[id(1),id(20)])).rows[0].result.pendingTask;
assert.equal(mixedContext.requiresAnswer,true);assert.equal(mixedContext.request.text,'save it and compare with his old notes');checks++;
await message(56,'Sable');
const partial=await apply(56,54,'he rested in the hammock',{intent:'resume',pet:id(10),task:mixed.id,revision:1});
assert.equal(partial.status,'awaiting_answer');checks++;
const mixedStatus=async()=> (await db.query('select status from private.ask_tasks where id=$1',[mixed.id])).rows[0].status;
assert.equal(await mixedStatus(),'awaiting_answer','no assistant message is not an answer receipt');checks++;
await db.query("insert into ask_conversation_messages(id,conversation_id,user_id,role,request_id,sequence_number,response_data) values($1,$2,$3,'furvise',$4,57,$5)",[id(57),id(20),id(1),id(56),JSON.stringify({turn:{finalStage:'COMPLETED',taskOutcome:'limited',answerOutcome:'limited'}})]);
assert.equal(await mixedStatus(),'awaiting_answer','a persisted limited answer does not complete the task');checks++;
await db.exec('begin');
await db.query('update ask_conversation_messages set response_data=$1 where id=$2',[JSON.stringify({turn:{finalStage:'COMPLETED',taskOutcome:'complete',answerOutcome:'complete'}}),id(57)]);
assert.equal(await mixedStatus(),'completed');
await db.exec('rollback');
assert.equal(await mixedStatus(),'awaiting_answer','task completion rolls back with response finalization');checks++;
await db.query('update ask_conversation_messages set response_data=$1 where id=$2',[JSON.stringify({turn:{finalStage:'COMPLETED',taskOutcome:'complete',answerOutcome:'complete'}}),id(57)]);
assert.equal(await mixedStatus(),'completed');checks++;
assert.equal((await db.query('select read_ask_task_context($1,$2) as result',[id(1),id(20)])).rows[0].result.pendingTask,null);checks++;
for(const role of ['anon','authenticated']) {
 const privileges=(await db.query("select has_function_privilege($1,'public.apply_ask_task(uuid,uuid,uuid,text,uuid,text,uuid,uuid,integer,timestamptz,text,boolean)','execute') as allowed",[role])).rows[0];
 assert.equal(privileges.allowed,false);checks++;
}
assert.equal((await db.query("select relrowsecurity from pg_class where oid='private.ask_tasks'::regclass")).rows[0].relrowsecurity,true);checks++;
if(native) {
 // Two actual server connections race the same authorized save under the real
 // service role. Neither may duplicate the note or the enrichment outbox job.
 await message(60,'Sable rested by the window');await message(61,'save that');
 const other=(await import('./helpers/docker-postgres.mjs')).dockerPostgres();
 try {
  await db.exec('set role service_role;');
  await other.exec("set role service_role; set request.jwt.claim.role='service_role';");
  const args=[id(1),id(20),id(61),'save',id(60),'Sable rested by the window',id(10),null,null,false];
  const statement='select apply_ask_task($1,$2,$3,$4,$5,$6,$7,$8,$9,null,null,$10) as result';
  const results=await Promise.all([db.query(statement,args),other.query(statement,args)]);
  assert.equal(results[0].rows[0].result.entryId,results[1].rows[0].result.entryId);checks++;
  await db.exec('reset role;');
  assert.equal((await db.query('select count(*)::int as n from pet_care_entries where intelligence_source_message_id=$1',[id(60)])).rows[0].n,1);checks++;
  assert.equal((await db.query('select count(*)::int as n from owner_note_jobs where entry_id=$1',[results[0].rows[0].result.entryId])).rows[0].n,1);checks++;
 } finally {await other.close();}
}
await db.close();
console.log(`${checks} PostgreSQL continuation assertions passed`);
