begin;

create or replace function public.run_furvise_integrity_diagnostics()
returns table(issue_code text, severity text, issue_count bigint)
language sql security definer set search_path = '' as $$
  select 'pets_without_auth_owner', 'critical', count(*) from public.dog_profiles p where not exists (select 1 from auth.users u where u.id = p.user_id)
  union all select 'care_without_pet', 'critical', count(*) from public.pet_care_entries e where not exists (select 1 from public.dog_profiles p where p.id = e.pet_profile_id)
  union all select 'state_without_pet', 'critical', count(*) from public.pet_current_state s where not exists (select 1 from public.dog_profiles p where p.id = s.pet_profile_id)
  union all select 'episode_without_pet', 'critical', count(*) from public.pet_care_episodes e where not exists (select 1 from public.dog_profiles p where p.id = e.pet_profile_id)
  union all select 'invalid_memory_supersession', 'high', count(*) from public.furvise_memories m where m.superseded_by is not null and not exists (select 1 from public.furvise_memories n where n.id = m.superseded_by and n.user_id = m.user_id)
  union all select 'duplicate_active_memory', 'high', count(*) from (select user_id, subject_type, pet_id, fact_key from public.furvise_memories where status = 'active' group by user_id, subject_type, pet_id, fact_key having count(*) > 1) d
  union all select 'duplicate_active_medication_state', 'high', count(*) from (select user_id, pet_profile_id, normalized_key from public.pet_care_episodes where episode_type = 'medication_course' and status = 'active' group by user_id, pet_profile_id, normalized_key having count(*) > 1) d
  union all select 'stale_ai_credit_reservation', 'high', count(*) from public.ai_usage_events where status = 'reserved' and created_at < now() - interval '30 minutes'
  union all select 'stale_idempotency_processing', 'high', count(*) from public.idempotency_operations where status = 'processing' and lease_expires_at < now()
  union all select 'completed_idempotency_without_response', 'high', count(*) from public.idempotency_operations where status = 'completed' and response_status is null
  union all select 'provider_usage_reconciliation_required', 'critical', count(*) from public.idempotency_operations where error_code in ('POST_PROVIDER_RECONCILIATION', 'POST_MUTATION_RECONCILIATION')
  union all select 'account_deletion_reconciliation', 'critical', count(*) from public.account_deletion_requests where status = 'auth_delete_failed'
  union all select 'duplicate_application_profile', 'critical', count(*) from (select user_id from public.user_profiles group by user_id having count(*) > 1) d
  union all select 'migration_version_mismatch', 'critical', case when coalesce((select max(version)::text from supabase_migrations.schema_migrations), '') = '20260730032000' then 0 else 1 end;
$$;

revoke all on function public.run_furvise_integrity_diagnostics() from public, anon, authenticated;
grant execute on function public.run_furvise_integrity_diagnostics() to service_role;

commit;
