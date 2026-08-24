begin;

-- A transient renewal failure should not instantly punish a paying Furvise user.
-- Keep the Stripe projection truthful (`plan` remains active-only), but remember
-- when a subscription first entered `past_due` so entitlement resolution can
-- provide a bounded seven-day recovery window without depending on Stripe's
-- account-level retry schedule or allowing grace to extend indefinitely.
alter table public.billing_accounts
  add column past_due_since timestamptz;

comment on column public.billing_accounts.past_due_since is
  'Stripe event time when the current continuous past_due episode began. Cleared when the subscription leaves past_due.';

create or replace function public.apply_stripe_subscription_projection(
  p_user_id uuid,
  p_stripe_customer_id text,
  p_stripe_subscription_id text,
  p_stripe_price_id text,
  p_stripe_currency text,
  p_price_recognized boolean,
  p_subscription_status text,
  p_current_period_start timestamptz,
  p_current_period_end timestamptz,
  p_cancel_at_period_end boolean,
  p_stripe_event_id text,
  p_stripe_event_type text,
  p_stripe_event_created_at timestamptz
)
returns text
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_account public.billing_accounts%rowtype;
  v_plan text;
  v_past_due_since timestamptz;
begin
  if p_user_id is null
    or nullif(btrim(p_stripe_customer_id), '') is null
    or nullif(btrim(p_stripe_subscription_id), '') is null
    or nullif(btrim(p_stripe_price_id), '') is null
    or nullif(btrim(p_stripe_currency), '') is null
    or p_stripe_currency !~ '^[a-z]{3}$'
    or nullif(btrim(p_stripe_event_id), '') is null
    or nullif(btrim(p_stripe_event_type), '') is null
    or p_stripe_event_created_at is null
    or p_subscription_status not in ('incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused') then
    raise exception using errcode = '22023', message = 'INVALID_STRIPE_SUBSCRIPTION_PROJECTION';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('billing:' || p_user_id::text, 0));
  if exists (select 1 from private.stripe_webhook_events where stripe_event_id = p_stripe_event_id) then
    return 'replayed';
  end if;

  select * into v_account from public.billing_accounts where user_id = p_user_id for update;
  if v_account.user_id is null or v_account.stripe_customer_id <> p_stripe_customer_id then
    raise exception using errcode = '42501', message = 'BILLING_CUSTOMER_NOT_ASSOCIATED';
  end if;
  if v_account.last_stripe_event_created_at is not null
    and p_stripe_event_created_at < v_account.last_stripe_event_created_at then
    insert into private.stripe_webhook_events (
      stripe_event_id, stripe_event_type, stripe_event_created_at, processing_status
    ) values (
      p_stripe_event_id, p_stripe_event_type, p_stripe_event_created_at, 'ignored_stale'
    );
    return 'ignored_stale';
  end if;
  if p_price_recognized and v_account.checkout_price_id <> p_stripe_price_id then
    raise exception using errcode = '42501', message = 'BILLING_PRICE_ASSOCIATION_MISMATCH';
  end if;

  v_plan := case
    when p_price_recognized
      and p_subscription_status = 'active'
      and p_current_period_start is not null
      and p_current_period_end is not null
      and p_current_period_end > p_current_period_start
    then 'plus'
    else 'free'
  end;

  v_past_due_since := case
    when p_subscription_status = 'past_due' then
      case
        when v_account.subscription_status = 'past_due' and v_account.past_due_since is not null
        then v_account.past_due_since
        else p_stripe_event_created_at
      end
    else null
  end;

  update public.billing_accounts set
    stripe_subscription_id = p_stripe_subscription_id,
    stripe_price_id = p_stripe_price_id,
    stripe_currency = p_stripe_currency,
    plan = v_plan,
    subscription_status = p_subscription_status,
    current_period_start = p_current_period_start,
    current_period_end = p_current_period_end,
    cancel_at_period_end = coalesce(p_cancel_at_period_end, false),
    past_due_since = v_past_due_since,
    last_stripe_event_id = p_stripe_event_id,
    last_stripe_event_created_at = p_stripe_event_created_at,
    updated_at = now()
  where user_id = p_user_id;

  insert into private.stripe_webhook_events (
    stripe_event_id, stripe_event_type, stripe_event_created_at, processing_status
  ) values (
    p_stripe_event_id, p_stripe_event_type, p_stripe_event_created_at, 'processed'
  );
  return case when v_plan = 'plus' then 'plus_active' else 'free_active' end;
end;
$$;

revoke all on function public.apply_stripe_subscription_projection(uuid,text,text,text,text,boolean,text,timestamptz,timestamptz,boolean,text,text,timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.apply_stripe_subscription_projection(uuid,text,text,text,text,boolean,text,timestamptz,timestamptz,boolean,text,text,timestamptz)
  to service_role;

create or replace function private.resolve_active_billing_plan(p_user_id uuid)
returns table(
  billing_plan text,
  period_start date,
  period_end timestamptz,
  period_key text,
  subscription_status text,
  cancel_at_period_end boolean
)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  with account_state as (
    select account.*,
      case
        when account.plan = 'plus'
          and account.subscription_status = 'active'
          and account.current_period_start <= statement_timestamp()
          and account.current_period_end > statement_timestamp()
        then true
        when account.subscription_status = 'past_due'
          and account.stripe_subscription_id is not null
          and account.stripe_price_id is not null
          and account.stripe_price_id = account.checkout_price_id
          and account.current_period_start <= statement_timestamp()
          and account.current_period_end > statement_timestamp()
          and account.past_due_since is not null
          and account.past_due_since <= statement_timestamp()
          and account.past_due_since + interval '7 days' > statement_timestamp()
        then true
        else false
      end as has_plus_access
    from (select 1) as seed
    left join public.billing_accounts as account on account.user_id = p_user_id
  )
  select
    case when account.has_plus_access then 'plus' else 'free' end,
    case
      when account.has_plus_access then timezone('utc', account.current_period_start)::date
      else date_trunc('month', timezone('utc', statement_timestamp()))::date
    end,
    case
      when account.has_plus_access then account.current_period_end
      else (date_trunc('month', timezone('utc', statement_timestamp())) + interval '1 month') at time zone 'utc'
    end,
    case
      when account.has_plus_access
      then 'stripe:' || account.stripe_subscription_id || ':' || extract(epoch from account.current_period_start)::bigint::text
      else 'free:' || to_char(timezone('utc', statement_timestamp()), 'YYYY-MM')
    end,
    coalesce(account.subscription_status, 'none'),
    coalesce(account.cancel_at_period_end, false)
  from account_state as account;
$$;

revoke all on function private.resolve_active_billing_plan(uuid)
  from public, anon, authenticated;

-- Extend deployment readiness so the grace timestamp remains server-owned and
-- the two functions that define recovery semantics cannot silently lose their
-- trusted execution properties.
alter function public.furvise_security_compatibility_snapshot_v2(text[])
  rename to furvise_security_compatibility_snapshot_v2_pre_billing_payment_recovery_grace;
revoke all on function public.furvise_security_compatibility_snapshot_v2_pre_billing_payment_recovery_grace(text[])
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
  v_relation oid;
  v_projection oid;
  v_resolver oid;
  v_projection_definition text;
  v_resolver_definition text;
  v_ok boolean := true;
begin
  if coalesce(pg_catalog.current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;

  select snapshot.failed_checks into v_prior_failures
  from public.furvise_security_compatibility_snapshot_v2_pre_billing_payment_recovery_grace(
    p_required_migration_names
  ) snapshot;
  v_failures := v_failures || coalesce(v_prior_failures, '{}'::text[]);

  v_relation := pg_catalog.to_regclass('public.billing_accounts');
  v_ok := v_ok and v_relation is not null;
  if v_relation is not null then
    v_ok := v_ok
      and exists (
        select 1
        from pg_catalog.pg_attribute attribute
        where attribute.attrelid = v_relation
          and attribute.attname = 'past_due_since'
          and attribute.atttypid = 'timestamptz'::regtype
          and attribute.attnum > 0
          and not attribute.attisdropped
      )
      and not pg_catalog.has_table_privilege('authenticated', v_relation, 'INSERT')
      and not pg_catalog.has_table_privilege('authenticated', v_relation, 'UPDATE')
      and not pg_catalog.has_table_privilege('authenticated', v_relation, 'DELETE')
      and not pg_catalog.has_table_privilege('anon', v_relation, 'INSERT')
      and not pg_catalog.has_table_privilege('anon', v_relation, 'UPDATE')
      and not pg_catalog.has_table_privilege('anon', v_relation, 'DELETE')
      and not pg_catalog.has_column_privilege('authenticated', v_relation, 'past_due_since', 'INSERT')
      and not pg_catalog.has_column_privilege('authenticated', v_relation, 'past_due_since', 'UPDATE')
      and not pg_catalog.has_column_privilege('anon', v_relation, 'past_due_since', 'INSERT')
      and not pg_catalog.has_column_privilege('anon', v_relation, 'past_due_since', 'UPDATE');
  end if;

  v_projection := pg_catalog.to_regprocedure(
    'public.apply_stripe_subscription_projection(uuid,text,text,text,text,boolean,text,timestamptz,timestamptz,boolean,text,text,timestamptz)'
  );
  v_ok := v_ok and v_projection is not null;
  if v_projection is not null then
    select pg_catalog.pg_get_functiondef(v_projection) into v_projection_definition;
    v_ok := v_ok
      and (select proc.prosecdef from pg_catalog.pg_proc proc where proc.oid = v_projection)
      and coalesce((select proc.proconfig @> array['search_path=pg_catalog']::text[] from pg_catalog.pg_proc proc where proc.oid = v_projection), false)
      and pg_catalog.has_function_privilege('service_role', v_projection, 'EXECUTE')
      and not pg_catalog.has_function_privilege('authenticated', v_projection, 'EXECUTE')
      and not pg_catalog.has_function_privilege('anon', v_projection, 'EXECUTE')
      and v_projection_definition ~* 'past_due_since'
      and v_projection_definition ~* 'p_stripe_event_created_at';
  end if;

  v_resolver := pg_catalog.to_regprocedure('private.resolve_active_billing_plan(uuid)');
  v_ok := v_ok and v_resolver is not null;
  if v_resolver is not null then
    select pg_catalog.pg_get_functiondef(v_resolver) into v_resolver_definition;
    v_ok := v_ok
      and (select proc.prosecdef from pg_catalog.pg_proc proc where proc.oid = v_resolver)
      and coalesce((select proc.proconfig @> array['search_path=pg_catalog']::text[] from pg_catalog.pg_proc proc where proc.oid = v_resolver), false)
      and not pg_catalog.has_function_privilege('authenticated', v_resolver, 'EXECUTE')
      and not pg_catalog.has_function_privilege('anon', v_resolver, 'EXECUTE')
      and v_resolver_definition ~* 'past_due_since'
      and v_resolver_definition ~* 'past_due'
      and v_resolver_definition ~* '7 days';
  end if;

  if not v_ok then
    v_failures := pg_catalog.array_append(v_failures, 'billing_payment_recovery_authority');
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
revoke all on function public.furvise_security_compatibility_snapshot_v2_pre_billing_payment_recovery_grace(text[])
  from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
commit;
