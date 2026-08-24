begin;

-- The prior V2 contract is already deployed. Preserve it as a private implementation
-- layer, then wrap it with broader effective-authority checks. This keeps the public
-- RPC signature stable while making readiness fail closed for authority drift outside
-- the earlier finite canonical-care catalog.
alter function public.furvise_security_compatibility_snapshot_v2(text[])
  rename to furvise_security_compatibility_snapshot_v2_pre_protected_authority_families;

revoke all on function public.furvise_security_compatibility_snapshot_v2_pre_protected_authority_families(text[])
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
  v_allowed_browser_security_definers text[] := array[
    'public.get_my_ask_allowance_status()',
    'public.get_my_care_entry_removal_impact(uuid)',
    'public.get_my_entitlements()',
    'public.has_vet_brief_entitlement()',
    'public.manage_furvise_memory(uuid,text,text)',
    'public.remove_my_care_entry(uuid,boolean)',
    'public.resolve_organic_product_destinations(uuid[],text,text)',
    'public.rls_auto_enable()',
    'public.tombstone_my_care_entry(uuid,text)',
    'public.update_my_care_entry(uuid,uuid,timestamptz,text,text,text,text,timestamptz)'
  ]::text[];
  v_protected_rpc_names text[] := array[
    'reserve_ai_credit',
    'complete_ai_credit',
    'release_ai_credit',
    'reconcile_ai_credit',
    'set_ai_credit_disposition',
    'persist_furvise_ask_intelligence',
    'persist_furvise_intelligence',
    'persist_furvise_feature_intelligence',
    'manage_furvise_memory',
    'execute_ask_action_capability',
    'update_my_care_entry',
    'remove_my_care_entry',
    'tombstone_my_care_entry',
    'get_my_care_entry_removal_impact',
    'has_vet_brief_entitlement',
    'get_my_entitlements',
    'get_my_ask_allowance_status',
    'delete_pet_profile_for_user',
    'persist_furvise_semantic_event',
    'persist_furvise_semantic_event_exact_20260807',
    'persist_furvise_care_event',
    'persist_furvise_care_event_before_destination_routing',
    'persist_furvise_care_event_with_concern',
    'apply_furvise_state_suggestion',
    'resolve_concern_suggestion',
    'persist_furvise_server_semantic_event',
    'persist_furvise_server_care_event',
    'apply_furvise_server_state_suggestion',
    'apply_stripe_subscription_projection',
    'register_stripe_billing_customer',
    'prepare_account_deletion',
    'mark_account_deletion_result',
    'record_billing_deletion_tombstones'
  ]::text[];
  v_name text;
  v_column text;
  v_relation oid;
  v_ok boolean;
begin
  if coalesce(pg_catalog.current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;

  select snapshot.failed_checks
  into v_prior_failures
  from public.furvise_security_compatibility_snapshot_v2_pre_protected_authority_families(
    p_required_migration_names
  ) snapshot;
  v_failures := v_failures || coalesce(v_prior_failures, '{}'::text[]);

  -- Any browser-executable SECURITY DEFINER function is a privilege boundary.
  -- Permit only the reviewed exact signatures. A new name or an overload of an
  -- allowed name therefore fails readiness automatically instead of silently
  -- expanding browser authority.
  if exists (
    select 1
    from pg_catalog.pg_proc proc
    join pg_catalog.pg_namespace namespace on namespace.oid = proc.pronamespace
    where namespace.nspname = 'public'
      and proc.prosecdef
      and (
        pg_catalog.has_function_privilege('anon', proc.oid, 'EXECUTE')
        or pg_catalog.has_function_privilege('authenticated', proc.oid, 'EXECUTE')
      )
      and not exists (
        select 1
        from pg_catalog.unnest(v_allowed_browser_security_definers) as allowed(signature)
        where pg_catalog.to_regprocedure(allowed.signature)::oid = proc.oid
      )
  ) then
    v_failures := pg_catalog.array_append(v_failures, 'browser_security_definer_authority');
  end if;

  -- Launch-critical RPC families intentionally expose exactly one function per
  -- reviewed name. This rejects unexpected overloads even when they are not yet
  -- browser-executable, preventing PostgREST/server call ambiguity from becoming
  -- a latent authority path.
  foreach v_name in array v_protected_rpc_names loop
    if (
      select pg_catalog.count(*)
      from pg_catalog.pg_proc proc
      join pg_catalog.pg_namespace namespace on namespace.oid = proc.pronamespace
      where namespace.nspname = 'public' and proc.proname = v_name
    ) <> 1 then
      v_failures := pg_catalog.array_append(v_failures, 'protected_rpc_inventory');
      exit;
    end if;
  end loop;

  -- Canonical memory is browser-readable and supports only the three reviewed
  -- lifecycle-maintenance UPDATE columns. Provenance, semantic identity, source,
  -- confidence, and tenant columns remain server-owned.
  v_relation := pg_catalog.to_regclass('public.furvise_memories');
  v_ok := v_relation is not null;
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
      and pg_catalog.has_table_privilege('service_role', v_relation, 'SELECT,INSERT,UPDATE,DELETE');

    for v_column in
      select attribute.attname::text
      from pg_catalog.pg_attribute attribute
      where attribute.attrelid = v_relation
        and attribute.attnum > 0
        and not attribute.attisdropped
    loop
      if v_column = any(array['status', 'superseded_by', 'updated_at']::text[]) then
        v_ok := v_ok and pg_catalog.has_column_privilege('authenticated', v_relation, v_column, 'UPDATE');
      else
        v_ok := v_ok and not pg_catalog.has_column_privilege('authenticated', v_relation, v_column, 'UPDATE');
      end if;
      v_ok := v_ok
        and not pg_catalog.has_column_privilege('authenticated', v_relation, v_column, 'INSERT')
        and not pg_catalog.has_column_privilege('authenticated', v_relation, v_column, 'DELETE')
        and not pg_catalog.has_column_privilege('anon', v_relation, v_column, 'INSERT')
        and not pg_catalog.has_column_privilege('anon', v_relation, v_column, 'UPDATE')
        and not pg_catalog.has_column_privilege('anon', v_relation, v_column, 'DELETE');
    end loop;
  end if;
  if not v_ok then
    v_failures := pg_catalog.array_append(v_failures, 'canonical_memory_authority');
  end if;

  -- AI-credit rows may be read by their owner but never mutated by browser roles.
  -- Check column grants as well as table grants so a narrow hostile grant cannot
  -- bypass the table-level test.
  v_relation := pg_catalog.to_regclass('public.ai_usage_events');
  v_ok := v_relation is not null;
  if v_relation is not null then
    v_ok := v_ok
      and exists (
        select 1 from pg_catalog.pg_class relation
        where relation.oid = v_relation
          and relation.relrowsecurity
          and relation.relforcerowsecurity
      )
      and pg_catalog.has_table_privilege('authenticated', v_relation, 'SELECT')
      and not pg_catalog.has_table_privilege('authenticated', v_relation, 'INSERT,UPDATE,DELETE')
      and not pg_catalog.has_table_privilege('anon', v_relation, 'SELECT,INSERT,UPDATE,DELETE')
      and pg_catalog.has_table_privilege('service_role', v_relation, 'SELECT,INSERT,UPDATE,DELETE');
    for v_column in
      select attribute.attname::text
      from pg_catalog.pg_attribute attribute
      where attribute.attrelid = v_relation
        and attribute.attnum > 0
        and not attribute.attisdropped
    loop
      v_ok := v_ok
        and not pg_catalog.has_column_privilege('authenticated', v_relation, v_column, 'INSERT')
        and not pg_catalog.has_column_privilege('authenticated', v_relation, v_column, 'UPDATE')
        and not pg_catalog.has_column_privilege('authenticated', v_relation, v_column, 'DELETE')
        and not pg_catalog.has_column_privilege('anon', v_relation, v_column, 'INSERT')
        and not pg_catalog.has_column_privilege('anon', v_relation, v_column, 'UPDATE')
        and not pg_catalog.has_column_privilege('anon', v_relation, v_column, 'DELETE');
    end loop;
  end if;
  if not v_ok then
    v_failures := pg_catalog.array_append(v_failures, 'ai_credit_authority');
  end if;

  -- Action capabilities are server-authored opaque authority. Browser roles have
  -- no table or column access; service_role may only select and insert directly.
  v_relation := pg_catalog.to_regclass('public.ask_action_capabilities');
  v_ok := v_relation is not null;
  if v_relation is not null then
    v_ok := v_ok
      and exists (
        select 1 from pg_catalog.pg_class relation
        where relation.oid = v_relation
          and relation.relrowsecurity
          and relation.relforcerowsecurity
      )
      and not pg_catalog.has_table_privilege('authenticated', v_relation, 'SELECT,INSERT,UPDATE,DELETE')
      and not pg_catalog.has_table_privilege('anon', v_relation, 'SELECT,INSERT,UPDATE,DELETE')
      and pg_catalog.has_table_privilege('service_role', v_relation, 'SELECT,INSERT')
      and not pg_catalog.has_table_privilege('service_role', v_relation, 'UPDATE,DELETE');
    for v_column in
      select attribute.attname::text
      from pg_catalog.pg_attribute attribute
      where attribute.attrelid = v_relation
        and attribute.attnum > 0
        and not attribute.attisdropped
    loop
      v_ok := v_ok
        and not pg_catalog.has_column_privilege('authenticated', v_relation, v_column, 'INSERT')
        and not pg_catalog.has_column_privilege('authenticated', v_relation, v_column, 'UPDATE')
        and not pg_catalog.has_column_privilege('authenticated', v_relation, v_column, 'DELETE')
        and not pg_catalog.has_column_privilege('anon', v_relation, v_column, 'INSERT')
        and not pg_catalog.has_column_privilege('anon', v_relation, v_column, 'UPDATE')
        and not pg_catalog.has_column_privilege('anon', v_relation, v_column, 'DELETE');
    end loop;
  end if;
  if not v_ok then
    v_failures := pg_catalog.array_append(v_failures, 'action_capability_authority');
  end if;

  -- Profile writes are intentionally browser-capable only for the reviewed
  -- owner-authored profile fields. Lifecycle state, identity, timestamps owned by
  -- the database, and deletion remain outside browser authority.
  v_relation := pg_catalog.to_regclass('public.dog_profiles');
  v_ok := v_relation is not null;
  if v_relation is not null then
    v_ok := v_ok
      and exists (
        select 1 from pg_catalog.pg_class relation
        where relation.oid = v_relation
          and relation.relrowsecurity
          and relation.relforcerowsecurity
      )
      and not pg_catalog.has_table_privilege('authenticated', v_relation, 'INSERT')
      and not pg_catalog.has_table_privilege('authenticated', v_relation, 'UPDATE')
      and not pg_catalog.has_table_privilege('authenticated', v_relation, 'DELETE')
      and not pg_catalog.has_table_privilege('anon', v_relation, 'INSERT,UPDATE,DELETE');

    for v_column in
      select attribute.attname::text
      from pg_catalog.pg_attribute attribute
      where attribute.attrelid = v_relation
        and attribute.attnum > 0
        and not attribute.attisdropped
    loop
      if v_column = any(array[
        'user_id', 'name', 'species', 'breed', 'age_value', 'age_unit',
        'weight_value', 'weight_unit', 'current_food', 'main_concern',
        'wellness_goal', 'avoid_ingredients', 'monthly_budget', 'sex',
        'routine_note', 'idempotency_key', 'updated_at'
      ]::text[]) then
        v_ok := v_ok and pg_catalog.has_column_privilege('authenticated', v_relation, v_column, 'INSERT');
      else
        v_ok := v_ok and not pg_catalog.has_column_privilege('authenticated', v_relation, v_column, 'INSERT');
      end if;

      if v_column = any(array[
        'name', 'species', 'breed', 'age_value', 'age_unit', 'weight_value',
        'weight_unit', 'current_food', 'main_concern', 'wellness_goal',
        'avoid_ingredients', 'monthly_budget', 'sex', 'routine_note', 'updated_at'
      ]::text[]) then
        v_ok := v_ok and pg_catalog.has_column_privilege('authenticated', v_relation, v_column, 'UPDATE');
      else
        v_ok := v_ok and not pg_catalog.has_column_privilege('authenticated', v_relation, v_column, 'UPDATE');
      end if;
    end loop;
  end if;
  if not v_ok then
    v_failures := pg_catalog.array_append(v_failures, 'entitlement_pet_boundary');
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

-- The implementation layer is intentionally non-callable through Data API roles.
revoke all on function public.furvise_security_compatibility_snapshot_v2_pre_protected_authority_families(text[])
  from public, anon, authenticated, service_role;

comment on function public.furvise_security_compatibility_snapshot_v2(text[]) is
  'Service-only V2 deployment compatibility contract with fail-closed protected authority-family, browser SECURITY DEFINER, overload, and column-grant drift detection.';
comment on function public.furvise_security_compatibility_snapshot_v2_pre_protected_authority_families(text[]) is
  'Internal prior V2 compatibility implementation retained only for composition by the current service-only readiness contract.';

notify pgrst, 'reload schema';

commit;
