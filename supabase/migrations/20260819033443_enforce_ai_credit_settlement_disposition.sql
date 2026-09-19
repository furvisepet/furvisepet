-- Persist the server's required financial outcome before terminal credit
-- bookkeeping is allowed to become best-effort. The ledger, not application
-- memory or assistant response_data, is authoritative.
begin;

alter table public.ai_usage_events
  add column if not exists logical_request_id uuid,
  add column if not exists settlement_disposition text,
  add column if not exists settlement_decided_at timestamptz;

-- Terminal legacy rows have an unambiguous disposition. Legacy reservations
-- intentionally remain undecided and are surfaced for operator review.
update public.ai_usage_events
set
  logical_request_id = coalesce(logical_request_id, request_id),
  settlement_disposition = case
    when status = 'completed' then 'complete'
    when status = 'released' then 'release'
    else settlement_disposition
  end,
  settlement_decided_at = case
    when status = 'completed' then coalesce(settlement_decided_at, completed_at, created_at)
    when status = 'released' then coalesce(settlement_decided_at, created_at)
    else settlement_decided_at
  end;

alter table public.ai_usage_events
  alter column logical_request_id set not null;

alter table public.ai_usage_events
  drop constraint if exists ai_usage_events_settlement_disposition_check;
alter table public.ai_usage_events
  add constraint ai_usage_events_settlement_disposition_check check (
    settlement_disposition is null
    or settlement_disposition in ('complete', 'release')
  ) not valid;

alter table public.ai_usage_events
  drop constraint if exists ai_usage_events_settlement_decision_shape;
alter table public.ai_usage_events
  add constraint ai_usage_events_settlement_decision_shape check (
    (settlement_disposition is null and settlement_decided_at is null)
    or (settlement_disposition is not null and settlement_decided_at is not null)
  ) not valid;

alter table public.ai_usage_events
  drop constraint if exists ai_usage_events_state_shape;
alter table public.ai_usage_events
  add constraint ai_usage_events_state_shape check (
    (status = 'reserved' and credits_used = 1 and completed_at is null)
    or (
      status = 'completed'
      and credits_used = 1
      and completed_at is not null
      and settlement_disposition = 'complete'
    )
    or (
      status = 'released'
      and credits_used = 0
      and completed_at is null
      and settlement_disposition = 'release'
    )
  ) not valid;

alter table public.ai_usage_events validate constraint ai_usage_events_settlement_disposition_check;
alter table public.ai_usage_events validate constraint ai_usage_events_settlement_decision_shape;
alter table public.ai_usage_events validate constraint ai_usage_events_state_shape;

create index if not exists ai_usage_events_logical_settlement_idx
  on public.ai_usage_events(user_id, feature, logical_request_id, status, settlement_disposition);

create unique index if not exists ai_usage_events_one_chargeable_attempt_per_logical_turn
  on public.ai_usage_events(user_id, feature, logical_request_id)
  where settlement_disposition = 'complete';

create or replace function private.enforce_ai_credit_state_machine()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if old.user_id <> new.user_id
    or old.request_id <> new.request_id
    or old.logical_request_id <> new.logical_request_id
    or old.feature <> new.feature
    or old.period_start <> new.period_start
    or old.allowance_period_key is distinct from new.allowance_period_key
    or (old.payload_hash is not null and old.payload_hash is distinct from new.payload_hash) then
    raise exception using errcode = '23514', message = 'AI_CREDIT_IDENTITY_IMMUTABLE';
  end if;
  if old.settlement_disposition is not null
    and old.settlement_disposition is distinct from new.settlement_disposition then
    raise exception using errcode = '23514', message = 'AI_CREDIT_DISPOSITION_IMMUTABLE';
  end if;
  if old.settlement_decided_at is not null
    and old.settlement_decided_at is distinct from new.settlement_decided_at then
    raise exception using errcode = '23514', message = 'AI_CREDIT_DISPOSITION_IMMUTABLE';
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

-- Replace the old four-argument mutations. All new mutations bind both the
-- execution attempt and its logical request.
revoke all on function public.reserve_ai_credit(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.complete_ai_credit(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.release_ai_credit(uuid, uuid, text, text) from public, anon, authenticated;
drop function public.reserve_ai_credit(uuid, uuid, text, text);
drop function public.complete_ai_credit(uuid, uuid, text, text);
drop function public.release_ai_credit(uuid, uuid, text, text);

create function public.reserve_ai_credit(
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
    user_id, request_id, logical_request_id, feature, payload_hash,
    credits_used, status, period_start, allowance_period_key
  ) values (
    p_user_id, p_request_id, p_logical_request_id, p_feature, p_payload_hash,
    1, 'reserved', v_period_start, v_period_key
  ) returning * into v_existing;
  return query select 'reserved'::text, 1, greatest(0, v_allowance - v_committed);
end;
$$;

create function public.set_ai_credit_disposition(
  p_user_id uuid,
  p_request_id uuid,
  p_logical_request_id uuid,
  p_feature text,
  p_payload_hash text,
  p_disposition text
)
returns table(event_status text, settlement_disposition text)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_event public.ai_usage_events%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_user_id is null or p_request_id is null or p_logical_request_id is null
    or p_feature is null or p_payload_hash is null or p_payload_hash !~ '^[0-9a-f]{64}$'
    or p_disposition not in ('complete', 'release') then
    raise exception using errcode = '22023', message = 'INVALID_AI_SETTLEMENT_INTENT';
  end if;
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
    update public.ai_usage_events as usage_event
    set settlement_disposition = p_disposition, settlement_decided_at = now()
    where usage_event.id = v_event.id
    returning usage_event.* into v_event;
  elsif v_event.settlement_disposition <> p_disposition then
    raise exception using errcode = '23514', message = 'AI_CREDIT_DISPOSITION_CONFLICT';
  end if;
  if (v_event.status = 'completed' and p_disposition <> 'complete')
    or (v_event.status = 'released' and p_disposition <> 'release') then
    raise exception using errcode = '23514', message = 'AI_CREDIT_TERMINAL_CONFLICT';
  end if;
  return query select v_event.status, v_event.settlement_disposition;
end;
$$;

create function private.reconcile_ai_credit_event(
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

  if v_event.feature = 'ask' then
    select resolved.allowance into strict v_allowance
    from private.resolve_ask_allowance(p_user_id) as resolved;
  else
    select entitlements.monthly_ai_credits into strict v_allowance
    from private.resolve_account_entitlements(p_user_id) as entitlements;
  end if;
  select coalesce(sum(usage.credits_used), 0)::integer into v_completed
  from public.ai_usage_events as usage
  where usage.user_id = p_user_id
    and usage.period_start = v_event.period_start
    and (v_event.feature <> 'ask' or usage.allowance_period_key = v_event.allowance_period_key)
    and usage.status = 'completed'
    and ((v_event.feature = 'ask' and usage.feature = 'ask') or (v_event.feature <> 'ask' and usage.feature <> 'ask'));
  return query select v_event.status, v_event.settlement_disposition, v_event.credits_used,
    greatest(0, v_allowance - v_completed);
end;
$$;

create function public.reconcile_ai_credit(
  p_user_id uuid,
  p_request_id uuid,
  p_logical_request_id uuid,
  p_feature text,
  p_payload_hash text
)
returns table(event_status text, settlement_disposition text, credits_used integer, remaining integer)
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_user_id is null or p_request_id is null or p_logical_request_id is null
    or p_feature is null or p_payload_hash is null or p_payload_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'INVALID_AI_REQUEST_IDENTITY';
  end if;
  return query select * from private.reconcile_ai_credit_event(
    p_user_id, p_request_id, p_logical_request_id, p_feature, p_payload_hash, null
  );
end;
$$;

create function public.complete_ai_credit(
  p_user_id uuid,
  p_request_id uuid,
  p_logical_request_id uuid,
  p_feature text,
  p_payload_hash text
)
returns table(event_status text, credits_used integer, remaining integer)
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  return query
  select reconciled.event_status, reconciled.credits_used, reconciled.remaining
  from private.reconcile_ai_credit_event(
    p_user_id, p_request_id, p_logical_request_id, p_feature, p_payload_hash, 'complete'
  ) as reconciled;
end;
$$;

create function public.release_ai_credit(
  p_user_id uuid,
  p_request_id uuid,
  p_logical_request_id uuid,
  p_feature text,
  p_payload_hash text
)
returns table(event_status text, credits_used integer, remaining integer)
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  return query
  select reconciled.event_status, reconciled.credits_used, reconciled.remaining
  from private.reconcile_ai_credit_event(
    p_user_id, p_request_id, p_logical_request_id, p_feature, p_payload_hash, 'release'
  ) as reconciled;
end;
$$;

revoke all on function private.reconcile_ai_credit_event(uuid, uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.reserve_ai_credit(uuid, uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.set_ai_credit_disposition(uuid, uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.reconcile_ai_credit(uuid, uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.complete_ai_credit(uuid, uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.release_ai_credit(uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function private.reconcile_ai_credit_event(uuid, uuid, uuid, text, text, text) to service_role;
grant execute on function public.reserve_ai_credit(uuid, uuid, uuid, text, text) to service_role;
grant execute on function public.set_ai_credit_disposition(uuid, uuid, uuid, text, text, text) to service_role;
grant execute on function public.reconcile_ai_credit(uuid, uuid, uuid, text, text) to service_role;
grant execute on function public.complete_ai_credit(uuid, uuid, uuid, text, text) to service_role;
grant execute on function public.release_ai_credit(uuid, uuid, uuid, text, text) to service_role;

-- Operational cleanup follows durable intent. Undecided reservations are
-- never guessed; they remain reserved and visible as critical diagnostics.
drop function public.cleanup_operational_records(boolean, integer);
create function public.cleanup_operational_records(p_apply boolean default false, p_batch_limit integer default 500)
returns table(
  stale_credit_count bigint,
  completed_credit_count bigint,
  released_credit_count bigint,
  missing_disposition_count bigint,
  expired_deletion_count bigint,
  deleted_deletion_count bigint
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_stale bigint := 0;
  v_completed bigint := 0;
  v_released bigint := 0;
  v_missing bigint := 0;
  v_expired bigint := 0;
  v_deleted bigint := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_batch_limit not between 1 and 5000 then
    raise exception using errcode = '22023', message = 'BATCH_LIMIT_INVALID';
  end if;
  select
    count(*),
    count(*) filter (where stale.settlement_disposition is null)
  into v_stale, v_missing
  from (
    select settlement_disposition
    from public.ai_usage_events
    where status = 'reserved' and created_at < now() - interval '30 minutes'
    order by created_at
    limit p_batch_limit
  ) as stale;
  select count(*) into v_expired
  from (
    select id from public.account_deletion_requests
    where status = 'completed' and retain_until < now()
    limit p_batch_limit
  ) as rows;
  if p_apply then
    with rows as (
      select id
      from public.ai_usage_events
      where status = 'reserved'
        and settlement_disposition is not null
        and created_at < now() - interval '30 minutes'
      order by created_at
      limit p_batch_limit
      for update skip locked
    ), settled as (
      update public.ai_usage_events as usage_event
      set
        status = case usage_event.settlement_disposition when 'complete' then 'completed' else 'released' end,
        credits_used = case usage_event.settlement_disposition when 'complete' then 1 else 0 end,
        completed_at = case usage_event.settlement_disposition when 'complete' then now() else null end
      where usage_event.id in (select id from rows)
      returning usage_event.settlement_disposition
    )
    select
      count(*) filter (where settled.settlement_disposition = 'complete'),
      count(*) filter (where settled.settlement_disposition = 'release')
    into v_completed, v_released
    from settled;

    with rows as (
      select id from public.account_deletion_requests
      where status = 'completed' and retain_until < now()
      order by retain_until
      limit p_batch_limit
      for update skip locked
    )
    delete from public.account_deletion_requests
    where id in (select id from rows);
    get diagnostics v_deleted = row_count;
  end if;
  return query select v_stale, v_completed, v_released, v_missing, v_expired, v_deleted;
end;
$$;

create or replace function public.run_furvise_integrity_diagnostics()
returns table(issue_code text, severity text, issue_count bigint)
language sql
security definer
set search_path = pg_catalog
as $$
  select 'pets_without_auth_owner', 'critical', count(*) from public.dog_profiles p where not exists (select 1 from auth.users u where u.id = p.user_id)
  union all select 'care_without_pet', 'critical', count(*) from public.pet_care_entries e where not exists (select 1 from public.dog_profiles p where p.id = e.pet_profile_id)
  union all select 'state_without_pet', 'critical', count(*) from public.pet_current_state s where not exists (select 1 from public.dog_profiles p where p.id = s.pet_profile_id)
  union all select 'episode_without_pet', 'critical', count(*) from public.pet_care_episodes e where not exists (select 1 from public.dog_profiles p where p.id = e.pet_profile_id)
  union all select 'invalid_memory_supersession', 'high', count(*) from public.furvise_memories m where m.superseded_by is not null and not exists (select 1 from public.furvise_memories n where n.id = m.superseded_by and n.user_id = m.user_id)
  union all select 'duplicate_active_memory', 'high', count(*) from (select user_id, subject_type, pet_id, fact_key from public.furvise_memories where status = 'active' group by user_id, subject_type, pet_id, fact_key having count(*) > 1) d
  union all select 'duplicate_active_medication_state', 'high', count(*) from (select user_id, pet_profile_id, normalized_key from public.pet_care_episodes where episode_type = 'medication_course' and status = 'active' group by user_id, pet_profile_id, normalized_key having count(*) > 1) d
  union all select 'stale_ai_credit_must_complete', 'critical', count(*) from public.ai_usage_events where status = 'reserved' and settlement_disposition = 'complete' and created_at < now() - interval '30 minutes'
  union all select 'stale_ai_credit_must_release', 'high', count(*) from public.ai_usage_events where status = 'reserved' and settlement_disposition = 'release' and created_at < now() - interval '30 minutes'
  union all select 'ai_credit_missing_disposition', 'critical', count(*) from public.ai_usage_events where status = 'reserved' and settlement_disposition is null and created_at < now() - interval '30 minutes'
  union all select 'stale_idempotency_processing', 'high', count(*) from public.idempotency_operations where status = 'processing' and lease_expires_at < now()
  union all select 'completed_idempotency_without_response', 'high', count(*) from public.idempotency_operations where status = 'completed' and response_status is null
  union all select 'provider_usage_reconciliation_required', 'critical', count(*) from public.idempotency_operations where error_code in ('POST_PROVIDER_RECONCILIATION', 'POST_MUTATION_RECONCILIATION')
  union all select 'account_deletion_reconciliation', 'critical', count(*) from public.account_deletion_requests where status = 'auth_delete_failed'
  union all select 'duplicate_application_profile', 'critical', count(*) from (select user_id from public.user_profiles group by user_id having count(*) > 1) d
  union all select 'migration_version_mismatch', 'critical', case when coalesce((select max(version)::text from supabase_migrations.schema_migrations), '') = '20260819033443' then 0 else 1 end;
$$;

drop function public.furvise_readiness_snapshot();
create function public.furvise_readiness_snapshot()
returns table(
  latest_migration text,
  deletion_reconciliation_count bigint,
  stale_credit_count bigint,
  missing_credit_disposition_count bigint
)
language sql
security definer
set search_path = pg_catalog
as $$
  select
    coalesce((select max(version)::text from supabase_migrations.schema_migrations), ''),
    (select count(*) from public.account_deletion_requests where status = 'auth_delete_failed'),
    (select count(*) from public.ai_usage_events where status = 'reserved' and created_at < now() - interval '30 minutes'),
    (select count(*) from public.ai_usage_events where status = 'reserved' and settlement_disposition is null and created_at < now() - interval '30 minutes');
$$;

revoke all on function public.cleanup_operational_records(boolean, integer) from public, anon, authenticated;
revoke all on function public.run_furvise_integrity_diagnostics() from public, anon, authenticated;
revoke all on function public.furvise_readiness_snapshot() from public, anon, authenticated;
grant execute on function public.cleanup_operational_records(boolean, integer) to service_role;
grant execute on function public.run_furvise_integrity_diagnostics() to service_role;
grant execute on function public.furvise_readiness_snapshot() to service_role;

comment on column public.ai_usage_events.logical_request_id is
  'Server-bound logical request identity. Multiple released retry attempts may share it.';
comment on column public.ai_usage_events.settlement_disposition is
  'Immutable server-authored terminal intent: complete or release. Null reserved rows require operator reconciliation.';

commit;
