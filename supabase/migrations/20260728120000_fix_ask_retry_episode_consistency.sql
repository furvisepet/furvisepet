-- Preserve logical Ask retries and allow concern-optional symptom episodes to resolve safely.
alter function public.persist_furvise_care_event(uuid, uuid, uuid, jsonb, uuid)
  rename to persist_furvise_care_event_with_concern;

revoke all on function public.persist_furvise_care_event_with_concern(uuid, uuid, uuid, jsonb, uuid) from public, anon;

create function public.persist_furvise_care_event(
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
  v_entry_id uuid;
  v_episode public.pet_care_episodes%rowtype;
  v_key text;
  v_title text := left(coalesce(nullif(btrim(p_care_action->>'title'), ''), 'Symptom improved'), 120);
  v_text text := coalesce(p_care_action->>'title', '') || ' ' || coalesce(p_care_action->>'details', '');
begin
  if auth.uid() is distinct from p_user_id or not exists (
    select 1 from public.dog_profiles where id = p_pet_id and user_id = p_user_id
  ) then raise exception using errcode = '42501', message = 'CARE_EVENT_FORBIDDEN'; end if;

  if p_care_action->>'action' <> 'resolve_concern'
    or coalesce(p_care_action->>'relatedRecordId', '') ~* '^[0-9a-f-]{36}$' then
    return query select * from public.persist_furvise_care_event_with_concern(
      p_user_id, p_pet_id, p_source_message_id, p_care_action, p_suggestion_id
    );
    return;
  end if;

  select entry_row.id into v_entry_id from public.pet_care_entries as entry_row
  where entry_row.user_id = p_user_id and entry_row.intelligence_source_message_id = p_source_message_id
  limit 1 for update;
  if v_entry_id is not null then
    return query select 'persisted'::text, array[v_entry_id], array[]::uuid[], 'recently_resolved'::text, true, null::text;
    return;
  end if;

  v_key := case
    when v_text ~* '(breath|breathing|deep breaths?)' then 'breathing'
    when v_text ~* '(ear|scratch|head shak)' then 'ear_scratching'
    when v_text ~* '(appetite|eating|food intake)' then 'appetite_reduced'
    else null end;

  select episode_row.* into v_episode from public.pet_care_episodes as episode_row
  where episode_row.user_id = p_user_id and episode_row.pet_profile_id = p_pet_id
    and episode_row.episode_type = 'symptom' and episode_row.status in ('active', 'monitoring')
    and (episode_row.normalized_key = v_key
      or (v_key = 'ear_scratching' and (episode_row.normalized_key = 'symptom' or episode_row.title ~* '(ear|scratch)'))
      or (v_key = 'breathing' and episode_row.title ~* '(breath|breathing)')
      or (v_key = 'appetite_reduced' and episode_row.title ~* '(appetite|eating)'))
  order by case when episode_row.normalized_key = v_key then 0 else 1 end, episode_row.last_event_at desc
  limit 1 for update;

  -- No arbitrary active episode fallback. An unmatched recovery is a standalone,
  -- neutral resolved symptom event and cannot transition an unrelated episode.
  v_key := coalesce(v_episode.normalized_key, v_key, 'symptom_improvement');
  insert into public.pet_care_entries(
    user_id, pet_profile_id, category, title, note, occurred_at, severity, concern_id,
    intelligence_source_message_id, intelligence_source_type, intelligence_confidence,
    state_action_type, state_suggestion_id, care_event_metadata, episode_id
  ) values (
    p_user_id, p_pet_id, 'symptom', v_title,
    left(coalesce(nullif(btrim(p_care_action->>'details'), ''), 'Owner reported that the symptom improved.'), 1000),
    now(), null, null, p_source_message_id, 'ask_furvise',
    coalesce((p_care_action->>'confidence')::numeric, 0.99), 'resolve_concern', p_suggestion_id,
    jsonb_build_object('normalizedConcernKey', v_key, 'source', 'ask_furvise'), v_episode.id
  ) on conflict (user_id, intelligence_source_message_id)
    where intelligence_source_message_id is not null do nothing
  returning id into v_entry_id;

  if v_episode.id is not null then
    update public.pet_care_episodes set status = 'resolved', resolved_at = now(), last_event_at = now(), updated_at = now(),
      summary = jsonb_set(summary, '{latestStatus}', '"resolved"'::jsonb)
        || jsonb_build_object('sourceRecordIds', coalesce(summary->'sourceRecordIds', '[]'::jsonb) || jsonb_build_array(v_entry_id))
    where id = v_episode.id;
  end if;
  if p_suggestion_id is not null then
    update public.ai_update_suggestions set status = 'saved', actioned_at = coalesce(actioned_at, now()),
      applied_at = coalesce(applied_at, now()), care_entry_id = v_entry_id
    where id = p_suggestion_id and user_id = p_user_id;
  end if;
  return query select 'persisted'::text, array[v_entry_id], array[]::uuid[], 'recently_resolved'::text, false, null::text;
end;
$$;

revoke all on function public.persist_furvise_care_event(uuid, uuid, uuid, jsonb, uuid) from public, anon;
grant execute on function public.persist_furvise_care_event(uuid, uuid, uuid, jsonb, uuid) to authenticated;

-- Service-only, dry-run-first compatibility repair. It corrects derived links and
-- retry duplicates; immutable user-authored history text is never used as inferred evidence.
create function public.repair_maple_qa_consistency(p_dry_run boolean default true)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_pet_id constant uuid := '75db72b1-64fe-476d-a62a-70f4f6aee7cd';
  v_result jsonb;
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  v_result := jsonb_build_object(
    'duplicateMessageId', 'd8a6ea9e-e18e-475b-977a-1e9c6766d6d9',
    'canonicalMessageId', 'f2b845aa-e3cb-4760-ab22-f326e03053d0',
    'recoveryEntryId', '2612c81b-4f16-4591-ad45-480ca2e705cb',
    'dryRun', p_dry_run
  );
  if p_dry_run then return v_result; end if;

  delete from public.ask_conversation_messages as message_row using public.ask_conversations as conversation_row
  where message_row.id = 'd8a6ea9e-e18e-475b-977a-1e9c6766d6d9' and message_row.conversation_id = conversation_row.id
    and conversation_row.pet_profile_id = v_pet_id and message_row.role = 'user'
    and message_row.request_id = '13d00733-5d10-48b1-8e7b-bf834236dbb9';

  update public.pet_care_entries set title = 'Ear scratching returned to normal', concern_id = null,
    care_event_metadata = coalesce(care_event_metadata, '{}'::jsonb) || jsonb_build_object('normalizedConcernKey', 'ear_scratching', 'repair', 'explicit_source_message')
  where id = '2612c81b-4f16-4591-ad45-480ca2e705cb' and pet_profile_id = v_pet_id
    and intelligence_source_message_id = 'b54fcfea-dbb3-4498-a926-4f086de45d58';

  update public.ai_update_suggestions set concern_id = null,
    payload = coalesce(payload, '{}'::jsonb) - 'concernId' - 'resolvedConcernKeys'
  where id = '7747627e-8b90-4c65-b360-77947240a5e4' and pet_profile_id = v_pet_id;

  delete from public.pet_concerns as concern_row using public.pet_care_entries as source_entry
  where concern_row.pet_profile_id = v_pet_id and concern_row.source_care_entry_id = source_entry.id
    and source_entry.pet_profile_id = v_pet_id
    and (concern_row.id = 'fcba4d71-8d5a-4db7-b59c-801ad883954d'
      or source_entry.category = 'food'
      or (source_entry.category = 'behavior' and source_entry.note ~* '(more playful|playful today)'));

  update public.pet_care_episodes set status = 'archived', updated_at = now()
  where pet_profile_id = v_pet_id and episode_type = 'behavior_change' and status = 'active'
    and title ~* '(more playful|playful today)';
  return v_result || jsonb_build_object('applied', true);
end;
$$;

revoke all on function public.repair_maple_qa_consistency(boolean) from public, anon, authenticated;
grant execute on function public.repair_maple_qa_consistency(boolean) to service_role;
