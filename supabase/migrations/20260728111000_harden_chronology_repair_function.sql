alter function public.repair_furvise_recovery_events(boolean) rename to repair_furvise_recovery_events_legacy;

create or replace function public.repair_furvise_recovery_events(p_apply boolean default false)
returns table(source_message_id uuid, pet_id uuid, concern_id uuid, action text)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.role() <> 'service_role' and current_user not in ('postgres', 'supabase_admin') then
    raise exception using errcode = '42501', message = 'REPAIR_FORBIDDEN';
  end if;
  return query select * from public.repair_furvise_recovery_events_legacy(p_apply);
  if p_apply then
    update public.pet_concerns as concern_row
    set reopened_at = recurrence_entry.occurred_at, opened_at = recurrence_entry.occurred_at, updated_at = now()
    from public.pet_care_entries as recurrence_entry
    where recurrence_entry.id = concern_row.source_care_entry_id
      and recurrence_entry.state_action_type = 'reopen_concern'
      and recurrence_entry.care_event_metadata->>'repair' = 'true'
      and concern_row.reopened_at is distinct from recurrence_entry.occurred_at;

    with explicit_recoveries as (
      select user_message.user_id, user_message.request_id, concern_row.id as concern_id,
        1 + (select count(*)::integer from public.pet_care_entries as recurrence_entry
          where recurrence_entry.user_id = user_message.user_id
            and recurrence_entry.pet_profile_id = conversation_row.pet_profile_id
            and recurrence_entry.occurred_at <= user_message.created_at
            and recurrence_entry.state_action_type = 'reopen_concern') as episode_sequence
      from public.ask_conversation_messages as user_message
      join public.ask_conversations as conversation_row on conversation_row.id = user_message.conversation_id
      join lateral (select candidate_concern.id from public.pet_concerns as candidate_concern
        where candidate_concern.user_id = user_message.user_id
          and candidate_concern.pet_profile_id = conversation_row.pet_profile_id
          and candidate_concern.normalized_key = 'breathing'
        order by candidate_concern.updated_at desc limit 1) as concern_row on true
      where user_message.role = 'user'
        and user_message.user_text ~* '(breathing (is )?normal|back (to )?normal|normal now|is good now)'
        and exists (select 1 from public.ask_conversation_messages as assistant_message
          where assistant_message.request_id = user_message.request_id and assistant_message.role = 'furvise'
            and assistant_message.response_data->>'urgency' = 'resolved')
    ), canonical_recoveries as (
      select explicit_recoveries.user_id, explicit_recoveries.request_id, explicit_recoveries.concern_id,
        recovery_entry.id as care_entry_id
      from explicit_recoveries join public.pet_care_entries as recovery_entry
        on recovery_entry.user_id = explicit_recoveries.user_id
        and recovery_entry.concern_id = explicit_recoveries.concern_id
        and recovery_entry.state_action_type = 'resolve_concern'
        and recovery_entry.care_event_metadata->>'episodeSequence' = explicit_recoveries.episode_sequence::text
    )
    update public.ask_conversation_messages as assistant_message
    set care_persistence = jsonb_build_object('status','persisted','careEntryIds',jsonb_build_array(canonical_recoveries.care_entry_id),
      'concernIds',jsonb_build_array(canonical_recoveries.concern_id),'errorCode',null)
    from canonical_recoveries
    where assistant_message.user_id = canonical_recoveries.user_id
      and assistant_message.request_id = canonical_recoveries.request_id and assistant_message.role = 'furvise';
  end if;
end;
$$;

revoke all on function public.repair_furvise_recovery_events_legacy(boolean) from public, anon, authenticated;
grant execute on function public.repair_furvise_recovery_events_legacy(boolean) to service_role;
revoke all on function public.repair_furvise_recovery_events(boolean) from public, anon, authenticated;
grant execute on function public.repair_furvise_recovery_events(boolean) to service_role;
