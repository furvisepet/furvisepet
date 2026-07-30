-- Shared Phase 2 persistence for non-conversation AI features. Existing Ask persistence remains compatible.
alter table public.pet_care_entries
  add column if not exists intelligence_request_id uuid,
  add column if not exists intelligence_source_type text;

create unique index if not exists pet_care_entries_feature_request_unique
  on public.pet_care_entries(user_id, pet_profile_id, intelligence_source_type, intelligence_request_id)
  where intelligence_request_id is not null and intelligence_source_type is not null;

create or replace function public.persist_furvise_feature_intelligence(
  p_pet_id uuid,
  p_source_type text,
  p_request_id uuid,
  p_learnings jsonb default '[]'::jsonb,
  p_care_actions jsonb default '[]'::jsonb
)
returns table(memories_created integer, memories_superseded integer, care_entries_created integer, concerns_resolved integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_learning jsonb;
  v_action jsonb;
  v_existing public.furvise_memories%rowtype;
  v_memory_id uuid;
  v_dedupe_key text;
  v_fact_key text;
  v_normalized_value text;
  v_subject_type text;
  v_pet_id uuid;
  v_entry_id uuid;
  v_concern_id uuid;
  v_memories_created integer := 0;
  v_memories_superseded integer := 0;
  v_care_entries_created integer := 0;
  v_concerns_resolved integer := 0;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'AUTH_REQUIRED'; end if;
  if p_source_type not in ('product_question', 'product_query', 'safety_followup', 'vet_brief') then
    raise exception using errcode = '22023', message = 'INVALID_INTELLIGENCE_SOURCE';
  end if;
  if not exists (select 1 from public.dog_profiles as pet_row where pet_row.id = p_pet_id and pet_row.user_id = v_user_id) then
    raise exception using errcode = '42501', message = 'PET_NOT_OWNED';
  end if;

  for v_learning in select value from jsonb_array_elements(coalesce(p_learnings, '[]'::jsonb))
  loop
    if coalesce((v_learning->>'confidence')::numeric, 0) < 0.85 then continue; end if;
    v_subject_type := v_learning->>'subjectType';
    if v_subject_type not in ('pet', 'owner') then continue; end if;
    v_pet_id := case when v_subject_type = 'pet' then p_pet_id else null end;
    v_fact_key := lower(regexp_replace(coalesce(v_learning->>'factKey', ''), '[^a-z0-9]+', '_', 'g'));
    v_normalized_value := left(coalesce(v_learning->>'normalizedValue', ''), 500);
    if v_fact_key = '' or v_normalized_value = '' then continue; end if;
    v_dedupe_key := md5(v_user_id::text || ':' || coalesce(v_pet_id::text, 'owner') || ':' || v_fact_key || ':' || v_normalized_value || ':' || p_source_type || ':' || p_request_id::text);

    select memory_row.* into v_existing from public.furvise_memories as memory_row
    where memory_row.user_id = v_user_id and memory_row.subject_type = v_subject_type
      and memory_row.pet_id is not distinct from v_pet_id and memory_row.fact_key = v_fact_key and memory_row.status = 'active'
    order by memory_row.last_confirmed_at desc limit 1 for update;
    if v_existing.id is not null and v_existing.normalized_value = v_normalized_value then
      update public.furvise_memories as memory_row
      set last_confirmed_at = now(), updated_at = now(), confidence = greatest(memory_row.confidence, (v_learning->>'confidence')::numeric)
      where memory_row.id = v_existing.id;
      continue;
    end if;
    insert into public.furvise_memories(
      user_id, pet_id, subject_type, category, fact_key, fact_value, normalized_value, confidence,
      importance, durability, status, source_type, source_id, source_excerpt, dedupe_key
    ) values (
      v_user_id, v_pet_id, v_subject_type, left(v_learning->>'category', 80), v_fact_key, v_learning->'factValue',
      v_normalized_value, (v_learning->>'confidence')::numeric, v_learning->>'importance', v_learning->>'durability',
      'active', p_source_type, p_request_id, left(v_learning->>'sourceExcerpt', 240), v_dedupe_key
    ) on conflict (dedupe_key) do nothing returning id into v_memory_id;
    if v_memory_id is null then continue; end if;
    v_memories_created := v_memories_created + 1;
    if v_existing.id is not null then
      update public.furvise_memories as memory_row set status = 'superseded', superseded_by = v_memory_id, updated_at = now()
      where memory_row.id = v_existing.id;
      v_memories_superseded := v_memories_superseded + 1;
    end if;
    v_existing := null;
    v_memory_id := null;
  end loop;

  for v_action in select value from jsonb_array_elements(coalesce(p_care_actions, '[]'::jsonb)) limit 1
  loop
    if coalesce((v_action->>'confidence')::numeric, 0) < 0.90 then continue; end if;
    if v_action->>'action' not in ('create_entry', 'resolve_concern') then continue; end if;
    v_concern_id := case when coalesce(v_action->>'relatedRecordId', '') ~* '^[0-9a-f-]{36}$' then (v_action->>'relatedRecordId')::uuid else null end;
    if v_action->>'action' = 'resolve_concern' and not exists (
      select 1 from public.pet_concerns as concern_row where concern_row.id = v_concern_id and concern_row.user_id = v_user_id
        and concern_row.pet_profile_id = p_pet_id and concern_row.status in ('active', 'monitoring', 'reopened') and concern_row.resolved_at is null
    ) then continue; end if;
    insert into public.pet_care_entries(
      user_id, pet_profile_id, category, title, note, occurred_at, severity, concern_id,
      intelligence_request_id, intelligence_source_type
    ) values (
      v_user_id, p_pet_id,
      case when v_action->>'category' in ('symptom', 'food', 'medication', 'activity', 'grooming', 'vet_visit', 'behavior', 'general') then v_action->>'category' else 'general' end,
      left(v_action->>'title', 120), left(v_action->>'details', 1000), now(),
      case when v_action->>'severity' in ('urgent', 'emergency') then 'severe' when v_action->>'severity' = 'moderate' then 'moderate' when v_action->>'severity' = 'mild' then 'mild' else null end,
      v_concern_id, p_request_id, p_source_type
    ) on conflict (user_id, pet_profile_id, intelligence_source_type, intelligence_request_id)
      where intelligence_request_id is not null and intelligence_source_type is not null do nothing
    returning id into v_entry_id;
    if v_entry_id is not null then v_care_entries_created := v_care_entries_created + 1; end if;
    if v_action->>'action' = 'resolve_concern' and v_entry_id is not null then
      update public.pet_concerns as concern_row set status = 'resolved', resolved_at = now(),
        resolution_note = left(v_action->>'details', 1000), updated_at = now()
      where concern_row.id = v_concern_id and concern_row.user_id = v_user_id and concern_row.pet_profile_id = p_pet_id
        and concern_row.status in ('active', 'monitoring', 'reopened') and concern_row.resolved_at is null;
      get diagnostics v_concerns_resolved = row_count;
    end if;
  end loop;
  return query select v_memories_created, v_memories_superseded, v_care_entries_created, v_concerns_resolved;
end;
$$;

revoke all on function public.persist_furvise_feature_intelligence(uuid, text, uuid, jsonb, jsonb) from public, anon;
grant execute on function public.persist_furvise_feature_intelligence(uuid, text, uuid, jsonb, jsonb) to authenticated;

comment on table public.product_question_usage is 'Legacy compatibility data. New AI usage writes use public.ai_usage_events.';
comment on table public.shop_search_usage is 'Legacy compatibility data. New AI usage writes use public.ai_usage_events.';
comment on table public.product_ai_usage is 'Legacy compatibility data. New AI usage writes use public.ai_usage_events.';
