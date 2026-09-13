-- Generic, concern-independent semantic event persistence for authenticated Ask turns.
-- Existing concern persistence remains unchanged.
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
  v_auth_user_id uuid := auth.uid();
  v_source_text text;
  v_source_created_at timestamptz;
  v_occurred_at timestamptz;
  v_subject_type text := p_event#>>'{subject,type}';
  v_domain text := p_event->>'domain';
  v_topic text := regexp_replace(lower(btrim(coalesce(p_event->>'topic', ''))), '[^a-z0-9]+', '_', 'g');
  v_transition text := p_event->>'transition';
  v_state text := p_event->>'state';
  v_importance text := p_event->>'importance';
  v_confidence numeric;
  v_excerpt text := btrim(coalesce(p_event->>'sourceExcerpt', ''));
  v_key text;
  v_category text;
  v_episode_type text;
  v_entry_id uuid;
  v_existing_episode_id uuid;
  v_linked_concern_id uuid;
  v_episode public.pet_care_episodes%rowtype;
  v_compatible_count integer := 0;
  v_sequence integer;
  v_episode_status text;
  v_title text;
  v_current_state public.pet_current_state%rowtype;
  v_state_json jsonb;
  v_active_ids uuid[];
  v_monitoring_ids uuid[];
  v_overall_state text;
begin
  if v_auth_user_id is null or p_user_id is null or v_auth_user_id is distinct from p_user_id then
    raise exception using errcode = '42501', message = 'SEMANTIC_EVENT_FORBIDDEN';
  end if;
  if p_pet_id is null or p_source_message_id is null or p_event is null or jsonb_typeof(p_event) <> 'object' then
    raise exception using errcode = '22023', message = 'SEMANTIC_EVENT_INVALID';
  end if;
  if not (p_event ?& array['subject','domain','topic','transition','state','temporal','importance','confidence','sourceExcerpt']) then
    raise exception using errcode = '22023', message = 'SEMANTIC_EVENT_INVALID';
  end if;
  if jsonb_typeof(p_event->'subject') <> 'object' or jsonb_typeof(p_event->'temporal') <> 'object' then
    raise exception using errcode = '22023', message = 'SEMANTIC_EVENT_INVALID';
  end if;
  if jsonb_typeof(p_event->'domain') <> 'string' or jsonb_typeof(p_event->'topic') <> 'string'
    or jsonb_typeof(p_event->'transition') <> 'string' or jsonb_typeof(p_event->'state') <> 'string'
    or jsonb_typeof(p_event->'importance') <> 'string' or jsonb_typeof(p_event->'confidence') <> 'number'
    or jsonb_typeof(p_event->'sourceExcerpt') <> 'string'
    or coalesce(jsonb_typeof(p_event#>'{subject,name}'), 'null') not in ('string','null')
    or coalesce(jsonb_typeof(p_event#>'{temporal,occurredAt}'), 'null') not in ('string','null')
    or coalesce(jsonb_typeof(p_event#>'{temporal,explicitTime}'), 'null') not in ('string','null')
  then
    raise exception using errcode = '22023', message = 'SEMANTIC_EVENT_INVALID';
  end if;
  if p_event ? 'references' or coalesce(p_event->'subject', '{}'::jsonb) ? 'id' then
    raise exception using errcode = '22023', message = 'SEMANTIC_EVENT_MODEL_REFERENCE_FORBIDDEN';
  end if;
  if exists (select 1 from jsonb_object_keys(p_event) as key_name where key_name not in
      ('subject','domain','topic','transition','state','temporal','importance','confidence','sourceExcerpt'))
    or exists (select 1 from jsonb_object_keys(coalesce(p_event->'subject', '{}'::jsonb)) as key_name where key_name not in ('type','name'))
    or exists (select 1 from jsonb_object_keys(coalesce(p_event->'temporal', '{}'::jsonb)) as key_name where key_name not in ('occurredAt','explicitTime'))
  then
    raise exception using errcode = '22023', message = 'SEMANTIC_EVENT_UNSUPPORTED_FIELD';
  end if;
  if not exists (
    select 1 from public.dog_profiles as pet_row
    where pet_row.id = p_pet_id and pet_row.user_id = p_user_id
  ) then
    raise exception using errcode = '42501', message = 'SEMANTIC_EVENT_PET_NOT_OWNED';
  end if;
  select message_row.user_text, message_row.created_at
    into v_source_text, v_source_created_at
  from public.ask_conversation_messages as message_row
  join public.ask_conversations as conversation_row on conversation_row.id = message_row.conversation_id
  where message_row.id = p_source_message_id
    and message_row.user_id = p_user_id
    and message_row.role = 'user'
    and conversation_row.user_id = p_user_id
    and conversation_row.pet_profile_id = p_pet_id;
  if v_source_created_at is null then
    raise exception using errcode = '42501', message = 'SEMANTIC_EVENT_SOURCE_NOT_OWNED';
  end if;
  v_occurred_at := v_source_created_at;
  if nullif(btrim(coalesce(p_event#>>'{temporal,occurredAt}', '')), '') is not null then
    begin v_occurred_at := (p_event#>>'{temporal,occurredAt}')::timestamptz;
    exception when others then raise exception using errcode = '22023', message = 'SEMANTIC_EVENT_TIME_INVALID'; end;
    if v_occurred_at > v_source_created_at + interval '5 minutes' or v_occurred_at < v_source_created_at - interval '10 years' then
      raise exception using errcode = '22023', message = 'SEMANTIC_EVENT_TIME_INVALID';
    end if;
  end if;

  begin v_confidence := (p_event->>'confidence')::numeric;
  exception when others then raise exception using errcode = '22023', message = 'SEMANTIC_EVENT_INVALID_CONFIDENCE'; end;
  if v_confidence = 'NaN'::numeric or v_confidence < 0 or v_confidence > 1
    or length(coalesce(p_event#>>'{subject,name}', '')) > 120
    or length(coalesce(p_event#>>'{temporal,explicitTime}', '')) > 120
    or v_subject_type <> 'pet'
    or v_domain not in ('health','behavior','nutrition','medication','safety','routine','preference','profile','shopping','care','other')
    or v_transition not in ('observed','started','continued','changed','improved','worsened','resolved','corrected','confirmed','preference_set')
    or v_state not in ('active','monitoring','resolved','historical','unknown')
    or v_importance not in ('routine','important','urgent')
    or v_topic !~ '^[a-z0-9][a-z0-9_]{1,99}$'
    or length(v_excerpt) < 1 or length(v_excerpt) > 240
    or position(lower(v_excerpt) in lower(coalesce(v_source_text, ''))) = 0
  then
    raise exception using errcode = '22023', message = 'SEMANTIC_EVENT_INVALID';
  end if;
  if v_confidence < (case when v_transition in ('resolved','corrected') then 0.95 when v_state in ('active','resolved') then 0.90 else 0.85 end) then
    raise exception using errcode = '22023', message = 'SEMANTIC_EVENT_LOW_CONFIDENCE';
  end if;
  if (v_transition = 'resolved' and v_state <> 'resolved')
    or (v_state = 'resolved' and v_transition <> 'resolved')
    or (v_transition in ('started','continued','worsened') and v_state = 'resolved')
    or (v_transition = 'preference_set' and v_domain not in ('preference','shopping'))
  then
    raise exception using errcode = '22023', message = 'SEMANTIC_EVENT_TRANSITION_INVALID';
  end if;

  v_key := left(v_domain || '_' || v_topic, 120);
  v_category := case v_domain
    when 'health' then 'symptom' when 'nutrition' then 'food' when 'medication' then 'medication'
    when 'behavior' then 'behavior' when 'care' then 'general' else 'general' end;
  v_episode_type := case v_domain
    when 'health' then 'symptom' when 'nutrition' then 'food_transition' when 'medication' then 'medication_course'
    when 'behavior' then 'behavior_change' else 'care_tracking' end;
  v_title := left(case
    when v_domain = 'medication' and v_transition = 'started' then 'Started ' || initcap(replace(v_topic, '_', ' '))
    when v_domain = 'medication' and v_transition = 'resolved' then 'Stopped ' || initcap(replace(v_topic, '_', ' '))
    else initcap(replace(v_topic, '_', ' ')) end, 120);

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_pet_id::text || ':semantic-source:' || p_source_message_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_pet_id::text || ':semantic-topic:' || v_key, 0));

  select entry_row.id, entry_row.episode_id into v_entry_id, v_existing_episode_id
  from public.pet_care_entries as entry_row
  where entry_row.user_id = p_user_id
    and entry_row.pet_profile_id = p_pet_id
    and entry_row.intelligence_source_message_id = p_source_message_id
  limit 1 for update;
  if v_entry_id is not null then
    return query select 'persisted'::text, v_entry_id, v_existing_episode_id, v_key, v_state, true;
    return;
  end if;

  select count(*) into v_compatible_count
  from public.pet_care_episodes as episode_row
  where episode_row.user_id = p_user_id and episode_row.pet_profile_id = p_pet_id
    and episode_row.normalized_key = v_key and episode_row.status in ('active','monitoring');
  if v_compatible_count > 1 then
    raise exception using errcode = '22023', message = 'SEMANTIC_EVENT_EPISODE_AMBIGUOUS';
  end if;
  if v_compatible_count = 1 then
    select episode_row.* into v_episode
    from public.pet_care_episodes as episode_row
    where episode_row.user_id = p_user_id and episode_row.pet_profile_id = p_pet_id
      and episode_row.normalized_key = v_key and episode_row.status in ('active','monitoring')
    order by episode_row.last_event_at desc limit 1 for update;
  end if;
  if v_transition in ('continued','improved','worsened','resolved') and v_episode.id is null then
    raise exception using errcode = '22023', message = 'SEMANTIC_EVENT_ACTIVE_EPISODE_REQUIRED';
  end if;
  if v_episode.id is not null and v_occurred_at < v_episode.started_at then
    raise exception using errcode = '22023', message = 'SEMANTIC_EVENT_CHRONOLOGY_INVALID';
  end if;
  if v_transition = 'started' and v_episode.id is not null then
    raise exception using errcode = '22023', message = 'SEMANTIC_EVENT_ALREADY_ACTIVE';
  end if;

  v_entry_id := gen_random_uuid();
  v_episode_status := case when v_state = 'resolved' then 'resolved' when v_state = 'monitoring' then 'monitoring' else 'active' end;
  if v_state in ('active','monitoring','resolved') then
    if v_episode.id is null then
      select coalesce(max(episode_row.sequence_number), 0) + 1 into v_sequence
      from public.pet_care_episodes as episode_row
      where episode_row.user_id = p_user_id and episode_row.pet_profile_id = p_pet_id and episode_row.normalized_key = v_key;
      insert into public.pet_care_episodes(
        user_id, pet_profile_id, episode_type, normalized_key, title, status, severity, sequence_number,
        started_at, last_event_at, resolved_at, summary, source_type
      ) values (
        p_user_id, p_pet_id, v_episode_type, v_key, v_title, v_episode_status, v_importance, v_sequence,
        v_occurred_at, v_occurred_at, case when v_episode_status = 'resolved' then v_occurred_at end,
        jsonb_build_object('eventCount', 1, 'latestStatus', v_episode_status, 'semanticDomain', v_domain,
          'semanticTopic', v_topic, 'sourceRecordIds', jsonb_build_array(v_entry_id)), 'semantic_event'
      ) returning * into v_episode;
    else
      update public.pet_care_episodes as episode_row set
        status = v_episode_status,
        severity = case when v_importance = 'urgent' then 'urgent' when v_importance = 'important' and episode_row.severity = 'routine' then 'important' else episode_row.severity end,
        last_event_at = greatest(episode_row.last_event_at, v_occurred_at),
        resolved_at = case when v_episode_status = 'resolved' then v_occurred_at else null end,
        updated_at = now(),
        summary = jsonb_set(jsonb_set(episode_row.summary, '{eventCount}', to_jsonb(coalesce((episode_row.summary->>'eventCount')::integer, 0) + 1)),
          '{latestStatus}', to_jsonb(v_episode_status)) || jsonb_build_object('semanticDomain', v_domain, 'semanticTopic', v_topic,
          'sourceRecordIds', coalesce(episode_row.summary->'sourceRecordIds', '[]'::jsonb) || jsonb_build_array(v_entry_id))
      where episode_row.id = v_episode.id and episode_row.user_id = p_user_id and episode_row.pet_profile_id = p_pet_id
      returning * into v_episode;
    end if;
  end if;
  v_linked_concern_id := v_episode.linked_concern_id;

  insert into public.pet_care_entries(
    id, user_id, pet_profile_id, category, title, note, occurred_at, severity, concern_id,
    intelligence_source_message_id, intelligence_source_type, intelligence_confidence,
    state_action_type, care_event_metadata, episode_id
  ) values (
    v_entry_id, p_user_id, p_pet_id, v_category, v_title, v_excerpt, v_occurred_at,
    case when v_importance = 'urgent' then 'severe' when v_importance = 'important' then 'moderate' else null end,
    v_linked_concern_id, p_source_message_id, 'ask_semantic_event', v_confidence,
    case when v_transition = 'resolved' then 'resolve_concern' else 'semantic_' || v_transition end,
    jsonb_build_object('semanticDomain', v_domain, 'semanticTopic', v_topic, 'semanticTransition', v_transition,
      'semanticState', v_state, 'importance', v_importance, 'explicitTime', p_event#>>'{temporal,explicitTime}', 'source', 'ask_furvise'),
    v_episode.id
  );

  if v_transition = 'resolved' and v_linked_concern_id is not null then
    update public.pet_concerns as concern_row set
      status = 'resolved', resolved_at = v_occurred_at, resolution_note = v_excerpt,
      active_episode_id = null, updated_at = now()
    where concern_row.id = v_linked_concern_id
      and concern_row.user_id = p_user_id and concern_row.pet_profile_id = p_pet_id
      and concern_row.status in ('active','reopened');
  elsif v_episode.id is not null then
    select concern_row.id into v_linked_concern_id
    from public.pet_concerns as concern_row
    where concern_row.user_id = p_user_id and concern_row.pet_profile_id = p_pet_id
      and concern_row.source_care_entry_id = v_entry_id
    order by concern_row.updated_at desc limit 1 for update;
    if v_linked_concern_id is not null then
      update public.pet_care_episodes as episode_row set linked_concern_id = v_linked_concern_id, updated_at = now()
      where episode_row.id = v_episode.id and episode_row.user_id = p_user_id and episode_row.pet_profile_id = p_pet_id;
      update public.pet_concerns as concern_row set active_episode_id = v_episode.id, updated_at = now()
      where concern_row.id = v_linked_concern_id and concern_row.user_id = p_user_id and concern_row.pet_profile_id = p_pet_id;
      update public.pet_care_entries as entry_row set concern_id = v_linked_concern_id
      where entry_row.id = v_entry_id and entry_row.user_id = p_user_id and entry_row.pet_profile_id = p_pet_id;
    end if;
  end if;

  select * into v_current_state from public.pet_current_state
  where pet_profile_id = p_pet_id and user_id = p_user_id for update;
  v_state_json := coalesce(v_current_state.state, '{}'::jsonb);
  if v_state in ('active','monitoring','resolved') then
    v_state_json := jsonb_set(v_state_json, '{semanticStates}', coalesce(v_state_json->'semanticStates', '{}'::jsonb), true);
    v_state_json := jsonb_set(v_state_json, array['semanticStates', v_key], jsonb_build_object(
      'domain', v_domain, 'topic', v_topic, 'status', v_state, 'transition', v_transition,
      'importance', v_importance, 'confidence', v_confidence, 'lastObservedAt', v_occurred_at,
      'sourceEventId', v_entry_id, 'episodeId', v_episode.id
    ), true);
  end if;
  select coalesce(array_agg(episode_row.id order by episode_row.last_event_at), '{}') into v_active_ids
  from public.pet_care_episodes as episode_row where episode_row.user_id = p_user_id and episode_row.pet_profile_id = p_pet_id and episode_row.status = 'active';
  select coalesce(array_agg(episode_row.id order by episode_row.last_event_at), '{}') into v_monitoring_ids
  from public.pet_care_episodes as episode_row where episode_row.user_id = p_user_id and episode_row.pet_profile_id = p_pet_id and episode_row.status = 'monitoring';
  v_overall_state := case
    when v_state_json#>>'{breathing,status}' = 'abnormal' or exists (
      select 1 from public.pet_care_episodes as episode_row
      where episode_row.user_id = p_user_id and episode_row.pet_profile_id = p_pet_id
        and episode_row.status = 'active' and (episode_row.severity = 'urgent' or episode_row.episode_type = 'symptom')
    ) then 'urgent'
    when cardinality(v_active_ids) > 0 or cardinality(v_monitoring_ids) > 0 or v_state = 'resolved' then 'monitoring'
    else 'normal' end;
  v_state_json := jsonb_set(v_state_json, '{wellbeing}', coalesce(v_state_json->'wellbeing', '{}'::jsonb), true);
  v_state_json := jsonb_set(v_state_json, '{wellbeing,overall}', to_jsonb(v_overall_state), true);
  insert into public.pet_current_state(
    pet_profile_id, user_id, state_version, state, active_episode_ids, monitoring_episode_ids, source_event_ids, computed_at, updated_at
  ) values (
    p_pet_id, p_user_id, 1, v_state_json, v_active_ids, v_monitoring_ids, array[v_entry_id], now(), now()
  ) on conflict (pet_profile_id) do update set
    state_version = public.pet_current_state.state_version + 1,
    state = excluded.state,
    active_episode_ids = excluded.active_episode_ids,
    monitoring_episode_ids = excluded.monitoring_episode_ids,
    source_event_ids = case when v_entry_id = any(public.pet_current_state.source_event_ids) then public.pet_current_state.source_event_ids else public.pet_current_state.source_event_ids || v_entry_id end,
    computed_at = now(), updated_at = now();

  return query select 'persisted'::text, v_entry_id, v_episode.id, v_key, v_state, false;
end;
$$;

revoke all on function public.persist_furvise_semantic_event(uuid, uuid, uuid, jsonb) from public, anon, service_role;
grant execute on function public.persist_furvise_semantic_event(uuid, uuid, uuid, jsonb) to authenticated;
