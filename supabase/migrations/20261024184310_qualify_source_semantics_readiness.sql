-- Two exact bases differ only by reviewed comments (deployed vs repository).
-- Retain every compatibility check. Align only the four reviewed user-scoped
-- reader grants and recognize the exact bounded source-semantics implementation.
REVOKE EXECUTE ON FUNCTION public.get_my_ask_allowance_status() FROM service_role;
REVOKE EXECUTE ON FUNCTION public.get_my_entitlements() FROM service_role;
REVOKE EXECUTE ON FUNCTION public.get_my_vet_brief_allowance_status() FROM service_role;
REVOKE EXECUTE ON FUNCTION public.read_ask_source_semantics(uuid[],uuid[]) FROM service_role;
DO $release_contract$
DECLARE current_definition text;
BEGIN
 SELECT pg_catalog.pg_get_functiondef('public.furvise_security_compatibility_snapshot_v2_pre_billing(text[])'::regprocedure) INTO current_definition;
 IF pg_catalog.md5(pg_catalog.replace(current_definition,pg_catalog.chr(13),'')) NOT IN ('2876a1af35c7dd1f549c81e1d47754d3','c21d27cd9806e80731ceee492337be8b') THEN
  RAISE EXCEPTION 'SOURCE_SEMANTICS_READINESS_BASE_MISMATCH';
 END IF;
 EXECUTE $qualified_definition$
CREATE OR REPLACE FUNCTION public.furvise_security_compatibility_snapshot_v2_pre_billing(p_required_migration_names text[])
 RETURNS TABLE(contract_version integer, failed_checks text[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_failures text[] := '{}'::text[];
  v_prior_failures text[] := '{}'::text[];
  v_allowed_browser_security_definers text[] := array[
    'public.read_ask_history_candidates(uuid,text[],timestamptz,timestamptz,timestamptz,uuid,integer)',
    'public.read_ask_history_correction_page(uuid[],uuid[],uuid[],timestamptz,timestamptz,text[])',
    'public.read_ask_episode_sources(uuid,text[],uuid[],timestamptz,timestamptz)',
    'public.read_ask_source_semantics(uuid[],uuid[])',
    'public.read_ask_history_candidates_latest(uuid,text[],timestamptz,timestamptz,timestamptz,uuid,integer)',
    'public.get_my_ask_allowance_status()',
    'public.get_my_vet_brief_allowance_status()',
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
    'get_my_vet_brief_allowance_status',
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

  -- The deployed prior V2 implementation bounds required-migration failure names
  -- to 56 characters. Preserve that compatibility layer, but restore the complete
  -- caller-supplied migration identity when the resulting failure code still fits
  -- the application's 96-character readiness-code contract.
  if p_required_migration_names is not null and v_prior_failures is not null then
    foreach v_name in array p_required_migration_names loop
      if pg_catalog.char_length('required_migration_name:' || v_name) <= 96
        and ('required_migration_name:' || pg_catalog.left(v_name, 56)) = any(v_prior_failures) then
        v_prior_failures := pg_catalog.array_replace(
          v_prior_failures,
          'required_migration_name:' || pg_catalog.left(v_name, 56),
          'required_migration_name:' || v_name
        );
      end if;
    end loop;
  end if;

  v_failures := v_failures || coalesce(v_prior_failures, '{}'::text[]);

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

  -- The separately reviewed source-semantics reader is browser callable only
  -- with this exact bounded owner/pet implementation and unchanged grants.
  if not exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_roles r on r.oid=p.proowner
    where p.oid=pg_catalog.to_regprocedure('public.read_ask_source_semantics(uuid[],uuid[])')
      and p.prosecdef and p.provolatile='s' and r.rolname='postgres'
      and p.proconfig=array['search_path=pg_catalog']::text[]
      and pg_catalog.md5(pg_catalog.replace(pg_catalog.pg_get_functiondef(p.oid),pg_catalog.chr(13),''))='93e1dc64d122671543f95e941e34dde1'
      and pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
      and not pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE')
      and not pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
  ) then
    v_failures:=pg_catalog.array_append(v_failures,'ask_source_semantics_reader_authority');
  end if;

  -- Exact definitions pin the reviewed bounded owner/pet checks, not just names.
  -- Future reader changes must update this contract with matching security tests.
  if exists (
    select 1 from (values
      ('public.read_ask_history_candidates(uuid,text[],timestamptz,timestamptz,timestamptz,uuid,integer)','3f52e6869cc2ce7289e74598798f1c4c','ask_history_candidate_reader'),
      ('public.read_ask_history_correction_page(uuid[],uuid[],uuid[],timestamptz,timestamptz,text[])','7c4b1db58d569f81caabc17d8b611111','postgres'),
      ('public.read_ask_episode_sources(uuid,text[],uuid[],timestamptz,timestamptz)','e55415cfe3420e87d60dfedbf695f117','postgres')
    ) expected(signature,definition_hash,owner_name)
    left join pg_catalog.pg_proc p on p.oid=pg_catalog.to_regprocedure(expected.signature)
    left join pg_catalog.pg_roles r on r.oid=p.proowner
    where p.oid is null or not p.prosecdef or r.rolname<>expected.owner_name
      or pg_catalog.md5(pg_catalog.replace(pg_catalog.pg_get_functiondef(p.oid),pg_catalog.chr(13),''))<>expected.definition_hash
      or not pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
      or pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
      or pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE')
  ) then v_failures:=pg_catalog.array_append(v_failures,'ask_history_reader_authority'); end if;


  -- BEGIN ASK LATEST READER AUTHORITY
  if not exists (
    select 1 from pg_catalog.pg_proc p join pg_catalog.pg_roles r on r.oid=p.proowner
    where p.oid=pg_catalog.to_regprocedure('public.read_ask_history_candidates_latest(uuid,text[],timestamptz,timestamptz,timestamptz,uuid,integer)') and p.prosecdef
      and r.rolname='ask_history_candidate_reader'
      and pg_catalog.md5(pg_catalog.replace(pg_catalog.pg_get_functiondef(p.oid),pg_catalog.chr(13),''))='6082ad4fa8754f027b08f4da94d34074'
      and pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
      and not pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
      and not pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE')
  ) then v_failures:=pg_catalog.array_append(v_failures,'ask_history_latest_reader_authority'); end if;
  -- END ASK LATEST READER AUTHORITY

  if pg_catalog.to_regprocedure('public.get_my_vet_brief_allowance_status()') is null then
    v_failures:=pg_catalog.array_append(v_failures,'vet_brief_allowance_reader_definition');
  elsif pg_catalog.md5(pg_catalog.replace(pg_catalog.pg_get_functiondef('public.get_my_vet_brief_allowance_status()'::regprocedure),pg_catalog.chr(13),'')) <> '6832d09c17bfc1762d82fe6b050c078e'
    or pg_catalog.has_function_privilege('anon','public.get_my_vet_brief_allowance_status()','EXECUTE')
    or not pg_catalog.has_function_privilege('authenticated','public.get_my_vet_brief_allowance_status()','EXECUTE') then
    v_failures:=pg_catalog.array_append(v_failures,'vet_brief_allowance_reader_definition');
  end if;
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
        and not pg_catalog.has_column_privilege('anon', v_relation, v_column, 'INSERT')
        and not pg_catalog.has_column_privilege('anon', v_relation, v_column, 'UPDATE');
    end loop;
  end if;
  if not v_ok then
    v_failures := pg_catalog.array_append(v_failures, 'canonical_memory_authority');
  end if;

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
      and not pg_catalog.has_table_privilege('authenticated', v_relation, 'INSERT')
      and not pg_catalog.has_table_privilege('authenticated', v_relation, 'UPDATE')
      and not pg_catalog.has_table_privilege('authenticated', v_relation, 'DELETE')
      and not pg_catalog.has_table_privilege('anon', v_relation, 'SELECT')
      and not pg_catalog.has_table_privilege('anon', v_relation, 'INSERT')
      and not pg_catalog.has_table_privilege('anon', v_relation, 'UPDATE')
      and not pg_catalog.has_table_privilege('anon', v_relation, 'DELETE')
      and not pg_catalog.has_table_privilege('service_role', v_relation, 'SELECT')
      and not pg_catalog.has_table_privilege('service_role', v_relation, 'INSERT')
      and not pg_catalog.has_table_privilege('service_role', v_relation, 'UPDATE')
      and not pg_catalog.has_table_privilege('service_role', v_relation, 'DELETE');
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
        and not pg_catalog.has_column_privilege('anon', v_relation, v_column, 'INSERT')
        and not pg_catalog.has_column_privilege('anon', v_relation, v_column, 'UPDATE')
        and not pg_catalog.has_column_privilege('service_role', v_relation, v_column, 'SELECT')
        and not pg_catalog.has_column_privilege('service_role', v_relation, v_column, 'INSERT')
        and not pg_catalog.has_column_privilege('service_role', v_relation, v_column, 'UPDATE');
    end loop;
  end if;
  if not v_ok then
    v_failures := pg_catalog.array_append(v_failures, 'ai_credit_authority');
  end if;

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
        and not pg_catalog.has_column_privilege('anon', v_relation, v_column, 'INSERT')
        and not pg_catalog.has_column_privilege('anon', v_relation, v_column, 'UPDATE');
    end loop;
  end if;
  if not v_ok then
    v_failures := pg_catalog.array_append(v_failures, 'action_capability_authority');
  end if;

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
$function$

$qualified_definition$;
END
$release_contract$;
