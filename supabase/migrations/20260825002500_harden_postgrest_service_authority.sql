begin;

-- Supabase's opaque sb_secret_* keys authorize PostgREST requests by switching
-- the database request role to service_role without requiring a legacy JWT role
-- claim. Preserve that request-role authority across SECURITY DEFINER functions,
-- then bridge legacy Furvise guards transaction-locally while older layers are
-- retired incrementally.
create or replace function private.require_service_role_request()
returns void
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_request_role text := nullif(pg_catalog.current_setting('role', true), '');
  v_claims_text text := nullif(pg_catalog.current_setting('request.jwt.claims', true), '');
  v_claims jsonb := '{}'::jsonb;
begin
  if v_request_role = 'none' then
    v_request_role := null;
  end if;

  if v_claims_text is not null then
    begin
      v_claims := v_claims_text::jsonb;
    exception when others then
      v_claims := '{}'::jsonb;
    end;
  end if;

  if v_request_role is null then
    v_request_role := nullif(v_claims ->> 'role', '');
  end if;
  if v_request_role is null then
    v_request_role := nullif(
      pg_catalog.current_setting('request.jwt.claim.role', true),
      ''
    );
  end if;

  if v_request_role <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;

  -- Older deployed Furvise service RPCs used one of these claim settings for
  -- defense-in-depth. Only a request already proven to be service_role reaches
  -- this bridge, so an authenticated browser cannot promote itself by claims.
  perform pg_catalog.set_config(
    'request.jwt.claims',
    (v_claims || pg_catalog.jsonb_build_object('role', 'service_role'))::text,
    true
  );
  perform pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);
end;
$$;

revoke all on function private.require_service_role_request()
  from public, anon, authenticated, service_role;

-- Keep the already-proven implementations intact, but move them behind a new
-- request-role-aware service boundary. This avoids rewriting financial and
-- idempotency state-machine logic while removing reliance on legacy JWT GUCs.
alter function public.claim_idempotency_operation(uuid,text,uuid,text,integer,integer)
  set schema private;
alter function private.claim_idempotency_operation(uuid,text,uuid,text,integer,integer)
  rename to claim_idempotency_operation_pre_postgrest_service_authority;

alter function public.complete_idempotency_operation(uuid,text,uuid,uuid,integer,jsonb,text,uuid)
  set schema private;
alter function private.complete_idempotency_operation(uuid,text,uuid,uuid,integer,jsonb,text,uuid)
  rename to complete_idempotency_operation_pre_postgrest_service_authority;

alter function public.fail_idempotency_operation(uuid,text,uuid,uuid,boolean,text,integer,jsonb)
  set schema private;
alter function private.fail_idempotency_operation(uuid,text,uuid,uuid,boolean,text,integer,jsonb)
  rename to fail_idempotency_operation_pre_postgrest_service_authority;

alter function public.abandon_idempotency_operation(uuid,text,uuid,uuid,text)
  set schema private;
alter function private.abandon_idempotency_operation(uuid,text,uuid,uuid,text)
  rename to abandon_idempotency_operation_pre_postgrest_service_authority;

alter function public.cleanup_expired_idempotency_operations(boolean,integer)
  set schema private;
alter function private.cleanup_expired_idempotency_operations(boolean,integer)
  rename to cleanup_expired_idempotency_operations_pre_postgrest_service_authority;

alter function public.claim_billing_checkout_single_flight(uuid,text,integer,text)
  set schema private;
alter function private.claim_billing_checkout_single_flight(uuid,text,integer,text)
  rename to claim_billing_checkout_single_flight_pre_postgrest_service_authority;

alter function public.claim_billing_checkout_single_flight_v2(uuid,text,integer,text,text)
  set schema private;
alter function private.claim_billing_checkout_single_flight_v2(uuid,text,integer,text,text)
  rename to claim_billing_checkout_single_flight_v2_pre_postgrest_service_authority;

alter function public.complete_billing_checkout_single_flight(uuid,text,uuid,uuid,text,timestamptz)
  set schema private;
alter function private.complete_billing_checkout_single_flight(uuid,text,uuid,uuid,text,timestamptz)
  rename to complete_billing_checkout_single_flight_pre_postgrest_service_authority;

alter function public.abandon_billing_checkout_single_flight(uuid,text,uuid,uuid)
  set schema private;
alter function private.abandon_billing_checkout_single_flight(uuid,text,uuid,uuid)
  rename to abandon_billing_checkout_single_flight_pre_postgrest_service_authority;

alter function public.reset_billing_checkout_single_flight(uuid,text,text)
  set schema private;
alter function private.reset_billing_checkout_single_flight(uuid,text,text)
  rename to reset_billing_checkout_single_flight_pre_postgrest_service_authority;

revoke all on function private.claim_idempotency_operation_pre_postgrest_service_authority(uuid,text,uuid,text,integer,integer)
  from public, anon, authenticated, service_role;
revoke all on function private.complete_idempotency_operation_pre_postgrest_service_authority(uuid,text,uuid,uuid,integer,jsonb,text,uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.fail_idempotency_operation_pre_postgrest_service_authority(uuid,text,uuid,uuid,boolean,text,integer,jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.abandon_idempotency_operation_pre_postgrest_service_authority(uuid,text,uuid,uuid,text)
  from public, anon, authenticated, service_role;
revoke all on function private.cleanup_expired_idempotency_operations_pre_postgrest_service_authority(boolean,integer)
  from public, anon, authenticated, service_role;
revoke all on function private.claim_billing_checkout_single_flight_pre_postgrest_service_authority(uuid,text,integer,text)
  from public, anon, authenticated, service_role;
revoke all on function private.claim_billing_checkout_single_flight_v2_pre_postgrest_service_authority(uuid,text,integer,text,text)
  from public, anon, authenticated, service_role;
revoke all on function private.complete_billing_checkout_single_flight_pre_postgrest_service_authority(uuid,text,uuid,uuid,text,timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function private.abandon_billing_checkout_single_flight_pre_postgrest_service_authority(uuid,text,uuid,uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.reset_billing_checkout_single_flight_pre_postgrest_service_authority(uuid,text,text)
  from public, anon, authenticated, service_role;

create function public.claim_idempotency_operation(
  p_user_id uuid,
  p_operation_type text,
  p_idempotency_key uuid,
  p_payload_hash text,
  p_retention_seconds integer default 604800,
  p_lease_seconds integer default 120
)
returns table (
  claim_outcome text,
  operation_id uuid,
  owner_token uuid,
  response_status integer,
  response_body jsonb,
  retry_after_seconds integer,
  error_code text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_service_role_request();
  return query
  select * from private.claim_idempotency_operation_pre_postgrest_service_authority(
    p_user_id, p_operation_type, p_idempotency_key, p_payload_hash,
    p_retention_seconds, p_lease_seconds
  );
end;
$$;

create function public.complete_idempotency_operation(
  p_user_id uuid,
  p_operation_type text,
  p_idempotency_key uuid,
  p_owner_token uuid,
  p_response_status integer,
  p_response_body jsonb default null,
  p_resource_type text default null,
  p_resource_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_service_role_request();
  return private.complete_idempotency_operation_pre_postgrest_service_authority(
    p_user_id, p_operation_type, p_idempotency_key, p_owner_token,
    p_response_status, p_response_body, p_resource_type, p_resource_id
  );
end;
$$;

create function public.fail_idempotency_operation(
  p_user_id uuid,
  p_operation_type text,
  p_idempotency_key uuid,
  p_owner_token uuid,
  p_retryable boolean,
  p_error_code text default null,
  p_response_status integer default null,
  p_response_body jsonb default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_service_role_request();
  return private.fail_idempotency_operation_pre_postgrest_service_authority(
    p_user_id, p_operation_type, p_idempotency_key, p_owner_token,
    p_retryable, p_error_code, p_response_status, p_response_body
  );
end;
$$;

create function public.abandon_idempotency_operation(
  p_user_id uuid,
  p_operation_type text,
  p_idempotency_key uuid,
  p_owner_token uuid,
  p_error_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_service_role_request();
  return private.abandon_idempotency_operation_pre_postgrest_service_authority(
    p_user_id, p_operation_type, p_idempotency_key, p_owner_token, p_error_code
  );
end;
$$;

create function public.cleanup_expired_idempotency_operations(
  p_apply boolean default false,
  p_batch_limit integer default 500
)
returns table (eligible_count bigint, deleted_count bigint)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_service_role_request();
  return query
  select * from private.cleanup_expired_idempotency_operations_pre_postgrest_service_authority(
    p_apply, p_batch_limit
  );
end;
$$;

create function public.claim_billing_checkout_single_flight(
  p_user_id uuid,
  p_product_key text,
  p_lease_seconds integer,
  p_return_origin text
)
returns table(
  claim_outcome text,
  attempt_id uuid,
  owner_token uuid,
  return_origin text,
  stripe_checkout_session_id text,
  session_expires_at timestamptz,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_service_role_request();
  return query
  select * from private.claim_billing_checkout_single_flight_pre_postgrest_service_authority(
    p_user_id, p_product_key, p_lease_seconds, p_return_origin
  );
end;
$$;

create function public.claim_billing_checkout_single_flight_v2(
  p_user_id uuid,
  p_product_key text,
  p_lease_seconds integer,
  p_return_origin text,
  p_checkout_currency text
)
returns table(
  claim_outcome text,
  attempt_id uuid,
  owner_token uuid,
  return_origin text,
  checkout_currency text,
  stripe_checkout_session_id text,
  session_expires_at timestamptz,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_service_role_request();
  return query
  select * from private.claim_billing_checkout_single_flight_v2_pre_postgrest_service_authority(
    p_user_id, p_product_key, p_lease_seconds, p_return_origin, p_checkout_currency
  );
end;
$$;

create function public.complete_billing_checkout_single_flight(
  p_user_id uuid,
  p_product_key text,
  p_attempt_id uuid,
  p_owner_token uuid,
  p_stripe_checkout_session_id text,
  p_session_expires_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_service_role_request();
  return private.complete_billing_checkout_single_flight_pre_postgrest_service_authority(
    p_user_id, p_product_key, p_attempt_id, p_owner_token,
    p_stripe_checkout_session_id, p_session_expires_at
  );
end;
$$;

create function public.abandon_billing_checkout_single_flight(
  p_user_id uuid,
  p_product_key text,
  p_attempt_id uuid,
  p_owner_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_service_role_request();
  return private.abandon_billing_checkout_single_flight_pre_postgrest_service_authority(
    p_user_id, p_product_key, p_attempt_id, p_owner_token
  );
end;
$$;

create function public.reset_billing_checkout_single_flight(
  p_user_id uuid,
  p_product_key text,
  p_stripe_checkout_session_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_service_role_request();
  return private.reset_billing_checkout_single_flight_pre_postgrest_service_authority(
    p_user_id, p_product_key, p_stripe_checkout_session_id
  );
end;
$$;

revoke all on function public.claim_idempotency_operation(uuid,text,uuid,text,integer,integer)
  from public, anon, authenticated, service_role;
revoke all on function public.complete_idempotency_operation(uuid,text,uuid,uuid,integer,jsonb,text,uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.fail_idempotency_operation(uuid,text,uuid,uuid,boolean,text,integer,jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.abandon_idempotency_operation(uuid,text,uuid,uuid,text)
  from public, anon, authenticated, service_role;
revoke all on function public.cleanup_expired_idempotency_operations(boolean,integer)
  from public, anon, authenticated, service_role;
revoke all on function public.claim_billing_checkout_single_flight(uuid,text,integer,text)
  from public, anon, authenticated, service_role;
revoke all on function public.claim_billing_checkout_single_flight_v2(uuid,text,integer,text,text)
  from public, anon, authenticated, service_role;
revoke all on function public.complete_billing_checkout_single_flight(uuid,text,uuid,uuid,text,timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.abandon_billing_checkout_single_flight(uuid,text,uuid,uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.reset_billing_checkout_single_flight(uuid,text,text)
  from public, anon, authenticated, service_role;

grant execute on function public.claim_idempotency_operation(uuid,text,uuid,text,integer,integer)
  to service_role;
grant execute on function public.complete_idempotency_operation(uuid,text,uuid,uuid,integer,jsonb,text,uuid)
  to service_role;
grant execute on function public.fail_idempotency_operation(uuid,text,uuid,uuid,boolean,text,integer,jsonb)
  to service_role;
grant execute on function public.abandon_idempotency_operation(uuid,text,uuid,uuid,text)
  to service_role;
grant execute on function public.cleanup_expired_idempotency_operations(boolean,integer)
  to service_role;
grant execute on function public.claim_billing_checkout_single_flight(uuid,text,integer,text)
  to service_role;
grant execute on function public.claim_billing_checkout_single_flight_v2(uuid,text,integer,text,text)
  to service_role;
grant execute on function public.complete_billing_checkout_single_flight(uuid,text,uuid,uuid,text,timestamptz)
  to service_role;
grant execute on function public.abandon_billing_checkout_single_flight(uuid,text,uuid,uuid)
  to service_role;
grant execute on function public.reset_billing_checkout_single_flight(uuid,text,text)
  to service_role;

-- Preserve every earlier readiness layer, but bridge its legacy claim guard only
-- after proving the actual PostgREST request role. Older semantic checks for the
-- single-flight function bodies are replaced below with the modern equivalent.
alter function public.furvise_security_compatibility_snapshot_v2(text[])
  set schema private;
alter function private.furvise_security_compatibility_snapshot_v2(text[])
  rename to furvise_security_compatibility_snapshot_v2_pre_postgrest_service_authority;
revoke all on function private.furvise_security_compatibility_snapshot_v2_pre_postgrest_service_authority(text[])
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
  v_service_signatures text[] := array[
    'public.claim_idempotency_operation(uuid,text,uuid,text,integer,integer)',
    'public.complete_idempotency_operation(uuid,text,uuid,uuid,integer,jsonb,text,uuid)',
    'public.fail_idempotency_operation(uuid,text,uuid,uuid,boolean,text,integer,jsonb)',
    'public.abandon_idempotency_operation(uuid,text,uuid,uuid,text)',
    'public.cleanup_expired_idempotency_operations(boolean,integer)'
  ]::text[];
  v_billing_signatures text[] := array[
    'public.claim_billing_checkout_single_flight(uuid,text,integer,text)',
    'public.claim_billing_checkout_single_flight_v2(uuid,text,integer,text,text)',
    'public.complete_billing_checkout_single_flight(uuid,text,uuid,uuid,text,timestamptz)',
    'public.abandon_billing_checkout_single_flight(uuid,text,uuid,uuid)',
    'public.reset_billing_checkout_single_flight(uuid,text,text)'
  ]::text[];
  v_legacy_signatures text[] := array[
    'private.claim_idempotency_operation_pre_postgrest_service_authority(uuid,text,uuid,text,integer,integer)',
    'private.complete_idempotency_operation_pre_postgrest_service_authority(uuid,text,uuid,uuid,integer,jsonb,text,uuid)',
    'private.fail_idempotency_operation_pre_postgrest_service_authority(uuid,text,uuid,uuid,boolean,text,integer,jsonb)',
    'private.abandon_idempotency_operation_pre_postgrest_service_authority(uuid,text,uuid,uuid,text)',
    'private.cleanup_expired_idempotency_operations_pre_postgrest_service_authority(boolean,integer)',
    'private.claim_billing_checkout_single_flight_pre_postgrest_service_authority(uuid,text,integer,text)',
    'private.claim_billing_checkout_single_flight_v2_pre_postgrest_service_authority(uuid,text,integer,text,text)',
    'private.complete_billing_checkout_single_flight_pre_postgrest_service_authority(uuid,text,uuid,uuid,text,timestamptz)',
    'private.abandon_billing_checkout_single_flight_pre_postgrest_service_authority(uuid,text,uuid,uuid)',
    'private.reset_billing_checkout_single_flight_pre_postgrest_service_authority(uuid,text,text)'
  ]::text[];
  v_signature text;
  v_function oid;
  v_definition text;
  v_helper oid;
  v_helper_definition text;
  v_relation oid;
  v_service_ok boolean := true;
  v_billing_ok boolean := true;
begin
  perform private.require_service_role_request();

  select snapshot.failed_checks into v_prior_failures
  from private.furvise_security_compatibility_snapshot_v2_pre_postgrest_service_authority(
    p_required_migration_names
  ) snapshot;

  -- Those two labels were produced by old regexes that required the exact
  -- legacy request.jwt.claim.role implementation. Recompute their authority
  -- below instead of treating a safer request-role wrapper as drift.
  v_prior_failures := pg_catalog.array_remove(
    coalesce(v_prior_failures, '{}'::text[]),
    'billing_checkout_authority'
  );
  v_prior_failures := pg_catalog.array_remove(
    v_prior_failures,
    'billing_checkout_currency_authority'
  );
  v_failures := v_failures || v_prior_failures;

  v_helper := pg_catalog.to_regprocedure('private.require_service_role_request()');
  v_service_ok := v_service_ok and v_helper is not null;
  if v_helper is not null then
    select pg_catalog.pg_get_functiondef(v_helper) into v_helper_definition;
    v_service_ok := v_service_ok
      and not (select proc.prosecdef from pg_catalog.pg_proc proc where proc.oid = v_helper)
      and coalesce((
        select proc.proconfig @> array['search_path=""']::text[]
        from pg_catalog.pg_proc proc
        where proc.oid = v_helper
      ), false)
      and not pg_catalog.has_function_privilege('service_role', v_helper, 'EXECUTE')
      and not pg_catalog.has_function_privilege('authenticated', v_helper, 'EXECUTE')
      and not pg_catalog.has_function_privilege('anon', v_helper, 'EXECUTE')
      and v_helper_definition ~* 'current_setting'
      and v_helper_definition ~* 'request[.]jwt[.]claims'
      and v_helper_definition ~* 'request[.]jwt[.]claim[.]role'
      and v_helper_definition ~* 'SERVICE_ROLE_REQUIRED';
  end if;

  foreach v_signature in array v_service_signatures loop
    v_function := pg_catalog.to_regprocedure(v_signature);
    v_service_ok := v_service_ok and v_function is not null;
    if v_function is not null then
      select pg_catalog.pg_get_functiondef(v_function) into v_definition;
      v_service_ok := v_service_ok
        and (select proc.prosecdef from pg_catalog.pg_proc proc where proc.oid = v_function)
        and coalesce((
          select proc.proconfig @> array['search_path=""']::text[]
          from pg_catalog.pg_proc proc
          where proc.oid = v_function
        ), false)
        and pg_catalog.has_function_privilege('service_role', v_function, 'EXECUTE')
        and not pg_catalog.has_function_privilege('authenticated', v_function, 'EXECUTE')
        and not pg_catalog.has_function_privilege('anon', v_function, 'EXECUTE')
        and v_definition ~* 'private[.]require_service_role_request';
    end if;
  end loop;

  foreach v_signature in array v_billing_signatures loop
    v_function := pg_catalog.to_regprocedure(v_signature);
    v_billing_ok := v_billing_ok and v_function is not null;
    if v_function is not null then
      select pg_catalog.pg_get_functiondef(v_function) into v_definition;
      v_billing_ok := v_billing_ok
        and (select proc.prosecdef from pg_catalog.pg_proc proc where proc.oid = v_function)
        and coalesce((
          select proc.proconfig @> array['search_path=""']::text[]
          from pg_catalog.pg_proc proc
          where proc.oid = v_function
        ), false)
        and pg_catalog.has_function_privilege('service_role', v_function, 'EXECUTE')
        and not pg_catalog.has_function_privilege('authenticated', v_function, 'EXECUTE')
        and not pg_catalog.has_function_privilege('anon', v_function, 'EXECUTE')
        and v_definition ~* 'private[.]require_service_role_request';
    end if;
  end loop;

  foreach v_signature in array v_legacy_signatures loop
    v_function := pg_catalog.to_regprocedure(v_signature);
    v_service_ok := v_service_ok and v_function is not null;
    if v_function is not null then
      v_service_ok := v_service_ok
        and not pg_catalog.has_function_privilege('service_role', v_function, 'EXECUTE')
        and not pg_catalog.has_function_privilege('authenticated', v_function, 'EXECUTE')
        and not pg_catalog.has_function_privilege('anon', v_function, 'EXECUTE');
    end if;
  end loop;

  v_relation := pg_catalog.to_regclass('private.billing_checkout_single_flights');
  v_billing_ok := v_billing_ok and v_relation is not null;
  if v_relation is not null then
    v_billing_ok := v_billing_ok
      and not pg_catalog.has_table_privilege('service_role', v_relation, 'SELECT')
      and not pg_catalog.has_table_privilege('service_role', v_relation, 'INSERT')
      and not pg_catalog.has_table_privilege('service_role', v_relation, 'UPDATE')
      and not pg_catalog.has_table_privilege('service_role', v_relation, 'DELETE')
      and not pg_catalog.has_table_privilege('authenticated', v_relation, 'SELECT')
      and not pg_catalog.has_table_privilege('authenticated', v_relation, 'INSERT')
      and not pg_catalog.has_table_privilege('authenticated', v_relation, 'UPDATE')
      and not pg_catalog.has_table_privilege('authenticated', v_relation, 'DELETE')
      and exists (
        select 1
        from pg_catalog.pg_attribute attribute
        where attribute.attrelid = v_relation
          and attribute.attname = 'checkout_currency'
          and attribute.atttypid = 'text'::regtype
          and attribute.attnum > 0
          and not attribute.attisdropped
      );
  end if;

  if (
    select pg_catalog.count(*)
    from pg_catalog.pg_proc proc
    join pg_catalog.pg_namespace namespace on namespace.oid = proc.pronamespace
    where namespace.nspname = 'public'
      and proc.proname in (
        'claim_idempotency_operation',
        'complete_idempotency_operation',
        'fail_idempotency_operation',
        'abandon_idempotency_operation',
        'cleanup_expired_idempotency_operations'
      )
  ) <> 5 then
    v_service_ok := false;
  end if;

  if (
    select pg_catalog.count(*)
    from pg_catalog.pg_proc proc
    join pg_catalog.pg_namespace namespace on namespace.oid = proc.pronamespace
    where namespace.nspname = 'public'
      and proc.proname in (
        'claim_billing_checkout_single_flight',
        'claim_billing_checkout_single_flight_v2',
        'complete_billing_checkout_single_flight',
        'abandon_billing_checkout_single_flight',
        'reset_billing_checkout_single_flight'
      )
  ) <> 5 then
    v_billing_ok := false;
  end if;

  if not v_service_ok then
    v_failures := pg_catalog.array_append(v_failures, 'service_request_authority');
  end if;
  if not v_billing_ok then
    v_failures := pg_catalog.array_append(v_failures, 'billing_checkout_authority');
    v_failures := pg_catalog.array_append(v_failures, 'billing_checkout_currency_authority');
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

comment on function private.require_service_role_request() is
  'Validates the PostgREST request database role, then transaction-locally bridges legacy Furvise service-role claim guards.';
comment on function public.furvise_security_compatibility_snapshot_v2(text[]) is
  'Service-only V2 compatibility contract with PostgREST request-role-aware server authority.';

notify pgrst, 'reload schema';
commit;
