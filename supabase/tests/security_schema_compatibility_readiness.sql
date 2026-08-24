begin;

create function pg_temp.security_compatibility_failures()
returns text[]
language sql
as $$
  select failed_checks
  from public.furvise_security_compatibility_snapshot_v2(array[
    'add_pet_profile_lifecycle_v1',
    'secure_ai_credit_state_machine',
    'enforce_ai_credit_settlement_disposition',
    'enforce_furvise_memory_semantic_integrity',
    'server_authored_ask_action_capabilities',
    'harden_entitlement_and_pet_data_boundaries',
    'repair_permanent_pet_delete_admin_role',
    'authorize_ask_memory_persistence',
    'harden_ask_action_capability_targets_freshness_expiry',
    'add_controlled_care_entry_update_boundary',
    'restrict_authenticated_care_entry_writes',
    'prepare_canonical_care_state_authority',
    'enforce_canonical_care_state_authority',
    'security_compatibility_contract_v2',
    'harden_security_compatibility_contract_v2'
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

savepoint browser_role;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
do $$
begin
  begin
    perform public.furvise_security_compatibility_snapshot_v2(array['harden_security_compatibility_contract_v2']);
    raise exception 'authenticated role unexpectedly executed V2 compatibility RPC';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;
rollback to savepoint browser_role;
select set_config('request.jwt.claim.role', 'service_role', true);

savepoint migration_version_rewrite;
update supabase_migrations.schema_migrations
set version = '20990101000000'
where name = 'authorize_ask_memory_persistence';
do $$
begin
  if pg_temp.security_compatibility_failures() <> '{}'::text[] then
    raise exception 'timestamp rewrite caused V2 incompatibility';
  end if;
end;
$$;
rollback to savepoint migration_version_rewrite;

-- Production historically recorded this one migration with its source timestamp,
-- while a clean Supabase replay records the stable suffix. The contract accepts
-- only these two exact identities so DB-first/app-second rollout stays compatible.
savepoint historical_memory_name_alias;
update supabase_migrations.schema_migrations
set name = '20260820010000_enforce_furvise_memory_semantic_integrity'
where name = 'enforce_furvise_memory_semantic_integrity';
do $$
begin
  if pg_temp.security_compatibility_failures() <> '{}'::text[] then
    raise exception 'historical memory migration alias caused V2 incompatibility';
  end if;
end;
$$;
rollback to savepoint historical_memory_name_alias;

savepoint missing_memory_semantic_migration;
delete from supabase_migrations.schema_migrations where name = 'enforce_furvise_memory_semantic_integrity';
select pg_temp.assert_has_failure('required_migration_name:enforce_furvise_memory_semantic_integrity');
rollback to savepoint missing_memory_semantic_migration;

savepoint missing_memory_migration;
delete from supabase_migrations.schema_migrations where name = 'authorize_ask_memory_persistence';
select pg_temp.assert_has_failure('required_migration_name:authorize_ask_memory_persistence');
rollback to savepoint missing_memory_migration;

savepoint missing_authority_migration;
delete from supabase_migrations.schema_migrations where name = 'enforce_canonical_care_state_authority';
select pg_temp.assert_has_failure('required_migration_name:enforce_canonical_care_state_authority');
rollback to savepoint missing_authority_migration;

savepoint missing_contract_hardening_migration;
delete from supabase_migrations.schema_migrations where name = 'harden_security_compatibility_contract_v2';
select pg_temp.assert_has_failure('required_migration_name:harden_security_compatibility_contract_v2');
rollback to savepoint missing_contract_hardening_migration;

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

savepoint care_protected_insert_drift;
grant insert (care_event_metadata) on table public.pet_care_entries to authenticated;
select pg_temp.assert_has_failure('care_history_write_authority');
rollback to savepoint care_protected_insert_drift;

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

savepoint legacy_care_rpc_drift;
grant execute on function public.persist_furvise_semantic_event(uuid,uuid,uuid,jsonb) to authenticated;
select pg_temp.assert_has_failure('canonical_care_state_authority');
rollback to savepoint legacy_care_rpc_drift;

savepoint unexpected_legacy_overload_drift;
create function public.persist_furvise_semantic_event(text)
returns void
language sql
as 'select';
revoke all on function public.persist_furvise_semantic_event(text) from public, anon, authenticated, service_role;
grant execute on function public.persist_furvise_semantic_event(text) to authenticated;
select pg_temp.assert_has_failure('canonical_care_state_authority');
rollback to savepoint unexpected_legacy_overload_drift;

savepoint concern_write_drift;
grant insert on table public.pet_concerns to authenticated;
select pg_temp.assert_has_failure('canonical_care_state_authority');
rollback to savepoint concern_write_drift;

savepoint suggestion_write_drift;
grant update on table public.ai_update_suggestions to authenticated;
select pg_temp.assert_has_failure('canonical_care_state_authority');
rollback to savepoint suggestion_write_drift;

savepoint server_rpc_drift;
revoke execute on function public.persist_furvise_server_care_event(uuid,uuid,uuid,jsonb,uuid) from service_role;
select pg_temp.assert_has_failure('canonical_care_state_authority');
rollback to savepoint server_rpc_drift;

savepoint unexpected_server_overload_drift;
create function public.persist_furvise_server_care_event(text)
returns void
language sql
as 'select';
revoke all on function public.persist_furvise_server_care_event(text) from public, anon, authenticated, service_role;
select pg_temp.assert_has_failure('canonical_care_state_authority');
rollback to savepoint unexpected_server_overload_drift;

savepoint browser_policy_drift;
create policy temporary_concern_insert_drift on public.pet_concerns for insert to authenticated with check (true);
select pg_temp.assert_has_failure('canonical_care_state_authority');
rollback to savepoint browser_policy_drift;

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
