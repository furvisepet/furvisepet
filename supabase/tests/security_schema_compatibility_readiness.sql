begin;

create function pg_temp.security_compatibility_failures()
returns text[]
language sql
as $$
  select failed_checks
  from public.furvise_security_compatibility_snapshot(array[
    '20260818084249', '20260818194748', '20260819033443',
    '20260820010000', '20260820070956', '20260821021825',
    '20260821050646', '20260823062212', '20260823120000',
    '20260823120001', '20260823120002'
  ]);
$$;

create function pg_temp.assert_has_failure(p_failure text)
returns void
language plpgsql
as $$
declare
  v_failures text[];
begin
  select pg_temp.security_compatibility_failures() into v_failures;
  if not p_failure = any(v_failures) then
    raise exception 'expected compatibility failure %, got %', p_failure, v_failures;
  end if;
end;
$$;

select set_config('request.jwt.claim.role', 'service_role', true);

do $$
begin
  if pg_temp.security_compatibility_failures() <> '{}'::text[] then
    raise exception 'complete current security schema was not ready';
  end if;
end;
$$;

-- The compatibility RPC itself is not a browser-visible schema oracle.
savepoint browser_role;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
do $$
begin
  begin
    perform public.furvise_security_compatibility_snapshot(array['20260823120002']);
    raise exception 'authenticated role unexpectedly executed compatibility RPC';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;
rollback to savepoint browser_role;
select set_config('request.jwt.claim.role', 'service_role', true);

-- New application connected to migration history ending at the obsolete floor.
savepoint old_floor;
delete from supabase_migrations.schema_migrations where version::text > '20260818084249';
select pg_temp.assert_has_failure('required_migration:20260823120002');
rollback to savepoint old_floor;

-- Exact migration requirements are independent of unrelated chronology.
savepoint missing_memory_migration;
delete from supabase_migrations.schema_migrations where version::text = '20260823062212';
select pg_temp.assert_has_failure('required_migration:20260823062212');
rollback to savepoint missing_memory_migration;

savepoint unrelated_migration;
delete from supabase_migrations.schema_migrations where version::text = '20260821062935';
do $$
begin
  if pg_temp.security_compatibility_failures() <> '{}'::text[] then
    raise exception 'unrelated migration history caused incompatibility';
  end if;
end;
$$;
rollback to savepoint unrelated_migration;

-- Drift remains detectable even when migration history falsely looks complete.
savepoint action_drift;
alter table public.ask_action_capabilities alter column expires_at drop not null;
select pg_temp.assert_has_failure('action_capability_authority');
rollback to savepoint action_drift;

savepoint care_rpc_drift;
revoke execute on function public.update_my_care_entry(uuid,uuid,timestamptz,text,text,text,text,timestamptz) from authenticated;
select pg_temp.assert_has_failure('care_history_write_authority');
rollback to savepoint care_rpc_drift;

savepoint care_grant_drift;
grant update on table public.pet_care_entries to authenticated;
select pg_temp.assert_has_failure('care_history_write_authority');
rollback to savepoint care_grant_drift;

savepoint legacy_memory_drift;
grant execute on function public.persist_furvise_intelligence(uuid,uuid,jsonb,jsonb) to authenticated;
select pg_temp.assert_has_failure('canonical_memory_authority');
rollback to savepoint legacy_memory_drift;

savepoint entitlement_drift;
alter table public.dog_profiles no force row level security;
select pg_temp.assert_has_failure('entitlement_pet_boundary');
rollback to savepoint entitlement_drift;

savepoint delete_drift;
grant execute on function public.delete_pet_profile_for_user(uuid,uuid) to authenticated;
select pg_temp.assert_has_failure('permanent_delete_authority');
rollback to savepoint delete_drift;

-- A normal check reads catalogs/history but does not alter application data.
do $$
declare
  v_before bigint;
  v_after bigint;
begin
  select count(*) into v_before from supabase_migrations.schema_migrations;
  perform pg_temp.security_compatibility_failures();
  select count(*) into v_after from supabase_migrations.schema_migrations;
  if v_before <> v_after then raise exception 'readiness mutated migration history'; end if;
end;
$$;

rollback;
