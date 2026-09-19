-- One Free generation per account lifetime. Read/save/export access remains
-- available after consumption; only AI generation is metered.
create or replace function private.resolve_feature_allowance(p_user_id uuid, p_feature text)
returns table(billing_plan text, effective_plan text, allowance integer, period_start date,
  period_end timestamptz, period_key text, subscription_status text, cancel_at_period_end boolean)
language sql stable security definer set search_path = pg_catalog as $$
  select a.billing_plan, a.effective_plan,
    case when p_feature='ask' then a.allowance
         when a.period_key like 'qa:%' then 100000
         when a.effective_plan='plus' then 4 else 1 end,
    case when p_feature='vet_brief' and a.effective_plan='free' then date '1970-01-01' else a.period_start end,
    case when p_feature='vet_brief' and a.effective_plan='free' then timestamptz '9999-01-01 00:00:00+00' else a.period_end end,
    case when p_feature='vet_brief' and a.effective_plan='free' then 'free:vet_brief:lifetime' else a.period_key end,
    a.subscription_status, a.cancel_at_period_end
  from private.resolve_ask_allowance(p_user_id) a where p_feature in ('ask','vet_brief');
$$;

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
    true, -- Vet Brief exports include the Free lifetime trial.

    exists (select 1 from active_grant) or billing.billing_plan = 'plus',
    case when exists (select 1 from active_grant) then 1000 when billing.billing_plan = 'plus' then 10 else 1 end,
    case when exists (select 1 from active_grant) then 100000 when billing.billing_plan = 'plus' then 500 else 50 end
  from billing;
$$;

revoke all on function private.resolve_account_entitlements(uuid) from public, anon, authenticated;

create or replace function public.has_vet_brief_entitlement()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from auth.users u where u.id=auth.uid()
    and u.email_confirmed_at is not null and coalesce(u.is_anonymous,false)=false)
    and coalesce((select r.vet_prep_exports from private.resolve_account_entitlements(auth.uid()) r),false);
$$;
-- Existing owner-scoped RLS policies and function ACLs are preserved.
