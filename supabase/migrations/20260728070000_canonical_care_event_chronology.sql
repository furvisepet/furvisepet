-- Canonical Ask care-event persistence. A UI confirmation is backed by a concrete care-entry id.

alter table public.ask_conversation_messages
  add column if not exists care_persistence jsonb;

alter table public.pet_care_entries
  add column if not exists intelligence_confidence numeric check (intelligence_confidence between 0 and 1),
  add column if not exists care_event_metadata jsonb not null default '{}'::jsonb;

alter table public.pet_concerns
  add column if not exists episode_sequence integer not null default 1 check (episode_sequence > 0);

create index if not exists pet_care_entries_concern_chronology_idx
  on public.pet_care_entries(user_id, pet_profile_id, concern_id, occurred_at, created_at);

create unique index if not exists pet_care_entries_concern_episode_resolution_unique
  on public.pet_care_entries(user_id, concern_id, state_action_type, (care_event_metadata->>'episodeSequence'))
  where concern_id is not null and state_action_type = 'resolve_concern'
    and care_event_metadata ? 'episodeSequence';

-- Migration 600 treated a resolved concern as equivalent to a persisted recovery event.
-- Restore only those suggestions that have no concrete linked care entry.
with stale as (
  select suggestion_row.id, row_number() over (
    partition by suggestion_row.user_id, suggestion_row.type, suggestion_row.concern_id
    order by suggestion_row.created_at, suggestion_row.id
  ) as candidate_number
  from public.ai_update_suggestions as suggestion_row
  where suggestion_row.type = 'concern_resolution' and suggestion_row.status = 'saved'
    and suggestion_row.care_entry_id is null
    and not exists (
      select 1 from public.pet_care_entries as entry_row
      where entry_row.user_id = suggestion_row.user_id and entry_row.state_suggestion_id = suggestion_row.id
    )
)
update public.ai_update_suggestions as suggestion_row
set status = case when stale.candidate_number = 1 and not exists (
      select 1 from public.ai_update_suggestions as pending_row
      where pending_row.user_id = suggestion_row.user_id and pending_row.type = suggestion_row.type
        and pending_row.concern_id is not distinct from suggestion_row.concern_id and pending_row.status = 'pending'
    ) then 'pending' else 'dismissed' end,
  actioned_at = null, applied_at = null
from stale where suggestion_row.id = stale.id;

create or replace function public.persist_furvise_care_event(
  p_user_id uuid,
  p_pet_id uuid,
  p_source_message_id uuid,
  p_care_action jsonb,
  p_suggestion_id uuid default null
)
returns table(
  persistence_status text,
  care_entry_ids uuid[],
  concern_ids uuid[],
  current_safety_state text,
  already_persisted boolean,
  error_code text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_action text := p_care_action->>'action';
  v_confidence numeric := coalesce((p_care_action->>'confidence')::numeric, 0);
  v_concern public.pet_concerns%rowtype;
  v_entry_id uuid;
  v_existing_concern_id uuid;
  v_key text;
  v_text text := coalesce(p_care_action->>'title', '') || ' ' || coalesce(p_care_action->>'details', '');
  v_title text;
  v_note text;
  v_category text;
  v_severity text;
  v_pet_name text;
  v_episode integer := 1;
  v_occurred_at timestamptz;
begin
  if v_auth_user_id is null or p_user_id is null or v_auth_user_id <> p_user_id then
    raise exception using errcode = '42501', message = 'CARE_EVENT_FORBIDDEN';
  end if;
  if p_pet_id is null or p_source_message_id is null or p_care_action is null then
    raise exception using errcode = '22023', message = 'CARE_EVENT_INVALID';
  end if;
  select pet_row.name into v_pet_name
  from public.dog_profiles as pet_row
  where pet_row.id = p_pet_id and pet_row.user_id = p_user_id;
  if v_pet_name is null then raise exception using errcode = '42501', message = 'PET_NOT_OWNED'; end if;
  select message_row.created_at into v_occurred_at
  from public.ask_conversation_messages as message_row
    join public.ask_conversations as conversation_row on conversation_row.id = message_row.conversation_id
    where message_row.id = p_source_message_id and message_row.user_id = p_user_id and message_row.role = 'user'
      and conversation_row.user_id = p_user_id and conversation_row.pet_profile_id = p_pet_id;
  if v_occurred_at is null then raise exception using errcode = '42501', message = 'SOURCE_MESSAGE_NOT_OWNED'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_pet_id::text || ':care-event', 0));

  select entry_row.id, entry_row.concern_id into v_entry_id, v_existing_concern_id
  from public.pet_care_entries as entry_row
  where entry_row.user_id = p_user_id and entry_row.pet_profile_id = p_pet_id
    and entry_row.intelligence_source_message_id = p_source_message_id
  order by entry_row.created_at desc limit 1 for update;
  if v_entry_id is not null then
    if p_suggestion_id is not null then
      update public.pet_care_entries set state_suggestion_id = coalesce(state_suggestion_id, p_suggestion_id) where id = v_entry_id;
      update public.ai_update_suggestions set status = 'saved', actioned_at = coalesce(actioned_at, now()),
        applied_at = coalesce(applied_at, now()), care_entry_id = v_entry_id
      where id = p_suggestion_id and user_id = p_user_id;
    end if;
    return query select 'persisted'::text, array[v_entry_id],
      case when v_existing_concern_id is null then array[]::uuid[] else array[v_existing_concern_id] end,
      case when exists (
        select 1 from public.pet_concerns as concern_row where concern_row.id = v_existing_concern_id
          and concern_row.status in ('active', 'reopened') and concern_row.resolved_at is null
      ) then 'urgent' else 'recently_resolved' end,
      true, null::text;
    return;
  end if;

  if v_action not in ('create_entry', 'resolve_concern', 'reopen_concern') or v_confidence < 0.90 then
    raise exception using errcode = '22023', message = 'CARE_EVENT_INVALID';
  end if;
  v_key := case when v_text ~* '(breath|breathing)' then 'breathing'
    else regexp_replace(lower(coalesce(nullif(btrim(p_care_action->>'category'), ''), 'care_concern')), '[^a-z0-9]+', '_', 'g') end;

  if coalesce(p_care_action->>'relatedRecordId', '') ~* '^[0-9a-f-]{36}$' then
    select concern_row.* into v_concern from public.pet_concerns as concern_row
    where concern_row.id = (p_care_action->>'relatedRecordId')::uuid
      and concern_row.user_id = p_user_id and concern_row.pet_profile_id = p_pet_id
    for update;
  end if;
  if v_concern.id is null and v_action in ('resolve_concern', 'reopen_concern') then
    select concern_row.* into v_concern from public.pet_concerns as concern_row
    where concern_row.user_id = p_user_id and concern_row.pet_profile_id = p_pet_id
      and concern_row.normalized_key = v_key
    order by concern_row.updated_at desc limit 1 for update;
  end if;
  if v_action = 'resolve_concern' and v_concern.id is null then
    raise exception using errcode = '22023', message = 'CARE_EVENT_CONCERN_NOT_FOUND';
  end if;

  v_episode := coalesce(v_concern.episode_sequence, 1);
  if v_action = 'reopen_concern' then v_episode := v_episode + 1; end if;
  if v_action = 'resolve_concern' then
    select entry_row.id into v_entry_id from public.pet_care_entries as entry_row
    where entry_row.user_id = p_user_id and entry_row.pet_profile_id = p_pet_id
      and entry_row.concern_id = v_concern.id and entry_row.state_action_type = 'resolve_concern'
      and entry_row.care_event_metadata->>'episodeSequence' = v_episode::text
    order by entry_row.created_at desc limit 1 for update;
    if v_entry_id is not null then
      if p_suggestion_id is not null then
        update public.pet_care_entries set state_suggestion_id = coalesce(state_suggestion_id, p_suggestion_id) where id = v_entry_id;
        update public.ai_update_suggestions set status = 'saved', actioned_at = coalesce(actioned_at, now()),
          applied_at = coalesce(applied_at, now()), care_entry_id = v_entry_id
        where id = p_suggestion_id and user_id = p_user_id;
      end if;
      return query select 'persisted'::text, array[v_entry_id], array[v_concern.id],
        'recently_resolved'::text, true, null::text;
      return;
    end if;
  end if;
  v_category := case
    when v_action in ('resolve_concern', 'reopen_concern') then 'symptom'
    when p_care_action->>'category' in ('symptom', 'food', 'medication', 'activity', 'grooming', 'vet_visit', 'behavior', 'general') then p_care_action->>'category'
    else 'general' end;
  v_severity := case
    when v_action = 'resolve_concern' then null
    when p_care_action->>'severity' in ('urgent', 'emergency') then 'severe'
    when p_care_action->>'severity' = 'moderate' then 'moderate'
    when p_care_action->>'severity' = 'mild' then 'mild'
    else null end;
  v_title := case
    when v_action = 'resolve_concern' and v_key = 'breathing' then 'Breathing returned to normal'
    when v_action = 'reopen_concern' and v_key = 'breathing' then 'Breathing concern recurred'
    else left(coalesce(nullif(btrim(p_care_action->>'title'), ''), 'Care update'), 120) end;
  v_note := case
    when v_action = 'resolve_concern' and v_key = 'breathing'
      then format('Owner reports %s''s breathing is normal again after the recent breathing concern.', v_pet_name)
    when v_action = 'reopen_concern' and v_key = 'breathing'
      then format('Owner reports %s is having the breathing problem again after a prior resolved episode.', v_pet_name)
    else left(coalesce(nullif(btrim(p_care_action->>'details'), ''), 'Owner provided a care update.'), 1000) end;

  insert into public.pet_care_entries(
    user_id, pet_profile_id, category, title, note, occurred_at, severity, concern_id,
    intelligence_source_message_id, intelligence_source_type, intelligence_confidence,
    state_action_type, state_suggestion_id, care_event_metadata
  ) values (
    p_user_id, p_pet_id, v_category, v_title, v_note, v_occurred_at, v_severity, v_concern.id,
    p_source_message_id, 'ask_furvise', v_confidence, v_action, p_suggestion_id,
    jsonb_build_object('episodeSequence', v_episode, 'normalizedConcernKey', v_key, 'source', 'ask_furvise')
  ) on conflict (user_id, intelligence_source_message_id)
    where intelligence_source_message_id is not null do nothing
  returning id into v_entry_id;

  if v_entry_id is null then
    select entry_row.id, entry_row.concern_id into v_entry_id, v_existing_concern_id
    from public.pet_care_entries as entry_row
    where entry_row.user_id = p_user_id and entry_row.intelligence_source_message_id = p_source_message_id
    limit 1;
    if p_suggestion_id is not null and v_entry_id is not null then
      update public.pet_care_entries set state_suggestion_id = coalesce(state_suggestion_id, p_suggestion_id) where id = v_entry_id;
      update public.ai_update_suggestions set status = 'saved', actioned_at = coalesce(actioned_at, now()),
        applied_at = coalesce(applied_at, now()), care_entry_id = v_entry_id
      where id = p_suggestion_id and user_id = p_user_id;
    end if;
    return query select 'persisted'::text, array[v_entry_id],
      case when v_existing_concern_id is null then array[]::uuid[] else array[v_existing_concern_id] end,
      case when v_action = 'reopen_concern' then 'urgent' else 'recently_resolved' end, true, null::text;
    return;
  end if;

  if v_action = 'resolve_concern' then
    update public.pet_concerns as concern_row set status = 'resolved', resolved_at = v_occurred_at,
      resolution_note = v_note, updated_at = now(), episode_sequence = v_episode
    where concern_row.id = v_concern.id;
  elsif v_action = 'reopen_concern' then
    if v_concern.id is null then
      select concern_row.* into v_concern from public.pet_concerns as concern_row
      where concern_row.user_id = p_user_id and concern_row.pet_profile_id = p_pet_id and concern_row.normalized_key = v_key
      order by concern_row.updated_at desc limit 1 for update;
    end if;
    update public.pet_concerns as concern_row set status = 'reopened', resolved_at = null, resolution_note = null,
      source_care_entry_id = v_entry_id, opened_at = v_occurred_at, reopened_at = v_occurred_at, updated_at = now(),
      episode_sequence = greatest(concern_row.episode_sequence + 1, v_episode)
    where concern_row.id = v_concern.id;
  end if;

  if v_concern.id is null then
    select concern_row.* into v_concern from public.pet_concerns as concern_row
    where concern_row.user_id = p_user_id and concern_row.pet_profile_id = p_pet_id and concern_row.normalized_key = v_key
    order by concern_row.updated_at desc limit 1;
  end if;
  update public.pet_care_entries as entry_row set concern_id = v_concern.id
  where entry_row.id = v_entry_id and entry_row.concern_id is null and v_concern.id is not null;
  if p_suggestion_id is not null then
    update public.ai_update_suggestions as suggestion_row set status = 'saved', actioned_at = coalesce(actioned_at, now()),
      applied_at = coalesce(applied_at, now()), care_entry_id = v_entry_id
    where suggestion_row.id = p_suggestion_id and suggestion_row.user_id = p_user_id;
  end if;

  return query select 'persisted'::text, array[v_entry_id],
    case when v_concern.id is null then array[]::uuid[] else array[v_concern.id] end,
    case when v_action = 'reopen_concern' or (v_action = 'create_entry' and v_severity in ('moderate', 'severe'))
      then 'urgent' else 'recently_resolved' end,
    false, null::text;
end;
$$;

revoke all on function public.persist_furvise_care_event(uuid, uuid, uuid, jsonb, uuid) from public, anon;
grant execute on function public.persist_furvise_care_event(uuid, uuid, uuid, jsonb, uuid) to authenticated;

create or replace function public.apply_furvise_state_suggestion(
  p_user_id uuid,
  p_suggestion_id uuid
)
returns table(
  apply_status text,
  suggestion_id uuid,
  concern_id uuid,
  care_entry_id uuid,
  concern_status text,
  applied_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_suggestion public.ai_update_suggestions%rowtype;
  v_user_source_id uuid;
  v_action jsonb;
  v_result record;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception using errcode = '42501', message = 'SUGGESTION_FORBIDDEN';
  end if;
  select suggestion_row.* into v_suggestion from public.ai_update_suggestions as suggestion_row
  where suggestion_row.id = p_suggestion_id for update;
  if v_suggestion.id is null then raise exception using errcode = 'P0002', message = 'SUGGESTION_NOT_FOUND'; end if;
  if v_suggestion.user_id <> p_user_id then raise exception using errcode = '42501', message = 'SUGGESTION_FORBIDDEN'; end if;
  if v_suggestion.status = 'saved' and v_suggestion.care_entry_id is not null then
    return query select 'already_applied'::text, v_suggestion.id, v_suggestion.concern_id,
      v_suggestion.care_entry_id,
      (select concern_row.status from public.pet_concerns as concern_row where concern_row.id = v_suggestion.concern_id),
      coalesce(v_suggestion.applied_at, v_suggestion.actioned_at);
    return;
  end if;
  if v_suggestion.status <> 'pending' or v_suggestion.type not in ('history', 'concern_resolution', 'concern_opening') then
    raise exception using errcode = '22023', message = 'SUGGESTION_INVALID';
  end if;

  select user_message.id into v_user_source_id
  from public.ask_conversation_messages as assistant_message
  join public.ask_conversation_messages as user_message
    on user_message.conversation_id = assistant_message.conversation_id
    and user_message.request_id = assistant_message.request_id and user_message.role = 'user'
  where assistant_message.id = v_suggestion.source_message_id and assistant_message.role = 'furvise'
    and assistant_message.user_id = p_user_id and user_message.user_id = p_user_id
  limit 1;
  if v_user_source_id is null then raise exception using errcode = '22023', message = 'SUGGESTION_INVALID'; end if;

  v_action := jsonb_build_object(
    'action', case when v_suggestion.type = 'concern_resolution' then 'resolve_concern'
      when v_suggestion.type = 'concern_opening' then 'create_entry' else 'create_entry' end,
    'category', coalesce(v_suggestion.payload->>'category', 'general'),
    'title', coalesce(v_suggestion.payload->>'title', v_suggestion.title),
    'details', coalesce(v_suggestion.details, v_suggestion.payload->>'note'),
    'severity', coalesce(v_suggestion.payload->>'severity', 'routine'),
    'confidence', 1.0,
    'relatedRecordId', v_suggestion.concern_id
  );
  select * into v_result from public.persist_furvise_care_event(
    p_user_id, v_suggestion.pet_profile_id, v_user_source_id, v_action, v_suggestion.id
  );
  if v_result.persistence_status <> 'persisted' or cardinality(v_result.care_entry_ids) = 0 then
    raise exception using errcode = 'P0001', message = 'SUGGESTION_PERSISTENCE_FAILED';
  end if;
  return query select case when v_result.already_persisted then 'already_applied' else 'applied' end,
    v_suggestion.id, (v_result.concern_ids)[1], (v_result.care_entry_ids)[1],
    (select concern_row.status from public.pet_concerns as concern_row where concern_row.id = (v_result.concern_ids)[1]),
    now();
end;
$$;

revoke all on function public.apply_furvise_state_suggestion(uuid, uuid) from public, anon;
grant execute on function public.apply_furvise_state_suggestion(uuid, uuid) to authenticated;

create or replace function public.repair_furvise_recovery_events(p_apply boolean default false)
returns table(source_message_id uuid, pet_id uuid, concern_id uuid, action text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  candidate record;
  v_entry_id uuid;
  v_created boolean;
begin
  if auth.role() <> 'service_role' and current_user not in ('postgres', 'supabase_admin') then
    raise exception using errcode = '42501', message = 'REPAIR_FORBIDDEN';
  end if;
  for candidate in
    select entry_row.id as entry_id, entry_row.user_id, entry_row.pet_profile_id as pet_id,
      entry_row.occurred_at as recurrence_at,
      concern_row.id as concern_id, concern_row.episode_sequence
    from public.pet_care_entries as entry_row
    join lateral (
      select candidate_concern.* from public.pet_concerns as candidate_concern
      where candidate_concern.user_id = entry_row.user_id and candidate_concern.pet_profile_id = entry_row.pet_profile_id
        and candidate_concern.normalized_key = 'breathing'
      order by candidate_concern.updated_at desc limit 1
    ) as concern_row on true
    where entry_row.concern_id is null
      and (coalesce(entry_row.title, '') || ' ' || entry_row.note) ~* '(breathing.*recurred|breathing problem again|problem.*back)'
      and entry_row.occurred_at > coalesce(concern_row.resolved_at, '-infinity'::timestamptz)
    order by entry_row.occurred_at
  loop
    v_entry_id := null;
    if p_apply then
      update public.pet_care_entries as entry_row set concern_id = candidate.concern_id,
        state_action_type = 'reopen_concern', intelligence_source_type = coalesce(entry_row.intelligence_source_type, 'compatibility_repair'),
        care_event_metadata = entry_row.care_event_metadata || jsonb_build_object('episodeSequence', candidate.episode_sequence + 1, 'repair', true)
      where entry_row.id = candidate.entry_id;
      update public.pet_concerns as concern_row set status = 'reopened', resolved_at = null, resolution_note = null,
        source_care_entry_id = candidate.entry_id, reopened_at = candidate.recurrence_at,
        opened_at = candidate.recurrence_at, updated_at = now(),
        episode_sequence = candidate.episode_sequence + 1
      where concern_row.id = candidate.concern_id;
    end if;
    source_message_id := null;
    pet_id := candidate.pet_id;
    concern_id := candidate.concern_id;
    action := case when p_apply then 'repaired_recurrence' else 'would_repair_recurrence' end;
    return next;
  end loop;
  for candidate in
    select user_message.id as source_message_id, user_message.request_id, user_message.user_id,
      conversation_row.pet_profile_id as pet_id, concern_row.id as concern_id,
      pet_row.name as pet_name, user_message.created_at,
      1 + (
        select count(*)::integer from public.pet_care_entries as recurrence_entry
        where recurrence_entry.user_id = user_message.user_id
          and recurrence_entry.pet_profile_id = conversation_row.pet_profile_id
          and recurrence_entry.occurred_at <= user_message.created_at
          and (
            recurrence_entry.state_action_type = 'reopen_concern'
            or (coalesce(recurrence_entry.title, '') || ' ' || recurrence_entry.note) ~* '(breathing.*recurred|breathing problem again|problem.*back)'
          )
      ) as episode_sequence
    from public.ask_conversation_messages as user_message
    join public.ask_conversations as conversation_row on conversation_row.id = user_message.conversation_id
    join public.dog_profiles as pet_row on pet_row.id = conversation_row.pet_profile_id and pet_row.user_id = user_message.user_id
    join lateral (
      select candidate_concern.* from public.pet_concerns as candidate_concern
      where candidate_concern.user_id = user_message.user_id and candidate_concern.pet_profile_id = conversation_row.pet_profile_id
        and candidate_concern.normalized_key = 'breathing'
      order by candidate_concern.updated_at desc limit 1
    ) as concern_row on true
    where user_message.role = 'user'
      and user_message.user_text ~* '(breathing (is )?normal|back (to )?normal|normal now|is good now)'
      and user_message.user_text !~* '(save|add).*(that|history)'
      and exists (
        select 1 from public.ask_conversation_messages as assistant_message
        where assistant_message.request_id = user_message.request_id and assistant_message.role = 'furvise'
          and assistant_message.response_data->>'urgency' = 'resolved'
      )
      and not exists (
        select 1 from public.pet_care_entries as entry_row
        where entry_row.user_id = user_message.user_id and entry_row.intelligence_source_message_id = user_message.id
      )
    order by user_message.created_at
  loop
    v_entry_id := null;
    v_created := false;
    if p_apply then
      insert into public.pet_care_entries(
        user_id, pet_profile_id, category, title, note, occurred_at, severity, concern_id,
        intelligence_source_message_id, intelligence_source_type, intelligence_confidence,
        state_action_type, care_event_metadata
      ) values (
        candidate.user_id, candidate.pet_id, 'symptom', 'Breathing returned to normal',
        format('Owner reports %s''s breathing is normal again after the recent breathing concern.', candidate.pet_name),
        candidate.created_at, null, candidate.concern_id, candidate.source_message_id, 'ask_furvise_repair', 0.99,
        'resolve_concern', jsonb_build_object('episodeSequence', candidate.episode_sequence, 'repair', true, 'source', 'explicit_user_message')
      ) on conflict do nothing
      returning id into v_entry_id;
      v_created := v_entry_id is not null;
      if v_entry_id is null then
        select entry_row.id into v_entry_id from public.pet_care_entries as entry_row
        where entry_row.user_id = candidate.user_id
          and entry_row.intelligence_source_message_id = candidate.source_message_id
        limit 1;
      end if;
      if v_entry_id is null then
        select entry_row.id into v_entry_id from public.pet_care_entries as entry_row
        where entry_row.user_id = candidate.user_id and entry_row.concern_id = candidate.concern_id
          and entry_row.state_action_type = 'resolve_concern'
          and entry_row.care_event_metadata->>'episodeSequence' = candidate.episode_sequence::text
        order by entry_row.occurred_at desc limit 1;
      end if;
      if v_created and not exists (
        select 1 from public.pet_care_entries as later_recurrence
        where later_recurrence.user_id = candidate.user_id and later_recurrence.pet_profile_id = candidate.pet_id
          and later_recurrence.occurred_at > candidate.created_at
          and (
            later_recurrence.state_action_type = 'reopen_concern'
            or (coalesce(later_recurrence.title, '') || ' ' || later_recurrence.note) ~* '(breathing.*recurred|breathing problem again|problem.*back)'
          )
      ) then
        update public.pet_concerns as concern_row set status = 'resolved', resolved_at = candidate.created_at,
          resolution_note = format('Owner reports %s''s breathing is normal again.', candidate.pet_name), updated_at = now()
        where concern_row.id = candidate.concern_id;
      end if;
      if v_entry_id is not null then
        update public.ask_conversation_messages as assistant_message
        set care_persistence = jsonb_build_object(
          'status', 'persisted', 'careEntryIds', jsonb_build_array(v_entry_id),
          'concernIds', jsonb_build_array(candidate.concern_id), 'errorCode', null
        )
        where assistant_message.user_id = candidate.user_id and assistant_message.role = 'furvise'
          and assistant_message.request_id = candidate.request_id;
      end if;
    end if;
    source_message_id := candidate.source_message_id;
    pet_id := candidate.pet_id;
    concern_id := candidate.concern_id;
    action := case when p_apply and v_created then 'repaired_recovery'
      when p_apply then 'already_present' else 'would_repair_recovery' end;
    return next;
  end loop;
end;
$$;

revoke all on function public.repair_furvise_recovery_events(boolean) from public, anon, authenticated;
grant execute on function public.repair_furvise_recovery_events(boolean) to service_role;
