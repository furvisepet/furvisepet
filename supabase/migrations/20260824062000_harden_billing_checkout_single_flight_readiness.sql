begin;

-- A new financial authority boundary must be covered by semantic readiness, not
-- only by migration presence. Preserve the current V2 implementation as a private
-- layer and add effective-authority checks for Furvise Plus Checkout single-flight.
alter function public.furvise_security_compatibility_snapshot_v2(text[])
  rename to furvise_security_compatibility_snapshot_v2_pre_billing;

revoke all on function public.furvise_security_compatibility_snapshot_v2_pre_billing(text[])
  from public, anon, authenticated, service_role;

create function public.furvise_security_compatibility_snapshot_v2(
  p_required_migration_names text[]
)
returns table(contract_version integer, failed_checks text[])
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_failures text[] := '{}'::text[];
  v_prior_failures text[] := '{}'::text[];
  v_expected_signatures text[] := array[
    'public.claim_billing_checkout_single_flight(uuid,text,integer,text)',
    'public.complete_billing_checkout_single_flight(uuid,text,uuid,uuid,text,timestamptz)',
    'public.abandon_billing_checkout_single_flight(uuid,text,uuid,uuid)',
    'public.reset_billing_checkout_single_flight(uuid,text,text)'
  ]::text[];
  v_protected_names text[] := array[
    'claim_billing_checkout_single_flight',
    'complete_billing_checkout_single_flight',
    'abandon_billing_checkout_single_flight',
    'reset_billing_checkout_single_flight'
  ]::text[];
  v_signature text;
  v_function oid;
  v_relation oid;
  v_definition text;
  v_ok boolean := true;
begin
  if coalesce(pg_catalog.current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;

  select snapshot.failed_checks
  into v_prior_failures
  from public.furvise_security_compatibility_snapshot_v2_pre_billing(
    p_required_migration_names
  ) snapshot;
  v_failures := v_failures || coalesce(v_prior_failures, '{}'::text[]);

  -- The durable single-flight row is internal coordination state. No Data API
  -- role, including service_role, receives direct table DML or SELECT authority.
  v_relation := pg_catalog.to_regclass('private.billing_checkout_single_flights');
  v_ok := v_relation is not null;
  if v_relation is not null then
    v_ok := v_ok
      and not pg_catalog.has_table_privilege('anon', v_relation, 'SELECT')
      and not pg_catalog.has_table_privilege('anon', v_relation, 'INSERT')
      and not pg_catalog.has_table_privilege('anon', v_relation, 'UPDATE')
      and not pg_catalog.has_table_privilege('anon', v_relation, 'DELETE')
      and not pg_catalog.has_table_privilege('authenticated', v_relation, 'SELECT')
      and not pg_catalog.has_table_privilege('authenticated', v_relation, 'INSERT')
      and not pg_catalog.has_table_privilege('authenticated', v_relation, 'UPDATE')
      and not pg_catalog.has_table_privilege('authenticated', v_relation, 'DELETE')
      and not pg_catalog.has_table_privilege('service_role', v_relation, 'SELECT')
      and not pg_catalog.has_table_privilege('service_role', v_relation, 'INSERT')
      and not pg_catalog.has_table_privilege('service_role', v_relation, 'UPDATE')
      and not pg_catalog.has_table_privilege('service_role', v_relation, 'DELETE')
      and exists (
        select 1
        from pg_catalog.pg_constraint constraint_row
        where constraint_row.conrelid = v_relation
          and constraint_row.contype = 'p'
          and (
            select pg_catalog.array_agg(attribute.attname::text order by key_column.ordinality)
            from pg_catalog.unnest(constraint_row.conkey) with ordinality as key_column(attnum, ordinality)
            join pg_catalog.pg_attribute attribute
              on attribute.attrelid = v_relation and attribute.attnum = key_column.attnum
          ) = array['user_id', 'product_key']::text[]
      );
  end if;

  -- The four exact RPCs are the only mutation surface. They remain service-only,
  -- SECURITY DEFINER, locked to an empty search_path, and retain a runtime
  -- service-role guard in addition to grants.
  foreach v_signature in array v_expected_signatures loop
    v_function := pg_catalog.to_regprocedure(v_signature);
    v_ok := v_ok and v_function is not null;
    if v_function is not null then
      select pg_catalog.pg_get_functiondef(v_function) into v_definition;
      v_ok := v_ok
        and pg_catalog.has_function_privilege('service_role', v_function, 'EXECUTE')
        and not pg_catalog.has_function_privilege('anon', v_function, 'EXECUTE')
        and not pg_catalog.has_function_privilege('authenticated', v_function, 'EXECUTE')
        and (select proc.prosecdef from pg_catalog.pg_proc proc where proc.oid = v_function)
        and coalesce((
          select proc.proconfig @> array['search_path=""']::text[]
          from pg_catalog.pg_proc proc
          where proc.oid = v_function
        ), false)
        and v_definition ~* 'request[.]jwt[.]claim[.]role'
        and v_definition ~* 'SERVICE_ROLE_REQUIRED';
    end if;
  end loop;

  -- An overload of a reviewed financial RPC is unreviewed authority, even before
  -- it is granted to a browser role. Fail readiness rather than allowing latent
  -- PostgREST/server ambiguity.
  if exists (
    select 1
    from pg_catalog.pg_proc proc
    join pg_catalog.pg_namespace namespace on namespace.oid = proc.pronamespace
    where namespace.nspname = 'public'
      and proc.proname::text = any(v_protected_names)
      and not exists (
        select 1
        from pg_catalog.unnest(v_expected_signatures) expected(signature)
        where pg_catalog.to_regprocedure(expected.signature)::oid = proc.oid
      )
  ) then
    v_ok := false;
  end if;

  if not v_ok then
    v_failures := pg_catalog.array_append(v_failures, 'billing_checkout_authority');
  end if;

  return query
  select 2, array(
    select distinct failure
    from pg_catalog.unnest(v_failures) failure
    order by failure
  );
end;
$$;

revoke all on function public.furvise_security_compatibility_snapshot_v2(text[])
  from public, anon, authenticated, service_role;
grant execute on function public.furvise_security_compatibility_snapshot_v2(text[])
  to service_role;

revoke all on function public.furvise_security_compatibility_snapshot_v2_pre_billing(text[])
  from public, anon, authenticated, service_role;

comment on function public.furvise_security_compatibility_snapshot_v2(text[]) is
  'Service-only V2 compatibility contract including effective Furvise Plus Checkout single-flight authority.';

notify pgrst, 'reload schema';

commit;
