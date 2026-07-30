begin;

alter table public.pet_care_entries add column if not exists idempotency_key uuid;
alter table public.dog_profiles add column if not exists idempotency_key uuid;
alter table public.ask_conversations add column if not exists idempotency_key uuid;
alter table public.vet_visit_briefs add column if not exists idempotency_key uuid;
alter table public.dog_memories add column if not exists idempotency_key uuid;
alter table public.dog_memories add column if not exists idempotency_item_index integer;

-- Existing rows receive NULL, so the preflight cannot contain a conflicting non-NULL key.
do $$
begin
  if exists (
    select 1 from public.pet_care_entries where idempotency_key is not null group by user_id, idempotency_key having count(*) > 1
    union all select 1 from public.dog_profiles where idempotency_key is not null group by user_id, idempotency_key having count(*) > 1
    union all select 1 from public.ask_conversations where idempotency_key is not null group by user_id, idempotency_key having count(*) > 1
    union all select 1 from public.vet_visit_briefs where idempotency_key is not null group by user_id, idempotency_key having count(*) > 1
  ) then raise exception 'IDEMPOTENCY_DUPLICATE_PREFLIGHT_FAILED'; end if;
end;
$$;

create unique index if not exists pet_care_entries_owner_idempotency_idx on public.pet_care_entries(user_id, idempotency_key) where idempotency_key is not null;
create unique index if not exists dog_profiles_owner_idempotency_idx on public.dog_profiles(user_id, idempotency_key) where idempotency_key is not null;
create unique index if not exists ask_conversations_owner_idempotency_idx on public.ask_conversations(user_id, idempotency_key) where idempotency_key is not null;
create unique index if not exists vet_visit_briefs_owner_idempotency_idx on public.vet_visit_briefs(user_id, idempotency_key) where idempotency_key is not null;
create unique index if not exists dog_memories_owner_idempotency_item_idx on public.dog_memories(user_id, idempotency_key, idempotency_item_index) where idempotency_key is not null;

create table if not exists public.idempotency_operations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  operation_type text not null check (operation_type ~ '^[a-z][a-z0-9_.-]{1,79}$'),
  idempotency_key uuid not null,
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'processing' check (status in ('processing', 'completed', 'failed_retryable', 'failed_final', 'abandoned')),
  owner_token uuid,
  attempt_count integer not null default 1 check (attempt_count > 0),
  response_status integer check (response_status between 100 and 599),
  response_body jsonb,
  resource_type text,
  resource_id uuid,
  error_code text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  lease_expires_at timestamptz,
  expires_at timestamptz not null,
  constraint idempotency_operations_owner_operation_key_unique unique (user_id, operation_type, idempotency_key),
  constraint idempotency_operations_response_size check (response_body is null or octet_length(response_body::text) <= 131072)
);

create index if not exists idempotency_operations_status_expiry_idx
  on public.idempotency_operations(status, expires_at);
create index if not exists idempotency_operations_user_updated_idx
  on public.idempotency_operations(user_id, updated_at desc);

alter table public.idempotency_operations enable row level security;
alter table public.idempotency_operations force row level security;
revoke all on table public.idempotency_operations from public, anon, authenticated;

create or replace function public.claim_idempotency_operation(
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
declare
  v_user_id uuid := p_user_id;
  v_now timestamptz := clock_timestamp();
  v_owner_token uuid := gen_random_uuid();
  v_row public.idempotency_operations%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED'; end if;
  if v_user_id is null then raise exception using errcode = '22023', message = 'IDEMPOTENCY_USER_REQUIRED'; end if;
  if p_operation_type is null or p_operation_type !~ '^[a-z][a-z0-9_.-]{1,79}$' then raise exception using errcode = '22023', message = 'IDEMPOTENCY_OPERATION_INVALID'; end if;
  if p_idempotency_key is null or p_payload_hash is null or p_payload_hash !~ '^[0-9a-f]{64}$' then raise exception using errcode = '22023', message = 'IDEMPOTENCY_INPUT_INVALID'; end if;
  if p_retention_seconds not between 3600 and 7776000 or p_lease_seconds not between 15 and 900 then raise exception using errcode = '22023', message = 'IDEMPOTENCY_TTL_INVALID'; end if;

  insert into public.idempotency_operations (
    user_id, operation_type, idempotency_key, payload_hash, owner_token,
    lease_expires_at, expires_at
  ) values (
    v_user_id, p_operation_type, p_idempotency_key, p_payload_hash, v_owner_token,
    v_now + make_interval(secs => p_lease_seconds), v_now + make_interval(secs => p_retention_seconds)
  )
  on conflict (user_id, operation_type, idempotency_key) do nothing
  returning * into v_row;

  if found then
    return query select 'new'::text, v_row.id, v_owner_token, null::integer, null::jsonb, 0, null::text;
    return;
  end if;

  select * into v_row
  from public.idempotency_operations operation_row
  where operation_row.user_id = v_user_id
    and operation_row.operation_type = p_operation_type
    and operation_row.idempotency_key = p_idempotency_key
  for update;

  if v_row.payload_hash <> p_payload_hash then
    return query select 'conflict'::text, v_row.id, null::uuid, null::integer, null::jsonb, 0, 'IDEMPOTENCY_CONFLICT'::text;
  elsif v_row.status = 'completed' then
    return query select 'completed'::text, v_row.id, null::uuid, v_row.response_status, v_row.response_body, 0, null::text;
  elsif v_row.status = 'failed_final' then
    return query select 'failed_final'::text, v_row.id, null::uuid, v_row.response_status, v_row.response_body, 0, v_row.error_code;
  elsif v_row.status = 'processing' and v_row.lease_expires_at > v_now then
    return query select 'in_progress'::text, v_row.id, null::uuid, null::integer, null::jsonb,
      greatest(1, ceil(extract(epoch from (v_row.lease_expires_at - v_now)))::integer), null::text;
  elsif v_row.status = 'processing' and exists (
    select 1 from public.ai_usage_events usage
    where usage.user_id = v_user_id and usage.request_id = p_idempotency_key and usage.status = 'completed'
  ) then
    update public.idempotency_operations operation_row set
      status = 'failed_final', error_code = 'POST_PROVIDER_RECONCILIATION', response_status = 503,
      response_body = jsonb_build_object('code', 'IDEMPOTENCY_RECONCILIATION_REQUIRED', 'error', 'This AI request completed provider work but needs reconciliation.'),
      owner_token = null, lease_expires_at = null, completed_at = v_now, updated_at = v_now
    where operation_row.id = v_row.id;
    return query select 'failed_final'::text, v_row.id, null::uuid, 503,
      jsonb_build_object('code', 'IDEMPOTENCY_RECONCILIATION_REQUIRED', 'error', 'This request is being reconciled. Please contact support before repeating it.'),
      0, 'POST_PROVIDER_RECONCILIATION'::text;
  else
    update public.idempotency_operations operation_row set
      status = 'processing', owner_token = v_owner_token, attempt_count = operation_row.attempt_count + 1,
      error_code = null, response_status = null, response_body = null, completed_at = null,
      updated_at = v_now, lease_expires_at = v_now + make_interval(secs => p_lease_seconds),
      expires_at = greatest(operation_row.expires_at, v_now + make_interval(secs => p_retention_seconds))
    where operation_row.id = v_row.id;
    return query select 'retry'::text, v_row.id, v_owner_token, null::integer, null::jsonb, 0, null::text;
  end if;
end;
$$;

create or replace function public.complete_idempotency_operation(
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
declare v_user_id uuid := p_user_id;
begin
  if auth.role() <> 'service_role' then raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED'; end if;
  if v_user_id is null then raise exception using errcode = '22023', message = 'IDEMPOTENCY_USER_REQUIRED'; end if;
  if p_response_status not between 100 and 599 or (p_response_body is not null and octet_length(p_response_body::text) > 131072) then
    raise exception using errcode = '22023', message = 'IDEMPOTENCY_RESPONSE_INVALID';
  end if;
  update public.idempotency_operations operation_row set
    status = 'completed', response_status = p_response_status, response_body = p_response_body,
    resource_type = left(p_resource_type, 80), resource_id = p_resource_id,
    owner_token = null, lease_expires_at = null, completed_at = clock_timestamp(), updated_at = clock_timestamp()
  where operation_row.user_id = v_user_id and operation_row.operation_type = p_operation_type
    and operation_row.idempotency_key = p_idempotency_key and operation_row.status = 'processing'
    and operation_row.owner_token = p_owner_token;
  return found;
end;
$$;

create or replace function public.fail_idempotency_operation(
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
declare v_user_id uuid := p_user_id;
begin
  if auth.role() <> 'service_role' then raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED'; end if;
  if v_user_id is null then raise exception using errcode = '22023', message = 'IDEMPOTENCY_USER_REQUIRED'; end if;
  update public.idempotency_operations operation_row set
    status = case when p_retryable then 'failed_retryable' else 'failed_final' end,
    error_code = left(p_error_code, 80), response_status = p_response_status, response_body = p_response_body,
    owner_token = null, lease_expires_at = null,
    completed_at = case when p_retryable then null else clock_timestamp() end,
    updated_at = clock_timestamp()
  where operation_row.user_id = v_user_id and operation_row.operation_type = p_operation_type
    and operation_row.idempotency_key = p_idempotency_key and operation_row.status = 'processing'
    and operation_row.owner_token = p_owner_token;
  return found;
end;
$$;

create or replace function public.abandon_idempotency_operation(
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
declare v_user_id uuid := p_user_id;
begin
  if auth.role() <> 'service_role' then raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED'; end if;
  if v_user_id is null then raise exception using errcode = '22023', message = 'IDEMPOTENCY_USER_REQUIRED'; end if;
  update public.idempotency_operations operation_row set
    status = 'abandoned', error_code = left(p_error_code, 80), owner_token = null,
    lease_expires_at = null, updated_at = clock_timestamp()
  where operation_row.user_id = v_user_id and operation_row.operation_type = p_operation_type
    and operation_row.idempotency_key = p_idempotency_key and operation_row.status = 'processing'
    and operation_row.owner_token = p_owner_token;
  return found;
end;
$$;

create or replace function public.cleanup_expired_idempotency_operations(
  p_apply boolean default false,
  p_batch_limit integer default 500
)
returns table (eligible_count bigint, deleted_count bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare v_eligible bigint; v_deleted bigint := 0;
begin
  if auth.role() <> 'service_role' then raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED'; end if;
  if p_batch_limit not between 1 and 5000 then raise exception using errcode = '22023', message = 'BATCH_LIMIT_INVALID'; end if;
  select count(*) into v_eligible from (
    select operation_row.id from public.idempotency_operations operation_row
    where operation_row.expires_at < clock_timestamp()
      and operation_row.status <> 'processing'
      and not exists (
        select 1 from public.ai_usage_events usage
        where usage.user_id = operation_row.user_id and usage.request_id = operation_row.idempotency_key
          and usage.status = 'reserved'
      )
    limit p_batch_limit
  ) candidates;
  if p_apply then
    with candidates as (
      select operation_row.id from public.idempotency_operations operation_row
      where operation_row.expires_at < clock_timestamp() and operation_row.status <> 'processing'
        and not exists (
          select 1 from public.ai_usage_events usage
          where usage.user_id = operation_row.user_id and usage.request_id = operation_row.idempotency_key
            and usage.status = 'reserved'
        )
      order by operation_row.expires_at asc limit p_batch_limit for update skip locked
    )
    delete from public.idempotency_operations operation_row using candidates
    where operation_row.id = candidates.id;
    get diagnostics v_deleted = row_count;
  end if;
  return query select v_eligible, v_deleted;
end;
$$;

revoke all on function public.claim_idempotency_operation(uuid, text, uuid, text, integer, integer) from public, anon, authenticated;
revoke all on function public.complete_idempotency_operation(uuid, text, uuid, uuid, integer, jsonb, text, uuid) from public, anon, authenticated;
revoke all on function public.fail_idempotency_operation(uuid, text, uuid, uuid, boolean, text, integer, jsonb) from public, anon, authenticated;
revoke all on function public.abandon_idempotency_operation(uuid, text, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.claim_idempotency_operation(uuid, text, uuid, text, integer, integer) to service_role;
grant execute on function public.complete_idempotency_operation(uuid, text, uuid, uuid, integer, jsonb, text, uuid) to service_role;
grant execute on function public.fail_idempotency_operation(uuid, text, uuid, uuid, boolean, text, integer, jsonb) to service_role;
grant execute on function public.abandon_idempotency_operation(uuid, text, uuid, uuid, text) to service_role;

revoke all on function public.cleanup_expired_idempotency_operations(boolean, integer) from public, anon, authenticated;
grant execute on function public.cleanup_expired_idempotency_operations(boolean, integer) to service_role;

commit;
