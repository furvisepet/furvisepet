// Explicit opt-in PostgreSQL/WASM correctness checks. No remote database or provider.
// Install PGlite 0.5.8 in a separate temporary prefix; see the readiness report.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const packageDir=process.env.FURVISE_PGLITE_PACKAGE_DIR;
const dataDir=process.env.FURVISE_EMBEDDED_POSTGRES_DIR;
assert.ok(packageDir && dataDir,'Explicit local package and NEW database directories required');
assert.equal(existsSync(dataDir),false,'Refusing to initialize an existing database');
assert.equal(JSON.parse(readFileSync(resolve(packageDir,'package.json'),'utf8')).version,'0.5.8');
const base=pathToFileURL(resolve(packageDir,'dist')+'/');
const {PGlite}=await import(new URL('index.js',base));
const extensions={};
for(const name of ['pgcrypto','pg_trgm','uuid_ossp']) extensions[name]=(await import(new URL(`contrib/${name}.js`,base)))[name];
const db=new PGlite(dataDir,{extensions});
const report={engine:null,migrations:0,suites:[],callback:null,cleanup:null};
try {
await db.exec(`
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create role authenticator nologin noinherit; create role supabase_admin superuser nologin;
grant anon,authenticated,service_role to authenticator;
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

for(const file of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort()) {
 await db.exec(readFileSync(`supabase/migrations/${file}`,'utf8'));
 await db.query('insert into supabase_migrations.schema_migrations(version,name) values($1,$2)',[file.split('_')[0],file.replace(/^\d+_|\.sql$/g,'')]);
 report.migrations++;
}
report.engine=(await db.query('select version()')).rows[0].version;
for(const name of ['vet_brief_allowance']) {
 await db.exec(readFileSync(`supabase/tests/${name}.sql`,'utf8'));
 console.log('PASS',name);
}
console.log('Applied migrations',report.migrations);
} finally {await db.close();}
