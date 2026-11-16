import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

export async function verifySourceSemanticsReadiness(db) {
  const source=readFileSync('app/lib/operations/readiness.ts','utf8');
  const list=source.split('export const REQUIRED_SECURITY_MIGRATION_NAMES = [')[1].split('] as const')[0];
  const required=[...list.matchAll(/"([a-z0-9_]+)"/g)].map(m=>m[1]);
  const failures=async()=>{
    await db.exec("set request.jwt.claim.role='service_role'");
    return (await db.query('select failed_checks from public.furvise_security_compatibility_snapshot_v2($1::text[])',[required])).rows[0].failed_checks;
  };
  assert.deepEqual(await failures(),[]);
  for(const signature of ['get_my_ask_allowance_status()','get_my_entitlements()','get_my_vet_brief_allowance_status()','read_ask_source_semantics(uuid[],uuid[])']){
    const grants=(await db.query("select has_function_privilege('authenticated',$1,'execute') a,has_function_privilege('anon',$1,'execute') n,has_function_privilege('service_role',$1,'execute') s",['public.'+signature])).rows[0];
    assert.deepEqual(grants,{a:true,n:false,s:false});
  }
  await db.exec('begin');
  try {
    await db.exec("create function public.readiness_unreviewed_test() returns void language plpgsql security definer as $$begin end$$; grant execute on function public.readiness_unreviewed_test() to authenticated;");
    assert.ok((await failures()).includes('browser_security_definer_authority'));
  } finally {await db.exec('rollback');}
  await db.exec('begin');
  try {
    await db.exec("create or replace function public.read_ask_source_semantics(p_pet_ids uuid[],p_source_ids uuid[] default '{}') returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$begin return '{}'::jsonb;end$$");
    assert.ok((await failures()).includes('ask_source_semantics_reader_authority'));
  } finally {await db.exec('rollback');}
  assert.deepEqual(await failures(),[]);
  console.log('Source-semantics readiness: exact reader/grants required; unknown definer and altered reader denied');
}
