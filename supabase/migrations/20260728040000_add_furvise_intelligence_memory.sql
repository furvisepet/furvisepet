create table if not exists public.furvise_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pet_id uuid references public.dog_profiles(id) on delete cascade,
  subject_type text not null check (subject_type in ('pet', 'owner')),
  category text not null,
  fact_key text not null,
  fact_value jsonb not null,
  normalized_value text,
  confidence numeric not null check (confidence between 0 and 1),
  importance text not null check (importance in ('low', 'medium', 'high')),
  durability text not null check (durability in ('temporary', 'ongoing', 'durable')),
  status text not null default 'active' check (status in ('active', 'unconfirmed', 'resolved', 'superseded', 'rejected')),
  source_type text not null,
  source_id uuid,
  source_excerpt text,
  dedupe_key text not null unique,
  first_observed_at timestamptz not null default now(),
  last_confirmed_at timestamptz not null default now(),
  superseded_by uuid references public.furvise_memories(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint furvise_memories_subject_pet_check check (
    (subject_type = 'pet' and pet_id is not null) or subject_type = 'owner'
  )
);

create index if not exists furvise_memories_owner_status_idx
  on public.furvise_memories(user_id, status, last_confirmed_at desc);
create index if not exists furvise_memories_pet_status_idx
  on public.furvise_memories(pet_id, status, last_confirmed_at desc) where pet_id is not null;
create index if not exists furvise_memories_fact_lookup_idx
  on public.furvise_memories(user_id, subject_type, pet_id, fact_key, status);

alter table public.furvise_memories enable row level security;
alter table public.furvise_memories force row level security;
drop policy if exists "furvise_memories_select_own" on public.furvise_memories;
drop policy if exists "furvise_memories_insert_own" on public.furvise_memories;
drop policy if exists "furvise_memories_update_own" on public.furvise_memories;
drop policy if exists "furvise_memories_delete_own" on public.furvise_memories;
create policy "furvise_memories_select_own" on public.furvise_memories for select using (user_id = auth.uid());
create policy "furvise_memories_insert_own" on public.furvise_memories for insert with check (
  user_id = auth.uid() and (pet_id is null or exists (
    select 1 from public.dog_profiles as pet_row where pet_row.id = pet_id and pet_row.user_id = auth.uid()
  ))
);
create policy "furvise_memories_update_own" on public.furvise_memories for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "furvise_memories_delete_own" on public.furvise_memories for delete using (user_id = auth.uid());
revoke all on table public.furvise_memories from anon;
grant select, insert, update, delete on table public.furvise_memories to authenticated;

alter table public.pet_care_entries
  add column if not exists intelligence_source_message_id uuid references public.ask_conversation_messages(id) on delete set null;
create unique index if not exists pet_care_entries_intelligence_source_unique
  on public.pet_care_entries(user_id, intelligence_source_message_id)
  where intelligence_source_message_id is not null;

create or replace function public.persist_furvise_intelligence(
  p_pet_id uuid,
  p_source_message_id uuid,
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
  if not exists (select 1 from public.dog_profiles as pet_row where pet_row.id = p_pet_id and pet_row.user_id = v_user_id) then
    raise exception using errcode = '42501', message = 'PET_NOT_OWNED';
  end if;
  if not exists (
    select 1 from public.ask_conversation_messages as message_row
    join public.ask_conversations as conversation_row on conversation_row.id = message_row.conversation_id
    where message_row.id = p_source_message_id and message_row.user_id = v_user_id
      and message_row.role = 'user' and conversation_row.pet_profile_id = p_pet_id and conversation_row.user_id = v_user_id
  ) then raise exception using errcode = '42501', message = 'SOURCE_MESSAGE_NOT_OWNED'; end if;

  for v_learning in select value from jsonb_array_elements(coalesce(p_learnings, '[]'::jsonb))
  loop
    if coalesce((v_learning->>'confidence')::numeric, 0) < 0.85 then continue; end if;
    v_subject_type := v_learning->>'subjectType';
    if v_subject_type not in ('pet', 'owner') then continue; end if;
    v_pet_id := case when v_subject_type = 'pet' then p_pet_id else null end;
    v_fact_key := lower(regexp_replace(coalesce(v_learning->>'factKey', ''), '[^a-z0-9]+', '_', 'g'));
    v_normalized_value := left(coalesce(v_learning->>'normalizedValue', ''), 500);
    if v_fact_key = '' or v_normalized_value = '' then continue; end if;
    v_dedupe_key := md5(v_user_id::text || ':' || coalesce(v_pet_id::text, 'owner') || ':' || v_fact_key || ':' || v_normalized_value || ':' || p_source_message_id::text);

    select memory_row.* into v_existing from public.furvise_memories as memory_row
    where memory_row.user_id = v_user_id and memory_row.subject_type = v_subject_type
      and memory_row.pet_id is not distinct from v_pet_id and memory_row.fact_key = v_fact_key and memory_row.status = 'active'
    order by memory_row.last_confirmed_at desc limit 1 for update;
    if v_existing.id is not null and v_existing.normalized_value = v_normalized_value then
      update public.furvise_memories as memory_row set last_confirmed_at = now(), updated_at = now(), confidence = greatest(memory_row.confidence, (v_learning->>'confidence')::numeric)
      where memory_row.id = v_existing.id;
      continue;
    end if;

    insert into public.furvise_memories(
      user_id, pet_id, subject_type, category, fact_key, fact_value, normalized_value, confidence,
      importance, durability, status, source_type, source_id, source_excerpt, dedupe_key
    ) values (
      v_user_id, v_pet_id, v_subject_type, left(v_learning->>'category', 80), v_fact_key, v_learning->'factValue',
      v_normalized_value, (v_learning->>'confidence')::numeric, v_learning->>'importance', v_learning->>'durability',
      'active', 'ask_message', p_source_message_id, left(v_learning->>'sourceExcerpt', 240), v_dedupe_key
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
      user_id, pet_profile_id, category, title, note, occurred_at, severity, concern_id, intelligence_source_message_id
    ) values (
      v_user_id, p_pet_id,
      case when v_action->>'category' in ('symptom', 'food', 'medication', 'activity', 'grooming', 'vet_visit', 'behavior', 'general') then v_action->>'category' else 'general' end,
      left(v_action->>'title', 120), left(v_action->>'details', 1000), now(),
      case when v_action->>'severity' in ('urgent', 'emergency') then 'severe' when v_action->>'severity' = 'moderate' then 'moderate' when v_action->>'severity' = 'mild' then 'mild' else null end,
      v_concern_id, p_source_message_id
    ) on conflict (user_id, intelligence_source_message_id) where intelligence_source_message_id is not null do nothing
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

revoke all on function public.persist_furvise_intelligence(uuid, uuid, jsonb, jsonb) from public, anon;
grant execute on function public.persist_furvise_intelligence(uuid, uuid, jsonb, jsonb) to authenticated;
