// Fresh disposable replay only. Never accepts a database URL or hosted credentials.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { initializeAskSchema } from './helpers/ask-schema.mjs';
const engine = process.env.FURVISE_PGLITE_MODULE || '@electric-sql/pglite';
const base = import.meta.resolve(engine);
const extensions = {};
for (const name of ['pgcrypto','pg_trgm','uuid_ossp']) extensions[name] = (await import(new URL(`contrib/${name}.js`,base)))[name];
const db = new (await import(engine)).PGlite({extensions});
const filename = '20260919083800_ask_task_note_span_v2.sql';
const signature = 'public.apply_ask_task_v2(uuid,uuid,uuid,text,uuid,text,text,uuid,uuid,integer,timestamptz,text,boolean)';
const source = readFileSync(new URL(`../../supabase/migrations/${filename}`,import.meta.url),'utf8');
assert.equal(createHash('sha256').update(source).digest('hex'),'f353a44bd72fdfcfaaabcc69206a79e54d5a7c8a62a19cfcd9fe287c0a25f071');
const snapshot = async () => (await db.query(`select pg_get_userbyid(proowner) as owner, prosecdef, proconfig, proacl::text,
 encode(sha256(convert_to(prosrc,'UTF8')),'hex') as body_hash,
 encode(sha256(convert_to(pg_get_functiondef(oid),'UTF8')),'hex') as definition_hash
 from pg_proc where oid=$1::regprocedure`,[signature])).rows[0];
let recoveryChecks = 0;
try {
 const count = await initializeAskSchema(db,{afterMigration:async (file) => {
  if(file !== filename) return;
  const before = await snapshot();
  assert.equal(before.body_hash,'9f2c87b6662c434ba4e9b168090bb32375ddc17be13e2eee76aaab9306ac53ca');recoveryChecks++;
  assert.equal(before.definition_hash,'d8708ff8f15a62b19dabf3b96463fb4afa314f9f10bab9079dde2ff721753a10');recoveryChecks++;
  // Idempotent at its historical position; never rerun this preimage after later guards.
  await db.exec('begin;\n'+source+'\ncommit;');
  assert.deepEqual(await snapshot(),before);recoveryChecks++;
 }});
 const final = await snapshot();
 assert.equal(final.owner,'postgres');recoveryChecks++;
 assert.equal(final.prosecdef,true);recoveryChecks++;
 assert.deepEqual(final.proconfig,['search_path=""']);recoveryChecks++;
 assert.equal(final.body_hash,'82d9c2841051260b3945c0a16f1c79b71b78dd7c96b23e062805a7eb294d28f3');recoveryChecks++;
 assert.equal(final.definition_hash,'c11e687c88b11c68158e66c671a7b39c01e80dcf558af5d85e107e0f0ae2fdf2');recoveryChecks++;
 for(const role of ['anon','authenticated','service_role']) {
  const row=(await db.query('select has_function_privilege($1,$2,\'execute\') as allowed',[role,signature])).rows[0];
  assert.equal(row.allowed,role==='service_role');recoveryChecks++;
 }
 const rls=(await db.query("select relrowsecurity from pg_class where oid='private.ask_tasks'::regclass")).rows[0];
 assert.equal(rls.relrowsecurity,true);recoveryChecks++;
 const care=(await db.query("select pg_get_functiondef('public.update_my_care_entry(uuid,uuid,timestamptz,text,text,text,text,timestamptz)'::regprocedure) as definition")).rows[0].definition;
 assert.equal((care.match(/errcode = 'PT409'/g)||[]).length,2);recoveryChecks++;
 assert.doesNotMatch(care,/errcode = '40001'/);recoveryChecks++;
 // The final reconciliation is idempotent and cannot regress the live incident contract.
 await db.exec(readFileSync(new URL('../../supabase/migrations/20261113101617_reconcile_care_entry_stale_conflict_no_retry.sql',import.meta.url),'utf8'));
 assert.equal((await db.query("select pg_get_functiondef('public.update_my_care_entry(uuid,uuid,timestamptz,text,text,text,text,timestamptz)'::regprocedure) as definition")).rows[0].definition,care);recoveryChecks++;
 console.log(`${count} repository migrations replayed; hosted scheduler excluded as documented by initializeAskSchema`);
 console.log(`${recoveryChecks} recovery, live-definition parity, grants, RLS and PT409 assertions passed`);
} finally { await db.close(); }
