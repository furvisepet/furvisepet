-- AI credit mutations are financial/usage authority. Bind every operation to
-- the authenticated user, feature, request identifier, and canonical payload.
alter table public.ai_usage_events
  add column if not exists payload_hash text;

alter table public.ai_usage_events
  drop constraint if exists ai_usage_events_payload_hash_format;
alter table public.ai_usage_events
  add constraint ai_usage_events_payload_hash_format
  check (payload_hash is null or payload_hash ~ '^[0-9a-f]{64}$');

alter table public.ai_usage_events
  drop constraint if exists ai_usage_events_state_shape;
alter table public.ai_usage_events
  add constraint ai_usage_events_state_shape check (
    (status = 'reserved' and credits_used = 1 and completed_at is null)
    or (status = 'completed' and credits_used = 1 and completed_at is not null)
    or (status = 'released' and credits_used = 0 and completed_at is null)
  ) not valid;

-- Existing rows predate payload fingerprints. They remain readable and can be
-- bound exactly once by a trusted server call; new rows always receive a hash.
drop index if exists public.ai_usage_events_user_request_unique;
create unique index if not exists ai_usage_events_user_feature_request_unique
  on public.ai_usage_events(user_id, feature, request_id);

create or replace function private.enforce_ai_credit_state_machine()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if old.user_id <> new.user_id
    or old.request_id <> new.request_id
    or old.feature <> new.feature
    or old.period_start <> new.period_start
    or old.allowance_period_key is distinct from new.allowance_period_key
    or (old.payload_hash is not null and old.payload_hash is distinct from new.payload_hash) then
    raise exception using errcode = '23514', message = 'AI_CREDIT_IDENTITY_IMMUTABLE';
  end if;
  if old.status = 'completed' and new.status <> 'completed' then
    raise exception using errcode = '23514', message = 'AI_CREDIT_COMPLETED_TERMINAL';
  end if;
  if old.status = 'released' and new.status <> 'released' then
    raise exception using errcode = '23514', message = 'AI_CREDIT_RELEASED_TERMINAL';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_ai_credit_state_machine() from public, anon, authenticated;
grant execute on function private.enforce_ai_credit_state_machine() to service_role;

drop trigger if exists enforce_ai_credit_state_machine on public.ai_usage_events;
create trigger enforce_ai_credit_state_machine
before update on public.ai_usage_events
for each row execute function private.enforce_ai_credit_state_machine();

-- Remove every client-callable legacy mutation signature before introducing
-- service-only, user-explicit operations.
revoke all on function public.reserve_ai_credit(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.complete_ai_credit(uuid, integer) from public, anon, authenticated;
revoke all on function public.release_ai_credit(uuid, integer) from public, anon, authenticated;
drop function public.reserve_ai_credit(uuid, text, integer);
drop function public.complete_ai_credit(uuid, integer);
drop function public.release_ai_credit(uuid, integer);

create function public.reserve_ai_credit(
  p_user_id uuid,
  p_request_id uuid,
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
  if p_user_id is null or p_request_id is null then
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

  perform pg_advisory_xact_lock(hashtextextended('ai-operation:' || p_user_id::text || ':' || p_feature || ':' || p_request_id::text, 0));
  select usage_event.* into v_existing
  from public.ai_usage_events as usage_event
  where usage_event.user_id = p_user_id
    and usage_event.feature = p_feature
    and usage_event.request_id = p_request_id
  for update;

  if v_existing.id is not null then
    if v_existing.payload_hash is null then
      update public.ai_usage_events as usage_event
      set payload_hash = p_payload_hash
      where usage_event.id = v_existing.id
      returning usage_event.* into v_existing;
    elsif v_existing.payload_hash <> p_payload_hash then
      raise exception using errcode = '23505', message = 'AI_REQUEST_IDENTITY_CONFLICT';
    end if;

    if v_existing.feature = 'ask' then
      select resolved.allowance into strict v_allowance
      from private.resolve_ask_allowance(p_user_id) as resolved;
    else
      select entitlements.monthly_ai_credits into strict v_allowance
      from private.resolve_account_entitlements(p_user_id) as entitlements;
    end if;
    select coalesce(sum(usage.credits_used), 0)::integer into v_committed
    from public.ai_usage_events as usage
    where usage.user_id = p_user_id
      and usage.period_start = v_existing.period_start
      and (p_feature <> 'ask' or usage.allowance_period_key = v_existing.allowance_period_key)
      and usage.status = 'completed'
      and ((p_feature = 'ask' and usage.feature = 'ask') or (p_feature <> 'ask' and usage.feature <> 'ask'));
    return query select v_existing.status, v_existing.credits_used, greatest(0, v_allowance - v_committed);
    return;
  end if;

  if p_feature = 'ask' then
    select resolved.allowance, resolved.period_start, resolved.period_key
      into strict v_allowance, v_period_start, v_period_key
    from private.resolve_ask_allowance(p_user_id) as resolved;
  else
    select entitlements.monthly_ai_credits into strict v_allowance
    from private.resolve_account_entitlements(p_user_id) as entitlements;
    v_period_start := date_trunc('month', timezone('utc', now()))::date;
    v_period_key := null;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'ai-period:' || p_user_id::text || ':' || case when p_feature = 'ask' then 'ask' else 'shared_non_ask' end || ':' || coalesce(v_period_key, v_period_start::text),
    0
  ));
  select
    coalesce(sum(usage.credits_used) filter (where usage.status = 'completed'), 0)::integer,
    coalesce(sum(usage.credits_used) filter (where usage.status in ('reserved', 'completed')), 0)::integer
  into v_committed, v_reserved
  from public.ai_usage_events as usage
  where usage.user_id = p_user_id
    and usage.period_start = v_period_start
    and (p_feature <> 'ask' or usage.allowance_period_key = v_period_key)
    and ((p_feature = 'ask' and usage.feature = 'ask') or (p_feature <> 'ask' and usage.feature <> 'ask'));

  if v_reserved >= v_allowance then
    return query select 'limit_reached'::text, 0, greatest(0, v_allowance - v_committed);
    return;
  end if;

  insert into public.ai_usage_events (
    user_id, request_id, feature, payload_hash, credits_used, status, period_start, allowance_period_key
  ) values (
    p_user_id, p_request_id, p_feature, p_payload_hash, 1, 'reserved', v_period_start, v_period_key
  ) returning * into v_existing;
  return query select 'reserved'::text, 1, greatest(0, v_allowance - v_committed);
end;
$$;

create function public.complete_ai_credit(
  p_user_id uuid,
  p_request_id uuid,
  p_feature text,
  p_payload_hash text
)
returns table(event_status text, credits_used integer, remaining integer)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_event public.ai_usage_events%rowtype;
  v_completed integer := 0;
  v_allowance integer;
begin
  if p_user_id is null or p_request_id is null or p_feature is null
    or p_payload_hash is null or p_payload_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'INVALID_AI_REQUEST_IDENTITY';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ai-operation:' || p_user_id::text || ':' || p_feature || ':' || p_request_id::text, 0));
  select usage_event.* into v_event
  from public.ai_usage_events as usage_event
  where usage_event.user_id = p_user_id
    and usage_event.feature = p_feature
    and usage_event.request_id = p_request_id
  for update;
  if v_event.id is null then
    raise exception using errcode = 'P0002', message = 'AI_RESERVATION_NOT_FOUND';
  end if;
  if v_event.payload_hash is null then
    update public.ai_usage_events set payload_hash = p_payload_hash where id = v_event.id returning * into v_event;
  elsif v_event.payload_hash <> p_payload_hash then
    raise exception using errcode = '23505', message = 'AI_REQUEST_IDENTITY_CONFLICT';
  end if;
  if v_event.status = 'released' then
    raise exception using errcode = '23514', message = 'AI_CREDIT_TERMINAL_CONFLICT';
  end if;
  if v_event.status = 'reserved' then
    update public.ai_usage_events as usage_event
    set status = 'completed', credits_used = 1, completed_at = coalesce(usage_event.completed_at, now())
    where usage_event.id = v_event.id
    returning usage_event.* into v_event;
  end if;

  if v_event.feature = 'ask' then
    select resolved.allowance into strict v_allowance from private.resolve_ask_allowance(p_user_id) as resolved;
  else
    select entitlements.monthly_ai_credits into strict v_allowance from private.resolve_account_entitlements(p_user_id) as entitlements;
  end if;
  select coalesce(sum(usage.credits_used), 0)::integer into v_completed
  from public.ai_usage_events as usage
  where usage.user_id = p_user_id
    and usage.period_start = v_event.period_start
    and (v_event.feature <> 'ask' or usage.allowance_period_key = v_event.allowance_period_key)
    and usage.status = 'completed'
    and ((v_event.feature = 'ask' and usage.feature = 'ask') or (v_event.feature <> 'ask' and usage.feature <> 'ask'));
  return query select 'completed'::text, 1, greatest(0, v_allowance - v_completed);
end;
$$;

create function public.release_ai_credit(
  p_user_id uuid,
  p_request_id uuid,
  p_feature text,
  p_payload_hash text
)
returns table(event_status text, credits_used integer, remaining integer)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_event public.ai_usage_events%rowtype;
  v_completed integer := 0;
  v_allowance integer;
begin
  if p_user_id is null or p_request_id is null or p_feature is null
    or p_payload_hash is null or p_payload_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'INVALID_AI_REQUEST_IDENTITY';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ai-operation:' || p_user_id::text || ':' || p_feature || ':' || p_request_id::text, 0));
  select usage_event.* into v_event
  from public.ai_usage_events as usage_event
  where usage_event.user_id = p_user_id
    and usage_event.feature = p_feature
    and usage_event.request_id = p_request_id
  for update;
  if v_event.id is null then
    raise exception using errcode = 'P0002', message = 'AI_RESERVATION_NOT_FOUND';
  end if;
  if v_event.payload_hash is null then
    update public.ai_usage_events set payload_hash = p_payload_hash where id = v_event.id returning * into v_event;
  elsif v_event.payload_hash <> p_payload_hash then
    raise exception using errcode = '23505', message = 'AI_REQUEST_IDENTITY_CONFLICT';
  end if;
  if v_event.status = 'completed' then
    raise exception using errcode = '23514', message = 'AI_CREDIT_TERMINAL_CONFLICT';
  end if;
  if v_event.status = 'reserved' then
    update public.ai_usage_events as usage_event
    set status = 'released', credits_used = 0, completed_at = null
    where usage_event.id = v_event.id
    returning usage_event.* into v_event;
  end if;

  if v_event.feature = 'ask' then
    select resolved.allowance into strict v_allowance from private.resolve_ask_allowance(p_user_id) as resolved;
  else
    select entitlements.monthly_ai_credits into strict v_allowance from private.resolve_account_entitlements(p_user_id) as entitlements;
  end if;
  select coalesce(sum(usage.credits_used), 0)::integer into v_completed
  from public.ai_usage_events as usage
  where usage.user_id = p_user_id
    and usage.period_start = v_event.period_start
    and (v_event.feature <> 'ask' or usage.allowance_period_key = v_event.allowance_period_key)
    and usage.status = 'completed'
    and ((v_event.feature = 'ask' and usage.feature = 'ask') or (v_event.feature <> 'ask' and usage.feature <> 'ask'));
  return query select 'released'::text, 0, greatest(0, v_allowance - v_completed);
end;
$$;

revoke all on function public.reserve_ai_credit(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.complete_ai_credit(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.release_ai_credit(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.reserve_ai_credit(uuid, uuid, text, text) to service_role;
grant execute on function public.complete_ai_credit(uuid, uuid, text, text) to service_role;
grant execute on function public.release_ai_credit(uuid, uuid, text, text) to service_role;
