// Disposable schema integration: applies every repository migration except the
// hosted pg_cron/pg_net worker scheduler, unavailable in PostgreSQL/WASM.
import { readFileSync, readdirSync } from 'node:fs';
export async function initializeAskSchema(db, {existingRoles=false}={}) {
 let migrations=0;
await db.exec(`
${existingRoles ? '' : `create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create role authenticator nologin noinherit; create role supabase_admin superuser nologin;
grant anon,authenticated,service_role to authenticator;`}
create schema auth; create schema extensions; create schema supabase_migrations;
create extension pgcrypto with schema extensions; create extension "uuid-ossp" with schema extensions;
create table supabase_migrations.schema_migrations(version text primary key, name text, statements text[]);
create table auth.users(id uuid primary key, aud text, role text, email text, encrypted_password text,
 email_confirmed_at timestamptz, phone_confirmed_at timestamptz, raw_app_meta_data jsonb, raw_user_meta_data jsonb,
 is_anonymous boolean default false, created_at timestamptz, updated_at timestamptz, deleted_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function auth.role() returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;
create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
grant usage on schema auth, public, extensions to anon,authenticated,service_role;
grant execute on all functions in schema auth to anon,authenticated,service_role;
`);

// Historical migration recovered from commit d5513439577eb109e2075466acfa3b02291b41f6.
 // CI-only fixture: never add this historical artifact to the live migration chain.
const historical = '20260919083800_ask_task_note_span_v2.sql';
const files = readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql') && !f.endsWith('_schedule_owner_note_enrichment.sql'));
if (!files.includes(historical)) files.push(historical);
for(const file of files.sort()) {
 const path = file === historical && !readdirSync('supabase/migrations').includes(historical)
  ? new URL('../fixtures/' + historical, import.meta.url) : `supabase/migrations/${file}`;
 // The task-writer guard hashes the historical LF source; Windows checkout may use CRLF.
 const sql = readFileSync(path,'utf8');
 const canonical = ['20260916020025_ask_task_continuation.sql',historical,'20261004233000_guard_canonical_task_writers.sql'].includes(file) ? sql.replace(/\r\n/g,'\n') : sql;
 await db.exec('begin;\n'+canonical+'\ncommit;');
 await db.query('insert into supabase_migrations.schema_migrations(version,name) values($1,$2)',[file.split('_')[0],file.replace(/^\d+_|\.sql$/g,'')]);
 migrations++;
}

 return migrations;
}
