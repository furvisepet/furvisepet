alter table public.ask_conversation_messages
  add column if not exists intelligence_validation jsonb,
  add column if not exists persistence_governance jsonb;

create index if not exists ask_messages_validation_failures_idx on public.ask_conversation_messages(user_id, created_at desc)
  where intelligence_validation is not null;

create or replace function public.diagnose_furvise_integrity(p_pet_id uuid default null)
returns table(issue_type text, pet_id uuid, record_id uuid, detail jsonb)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.role() <> 'service_role' and current_user not in ('postgres', 'supabase_admin') then
    raise exception using errcode = '42501', message = 'INTEGRITY_DIAGNOSTIC_FORBIDDEN';
  end if;
  return query
  select 'expected_event_without_episode', entry_row.pet_profile_id, entry_row.id,
    jsonb_build_object('action', entry_row.state_action_type, 'category', entry_row.category)
  from public.pet_care_entries as entry_row
  where entry_row.episode_id is null and entry_row.state_action_type is not null
    and entry_row.category in ('symptom','medication','food','behavior','vet_visit')
    and (p_pet_id is null or entry_row.pet_profile_id = p_pet_id)
  union all
  select 'resolved_episode_with_active_concern', episode_row.pet_profile_id, episode_row.id,
    jsonb_build_object('concernId', concern_row.id, 'concernStatus', concern_row.status)
  from public.pet_care_episodes as episode_row join public.pet_concerns as concern_row on concern_row.id = episode_row.linked_concern_id
  where episode_row.status = 'resolved' and concern_row.status in ('active','reopened')
    and (p_pet_id is null or episode_row.pet_profile_id = p_pet_id)
  union all
  select 'duplicate_source_message_event', (array_agg(entry_row.pet_profile_id))[1], (array_agg(entry_row.id))[1],
    jsonb_build_object('sourceMessageId', entry_row.intelligence_source_message_id, 'count', count(*))
  from public.pet_care_entries as entry_row where entry_row.intelligence_source_message_id is not null
    and (p_pet_id is null or entry_row.pet_profile_id = p_pet_id)
  group by entry_row.user_id, entry_row.intelligence_source_message_id having count(*) > 1
  union all
  select 'stale_active_suggestion', suggestion_row.pet_profile_id, suggestion_row.id,
    jsonb_build_object('createdAt', suggestion_row.created_at)
  from public.ai_update_suggestions as suggestion_row
  where suggestion_row.status = 'pending' and suggestion_row.created_at < now() - interval '7 days'
    and (p_pet_id is null or suggestion_row.pet_profile_id = p_pet_id)
  union all
  select 'expired_memory_still_active', memory_row.pet_id, memory_row.id,
    jsonb_build_object('expiresAt', memory_row.expires_at, 'factKey', memory_row.fact_key)
  from public.furvise_memories as memory_row
  where memory_row.status = 'active' and memory_row.expires_at is not null and memory_row.expires_at <= now()
    and (p_pet_id is null or memory_row.pet_id = p_pet_id);
end;
$$;
revoke all on function public.diagnose_furvise_integrity(uuid) from public, anon, authenticated;
grant execute on function public.diagnose_furvise_integrity(uuid) to service_role;
