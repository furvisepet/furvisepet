-- Prefer a unique exact semantic topic over normalization-only candidates.
-- A lower-ranked candidate is retired only when it is demonstrably a duplicate
-- of the selected episode: same tenant, pet, domain, compact topic,
-- opening timestamp and text, semantic source, and no linked concern.
do $$
begin
  if to_regprocedure('public.persist_furvise_semantic_event_exact_20260807(uuid,uuid,uuid,jsonb)') is null then
    raise exception using errcode = '42883', message = 'SEMANTIC_EVENT_BASE_FUNCTION_MISSING';
  end if;
end;
$$;

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
  v_requested_topic text := regexp_replace(lower(btrim(coalesce(p_event->>'topic', ''))), '[^a-z0-9]+', '_', 'g');
  v_topic text := v_requested_topic;
  v_transition text := p_event->>'transition';
  v_candidate record;
  v_candidate_id uuid;
  v_candidate_topic text;
  v_candidate_started_at timestamptz;
  v_top_rank integer := 0;
  v_top_count integer := 0;
  v_orphan_episode_ids uuid[] := '{}'::uuid[];
  v_orphan_keys text[] := '{}'::text[];
  v_cleanup_key text;
  v_title text := regexp_replace(btrim(coalesce(p_event->>'eventTitle', '')), '[[:cntrl:]]+', ' ', 'g');
  v_subject_label text;
  v_result record;
  v_overall text;
  v_state_json jsonb;
begin
  if auth.uid() is null or p_user_id is null or auth.uid() is distinct from p_user_id then
    raise exception using errcode = '42501', message = 'SEMANTIC_EVENT_FORBIDDEN';
  end if;

  -- The exact RPC remains authoritative for source ownership, evidence,
  -- confidence, subject, transition, chronology, idempotency, and persistence.
  if v_transition in ('continued','improved','worsened','resolved') then
    for v_candidate in
      select episode_row.id, episode_row.normalized_key, episode_row.started_at,
        candidate_topic.topic,
        case
          when regexp_replace(lower(candidate_topic.topic), '[^a-z0-9]+', '_', 'g') = v_requested_topic
            or episode_row.normalized_key = left(v_domain || '_' || v_requested_topic, 120)
          then 2 else 1
        end as match_rank
      from public.pet_care_episodes as episode_row
      cross join lateral (
        select coalesce(nullif(episode_row.summary->>'semanticTopic', ''),
          case when left(episode_row.normalized_key, length(v_domain) + 1) = v_domain || '_'
            then substring(episode_row.normalized_key from length(v_domain) + 2)
            else episode_row.normalized_key end) as topic
      ) as candidate_topic
      where episode_row.user_id = p_user_id
        and episode_row.pet_profile_id = p_pet_id
        and episode_row.status in ('active','monitoring')
        and coalesce(nullif(episode_row.summary->>'semanticDomain', ''),
          case when left(episode_row.normalized_key, length(v_domain) + 1) = v_domain || '_' then v_domain end) = v_domain
        and regexp_replace(lower(candidate_topic.topic), '[^a-z0-9]+', '', 'g')
          = regexp_replace(v_requested_topic, '[^a-z0-9]+', '', 'g')
      order by match_rank desc, episode_row.last_event_at desc, episode_row.id
      for update of episode_row
    loop
      if v_candidate.match_rank > v_top_rank then
        v_top_rank := v_candidate.match_rank;
        v_top_count := 1;
        v_candidate_id := v_candidate.id;
        v_candidate_topic := v_candidate.topic;
        v_candidate_started_at := v_candidate.started_at;
      elsif v_candidate.match_rank = v_top_rank then
        v_top_count := v_top_count + 1;
      end if;
    end loop;

    if v_top_count > 1 then
      raise exception using errcode = '22023', message = 'SEMANTIC_EVENT_EPISODE_AMBIGUOUS';
    elsif v_top_count = 1 then
      v_topic := regexp_replace(lower(btrim(v_candidate_topic)), '[^a-z0-9]+', '_', 'g');
    end if;

    if v_transition = 'resolved' and v_top_rank = 2 then
      select coalesce(array_agg(episode_row.id order by episode_row.id), '{}'::uuid[]),
        coalesce(array_agg(episode_row.normalized_key order by episode_row.id), '{}'::text[])
        into v_orphan_episode_ids, v_orphan_keys
      from public.pet_care_episodes as episode_row
      cross join lateral (
        select coalesce(nullif(episode_row.summary->>'semanticTopic', ''),
          case when left(episode_row.normalized_key, length(v_domain) + 1) = v_domain || '_'
            then substring(episode_row.normalized_key from length(v_domain) + 2)
            else episode_row.normalized_key end) as topic
      ) as candidate_topic
      where episode_row.user_id = p_user_id
        and episode_row.pet_profile_id = p_pet_id
        and episode_row.id <> v_candidate_id
        and episode_row.status in ('active','monitoring')
        and episode_row.source_type = 'semantic_event'
        and episode_row.linked_concern_id is null
        and episode_row.started_at = v_candidate_started_at
        and coalesce(nullif(episode_row.summary->>'semanticDomain', ''),
          case when left(episode_row.normalized_key, length(v_domain) + 1) = v_domain || '_' then v_domain end) = v_domain
        and regexp_replace(lower(candidate_topic.topic), '[^a-z0-9]+', '', 'g')
          = regexp_replace(v_requested_topic, '[^a-z0-9]+', '', 'g')
        and regexp_replace(lower(candidate_topic.topic), '[^a-z0-9]+', '_', 'g') <> v_requested_topic
        and exists (
          select 1
          from public.pet_care_entries as duplicate_entry
          join public.pet_care_entries as selected_entry
            on selected_entry.user_id = duplicate_entry.user_id
            and selected_entry.pet_profile_id = duplicate_entry.pet_profile_id
            and selected_entry.episode_id = v_candidate_id
            and selected_entry.occurred_at = duplicate_entry.occurred_at
            and lower(btrim(selected_entry.note)) = lower(btrim(duplicate_entry.note))
            and selected_entry.care_event_metadata->>'semanticTransition' = 'started'
          where duplicate_entry.user_id = p_user_id
            and duplicate_entry.pet_profile_id = p_pet_id
            and duplicate_entry.episode_id = episode_row.id
            and duplicate_entry.care_event_metadata->>'semanticTransition' = 'started'
        );

      update public.pet_care_episodes as episode_row
      set status = 'superseded', updated_at = now(),
        summary = jsonb_set(episode_row.summary, '{latestStatus}', '"superseded"'::jsonb)
          || jsonb_build_object('reconciledIntoEpisodeId', v_candidate_id)
      where episode_row.user_id = p_user_id
        and episode_row.pet_profile_id = p_pet_id
        and episode_row.id = any(v_orphan_episode_ids);
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
    select state_row.state
      into v_state_json
    from public.pet_current_state as state_row
    where state_row.user_id = p_user_id and state_row.pet_profile_id = p_pet_id
    for update;
    v_state_json := coalesce(v_state_json, '{}'::jsonb)
      #- array['semanticStates', v_domain || '_' || v_topic];
    foreach v_cleanup_key in array v_orphan_keys loop
      v_state_json := v_state_json #- array['semanticStates', v_cleanup_key];
    end loop;

    select case
      when v_state_json#>>'{breathing,status}' = 'abnormal' or exists (
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
          v_state_json, '{wellbeing,overall}', to_jsonb(coalesce(v_overall, 'normal')), true
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

revoke all on function public.persist_furvise_semantic_event_exact_20260807(uuid, uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.persist_furvise_semantic_event(uuid, uuid, uuid, jsonb)
  from public, anon, service_role;
grant execute on function public.persist_furvise_semantic_event(uuid, uuid, uuid, jsonb)
  to authenticated;
