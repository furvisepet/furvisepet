begin;

-- Forward-only hardening for the already-deployed V2 readiness contract.
-- Keep the same RPC/version so the current application remains compatible
-- while making the effective-authority checks exhaustive enough to detect
-- privilege drift, unexpected overloads, and protected Care History inserts.
create or replace function public.furvise_security_compatibility_snapshot_v2(
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
  v_name text;
  v_latest_version text;
  v_signature text;
  v_column text;
  v_function oid;
  v_relation oid;
  v_definition text;
  v_ok boolean;
begin
  if coalesce(pg_catalog.current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;

  if p_required_migration_names is null
    or pg_catalog.cardinality(p_required_migration_names) not between 1 and 32 then
    v_failures := pg_catalog.array_append(v_failures, 'compatibility_input');
  else
    foreach v_name in array p_required_migration_names loop
      if v_name !~ '^[a-z0-9_]{1,80}$' or not exists (
        select 1
        from supabase_migrations.schema_migrations migration
        where migration.name = v_name
          or (
            v_name = any(array[
              'enforce_furvise_memory_semantic_integrity',
              '20260820010000_enforce_furvise_memory_semantic_integrity'
            ]::text[])
            and migration.name = any(array[
              'enforce_furvise_memory_semantic_integrity',
              '20260820010000_enforce_furvise_memory_semantic_integrity'
            ]::text[])
          )
      ) then
        v_failures := pg_catalog.array_append(
          v_failures,
          'required_migration_name:' || pg_catalog.left(coalesce(v_name, 'invalid'), 56)
        );
      end if;
    end loop;
  end if;

  -- Reuse V1's semantic checks using a migration version that is guaranteed to
  -- exist in the current ledger, while V2 owns stable-name provenance checks.
  select pg_catalog.max(migration.version::text)
  into v_latest_version
  from supabase_migrations.schema_migrations migration;

  if v_latest_version is null then
    v_failures := pg_catalog.array_append(v_failures, 'migration_history_unavailable');
  else
    select snapshot.failed_checks
    into v_prior_failures
    from public.furvise_security_compatibility_snapshot(array[v_latest_version]) snapshot;
    v_failures := v_failures || coalesce(v_prior_failures, '{}'::text[]);
  end if;

  -- Known legacy canonical-care writers must remain present for compatibility
  -- but unreachable through every API role.
  v_ok := true;
  foreach v_signature in array array[
    'public.persist_furvise_semantic_event(uuid,uuid,uuid,jsonb)',
    'public.persist_furvise_semantic_event_exact_20260807(uuid,uuid,uuid,jsonb)',
    'public.persist_furvise_care_event(uuid,uuid,uuid,jsonb,uuid)',
    'public.persist_furvise_care_event_before_destination_routing(uuid,uuid,uuid,jsonb,uuid)',
    'public.persist_furvise_care_event_with_concern(uuid,uuid,uuid,jsonb,uuid)',
    'public.apply_furvise_state_suggestion(uuid,uuid)',
    'public.resolve_concern_suggestion(uuid)'
  ] loop
    v_function := pg_catalog.to_regprocedure(v_signature);
    v_ok := v_ok and v_function is not null;
    if v_function is not null then
      v_ok := v_ok
        and not pg_catalog.has_function_privilege('anon', v_function, 'EXECUTE')
        and not pg_catalog.has_function_privilege('authenticated', v_function, 'EXECUTE')
        and not pg_catalog.has_function_privilege('service_role', v_function, 'EXECUTE');
    end if;
  end loop;

  -- Do not rely on a closed list of signatures. Any overload of a protected
  -- legacy canonical writer that becomes executable by an API role is drift.
  if exists (
    select 1
    from pg_catalog.pg_proc proc
    join pg_catalog.pg_namespace namespace on namespace.oid = proc.pronamespace
    where namespace.nspname = 'public'
      and proc.proname::text = any(array[
        'persist_furvise_semantic_event',
        'persist_furvise_semantic_event_exact_20260807',
        'persist_furvise_care_event',
        'persist_furvise_care_event_before_destination_routing',
        'persist_furvise_care_event_with_concern',
        'apply_furvise_state_suggestion',
        'resolve_concern_suggestion'
      ]::text[])
      and (
        pg_catalog.has_function_privilege('anon', proc.oid, 'EXECUTE')
        or pg_catalog.has_function_privilege('authenticated', proc.oid, 'EXECUTE')
        or pg_catalog.has_function_privilege('service_role', proc.oid, 'EXECUTE')
      )
  ) then
    v_ok := false;
  end if;

  -- The three server-facing wrappers are exact, service-only SECURITY DEFINER
  -- boundaries and must delegate through the server-actor guard.
  foreach v_signature in array array[
    'public.persist_furvise_server_semantic_event(uuid,uuid,uuid,jsonb)',
    'public.persist_furvise_server_care_event(uuid,uuid,uuid,jsonb,uuid)',
    'public.apply_furvise_server_state_suggestion(uuid,uuid)'
  ] loop
    v_function := pg_catalog.to_regprocedure(v_signature);
    v_ok := v_ok and v_function is not null;
    if v_function is not null then
      select pg_catalog.pg_get_functiondef(v_function) into v_definition;
      v_ok := v_ok
        and pg_catalog.has_function_privilege('service_role', v_function, 'EXECUTE')
        and not pg_catalog.has_function_privilege('anon', v_function, 'EXECUTE')
        and not pg_catalog.has_function_privilege('authenticated', v_function, 'EXECUTE')
        and (select proc.prosecdef from pg_catalog.pg_proc proc where proc.oid = v_function)
        and coalesce((select proc.proconfig @> array['search_path=public, pg_temp']::text[] from pg_catalog.pg_proc proc where proc.oid = v_function), false)
        and v_definition ~* 'private\.set_furvise_server_actor\s*\(';
    end if;
  end loop;

  -- Unexpected overloads of trusted wrapper names are not part of the contract.
  if exists (
    select 1
    from pg_catalog.pg_proc proc
    join pg_catalog.pg_namespace namespace on namespace.oid = proc.pronamespace
    where namespace.nspname = 'public'
      and proc.proname::text = any(array[
        'persist_furvise_server_semantic_event',
        'persist_furvise_server_care_event',
        'apply_furvise_server_state_suggestion'
      ]::text[])
      and not (proc.oid = any(array[
        pg_catalog.to_regprocedure('public.persist_furvise_server_semantic_event(uuid,uuid,uuid,jsonb)')::oid,
        pg_catalog.to_regprocedure('public.persist_furvise_server_care_event(uuid,uuid,uuid,jsonb,uuid)')::oid,
        pg_catalog.to_regprocedure('public.apply_furvise_server_state_suggestion(uuid,uuid)')::oid
      ]::oid[]))
  ) then
    v_ok := false;
  end if;

  v_function := pg_catalog.to_regprocedure('private.set_furvise_server_actor(uuid)');
  v_ok := v_ok and v_function is not null;
  if v_function is not null then
    select pg_catalog.pg_get_functiondef(v_function) into v_definition;
    v_ok := v_ok
      and not pg_catalog.has_function_privilege('anon', v_function, 'EXECUTE')
      and not pg_catalog.has_function_privilege('authenticated', v_function, 'EXECUTE')
      and not pg_catalog.has_function_privilege('service_role', v_function, 'EXECUTE')
      and (select proc.prosecdef from pg_catalog.pg_proc proc where proc.oid = v_function)
      and coalesce((select proc.proconfig @> array['search_path=pg_catalog, pg_temp']::text[] from pg_catalog.pg_proc proc where proc.oid = v_function), false)
      and v_definition ~* 'auth\.role\(\)'
      and v_definition ~* 'service_role';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc proc
    join pg_catalog.pg_namespace namespace on namespace.oid = proc.pronamespace
    where namespace.nspname = 'private'
      and proc.proname = 'set_furvise_server_actor'
      and proc.oid <> coalesce(v_function, 0::oid)
  ) then
    v_ok := false;
  end if;

  foreach v_name in array array['pet_concerns', 'ai_update_suggestions'] loop
    v_relation := pg_catalog.to_regclass('public.' || v_name);
    v_ok := v_ok and v_relation is not null;
    if v_relation is not null then
      v_ok := v_ok
        and exists (
          select 1 from pg_catalog.pg_class relation
          where relation.oid = v_relation
            and relation.relrowsecurity
            and relation.relforcerowsecurity
        )
        and pg_catalog.has_table_privilege('authenticated', v_relation, 'SELECT')
        and not pg_catalog.has_table_privilege('authenticated', v_relation, 'INSERT')
        and not pg_catalog.has_table_privilege('authenticated', v_relation, 'UPDATE')
        and not pg_catalog.has_table_privilege('authenticated', v_relation, 'DELETE')
        and not pg_catalog.has_table_privilege('anon', v_relation, 'SELECT')
        and not pg_catalog.has_table_privilege('anon', v_relation, 'INSERT')
        and not pg_catalog.has_table_privilege('anon', v_relation, 'UPDATE')
        and not pg_catalog.has_table_privilege('anon', v_relation, 'DELETE')
        and pg_catalog.has_table_privilege('service_role', v_relation, 'SELECT')
        and pg_catalog.has_table_privilege('service_role', v_relation, 'INSERT')
        and pg_catalog.has_table_privilege('service_role', v_relation, 'UPDATE')
        and pg_catalog.has_table_privilege('service_role', v_relation, 'DELETE')
        and not exists (
          select 1
          from pg_catalog.pg_policies policy
          where policy.schemaname = 'public'
            and policy.tablename = v_name
            and policy.cmd in ('INSERT', 'UPDATE', 'DELETE')
        );
    end if;
  end loop;

  if not v_ok then
    v_failures := pg_catalog.array_append(v_failures, 'canonical_care_state_authority');
  end if;

  -- Care History browser insertion is intentionally column-scoped. Readiness
  -- must verify the complete effective INSERT allowlist, not only table-level
  -- UPDATE/DELETE authority inherited from V1.
  v_relation := pg_catalog.to_regclass('public.pet_care_entries');
  v_ok := v_relation is not null;
  if v_relation is not null then
    v_ok := v_ok
      and exists (
        select 1 from pg_catalog.pg_class relation
        where relation.oid = v_relation and relation.relrowsecurity
      )
      and pg_catalog.has_table_privilege('authenticated', v_relation, 'SELECT')
      and not pg_catalog.has_table_privilege('authenticated', v_relation, 'INSERT')
      and not pg_catalog.has_table_privilege('authenticated', v_relation, 'UPDATE')
      and not pg_catalog.has_table_privilege('authenticated', v_relation, 'DELETE')
      and not pg_catalog.has_table_privilege('anon', v_relation, 'INSERT')
      and not pg_catalog.has_table_privilege('anon', v_relation, 'UPDATE')
      and not pg_catalog.has_table_privilege('anon', v_relation, 'DELETE')
      and pg_catalog.has_table_privilege('service_role', v_relation, 'SELECT,INSERT,UPDATE,DELETE')
      and not exists (
        select 1
        from pg_catalog.pg_policies policy
        where policy.schemaname = 'public'
          and policy.tablename = 'pet_care_entries'
          and policy.cmd = 'UPDATE'
      );

    for v_column in
      select attribute.attname::text
      from pg_catalog.pg_attribute attribute
      where attribute.attrelid = v_relation
        and attribute.attnum > 0
        and not attribute.attisdropped
    loop
      if v_column = any(array[
        'user_id', 'pet_profile_id', 'category', 'title', 'note', 'severity',
        'occurred_at', 'idempotency_key'
      ]::text[]) then
        v_ok := v_ok and pg_catalog.has_column_privilege('authenticated', v_relation, v_column, 'INSERT');
      else
        v_ok := v_ok and not pg_catalog.has_column_privilege('authenticated', v_relation, v_column, 'INSERT');
      end if;

      v_ok := v_ok and not pg_catalog.has_column_privilege('authenticated', v_relation, v_column, 'UPDATE');
    end loop;
  end if;

  if not v_ok then
    v_failures := pg_catalog.array_append(v_failures, 'care_history_write_authority');
  end if;

  return query select 2, array(
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

-- The forward migration itself verifies only static grants because its own
-- migration-ledger name is recorded after the migration transaction completes.
do $$
begin
  if pg_catalog.has_function_privilege('authenticated', 'public.furvise_security_compatibility_snapshot_v2(text[])', 'EXECUTE')
    or pg_catalog.has_function_privilege('anon', 'public.furvise_security_compatibility_snapshot_v2(text[])', 'EXECUTE')
    or not pg_catalog.has_function_privilege('service_role', 'public.furvise_security_compatibility_snapshot_v2(text[])', 'EXECUTE') then
    raise exception 'hardened security compatibility V2 RPC grants are invalid';
  end if;
end;
$$;

comment on function public.furvise_security_compatibility_snapshot_v2(text[]) is
  'Service-only V2 deployment compatibility contract using stable migration names and exhaustive effective-authority drift checks.';

notify pgrst, 'reload schema';

commit;
