-- Dedicated Vet Brief allowance, retaining the existing atomic credit state machine.
-- Existing subscription periods and internal QA grants remain authoritative.
create or replace function private.resolve_feature_allowance(p_user_id uuid, p_feature text)
returns table(billing_plan text, effective_plan text, allowance integer, period_start date,
  period_end timestamptz, period_key text, subscription_status text, cancel_at_period_end boolean)
language sql stable security definer set search_path = pg_catalog as $$
  select a.billing_plan, a.effective_plan,
    case when p_feature = 'ask' then a.allowance
         when a.period_key like 'qa:%' then 100000
         when a.effective_plan = 'plus' then 4 else 0 end,
    a.period_start, a.period_end, a.period_key, a.subscription_status, a.cancel_at_period_end
  from private.resolve_ask_allowance(p_user_id) a
  where p_feature in ('ask', 'vet_brief');
$$;
revoke all on function private.resolve_feature_allowance(uuid,text) from public, anon, authenticated;
grant execute on function private.resolve_feature_allowance(uuid,text) to service_role;

create or replace function public.get_my_vet_brief_allowance_status()
returns table(billing_plan text, effective_plan text, allowance integer, period_start date,
 period_end timestamptz, subscription_status text, cancel_at_period_end boolean, used integer, remaining integer)
language plpgsql stable security definer set search_path = pg_catalog as $$
begin
 if auth.uid() is null then raise exception using errcode = '42501', message = 'AUTH_REQUIRED'; end if;
 return query
 select a.billing_plan, a.effective_plan, a.allowance, a.period_start, a.period_end,
 a.subscription_status, a.cancel_at_period_end, u.used, greatest(0,a.allowance-u.used)
 from private.resolve_feature_allowance(auth.uid(),'vet_brief') a
 cross join lateral (
   select coalesce(sum(e.credits_used),0)::integer used from public.ai_usage_events e
   where e.user_id=auth.uid() and e.feature='vet_brief' and ((e.period_start=a.period_start and e.allowance_period_key=a.period_key)
       or (a.period_key <> 'free:vet_brief:lifetime' and e.allowance_period_key is null and e.created_at>=a.period_start and e.created_at<a.period_end)) and e.status in ('reserved','completed')
     and e.settlement_disposition is distinct from 'release'
 ) u;
end;
$$;
revoke all on function public.get_my_vet_brief_allowance_status() from public, anon;
grant execute on function public.get_my_vet_brief_allowance_status() to authenticated;

create or replace function public.reserve_ai_credit(
  p_user_id uuid,
  p_request_id uuid,
  p_logical_request_id uuid,
  p_feature text,
  p_payload_hash text
)
returns table(reservation_status text, credits_used integer, remaining integer)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_period_start date;
  v_period_key text;
  v_existing public.ai_usage_events%rowtype;
  v_committed integer := 0;
  v_reserved integer := 0;
  v_allowance integer;
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_user_id is null or p_request_id is null or p_logical_request_id is null then
    raise exception using errcode = '22023', message = 'AI_REQUEST_IDENTITY_REQUIRED';
  end if;
  if p_feature not in ('ask', 'product_question', 'product_query', 'product_explanation', 'safety_followup', 'vet_brief', 'care_plan') then
    raise exception using errcode = '22023', message = 'INVALID_AI_FEATURE';
  end if;
  if p_payload_hash is null or p_payload_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'INVALID_AI_PAYLOAD_HASH';
  end if;
  if not exists (
    select 1 from auth.users as auth_user
    where auth_user.id = p_user_id
      and auth_user.email_confirmed_at is not null
      and coalesce(auth_user.is_anonymous, false) = false
  ) then
    raise exception using errcode = '42501', message = 'CONFIRMED_USER_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'ai-operation:' || p_user_id::text || ':' || p_feature || ':' || p_request_id::text,
    0
  ));
  select usage_event.* into v_existing
  from public.ai_usage_events as usage_event
  where usage_event.user_id = p_user_id
    and usage_event.feature = p_feature
    and usage_event.request_id = p_request_id
  for update;

  if v_existing.id is not null then
    if v_existing.logical_request_id <> p_logical_request_id then
      raise exception using errcode = '23505', message = 'AI_REQUEST_IDENTITY_CONFLICT';
    end if;
    if v_existing.payload_hash is null then
      update public.ai_usage_events as usage_event
      set payload_hash = p_payload_hash
      where usage_event.id = v_existing.id
      returning usage_event.* into v_existing;
    elsif v_existing.payload_hash <> p_payload_hash then
      raise exception using errcode = '23505', message = 'AI_REQUEST_IDENTITY_CONFLICT';
    end if;
    if v_existing.feature in ('ask', 'vet_brief') then
      select resolved.allowance into strict v_allowance
      from private.resolve_feature_allowance(p_user_id, p_feature) as resolved;
    else
      select entitlements.monthly_ai_credits into strict v_allowance
      from private.resolve_account_entitlements(p_user_id) as entitlements;
    end if;
    select coalesce(sum(usage.credits_used), 0)::integer into v_committed
    from public.ai_usage_events as usage
    where usage.user_id = p_user_id
      and ((usage.period_start = v_existing.period_start
    and (p_feature not in ('ask', 'vet_brief') or usage.allowance_period_key = v_existing.allowance_period_key))
      or (p_feature = 'vet_brief' and v_existing.allowance_period_key <> 'free:vet_brief:lifetime' and usage.allowance_period_key is null
        and usage.created_at >= v_existing.period_start
        and usage.created_at < (select a.period_end from private.resolve_feature_allowance(p_user_id, 'vet_brief') a)))
      and usage.status = 'completed'
      and ((p_feature in ('ask', 'vet_brief') and usage.feature = p_feature) or (p_feature not in ('ask', 'vet_brief') and usage.feature not in ('ask', 'vet_brief')));
    return query select v_existing.status, v_existing.credits_used, greatest(0, v_allowance - v_committed);
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'ai-logical:' || p_user_id::text || ':' || p_feature || ':' || p_logical_request_id::text,
    0
  ));

  if exists (
    select 1 from public.ai_usage_events as logical_event
    where logical_event.user_id = p_user_id
      and logical_event.feature = p_feature
      and logical_event.logical_request_id = p_logical_request_id
      and logical_event.payload_hash is distinct from p_payload_hash
  ) then
    raise exception using errcode = '23505', message = 'AI_REQUEST_IDENTITY_CONFLICT';
  end if;
  if exists (
    select 1 from public.ai_usage_events as logical_event
    where logical_event.user_id = p_user_id
      and logical_event.feature = p_feature
      and logical_event.logical_request_id = p_logical_request_id
      and logical_event.status = 'reserved'
      and logical_event.settlement_disposition is null
  ) then
    raise exception using errcode = '23514', message = 'AI_CREDIT_DISPOSITION_REQUIRED';
  end if;
  if exists (
    select 1 from public.ai_usage_events as logical_event
    where logical_event.user_id = p_user_id
      and logical_event.feature = p_feature
      and logical_event.logical_request_id = p_logical_request_id
      and logical_event.settlement_disposition = 'complete'
  ) then
    raise exception using errcode = '23514', message = 'AI_LOGICAL_TURN_ALREADY_CHARGEABLE';
  end if;

  -- A retry may safely reconcile release-pending attempts before quota is
  -- evaluated because their durable disposition already forbids completion.
  update public.ai_usage_events as logical_event
  set status = 'released', credits_used = 0, completed_at = null
  where logical_event.user_id = p_user_id
    and logical_event.feature = p_feature
    and logical_event.logical_request_id = p_logical_request_id
    and logical_event.status = 'reserved'
    and logical_event.settlement_disposition = 'release';

  if p_feature in ('ask', 'vet_brief') then
    select resolved.allowance, resolved.period_start, resolved.period_key
      into strict v_allowance, v_period_start, v_period_key
    from private.resolve_feature_allowance(p_user_id, p_feature) as resolved;
  else
    select entitlements.monthly_ai_credits into strict v_allowance
    from private.resolve_account_entitlements(p_user_id) as entitlements;
    v_period_start := date_trunc('month', timezone('utc', now()))::date;
    v_period_key := null;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'ai-period:' || p_user_id::text || ':' || case when p_feature in ('ask', 'vet_brief') then p_feature else 'shared_non_ask' end || ':' || coalesce(v_period_key, v_period_start::text),
    0
  ));
  select
    coalesce(sum(usage.credits_used) filter (where usage.status = 'completed'), 0)::integer,
    coalesce(sum(usage.credits_used) filter (where usage.status in ('reserved', 'completed')), 0)::integer
  into v_committed, v_reserved
  from public.ai_usage_events as usage
  where usage.user_id = p_user_id
    and ((usage.period_start = v_period_start
    and (p_feature not in ('ask', 'vet_brief') or usage.allowance_period_key = v_period_key))
      or (p_feature = 'vet_brief' and v_period_key <> 'free:vet_brief:lifetime' and usage.allowance_period_key is null
        and usage.created_at >= v_period_start
        and usage.created_at < (select a.period_end from private.resolve_feature_allowance(p_user_id, 'vet_brief') a)))
    and ((p_feature in ('ask', 'vet_brief') and usage.feature = p_feature) or (p_feature not in ('ask', 'vet_brief') and usage.feature not in ('ask', 'vet_brief')));

  if v_reserved >= v_allowance then
    return query select 'limit_reached'::text, 0, greatest(0, v_allowance - v_committed);
    return;
  end if;

  insert into public.ai_usage_events (
    user_id, request_id, logical_request_id, feature, payload_hash,
    credits_used, status, period_start, allowance_period_key
  ) values (
    p_user_id, p_request_id, p_logical_request_id, p_feature, p_payload_hash,
    1, 'reserved', v_period_start, v_period_key
  ) returning * into v_existing;
  return query select 'reserved'::text, 1, greatest(0, v_allowance - v_committed);
end;
$$;

create or replace function private.reconcile_ai_credit_event(
  p_user_id uuid,
  p_request_id uuid,
  p_logical_request_id uuid,
  p_feature text,
  p_payload_hash text,
  p_expected_disposition text default null
)
returns table(event_status text, settlement_disposition text, credits_used integer, remaining integer)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_event public.ai_usage_events%rowtype;
  v_completed integer := 0;
  v_allowance integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(
    'ai-operation:' || p_user_id::text || ':' || p_feature || ':' || p_request_id::text,
    0
  ));
  select usage_event.* into v_event
  from public.ai_usage_events as usage_event
  where usage_event.user_id = p_user_id
    and usage_event.feature = p_feature
    and usage_event.request_id = p_request_id
  for update;
  if v_event.id is null then
    raise exception using errcode = 'P0002', message = 'AI_RESERVATION_NOT_FOUND';
  end if;
  if v_event.logical_request_id <> p_logical_request_id
    or v_event.payload_hash is distinct from p_payload_hash then
    raise exception using errcode = '23505', message = 'AI_REQUEST_IDENTITY_CONFLICT';
  end if;
  if v_event.settlement_disposition is null then
    raise exception using errcode = '23514', message = 'AI_CREDIT_DISPOSITION_REQUIRED';
  end if;
  if p_expected_disposition is not null
    and v_event.settlement_disposition <> p_expected_disposition then
    raise exception using errcode = '23514', message = 'AI_CREDIT_DISPOSITION_CONFLICT';
  end if;

  if v_event.status = 'reserved' and v_event.settlement_disposition = 'complete' then
    update public.ai_usage_events as usage_event
    set status = 'completed', credits_used = 1, completed_at = now()
    where usage_event.id = v_event.id
    returning usage_event.* into v_event;
  elsif v_event.status = 'reserved' and v_event.settlement_disposition = 'release' then
    update public.ai_usage_events as usage_event
    set status = 'released', credits_used = 0, completed_at = null
    where usage_event.id = v_event.id
    returning usage_event.* into v_event;
  end if;

  if (v_event.status = 'completed' and v_event.settlement_disposition <> 'complete')
    or (v_event.status = 'released' and v_event.settlement_disposition <> 'release') then
    raise exception using errcode = '23514', message = 'AI_CREDIT_TERMINAL_CONFLICT';
  end if;

  if v_event.feature in ('ask', 'vet_brief') then
    select resolved.allowance into strict v_allowance
    from private.resolve_feature_allowance(p_user_id, p_feature) as resolved;
  else
    select entitlements.monthly_ai_credits into strict v_allowance
    from private.resolve_account_entitlements(p_user_id) as entitlements;
  end if;
  select coalesce(sum(usage.credits_used), 0)::integer into v_completed
  from public.ai_usage_events as usage
  where usage.user_id = p_user_id
    and ((usage.period_start = v_event.period_start
    and (v_event.feature not in ('ask', 'vet_brief') or usage.allowance_period_key = v_event.allowance_period_key))
      or (v_event.feature = 'vet_brief' and v_event.allowance_period_key <> 'free:vet_brief:lifetime' and usage.allowance_period_key is null
        and usage.created_at >= v_event.period_start
        and usage.created_at < (select a.period_end from private.resolve_feature_allowance(p_user_id, 'vet_brief') a)))
    and usage.status = 'completed'
    and ((v_event.feature in ('ask', 'vet_brief') and usage.feature = p_feature) or (v_event.feature not in ('ask', 'vet_brief') and usage.feature not in ('ask', 'vet_brief')));
  return query select v_event.status, v_event.settlement_disposition, v_event.credits_used,
    greatest(0, v_allowance - v_completed);
end;
$$;

