begin;

-- Readiness needs catalog access that is intentionally unavailable through the
-- exposed Data API. This RPC is read-only, service-only, and reports stable
-- compatibility codes rather than tenant rows or schema definitions.
create function public.furvise_security_compatibility_snapshot(
  p_required_migrations text[]
)
returns table(contract_version integer, failed_checks text[])
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_failures text[] := '{}'::text[];
  v_version text;
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

  if p_required_migrations is null or pg_catalog.cardinality(p_required_migrations) not between 1 and 32 then
    v_failures := pg_catalog.array_append(v_failures, 'compatibility_input');
  else
    foreach v_version in array p_required_migrations loop
      if v_version !~ '^[0-9]{14}$' or not exists (
        select 1
        from supabase_migrations.schema_migrations migration
        where migration.version::text = v_version
      ) then
        v_failures := pg_catalog.array_append(v_failures, 'required_migration:' || pg_catalog.left(v_version, 40));
      end if;
    end loop;
  end if;

  -- AI credit operations are service-only and bind logical requests to an
  -- immutable settlement disposition.
  v_relation := pg_catalog.to_regclass('public.ai_usage_events');
  v_ok := v_relation is not null
    and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ai_usage_events' and column_name = 'payload_hash')
    and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ai_usage_events' and column_name = 'logical_request_id' and is_nullable = 'NO')
    and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ai_usage_events' and column_name = 'settlement_disposition')
    and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ai_usage_events' and column_name = 'settlement_decided_at')
    and exists (
      select 1 from pg_catalog.pg_trigger trigger_row
      where trigger_row.tgrelid = v_relation and trigger_row.tgname = 'enforce_ai_credit_state_machine' and trigger_row.tgenabled <> 'D'
    );
  foreach v_signature in array array[
    'public.reserve_ai_credit(uuid,uuid,uuid,text,text)',
    'public.complete_ai_credit(uuid,uuid,uuid,text,text)',
    'public.release_ai_credit(uuid,uuid,uuid,text,text)'
  ] loop
    v_function := pg_catalog.to_regprocedure(v_signature);
    v_ok := v_ok and v_function is not null;
    if v_function is not null then
      v_ok := v_ok
        and pg_catalog.has_function_privilege('service_role', v_function, 'EXECUTE')
        and not pg_catalog.has_function_privilege('authenticated', v_function, 'EXECUTE')
        and not pg_catalog.has_function_privilege('anon', v_function, 'EXECUTE');
    end if;
  end loop;
  if not v_ok then v_failures := pg_catalog.array_append(v_failures, 'ai_credit_authority'); end if;

  -- Canonical Ask memory persistence is service-authored; the legacy JSON RPC
  -- remains present only for rollout compatibility and has no callable role.
  v_function := pg_catalog.to_regprocedure('public.persist_furvise_ask_intelligence(uuid,uuid,uuid[],uuid,uuid,uuid,text,uuid,jsonb)');
  v_ok := v_function is not null;
  if v_function is not null then
    v_ok := v_ok
      and pg_catalog.has_function_privilege('service_role', v_function, 'EXECUTE')
      and not pg_catalog.has_function_privilege('authenticated', v_function, 'EXECUTE')
      and not pg_catalog.has_function_privilege('anon', v_function, 'EXECUTE');
  end if;
  v_function := pg_catalog.to_regprocedure('public.persist_furvise_intelligence(uuid,uuid,jsonb,jsonb)');
  v_ok := v_ok and v_function is not null;
  if v_function is not null then
    v_ok := v_ok
      and not pg_catalog.has_function_privilege('service_role', v_function, 'EXECUTE')
      and not pg_catalog.has_function_privilege('authenticated', v_function, 'EXECUTE')
      and not pg_catalog.has_function_privilege('anon', v_function, 'EXECUTE');
  end if;
  v_function := pg_catalog.to_regprocedure('public.persist_furvise_feature_intelligence(uuid,uuid,text,text,uuid,text,uuid,text,jsonb,jsonb)');
  v_ok := v_ok and v_function is not null;
  if v_function is not null then
    v_ok := v_ok
      and pg_catalog.has_function_privilege('service_role', v_function, 'EXECUTE')
      and not pg_catalog.has_function_privilege('authenticated', v_function, 'EXECUTE')
      and not pg_catalog.has_function_privilege('anon', v_function, 'EXECUTE');
  end if;
  v_relation := pg_catalog.to_regclass('public.furvise_memories');
  v_ok := v_ok and v_relation is not null;
  if v_relation is not null then
    v_ok := v_ok
      and exists (select 1 from pg_catalog.pg_class relation where relation.oid = v_relation and relation.relrowsecurity and relation.relforcerowsecurity)
      and pg_catalog.has_table_privilege('authenticated', v_relation, 'SELECT')
      and not pg_catalog.has_table_privilege('authenticated', v_relation, 'INSERT')
      and exists (
        select 1 from pg_catalog.pg_trigger trigger_row
        where trigger_row.tgrelid = v_relation and trigger_row.tgname = 'furvise_memories_semantic_integrity' and trigger_row.tgenabled <> 'D'
      );
  end if;
  if not v_ok then v_failures := pg_catalog.array_append(v_failures, 'canonical_memory_authority'); end if;

  -- Application action capabilities must retain exact target, freshness, and
  -- expiry state and remain server-authored/server-executed.
  v_relation := pg_catalog.to_regclass('public.ask_action_capabilities');
  v_ok := v_relation is not null
    and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ask_action_capabilities' and column_name = 'target_id' and udt_name = 'uuid')
    and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ask_action_capabilities' and column_name = 'target_updated_at' and udt_name = 'timestamptz')
    and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ask_action_capabilities' and column_name = 'expires_at' and udt_name = 'timestamptz' and is_nullable = 'NO');
  if v_relation is not null then
    v_ok := v_ok
      and exists (select 1 from pg_catalog.pg_class relation where relation.oid = v_relation and relation.relrowsecurity and relation.relforcerowsecurity)
      and not pg_catalog.has_table_privilege('authenticated', v_relation, 'INSERT,UPDATE,DELETE')
      and exists (select 1 from pg_catalog.pg_trigger trigger_row where trigger_row.tgrelid = v_relation and trigger_row.tgname = 'ask_action_capabilities_validate_insert' and trigger_row.tgenabled <> 'D')
      and exists (select 1 from pg_catalog.pg_trigger trigger_row where trigger_row.tgrelid = v_relation and trigger_row.tgname = 'ask_action_capabilities_protect_update' and trigger_row.tgenabled <> 'D');
  end if;
  v_function := pg_catalog.to_regprocedure('public.execute_ask_action_capability(uuid,uuid,uuid,text,uuid)');
  v_ok := v_ok and v_function is not null;
  if v_function is not null then
    select pg_catalog.pg_get_functiondef(v_function) into v_definition;
    v_ok := v_ok
      and pg_catalog.has_function_privilege('service_role', v_function, 'EXECUTE')
      and not pg_catalog.has_function_privilege('authenticated', v_function, 'EXECUTE')
      and not pg_catalog.has_function_privilege('anon', v_function, 'EXECUTE')
      and v_definition ~* 'v_now\s*>=\s*v\.expires_at'
      and v_definition ~* 'v_entry\.updated_at\s+is\s+distinct\s+from\s+v\.target_updated_at'
      and v_definition ~* 'v_concern\.updated_at\s+is\s+distinct\s+from\s+v\.target_updated_at';
  end if;
  if not v_ok then v_failures := pg_catalog.array_append(v_failures, 'action_capability_authority'); end if;

  -- Care History editing is an exact owner/pet/freshness RPC. Browser roles
  -- have no direct UPDATE or DELETE authority and no dormant UPDATE policy.
  v_relation := pg_catalog.to_regclass('public.pet_care_entries');
  v_function := pg_catalog.to_regprocedure('public.update_my_care_entry(uuid,uuid,timestamptz,text,text,text,text,timestamptz)');
  v_ok := v_relation is not null and v_function is not null;
  if v_function is not null then
    select pg_catalog.pg_get_functiondef(v_function) into v_definition;
    v_ok := v_ok
      and pg_catalog.has_function_privilege('authenticated', v_function, 'EXECUTE')
      and not pg_catalog.has_function_privilege('anon', v_function, 'EXECUTE')
      and not pg_catalog.has_function_privilege('service_role', v_function, 'EXECUTE')
      and v_definition ~* 'entry\.user_id\s*=\s*v_user_id'
      and v_definition ~* 'entry\.pet_profile_id\s*=\s*p_pet_profile_id'
      and v_definition ~* 'entry\.updated_at\s+is\s+distinct\s+from\s+p_expected_updated_at';
  end if;
  if v_relation is not null then
    v_ok := v_ok
      and exists (select 1 from pg_catalog.pg_class relation where relation.oid = v_relation and relation.relrowsecurity)
      and not pg_catalog.has_table_privilege('authenticated', v_relation, 'UPDATE')
      and not pg_catalog.has_table_privilege('authenticated', v_relation, 'DELETE')
      and not pg_catalog.has_table_privilege('anon', v_relation, 'INSERT,UPDATE,DELETE')
      and pg_catalog.has_table_privilege('service_role', v_relation, 'SELECT,INSERT,UPDATE,DELETE')
      and not exists (
        select 1 from pg_catalog.pg_attribute attribute
        where attribute.attrelid = v_relation and attribute.attnum > 0 and not attribute.attisdropped
          and pg_catalog.has_column_privilege('authenticated', v_relation, attribute.attname, 'UPDATE')
      )
      and not exists (
        select 1 from pg_catalog.pg_policies policy
        where policy.schemaname = 'public' and policy.tablename = 'pet_care_entries' and policy.cmd = 'UPDATE'
      );
  end if;
  if not v_ok then v_failures := pg_catalog.array_append(v_failures, 'care_history_write_authority'); end if;

  -- Vet Brief entitlement policies and permanent deletion rely on forced pet
  -- RLS, protected lifecycle columns, and a service-only deletion RPC.
  v_relation := pg_catalog.to_regclass('public.dog_profiles');
  v_ok := v_relation is not null;
  if v_relation is not null then
    v_ok := v_ok
      and exists (select 1 from pg_catalog.pg_class relation where relation.oid = v_relation and relation.relrowsecurity and relation.relforcerowsecurity)
      and not pg_catalog.has_table_privilege('authenticated', v_relation, 'DELETE');
    foreach v_column in array array['user_id', 'lifecycle_status', 'lifecycle_changed_at', 'deceased_at'] loop
      v_ok := v_ok and not pg_catalog.has_column_privilege('authenticated', v_relation, v_column, 'UPDATE');
    end loop;
  end if;
  v_function := pg_catalog.to_regprocedure('public.has_vet_brief_entitlement()');
  v_ok := v_ok and v_function is not null;
  if v_function is not null then
    v_ok := v_ok
      and pg_catalog.has_function_privilege('authenticated', v_function, 'EXECUTE')
      and not pg_catalog.has_function_privilege('anon', v_function, 'EXECUTE');
  end if;
  v_ok := v_ok and (
    select pg_catalog.count(*) = 4
    from pg_catalog.pg_policies policy
    where policy.schemaname = 'public' and policy.tablename = 'vet_visit_briefs'
      and policy.policyname in (
        'vet_visit_briefs_select_own', 'vet_visit_briefs_insert_own',
        'vet_visit_briefs_update_own', 'vet_visit_briefs_delete_own'
      )
      and (coalesce(policy.qual, '') || ' ' || coalesce(policy.with_check, '')) ~ 'has_vet_brief_entitlement'
  );
  if not v_ok then v_failures := pg_catalog.array_append(v_failures, 'entitlement_pet_boundary'); end if;

  v_function := pg_catalog.to_regprocedure('public.delete_pet_profile_for_user(uuid,uuid)');
  v_ok := v_function is not null;
  if v_function is not null then
    select pg_catalog.pg_get_functiondef(v_function) into v_definition;
    v_ok := v_ok
      and pg_catalog.has_function_privilege('service_role', v_function, 'EXECUTE')
      and not pg_catalog.has_function_privilege('authenticated', v_function, 'EXECUTE')
      and not pg_catalog.has_function_privilege('anon', v_function, 'EXECUTE')
      and v_definition ~* 'service_role'
      and v_definition ~* 'where\s+id\s*=\s*p_pet_id\s+and\s+user_id\s*=\s*p_user_id';
  end if;
  if not v_ok then v_failures := pg_catalog.array_append(v_failures, 'permanent_delete_authority'); end if;

  return query select 1, v_failures;
end;
$$;

revoke all on function public.furvise_security_compatibility_snapshot(text[])
  from public, anon, authenticated, service_role;
grant execute on function public.furvise_security_compatibility_snapshot(text[])
  to service_role;

do $$
begin
  if pg_catalog.has_function_privilege('authenticated', 'public.furvise_security_compatibility_snapshot(text[])', 'EXECUTE')
    or pg_catalog.has_function_privilege('anon', 'public.furvise_security_compatibility_snapshot(text[])', 'EXECUTE')
    or not pg_catalog.has_function_privilege('service_role', 'public.furvise_security_compatibility_snapshot(text[])', 'EXECUTE') then
    raise exception 'security compatibility readiness RPC grants are invalid';
  end if;
end;
$$;

comment on function public.furvise_security_compatibility_snapshot(text[]) is
  'Service-only, read-only deployment compatibility checks for launch-critical security schema capabilities.';

notify pgrst, 'reload schema';

commit;
