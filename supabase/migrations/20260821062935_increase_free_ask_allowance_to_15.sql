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
    case when exists (select 1 from active_grant) then 100000 when billing.billing_plan = 'plus' then 55 else 15 end,
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
