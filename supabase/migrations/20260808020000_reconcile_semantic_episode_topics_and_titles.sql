-- Reconcile equivalent model topic spellings without weakening episode ownership,
-- chronology, subject, transition, or confidence checks in the original RPC.
do $$
begin
  if to_regprocedure('public.persist_furvise_semantic_event_exact_20260807(uuid,uuid,uuid,jsonb)') is null then
    if to_regprocedure('public.persist_furvise_semantic_event(uuid,uuid,uuid,jsonb)') is null then
      raise exception using errcode = '42883', message = 'SEMANTIC_EVENT_BASE_FUNCTION_MISSING';
    end if;
    alter function public.persist_furvise_semantic_event(uuid, uuid, uuid, jsonb)
      rename to persist_furvise_semantic_event_exact_20260807;
  end if;
end;
$$;

revoke all on function public.persist_furvise_semantic_event_exact_20260807(uuid, uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.persist_furvise_semantic_event(
  p_user_id uuid,
  p_pet_id uuid,
  p_source_message_id uuid,
  p_event jsonb
)
returns table(
  persistence_status text,
  care_entry_id uuid,
  episode_id uuid,
  normalized_topic text,
  resulting_state text,
  already_persisted boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event jsonb := coalesce(p_event, '{}'::jsonb);
  v_domain text := lower(btrim(coalesce(p_event->>'domain', '')));
  v_topic text := regexp_replace(lower(btrim(coalesce(p_event->>'topic', ''))), '[^a-z0-9]+', '_', 'g');
  v_transition text := p_event->>'transition';
  v_candidate_count integer := 0;
  v_candidate_topic text;
  v_title text := regexp_replace(btrim(coalesce(p_event->>'eventTitle', '')), '[[:cntrl:]]+', ' ', 'g');
  v_subject_label text;
  v_result record;
  v_overall text;
begin
  if auth.uid() is null or p_user_id is null or auth.uid() is distinct from p_user_id then
    raise exception using errcode = '42501', message = 'SEMANTIC_EVENT_FORBIDDEN';
  end if;
  -- The inner RPC remains the authority for authentication, owned subject/source,
  -- evidence, confidence, transition validity, and chronology.
  if v_transition in ('continued','improved','worsened','resolved') then
    select count(*), min(candidate.topic)
      into v_candidate_count, v_candidate_topic
    from (
      select coalesce(nullif(episode_row.summary->>'semanticTopic', ''),
        case when left(episode_row.normalized_key, length(v_domain) + 1) = v_domain || '_'
          then substring(episode_row.normalized_key from length(v_domain) + 2)
          else episode_row.normalized_key end) as topic
      from public.pet_care_episodes as episode_row
      where episode_row.user_id = p_user_id
        and episode_row.pet_profile_id = p_pet_id
        and episode_row.status in ('active','monitoring')
        and coalesce(nullif(episode_row.summary->>'semanticDomain', ''),
          case when left(episode_row.normalized_key, length(v_domain) + 1) = v_domain || '_' then v_domain end) = v_domain
        and regexp_replace(lower(coalesce(nullif(episode_row.summary->>'semanticTopic', ''),
          case when left(episode_row.normalized_key, length(v_domain) + 1) = v_domain || '_'
            then substring(episode_row.normalized_key from length(v_domain) + 2)
            else episode_row.normalized_key end)), '[^a-z0-9]+', '', 'g')
          = regexp_replace(v_topic, '[^a-z0-9]+', '', 'g')
      for update
    ) as candidate;
    if v_candidate_count = 1 then
      v_topic := regexp_replace(lower(btrim(v_candidate_topic)), '[^a-z0-9]+', '_', 'g');
    elsif v_candidate_count > 1 then
      raise exception using errcode = '22023', message = 'SEMANTIC_EVENT_EPISODE_AMBIGUOUS';
    end if;
  end if;

  v_subject_label := case v_domain
    when 'health' then 'Health issue' when 'behavior' then 'Behavior issue'
    when 'nutrition' then 'Food' when 'medication' then 'Medication'
    when 'safety' then 'Safety incident' when 'routine' then 'Routine'
    when 'care' then 'Care update' when 'preference' then 'Preference'
    when 'profile' then 'Profile' when 'shopping' then 'Shopping preference'
    else 'Care update' end;
  if length(v_title) < 2 or length(v_title) > 120 or v_title ~ '_'
    or regexp_replace(lower(v_title), '[^a-z0-9]+', '', 'g') = regexp_replace(v_topic, '[^a-z0-9]+', '', 'g')
    or v_title ~* '\m(start|started)\M.*\m(start|started)\M'
    or v_title ~* '\m(stop|stopped)\M.*\m(stop|stopped)\M'
    or v_title ~* '\m(resolve|resolved)\M.*\m(resolve|resolved)\M'
    or v_title ~* '\m(change|changed)\M.*\m(change|changed)\M'
  then
    v_title := case v_transition
      when 'started' then case when v_domain = 'medication' then 'Started medication' else v_subject_label || ' started' end
      when 'changed' then v_subject_label || ' changed'
      when 'improved' then v_subject_label || ' improved'
      when 'worsened' then v_subject_label || ' worsened'
      when 'resolved' then v_subject_label || ' resolved'
      when 'corrected' then v_subject_label || ' corrected'
      else v_subject_label end;
  end if;

  v_event := (v_event - 'eventTitle') || jsonb_build_object('topic', v_topic);
  select * into v_result
  from public.persist_furvise_semantic_event_exact_20260807(
    p_user_id, p_pet_id, p_source_message_id, v_event
  );

  update public.pet_care_entries as entry_row
  set title = v_title
  where entry_row.id = v_result.care_entry_id
    and entry_row.user_id = p_user_id
    and entry_row.pet_profile_id = p_pet_id;

  if v_transition <> 'resolved' then
    update public.pet_care_episodes as episode_row
    set title = v_title, updated_at = now()
    where episode_row.id = v_result.episode_id
      and episode_row.user_id = p_user_id
      and episode_row.pet_profile_id = p_pet_id;
  else
    select case
      when state_row.state#>>'{breathing,status}' = 'abnormal' or exists (
        select 1 from public.pet_care_episodes as episode_row
        where episode_row.user_id = p_user_id and episode_row.pet_profile_id = p_pet_id
          and episode_row.status = 'active' and (episode_row.severity = 'urgent' or episode_row.episode_type = 'symptom')
      ) then 'urgent'
      when cardinality(state_row.active_episode_ids) > 0 or cardinality(state_row.monitoring_episode_ids) > 0 then 'monitoring'
      else 'normal' end
      into v_overall
    from public.pet_current_state as state_row
    where state_row.user_id = p_user_id and state_row.pet_profile_id = p_pet_id;

    update public.pet_current_state as state_row
    set state = jsonb_set(
          state_row.state #- array['semanticStates', v_domain || '_' || v_topic],
          '{wellbeing,overall}', to_jsonb(coalesce(v_overall, 'normal')), true
        ),
        state_version = state_row.state_version + 1,
        computed_at = now(), updated_at = now()
    where state_row.user_id = p_user_id and state_row.pet_profile_id = p_pet_id;
  end if;

  return query select v_result.persistence_status, v_result.care_entry_id,
    v_result.episode_id, v_result.normalized_topic, v_result.resulting_state,
    v_result.already_persisted;
end;
$$;

revoke all on function public.persist_furvise_semantic_event(uuid, uuid, uuid, jsonb)
  from public, anon, service_role;
grant execute on function public.persist_furvise_semantic_event(uuid, uuid, uuid, jsonb)
  to authenticated;

-- Repair only generated presentation labels. Chronology, notes, event IDs, and
-- semantic metadata remain unchanged and append-only.
update public.pet_care_entries as entry_row
set title = case
  when lower(btrim(entry_row.title)) = 'missingpet' then 'Missing pet incident'
  else case entry_row.care_event_metadata->>'semanticTransition'
    when 'started' then case when entry_row.care_event_metadata->>'semanticDomain' = 'medication' then 'Started medication'
      else initcap(coalesce(entry_row.care_event_metadata->>'semanticDomain', 'care')) || ' event started' end
    when 'changed' then case when entry_row.care_event_metadata->>'semanticDomain' = 'nutrition' then 'Food changed'
      else initcap(coalesce(entry_row.care_event_metadata->>'semanticDomain', 'care')) || ' event changed' end
    when 'resolved' then initcap(coalesce(entry_row.care_event_metadata->>'semanticDomain', 'care')) || ' event resolved'
    else initcap(coalesce(entry_row.care_event_metadata->>'semanticDomain', 'care')) || ' update' end end
where entry_row.intelligence_source_type = 'ask_semantic_event'
  and (
    entry_row.title ~ '_'
    or lower(btrim(entry_row.title)) = 'missingpet'
    or entry_row.title ~* '\m(start|started)\M.*\m(start|started)\M'
  );
