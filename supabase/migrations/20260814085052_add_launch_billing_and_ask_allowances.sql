create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

alter table public.ai_usage_events add column allowance_period_key text;
alter table public.ai_usage_events add constraint ai_usage_events_allowance_period_key_check
  check (allowance_period_key is null or char_length(allowance_period_key) between 1 and 200);
create index ai_usage_events_user_allowance_period_status_idx
  on public.ai_usage_events(user_id, allowance_period_key, status, feature)
  where allowance_period_key is not null;

create table public.billing_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text not null unique,
  stripe_subscription_id text unique,
  stripe_price_id text,
  stripe_currency text check (stripe_currency is null or stripe_currency ~ '^[a-z]{3}$'),
  checkout_price_id text not null,
  plan text not null default 'free' check (plan in ('free', 'plus')),
  subscription_status text not null default 'none' check (
    subscription_status in ('none', 'incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused')
  ),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  last_stripe_event_id text,
  last_stripe_event_created_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (plan = 'free')
    or (
      plan = 'plus'
      and subscription_status = 'active'
      and stripe_subscription_id is not null
      and stripe_price_id is not null
      and current_period_start is not null
      and current_period_end is not null
      and current_period_end > current_period_start
    )
  )
);

comment on table public.billing_accounts is
  'Server-owned Stripe customer/subscription projection. Direct client writes are forbidden; safe state is exposed through caller-scoped RPCs.';

alter table public.billing_accounts enable row level security;
alter table public.billing_accounts force row level security;

drop policy if exists "billing_accounts_select_own" on public.billing_accounts;
create policy "billing_accounts_select_own"
  on public.billing_accounts for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.billing_accounts from public, anon, authenticated;
grant select, insert, update on table public.billing_accounts to service_role;

create table private.stripe_webhook_events (
  stripe_event_id text primary key,
  stripe_event_type text not null,
  stripe_event_created_at timestamptz not null,
  processing_status text not null check (processing_status in ('processed', 'ignored_stale')),
  processed_at timestamptz not null default now()
);

revoke all on table private.stripe_webhook_events from public, anon, authenticated;
grant select, insert on table private.stripe_webhook_events to service_role;

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
  select
    case
      when account.plan = 'plus'
        and account.subscription_status = 'active'
        and account.current_period_start <= statement_timestamp()
        and account.current_period_end > statement_timestamp()
      then 'plus'
      else 'free'
    end,
    case
      when account.plan = 'plus'
        and account.subscription_status = 'active'
        and account.current_period_start <= statement_timestamp()
        and account.current_period_end > statement_timestamp()
      then timezone('utc', account.current_period_start)::date
      else date_trunc('month', timezone('utc', statement_timestamp()))::date
    end,
    case
      when account.plan = 'plus'
        and account.subscription_status = 'active'
        and account.current_period_start <= statement_timestamp()
        and account.current_period_end > statement_timestamp()
      then account.current_period_end
      else (date_trunc('month', timezone('utc', statement_timestamp())) + interval '1 month') at time zone 'utc'
    end,
    case
      when account.plan = 'plus'
        and account.subscription_status = 'active'
        and account.current_period_start <= statement_timestamp()
        and account.current_period_end > statement_timestamp()
      then 'stripe:' || account.stripe_subscription_id || ':' || extract(epoch from account.current_period_start)::bigint::text
      else 'free:' || to_char(timezone('utc', statement_timestamp()), 'YYYY-MM')
    end,
    coalesce(account.subscription_status, 'none'),
    coalesce(account.cancel_at_period_end, false)
  from (select 1) as seed
  left join public.billing_accounts as account on account.user_id = p_user_id;
$$;

revoke all on function private.resolve_active_billing_plan(uuid) from public, anon, authenticated;

create or replace function private.resolve_ask_allowance(p_user_id uuid)
returns table(
  billing_plan text,
  effective_plan text,
  allowance integer,
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
  with billing as (
    select * from private.resolve_active_billing_plan(p_user_id)
  ), active_grant as (
    select true as internal_qa
    from public.account_access_grants as access_grant
    where access_grant.user_id = p_user_id
      and access_grant.access_role = 'internal_qa'
      and access_grant.enabled = true
      and access_grant.revoked_at is null
      and (access_grant.expires_at is null or access_grant.expires_at > statement_timestamp())
  )
  select
    billing.billing_plan,
    case when exists (select 1 from active_grant) then 'plus' else billing.billing_plan end,
    case when exists (select 1 from active_grant) then 100000 when billing.billing_plan = 'plus' then 55 else 8 end,
    case
      when exists (select 1 from active_grant) then date_trunc('month', timezone('utc', statement_timestamp()))::date
      else billing.period_start
    end,
    case
      when exists (select 1 from active_grant) then (date_trunc('month', timezone('utc', statement_timestamp())) + interval '1 month') at time zone 'utc'
      else billing.period_end
    end,
    case
      when exists (select 1 from active_grant) then 'qa:' || to_char(timezone('utc', statement_timestamp()), 'YYYY-MM')
      else billing.period_key
    end,
    billing.subscription_status,
    billing.cancel_at_period_end
  from billing;
$$;

revoke all on function private.resolve_ask_allowance(uuid) from public, anon, authenticated;

create or replace function private.resolve_account_entitlements(p_user_id uuid)
returns table(
  access_role text,
  billing_plan text,
  effective_plan text,
  live_product_research boolean,
  long_history_pattern_detection boolean,
  vet_prep_exports boolean,
  products_paid_functionality boolean,
  max_pets integer,
  monthly_ai_credits integer
)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  with billing as (
    select * from private.resolve_active_billing_plan(p_user_id)
  ), active_grant as (
    select true as internal_qa
    from public.account_access_grants as access_grant
    where access_grant.user_id = p_user_id
      and access_grant.access_role = 'internal_qa'
      and access_grant.enabled = true
      and access_grant.revoked_at is null
      and (access_grant.expires_at is null or access_grant.expires_at > statement_timestamp())
  )
  select
    case when exists (select 1 from active_grant) then 'internal_qa' else 'consumer' end,
    billing.billing_plan,
    case when exists (select 1 from active_grant) then 'plus' else billing.billing_plan end,
    exists (select 1 from active_grant) or billing.billing_plan = 'plus',
    exists (select 1 from active_grant) or billing.billing_plan = 'plus',
    exists (select 1 from active_grant) or billing.billing_plan = 'plus',
    exists (select 1 from active_grant) or billing.billing_plan = 'plus',
    case when exists (select 1 from active_grant) then 1000 when billing.billing_plan = 'plus' then 10 else 1 end,
    case when exists (select 1 from active_grant) then 100000 when billing.billing_plan = 'plus' then 500 else 50 end
  from billing;
$$;

revoke all on function private.resolve_account_entitlements(uuid) from public, anon, authenticated;

create or replace function public.get_my_ask_allowance_status()
returns table(
  billing_plan text,
  effective_plan text,
  allowance integer,
  used integer,
  remaining integer,
  period_start date,
  period_end timestamptz,
  period_key text,
  subscription_status text,
  cancel_at_period_end boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  return query
  with resolved as (
    select * from private.resolve_ask_allowance(v_user_id)
  ), usage as (
    select coalesce(sum(event.credits_used), 0)::integer as used
    from public.ai_usage_events as event, resolved
    where event.user_id = v_user_id
      and event.feature = 'ask'
      and event.allowance_period_key = resolved.period_key
      and event.status = 'completed'
  )
  select resolved.billing_plan, resolved.effective_plan, resolved.allowance, usage.used,
    greatest(0, resolved.allowance - usage.used), resolved.period_start, resolved.period_end, resolved.period_key,
    resolved.subscription_status, resolved.cancel_at_period_end
  from resolved, usage;
end;
$$;

revoke all on function public.get_my_ask_allowance_status() from public, anon;
grant execute on function public.get_my_ask_allowance_status() to authenticated;

create or replace function public.register_stripe_billing_customer(
  p_user_id uuid,
  p_stripe_customer_id text,
  p_checkout_price_id text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_existing public.billing_accounts%rowtype;
begin
  if p_user_id is null
    or nullif(btrim(p_stripe_customer_id), '') is null
    or nullif(btrim(p_checkout_price_id), '') is null then
    raise exception using errcode = '22023', message = 'INVALID_BILLING_CUSTOMER_ASSOCIATION';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception using errcode = 'P0002', message = 'BILLING_USER_NOT_FOUND';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('billing:' || p_user_id::text, 0));
  select * into v_existing from public.billing_accounts where user_id = p_user_id for update;
  if v_existing.user_id is not null and v_existing.stripe_customer_id <> p_stripe_customer_id then
    raise exception using errcode = '23505', message = 'BILLING_CUSTOMER_ASSOCIATION_CONFLICT';
  end if;
  if exists (
    select 1 from public.billing_accounts
    where stripe_customer_id = p_stripe_customer_id and user_id <> p_user_id
  ) then
    raise exception using errcode = '23505', message = 'BILLING_CUSTOMER_ALREADY_ASSOCIATED';
  end if;

  insert into public.billing_accounts (
    user_id, stripe_customer_id, checkout_price_id
  ) values (
    p_user_id, p_stripe_customer_id, p_checkout_price_id
  )
  on conflict (user_id) do update set
    checkout_price_id = excluded.checkout_price_id,
    updated_at = now();
end;
$$;

revoke all on function public.register_stripe_billing_customer(uuid, text, text) from public, anon, authenticated;
grant execute on function public.register_stripe_billing_customer(uuid, text, text) to service_role;

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

  update public.billing_accounts set
    stripe_subscription_id = p_stripe_subscription_id,
    stripe_price_id = p_stripe_price_id,
    stripe_currency = p_stripe_currency,
    plan = v_plan,
    subscription_status = p_subscription_status,
    current_period_start = p_current_period_start,
    current_period_end = p_current_period_end,
    cancel_at_period_end = coalesce(p_cancel_at_period_end, false),
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

revoke all on function public.apply_stripe_subscription_projection(uuid, text, text, text, text, boolean, text, timestamptz, timestamptz, boolean, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.apply_stripe_subscription_projection(uuid, text, text, text, text, boolean, text, timestamptz, timestamptz, boolean, text, text, timestamptz) to service_role;

create or replace function public.reserve_ai_credit(
  p_request_id uuid,
  p_feature text,
  p_allowance integer default 50
)
returns table(reservation_status text, credits_used integer, remaining integer)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_period_start date;
  v_period_key text;
  v_existing public.ai_usage_events%rowtype;
  v_committed integer := 0;
  v_reserved integer := 0;
  v_allowance integer;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'AUTH_REQUIRED'; end if;
  if not exists (
    select 1 from auth.users as auth_user
    where auth_user.id = v_user_id
      and auth_user.email_confirmed_at is not null
      and coalesce(auth_user.is_anonymous, false) = false
  ) then raise exception using errcode = '42501', message = 'EMAIL_CONFIRMATION_REQUIRED'; end if;
  if p_request_id is null then raise exception using errcode = '22023', message = 'REQUEST_ID_REQUIRED'; end if;
  if p_feature not in ('ask', 'product_question', 'product_query', 'product_explanation', 'safety_followup', 'vet_brief', 'care_plan') then
    raise exception using errcode = '22023', message = 'INVALID_AI_FEATURE';
  end if;

  if p_feature = 'ask' then
    select resolved.allowance, resolved.period_start, resolved.period_key into strict v_allowance, v_period_start, v_period_key
    from private.resolve_ask_allowance(v_user_id) as resolved;
  else
    select entitlements.monthly_ai_credits into strict v_allowance
    from private.resolve_account_entitlements(v_user_id) as entitlements;
    v_period_start := date_trunc('month', timezone('utc', now()))::date;
    v_period_key := null;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':' || p_feature || ':' || coalesce(v_period_key, v_period_start::text), 0));
  select usage_event.* into v_existing from public.ai_usage_events as usage_event
  where usage_event.user_id = v_user_id and usage_event.request_id = p_request_id;

  select
    coalesce(sum(monthly_usage.credits_used) filter (where monthly_usage.status = 'completed'), 0),
    coalesce(sum(monthly_usage.credits_used) filter (where monthly_usage.status in ('reserved', 'completed')), 0)
  into v_committed, v_reserved from public.ai_usage_events as monthly_usage
  where monthly_usage.user_id = v_user_id
    and monthly_usage.period_start = v_period_start
    and (p_feature <> 'ask' or monthly_usage.allowance_period_key = v_period_key)
    and (p_feature <> 'ask' or monthly_usage.feature = 'ask');

  if v_existing.id is not null and v_existing.status in ('reserved', 'completed') then
    return query select v_existing.status, v_existing.credits_used, greatest(0, v_allowance - v_committed); return;
  end if;
  if v_reserved >= v_allowance then
    return query select 'limit_reached'::text, 0, greatest(0, v_allowance - v_committed); return;
  end if;
  if v_existing.id is not null and v_existing.status = 'released' then
    update public.ai_usage_events as usage_event
    set feature = p_feature, credits_used = 1, status = 'reserved', period_start = v_period_start,
      allowance_period_key = v_period_key,
      created_at = now(), completed_at = null
    where usage_event.id = v_existing.id;
  else
    insert into public.ai_usage_events as usage_event (user_id, request_id, feature, credits_used, status, period_start, allowance_period_key)
    values (v_user_id, p_request_id, p_feature, 1, 'reserved', v_period_start, v_period_key);
  end if;
  return query select 'reserved'::text, 1, greatest(0, v_allowance - v_committed);
end;
$$;

create or replace function public.complete_ai_credit(
  p_request_id uuid,
  p_allowance integer default 50
)
returns table(event_status text, credits_used integer, remaining integer)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_event public.ai_usage_events%rowtype;
  v_completed integer := 0;
  v_allowance integer;
  v_current_period date;
  v_current_period_key text;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'AUTH_REQUIRED'; end if;
  select usage_event.* into v_event from public.ai_usage_events as usage_event
  where usage_event.user_id = v_user_id and usage_event.request_id = p_request_id;
  if v_event.id is null then raise exception using errcode = 'P0002', message = 'AI_RESERVATION_NOT_FOUND'; end if;

  if v_event.feature = 'ask' then
    select resolved.allowance, resolved.period_start, resolved.period_key into strict v_allowance, v_current_period, v_current_period_key
    from private.resolve_ask_allowance(v_user_id) as resolved;
  else
    select entitlements.monthly_ai_credits into strict v_allowance
    from private.resolve_account_entitlements(v_user_id) as entitlements;
    v_current_period := date_trunc('month', timezone('utc', now()))::date;
    v_current_period_key := null;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':' || v_event.feature || ':' || coalesce(v_event.allowance_period_key, v_event.period_start::text), 0));
  update public.ai_usage_events as usage_event
  set status = 'completed', credits_used = 1, completed_at = coalesce(usage_event.completed_at, now())
  where usage_event.user_id = v_user_id and usage_event.request_id = p_request_id and usage_event.status = 'reserved'
  returning usage_event.* into v_event;
  if v_event.id is null then
    select usage_event.* into v_event from public.ai_usage_events as usage_event
    where usage_event.user_id = v_user_id and usage_event.request_id = p_request_id;
  end if;

  select coalesce(sum(usage.credits_used), 0)::integer into v_completed
  from public.ai_usage_events as usage
  where usage.user_id = v_user_id
    and usage.period_start = v_current_period
    and (v_event.feature <> 'ask' or usage.allowance_period_key = v_current_period_key)
    and usage.status = 'completed'
    and (v_event.feature <> 'ask' or usage.feature = 'ask');
  return query select v_event.status, v_event.credits_used, greatest(0, v_allowance - v_completed);
end;
$$;

create or replace function public.release_ai_credit(
  p_request_id uuid,
  p_allowance integer default 50
)
returns table(event_status text, credits_used integer, remaining integer)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_event public.ai_usage_events%rowtype;
  v_completed integer := 0;
  v_allowance integer;
  v_current_period date;
  v_current_period_key text;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'AUTH_REQUIRED'; end if;
  select usage_event.* into v_event from public.ai_usage_events as usage_event
  where usage_event.user_id = v_user_id and usage_event.request_id = p_request_id;
  if v_event.id is null then raise exception using errcode = 'P0002', message = 'AI_RESERVATION_NOT_FOUND'; end if;

  if v_event.feature = 'ask' then
    select resolved.allowance, resolved.period_start, resolved.period_key into strict v_allowance, v_current_period, v_current_period_key
    from private.resolve_ask_allowance(v_user_id) as resolved;
  else
    select entitlements.monthly_ai_credits into strict v_allowance
    from private.resolve_account_entitlements(v_user_id) as entitlements;
    v_current_period := date_trunc('month', timezone('utc', now()))::date;
    v_current_period_key := null;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':' || v_event.feature || ':' || coalesce(v_event.allowance_period_key, v_event.period_start::text), 0));
  update public.ai_usage_events as usage_event
  set status = 'released', credits_used = 0, completed_at = null
  where usage_event.user_id = v_user_id and usage_event.request_id = p_request_id and usage_event.status = 'reserved'
  returning usage_event.* into v_event;
  if v_event.id is null then
    select usage_event.* into v_event from public.ai_usage_events as usage_event
    where usage_event.user_id = v_user_id and usage_event.request_id = p_request_id;
  end if;

  select coalesce(sum(usage.credits_used), 0)::integer into v_completed
  from public.ai_usage_events as usage
  where usage.user_id = v_user_id
    and usage.period_start = v_current_period
    and (v_event.feature <> 'ask' or usage.allowance_period_key = v_current_period_key)
    and usage.status = 'completed'
    and (v_event.feature <> 'ask' or usage.feature = 'ask');
  return query select v_event.status, v_event.credits_used, greatest(0, v_allowance - v_completed);
end;
$$;

revoke all on function public.reserve_ai_credit(uuid, text, integer) from public, anon;
revoke all on function public.complete_ai_credit(uuid, integer) from public, anon;
revoke all on function public.release_ai_credit(uuid, integer) from public, anon;
grant execute on function public.reserve_ai_credit(uuid, text, integer) to authenticated;
grant execute on function public.complete_ai_credit(uuid, integer) to authenticated;
grant execute on function public.release_ai_credit(uuid, integer) to authenticated;
