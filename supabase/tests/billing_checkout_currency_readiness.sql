begin;

select set_config('request.jwt.claim.role', 'service_role', true);

create function pg_temp.checkout_currency_failures()
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
    'harden_security_compatibility_contract_v2',
    'harden_security_compatibility_protected_authority_families',
    'add_billing_checkout_single_flight',
    'harden_billing_checkout_single_flight_readiness',
    'align_billing_checkout_currency_authority'
  ]);
$$;

create function pg_temp.assert_currency_failure()
returns void
language plpgsql
as $$
declare
  v_failures text[];
begin
  select pg_temp.checkout_currency_failures() into v_failures;
  if not 'billing_checkout_currency_authority' = any(v_failures) then
    raise exception 'expected billing_checkout_currency_authority, got %', v_failures;
  end if;
end;
$$;

-- PostgreSQL represents SET search_path = '' as the literal proconfig entry
-- search_path="". Keep the readiness contract pinned to the catalog's real form.
do $$
declare
  v_function oid := pg_catalog.to_regprocedure(
    'public.claim_billing_checkout_single_flight_v2(uuid,text,integer,text,text)'
  );
  v_config text[];
begin
  if v_function is null then
    raise exception 'currency-aware checkout claim RPC missing';
  end if;
  select proc.proconfig into v_config
  from pg_catalog.pg_proc proc
  where proc.oid = v_function;
  if not coalesce(v_config @> array['search_path=""']::text[], false) then
    raise exception 'currency-aware checkout claim search_path config invalid: %', v_config;
  end if;
end;
$$;

do $$
begin
  if pg_temp.checkout_currency_failures() <> '{}'::text[] then
    raise exception 'healthy checkout currency readiness was not empty';
  end if;
end;
$$;

savepoint missing_currency_migration;
delete from supabase_migrations.schema_migrations
where name = 'align_billing_checkout_currency_authority';
do $$
declare
  v_failures text[];
begin
  select pg_temp.checkout_currency_failures() into v_failures;
  if not 'required_migration_name:align_billing_checkout_currency_authority' = any(v_failures) then
    raise exception 'missing currency migration did not fail readiness: %', v_failures;
  end if;
end;
$$;
rollback to savepoint missing_currency_migration;

savepoint currency_rpc_service_grant_drift;
revoke execute on function public.claim_billing_checkout_single_flight_v2(uuid,text,integer,text,text) from service_role;
select pg_temp.assert_currency_failure();
rollback to savepoint currency_rpc_service_grant_drift;

savepoint currency_rpc_browser_grant_drift;
grant execute on function public.claim_billing_checkout_single_flight_v2(uuid,text,integer,text,text) to authenticated;
select pg_temp.assert_currency_failure();
rollback to savepoint currency_rpc_browser_grant_drift;

savepoint currency_rpc_security_mode_drift;
alter function public.claim_billing_checkout_single_flight_v2(uuid,text,integer,text,text) security invoker;
select pg_temp.assert_currency_failure();
rollback to savepoint currency_rpc_security_mode_drift;

savepoint currency_rpc_overload_drift;
create function public.claim_billing_checkout_single_flight_v2(text)
returns void
language sql
security definer
set search_path = ''
as 'select';
revoke all on function public.claim_billing_checkout_single_flight_v2(text) from public, anon, authenticated, service_role;
select pg_temp.assert_currency_failure();
rollback to savepoint currency_rpc_overload_drift;

rollback;
