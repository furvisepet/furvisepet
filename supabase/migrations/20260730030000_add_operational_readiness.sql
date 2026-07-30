begin;

create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  idempotency_key uuid not null,
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'processing' check (status in ('processing', 'application_deleted', 'auth_delete_failed', 'completed')),
  deleted_counts jsonb not null default '{}'::jsonb,
  error_code text,
  started_at timestamptz not null default now(),
  application_deleted_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  retain_until timestamptz not null default now() + interval '30 days',
  unique (user_id, idempotency_key)
);
create index if not exists account_deletion_requests_status_idx on public.account_deletion_requests(status, updated_at);
alter table public.account_deletion_requests enable row level security;
alter table public.account_deletion_requests force row level security;
revoke all on table public.account_deletion_requests from public, anon, authenticated;

create or replace function public.prepare_account_deletion(p_user_id uuid, p_idempotency_key uuid, p_payload_hash text)
returns table(outcome text, deletion_status text, deleted_counts jsonb)
language plpgsql security definer set search_path = '' as $$
declare
  v_request public.account_deletion_requests%rowtype;
  v_counts jsonb := '{}'::jsonb;
  v_count bigint;
begin
  if auth.role() <> 'service_role' then raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED'; end if;
  if p_user_id is null or p_idempotency_key is null or p_payload_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'ACCOUNT_DELETION_INPUT_INVALID';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':account-deletion', 0));
  insert into public.account_deletion_requests(user_id, idempotency_key, payload_hash)
  values (p_user_id, p_idempotency_key, p_payload_hash)
  on conflict (user_id, idempotency_key) do nothing;
  select * into v_request from public.account_deletion_requests
    where user_id = p_user_id and idempotency_key = p_idempotency_key for update;
  if v_request.payload_hash <> p_payload_hash then
    return query select 'conflict'::text, v_request.status, v_request.deleted_counts; return;
  end if;
  if v_request.status in ('application_deleted', 'auth_delete_failed', 'completed') then
    return query select 'replay'::text, v_request.status, v_request.deleted_counts; return;
  end if;

  delete from public.ai_update_suggestions where user_id = p_user_id; get diagnostics v_count = row_count; v_counts := v_counts || jsonb_build_object('suggestions', v_count);
  delete from public.ask_conversation_messages where user_id = p_user_id; get diagnostics v_count = row_count; v_counts := v_counts || jsonb_build_object('conversationMessages', v_count);
  delete from public.ask_conversations where user_id = p_user_id; get diagnostics v_count = row_count; v_counts := v_counts || jsonb_build_object('conversations', v_count);
  delete from public.vet_visit_briefs where user_id = p_user_id; get diagnostics v_count = row_count; v_counts := v_counts || jsonb_build_object('vetBriefs', v_count);
  delete from public.furvise_memories where user_id = p_user_id; get diagnostics v_count = row_count; v_counts := v_counts || jsonb_build_object('memories', v_count);
  delete from public.dog_memories where user_id = p_user_id;
  delete from public.dog_product_feedback where user_id = p_user_id; get diagnostics v_count = row_count; v_counts := v_counts || jsonb_build_object('productFeedback', v_count);
  delete from public.pet_current_state where user_id = p_user_id;
  delete from public.pet_care_entries where user_id = p_user_id; get diagnostics v_count = row_count; v_counts := v_counts || jsonb_build_object('careEntries', v_count);
  delete from public.pet_care_episodes where user_id = p_user_id;
  delete from public.pet_concerns where user_id = p_user_id;
  delete from public.dog_profiles where user_id = p_user_id; get diagnostics v_count = row_count; v_counts := v_counts || jsonb_build_object('pets', v_count);
  delete from public.ask_furvise_usage where user_id = p_user_id;
  delete from public.shop_search_usage where user_id = p_user_id;
  delete from public.product_question_usage where user_id = p_user_id;
  delete from public.product_ai_usage where user_id = p_user_id;
  delete from public.ai_usage_events where user_id = p_user_id; get diagnostics v_count = row_count; v_counts := v_counts || jsonb_build_object('aiUsageEvents', v_count);
  delete from public.user_profiles where user_id = p_user_id;

  update public.account_deletion_requests set status = 'application_deleted', deleted_counts = v_counts,
    application_deleted_at = now(), updated_at = now(), error_code = null
  where id = v_request.id;
  return query select 'new'::text, 'application_deleted'::text, v_counts;
end;
$$;

create or replace function public.mark_account_deletion_result(p_user_id uuid, p_idempotency_key uuid, p_completed boolean, p_error_code text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() <> 'service_role' then raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED'; end if;
  update public.account_deletion_requests set
    status = case when p_completed then 'completed' else 'auth_delete_failed' end,
    error_code = case when p_completed then null else left(coalesce(p_error_code, 'AUTH_DELETE_FAILED'), 80) end,
    completed_at = case when p_completed then now() else null end, updated_at = now()
  where user_id = p_user_id and idempotency_key = p_idempotency_key and status in ('application_deleted', 'auth_delete_failed');
  return found;
end;
$$;

create or replace function public.cleanup_operational_records(p_apply boolean default false, p_batch_limit integer default 500)
returns table(stale_credit_count bigint, released_credit_count bigint, expired_deletion_count bigint, deleted_deletion_count bigint)
language plpgsql security definer set search_path = '' as $$
declare v_stale bigint; v_released bigint := 0; v_expired bigint; v_deleted bigint := 0;
begin
  if auth.role() <> 'service_role' then raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED'; end if;
  if p_batch_limit not between 1 and 5000 then raise exception using errcode = '22023', message = 'BATCH_LIMIT_INVALID'; end if;
  select count(*) into v_stale from (select id from public.ai_usage_events where status = 'reserved' and created_at < now() - interval '30 minutes' limit p_batch_limit) rows;
  select count(*) into v_expired from (select id from public.account_deletion_requests where status = 'completed' and retain_until < now() limit p_batch_limit) rows;
  if p_apply then
    with rows as (select id from public.ai_usage_events where status = 'reserved' and created_at < now() - interval '30 minutes' order by created_at limit p_batch_limit for update skip locked)
    update public.ai_usage_events set status = 'released', credits_used = 0, completed_at = null where id in (select id from rows);
    get diagnostics v_released = row_count;
    with rows as (select id from public.account_deletion_requests where status = 'completed' and retain_until < now() order by retain_until limit p_batch_limit for update skip locked)
    delete from public.account_deletion_requests where id in (select id from rows);
    get diagnostics v_deleted = row_count;
  end if;
  return query select v_stale, v_released, v_expired, v_deleted;
end;
$$;

create or replace function public.run_furvise_integrity_diagnostics()
returns table(issue_code text, severity text, issue_count bigint)
language sql security definer set search_path = '' as $$
  select 'pets_without_auth_owner', 'critical', count(*) from public.dog_profiles p where not exists (select 1 from auth.users u where u.id = p.user_id)
  union all select 'care_without_pet', 'critical', count(*) from public.pet_care_entries e where not exists (select 1 from public.dog_profiles p where p.id = e.pet_profile_id)
  union all select 'state_without_pet', 'critical', count(*) from public.pet_current_state s where not exists (select 1 from public.dog_profiles p where p.id = s.pet_profile_id)
  union all select 'episode_without_pet', 'critical', count(*) from public.pet_care_episodes e where not exists (select 1 from public.dog_profiles p where p.id = e.pet_profile_id)
  union all select 'invalid_memory_supersession', 'high', count(*) from public.furvise_memories m where m.superseded_by is not null and not exists (select 1 from public.furvise_memories n where n.id = m.superseded_by and n.user_id = m.user_id)
  union all select 'duplicate_active_memory', 'high', count(*) from (select user_id, subject_type, pet_id, fact_key from public.furvise_memories where status = 'active' group by user_id, subject_type, pet_id, fact_key having count(*) > 1) d
  union all select 'stale_ai_credit_reservation', 'high', count(*) from public.ai_usage_events where status = 'reserved' and created_at < now() - interval '30 minutes'
  union all select 'stale_idempotency_processing', 'high', count(*) from public.idempotency_operations where status = 'processing' and lease_expires_at < now()
  union all select 'completed_idempotency_without_response', 'high', count(*) from public.idempotency_operations where status = 'completed' and response_status is null
  union all select 'account_deletion_reconciliation', 'critical', count(*) from public.account_deletion_requests where status = 'auth_delete_failed'
  union all select 'duplicate_application_profile', 'critical', count(*) from (select user_id from public.user_profiles group by user_id having count(*) > 1) d;
$$;

create or replace function public.furvise_readiness_snapshot()
returns table(latest_migration text, deletion_reconciliation_count bigint, stale_credit_count bigint)
language sql security definer set search_path = '' as $$
  select coalesce((select max(version)::text from supabase_migrations.schema_migrations), ''),
    (select count(*) from public.account_deletion_requests where status = 'auth_delete_failed'),
    (select count(*) from public.ai_usage_events where status = 'reserved' and created_at < now() - interval '30 minutes');
$$;

revoke all on function public.prepare_account_deletion(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.mark_account_deletion_result(uuid, uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.cleanup_operational_records(boolean, integer) from public, anon, authenticated;
revoke all on function public.run_furvise_integrity_diagnostics() from public, anon, authenticated;
revoke all on function public.furvise_readiness_snapshot() from public, anon, authenticated;
grant execute on function public.prepare_account_deletion(uuid, uuid, text) to service_role;
grant execute on function public.mark_account_deletion_result(uuid, uuid, boolean, text) to service_role;
grant execute on function public.cleanup_operational_records(boolean, integer) to service_role;
grant execute on function public.run_furvise_integrity_diagnostics() to service_role;
grant execute on function public.furvise_readiness_snapshot() to service_role;

commit;
