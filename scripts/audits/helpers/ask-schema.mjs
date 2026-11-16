// Disposable schema integration: applies every repository migration except the
// hosted pg_cron/pg_net worker scheduler, unavailable in PostgreSQL/WASM.
import { readFileSync, readdirSync } from 'node:fs';
export async function initializeAskSchema(db, {existingRoles=false,afterMigration}={}) {
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

for(const file of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql') && !f.endsWith('_schedule_owner_note_enrichment.sql')).sort()) {
 // Git SQL is LF; normalize Windows checkout newlines before exact body-hash guards.
 try {
  await db.exec('begin;\n'+readFileSync(`supabase/migrations/${file}`,'utf8').replace(/\r\n/g,'\n')+'\ncommit;');
 } catch (error) {
  throw new Error(`Migration ${file} failed (${error.code || 'unknown SQLSTATE'}): ${error.message}`, {cause:error});
 }
 await db.query('insert into supabase_migrations.schema_migrations(version,name) values($1,$2)',[file.split('_')[0],file.replace(/^\d+_|\.sql$/g,'')]);
 migrations++;
 if(afterMigration) await afterMigration(file);
}

 return migrations;
}
