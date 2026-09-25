-- Launch pet limits: Free = 1 active profile, Plus = 5.
-- Internal QA retains a high test-only allowance.
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
    true,
    exists (select 1 from active_grant) or billing.billing_plan = 'plus',
    case when exists (select 1 from active_grant) then 1000 when billing.billing_plan = 'plus' then 5 else 1 end,
    case when exists (select 1 from active_grant) then 100000 when billing.billing_plan = 'plus' then 500 else 50 end
  from billing;
$$;

revoke all on function private.resolve_account_entitlements(uuid) from public, anon, authenticated;
