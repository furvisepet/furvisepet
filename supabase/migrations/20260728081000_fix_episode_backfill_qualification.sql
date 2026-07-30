create or replace function public.backfill_pet_care_episodes(p_pet_id uuid default null, p_dry_run boolean default true)
returns table(pet_id uuid, concern_id uuid, episode_sequence integer, event_count integer, action text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare candidate record; v_episode_id uuid; v_prior_id uuid; v_created boolean;
begin
  if auth.role() <> 'service_role' and current_user not in ('postgres', 'supabase_admin') then
    raise exception using errcode = '42501', message = 'EPISODE_BACKFILL_FORBIDDEN';
  end if;
  for candidate in
    select entries.user_id, entries.pet_profile_id, entries.concern_id,
      (entries.care_event_metadata->>'episodeSequence')::integer as sequence_number,
      min(entries.occurred_at) as started_at, max(entries.occurred_at) as last_event_at,
      count(*)::integer as event_count, bool_or(entries.state_action_type = 'resolve_concern') as is_resolved,
      max(concern_row.normalized_key) as normalized_key
    from public.pet_care_entries as entries join public.pet_concerns as concern_row on concern_row.id = entries.concern_id
    where entries.concern_id is not null and entries.care_event_metadata ? 'episodeSequence'
      and (p_pet_id is null or entries.pet_profile_id = p_pet_id)
    group by entries.user_id, entries.pet_profile_id, entries.concern_id, (entries.care_event_metadata->>'episodeSequence')::integer
    order by entries.pet_profile_id, (entries.care_event_metadata->>'episodeSequence')::integer
  loop
    v_created := false; v_prior_id := null;
    select episode_row.id into v_episode_id from public.pet_care_episodes as episode_row
    where episode_row.user_id = candidate.user_id and episode_row.pet_profile_id = candidate.pet_profile_id
      and episode_row.normalized_key = candidate.normalized_key and episode_row.sequence_number = candidate.sequence_number;
    if v_episode_id is null and not p_dry_run then
      select episode_row.id into v_prior_id from public.pet_care_episodes as episode_row
      where episode_row.user_id = candidate.user_id and episode_row.pet_profile_id = candidate.pet_profile_id
        and episode_row.normalized_key = candidate.normalized_key and episode_row.sequence_number < candidate.sequence_number
      order by episode_row.sequence_number desc limit 1;
      insert into public.pet_care_episodes(user_id, pet_profile_id, episode_type, normalized_key, title, status, severity,
        sequence_number, recurrence_of, linked_concern_id, started_at, last_event_at, resolved_at, summary, source_type)
      values(candidate.user_id, candidate.pet_profile_id, 'symptom', candidate.normalized_key, initcap(replace(candidate.normalized_key, '_', ' ')),
        case when candidate.is_resolved then 'resolved' else 'active' end, 'urgent', candidate.sequence_number, v_prior_id,
        candidate.concern_id, candidate.started_at, candidate.last_event_at, case when candidate.is_resolved then candidate.last_event_at end,
        jsonb_build_object('eventCount', candidate.event_count, 'latestStatus', case when candidate.is_resolved then 'resolved' else 'active' end), 'compatibility_backfill')
      returning id into v_episode_id;
      v_created := true;
      update public.pet_care_entries as entry_row set episode_id = v_episode_id
      where entry_row.concern_id = candidate.concern_id
        and entry_row.care_event_metadata->>'episodeSequence' = candidate.sequence_number::text and entry_row.episode_id is null;
    end if;
    pet_id := candidate.pet_profile_id; concern_id := candidate.concern_id; episode_sequence := candidate.sequence_number;
    event_count := candidate.event_count; action := case when v_created then 'assigned' when v_episode_id is not null then 'already_assigned' when p_dry_run then 'would_assign' else 'ambiguous' end;
    return next;
  end loop;
end;
$$;
revoke all on function public.backfill_pet_care_episodes(uuid, boolean) from public, anon, authenticated;
grant execute on function public.backfill_pet_care_episodes(uuid, boolean) to service_role;
