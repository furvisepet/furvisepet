create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

alter table public.ai_usage_events drop constraint if exists ai_usage_events_feature_check;
alter table public.ai_usage_events add constraint ai_usage_events_feature_check
  check (feature in ('ask', 'product_question', 'product_query', 'product_explanation', 'safety_followup', 'vet_brief', 'care_plan'));

create table if not exists public.account_access_grants (
  user_id uuid primary key references auth.users(id) on delete cascade,
  access_role text not null check (access_role = 'internal_qa'),
  enabled boolean not null default true,
  expires_at timestamptz,
  reason text not null check (char_length(btrim(reason)) between 1 and 500),
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  check ((revoked_at is null and revoked_by is null) or revoked_at is not null),
  check (revoked_at is null or enabled = false),
  check (expires_at is null or expires_at > granted_at)
);

create table if not exists public.account_access_audit (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  access_role text not null,
  action text not null check (action in ('granted', 'updated', 'revoked', 'expiry_changed')),
  enabled boolean not null,
  expires_at timestamptz,
  reason text not null,
  changed_at timestamptz not null default now(),
  changed_by uuid,
  previous_state jsonb,
  new_state jsonb not null
);

alter table public.account_access_grants enable row level security;
alter table public.account_access_grants force row level security;
alter table public.account_access_audit enable row level security;
alter table public.account_access_audit force row level security;

revoke all on table public.account_access_grants, public.account_access_audit from public, anon, authenticated;
revoke all on sequence public.account_access_audit_id_seq from public, anon, authenticated;
grant select, insert, update on table public.account_access_grants to service_role;
grant select on table public.account_access_audit to service_role;
grant usage, select on sequence public.account_access_audit_id_seq to service_role;

create or replace function private.prepare_account_access_grant()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.prepare_account_access_grant() from public, anon, authenticated;

drop trigger if exists prepare_account_access_grant_before_update on public.account_access_grants;
create trigger prepare_account_access_grant_before_update
before update on public.account_access_grants
for each row execute function private.prepare_account_access_grant();

create or replace function private.audit_account_access_grant()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_action text;
  v_actor uuid;
begin
  if tg_op = 'DELETE' then
    insert into public.account_access_audit (
      user_id, access_role, action, enabled, expires_at, reason, changed_by, previous_state, new_state
    ) values (
      old.user_id, old.access_role, 'revoked', false, old.expires_at, old.reason,
      coalesce(old.revoked_by, old.granted_by), to_jsonb(old), jsonb_build_object('deleted', true)
    );
    return old;
  end if;

  v_actor := case
    when tg_op = 'INSERT' then new.granted_by
    else coalesce(new.revoked_by, new.granted_by, old.granted_by)
  end;
  v_action := case
    when tg_op = 'INSERT' then 'granted'
    when old.revoked_at is null and new.revoked_at is not null then 'revoked'
    when (old.enabled = false or old.revoked_at is not null or (old.expires_at is not null and old.expires_at <= statement_timestamp()))
      and new.enabled = true and new.revoked_at is null and (new.expires_at is null or new.expires_at > statement_timestamp()) then 'granted'
    when old.expires_at is distinct from new.expires_at then 'expiry_changed'
    else 'updated'
  end;

  insert into public.account_access_audit (
    user_id, access_role, action, enabled, expires_at, reason, changed_by, previous_state, new_state
  ) values (
    new.user_id,
    new.access_role,
    v_action,
    new.enabled,
    new.expires_at,
    new.reason,
    v_actor,
    case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
    to_jsonb(new)
  );
  return new;
end;
$$;

revoke all on function private.audit_account_access_grant() from public, anon, authenticated;

drop trigger if exists audit_account_access_grant_after_write on public.account_access_grants;
create trigger audit_account_access_grant_after_write
after insert or update or delete on public.account_access_grants
for each row execute function private.audit_account_access_grant();

create or replace function private.prevent_account_access_audit_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception using errcode = '42501', message = 'ACCOUNT_ACCESS_AUDIT_APPEND_ONLY';
end;
$$;

revoke all on function private.prevent_account_access_audit_mutation() from public, anon, authenticated;

drop trigger if exists prevent_account_access_audit_mutation on public.account_access_audit;
create trigger prevent_account_access_audit_mutation
before update or delete on public.account_access_audit
for each row execute function private.prevent_account_access_audit_mutation();

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
  with account as (
    select case
      when auth_user.raw_app_meta_data ->> 'plan' = 'plus' then 'plus'
      else 'free'
    end as billing_plan
    from auth.users as auth_user
    where auth_user.id = p_user_id
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
    account.billing_plan,
    case when exists (select 1 from active_grant) then 'plus' else account.billing_plan end,
    exists (select 1 from active_grant) or account.billing_plan = 'plus',
    exists (select 1 from active_grant) or account.billing_plan = 'plus',
    exists (select 1 from active_grant) or account.billing_plan = 'plus',
    exists (select 1 from active_grant) or account.billing_plan = 'plus',
    case when exists (select 1 from active_grant) then 1000 when account.billing_plan = 'plus' then 10 else 1 end,
    case when exists (select 1 from active_grant) then 100000 when account.billing_plan = 'plus' then 500 else 50 end
  from account;
$$;

revoke all on function private.resolve_account_entitlements(uuid) from public, anon, authenticated;

create or replace function public.get_my_entitlements()
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

  return query select * from private.resolve_account_entitlements(v_user_id);
end;
$$;

revoke all on function public.get_my_entitlements() from public, anon;
grant execute on function public.get_my_entitlements() to authenticated;

create or replace function public.enforce_pet_profile_plan_limit()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_entitlements record;
  v_existing_count integer;
begin
  if auth.uid() is null then
    return new;
  end if;
  if new.user_id <> auth.uid() then
    raise exception using errcode = '42501', message = 'Pet ownership does not match the signed-in user.';
  end if;

  select * into strict v_entitlements from private.resolve_account_entitlements(auth.uid());
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));
  select count(*) into v_existing_count from public.dog_profiles where user_id = new.user_id;

  if v_existing_count >= v_entitlements.max_pets then
    raise exception using
      errcode = 'P0001',
      message = 'PET_LIMIT_REACHED',
      detail = format('The effective %s access policy allows %s active pet profiles.', v_entitlements.effective_plan, v_entitlements.max_pets);
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_pet_profile_plan_limit() from public, anon, authenticated;

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
  v_period_start date := date_trunc('month', timezone('utc', now()))::date;
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
  if p_feature not in ('ask', 'product_question', 'product_query', 'product_explanation', 'safety_followup', 'vet_brief', 'care_plan') then raise exception using errcode = '22023', message = 'INVALID_AI_FEATURE'; end if;

  select entitlements.monthly_ai_credits into strict v_allowance
  from private.resolve_account_entitlements(v_user_id) as entitlements;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':' || v_period_start::text, 0));
  select usage_event.* into v_existing from public.ai_usage_events as usage_event
  where usage_event.user_id = v_user_id and usage_event.request_id = p_request_id;
  select
    coalesce(sum(monthly_usage.credits_used) filter (where monthly_usage.status = 'completed'), 0),
    coalesce(sum(monthly_usage.credits_used) filter (where monthly_usage.status in ('reserved', 'completed')), 0)
  into v_committed, v_reserved from public.ai_usage_events as monthly_usage
  where monthly_usage.user_id = v_user_id and monthly_usage.period_start = v_period_start;

  if v_existing.id is not null and v_existing.status in ('reserved', 'completed') then
    return query select v_existing.status, v_existing.credits_used, greatest(0, v_allowance - v_committed); return;
  end if;
  if v_reserved >= v_allowance then return query select 'limit_reached'::text, 0, greatest(0, v_allowance - v_committed); return; end if;
  if v_existing.id is not null and v_existing.status = 'released' then
    update public.ai_usage_events as usage_event set feature = p_feature, credits_used = 1, status = 'reserved', period_start = v_period_start, created_at = now(), completed_at = null where usage_event.id = v_existing.id;
  else
    insert into public.ai_usage_events as usage_event (user_id, request_id, feature, credits_used, status, period_start)
    values (v_user_id, p_request_id, p_feature, 1, 'reserved', v_period_start);
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
  v_period_start date := date_trunc('month', timezone('utc', now()))::date;
  v_event public.ai_usage_events%rowtype;
  v_completed integer := 0;
  v_allowance integer;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'AUTH_REQUIRED'; end if;
  select entitlements.monthly_ai_credits into strict v_allowance
  from private.resolve_account_entitlements(v_user_id) as entitlements;
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':' || v_period_start::text, 0));

  update public.ai_usage_events as usage_event
  set status = 'completed', credits_used = 1, completed_at = coalesce(usage_event.completed_at, now())
  where usage_event.user_id = v_user_id and usage_event.request_id = p_request_id and usage_event.status = 'reserved'
  returning usage_event.* into v_event;
  if v_event.id is null then
    select usage_event.* into v_event from public.ai_usage_events as usage_event
    where usage_event.user_id = v_user_id and usage_event.request_id = p_request_id;
  end if;
  if v_event.id is null then raise exception using errcode = 'P0002', message = 'AI_RESERVATION_NOT_FOUND'; end if;

  select coalesce(sum(monthly_usage.credits_used), 0)::integer into v_completed
  from public.ai_usage_events as monthly_usage
  where monthly_usage.user_id = v_user_id and monthly_usage.period_start = v_period_start and monthly_usage.status = 'completed';
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
  v_period_start date := date_trunc('month', timezone('utc', now()))::date;
  v_event public.ai_usage_events%rowtype;
  v_completed integer := 0;
  v_allowance integer;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'AUTH_REQUIRED'; end if;
  select entitlements.monthly_ai_credits into strict v_allowance
  from private.resolve_account_entitlements(v_user_id) as entitlements;
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':' || v_period_start::text, 0));

  update public.ai_usage_events as usage_event
  set status = 'released', credits_used = 0, completed_at = null
  where usage_event.user_id = v_user_id and usage_event.request_id = p_request_id and usage_event.status = 'reserved'
  returning usage_event.* into v_event;
  if v_event.id is null then
    select usage_event.* into v_event from public.ai_usage_events as usage_event
    where usage_event.user_id = v_user_id and usage_event.request_id = p_request_id;
  end if;
  if v_event.id is null then raise exception using errcode = 'P0002', message = 'AI_RESERVATION_NOT_FOUND'; end if;

  select coalesce(sum(monthly_usage.credits_used), 0)::integer into v_completed
  from public.ai_usage_events as monthly_usage
  where monthly_usage.user_id = v_user_id and monthly_usage.period_start = v_period_start and monthly_usage.status = 'completed';
  return query select v_event.status, v_event.credits_used, greatest(0, v_allowance - v_completed);
end;
$$;

revoke all on function public.reserve_ai_credit(uuid, text, integer) from public, anon;
revoke all on function public.complete_ai_credit(uuid, integer) from public, anon;
revoke all on function public.release_ai_credit(uuid, integer) from public, anon;
grant execute on function public.reserve_ai_credit(uuid, text, integer) to authenticated;
grant execute on function public.complete_ai_credit(uuid, integer) to authenticated;
grant execute on function public.release_ai_credit(uuid, integer) to authenticated;
