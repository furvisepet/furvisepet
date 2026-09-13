create table if not exists public.pet_care_episodes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pet_profile_id uuid not null references public.dog_profiles(id) on delete cascade,
  episode_type text not null check (episode_type in ('symptom', 'medication_course', 'food_transition', 'behavior_change', 'vet_visit', 'care_tracking')),
  normalized_key text not null check (btrim(normalized_key) <> ''),
  title text not null check (btrim(title) <> ''),
  status text not null check (status in ('active', 'monitoring', 'resolved', 'superseded', 'archived')),
  severity text not null check (severity in ('routine', 'important', 'urgent')),
  sequence_number integer not null check (sequence_number > 0),
  recurrence_of uuid references public.pet_care_episodes(id) on delete set null,
  linked_concern_id uuid references public.pet_concerns(id) on delete set null,
  started_at timestamptz not null,
  last_event_at timestamptz not null,
  resolved_at timestamptz,
  summary jsonb not null default '{}'::jsonb,
  source_type text not null default 'care_event',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, pet_profile_id, normalized_key, sequence_number)
);

alter table public.pet_care_entries add column if not exists episode_id uuid references public.pet_care_episodes(id) on delete set null;
alter table public.pet_concerns add column if not exists active_episode_id uuid references public.pet_care_episodes(id) on delete set null;

create index if not exists pet_care_episodes_pet_status_idx on public.pet_care_episodes(user_id, pet_profile_id, status, last_event_at desc);
create index if not exists pet_care_episodes_pet_key_idx on public.pet_care_episodes(user_id, pet_profile_id, normalized_key, sequence_number desc);
create index if not exists pet_care_entries_episode_time_idx on public.pet_care_entries(episode_id, occurred_at, created_at);
create index if not exists pet_concerns_active_episode_idx on public.pet_concerns(active_episode_id) where active_episode_id is not null;

alter table public.pet_care_episodes enable row level security;
create policy "Users can select their care episodes" on public.pet_care_episodes for select using (auth.uid() = user_id);
create policy "Users can insert their care episodes" on public.pet_care_episodes for insert with check (
  auth.uid() = user_id and exists (select 1 from public.dog_profiles where id = pet_profile_id and user_id = auth.uid())
);
create policy "Users can update their care episodes" on public.pet_care_episodes for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete their care episodes" on public.pet_care_episodes for delete using (auth.uid() = user_id);

create or replace function public.assign_pet_care_episode()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_text text := coalesce(new.title, '') || ' ' || coalesce(new.note, '');
  v_key text := coalesce(new.care_event_metadata->>'normalizedConcernKey', case when v_text ~* '(breath|breathing)' then 'breathing' else null end);
  v_type text;
  v_episode public.pet_care_episodes%rowtype;
  v_prior public.pet_care_episodes%rowtype;
  v_sequence integer;
  v_status text;
  v_severity text := case when new.severity = 'severe' then 'urgent' when new.severity = 'moderate' then 'important' else 'routine' end;
begin
  if new.episode_id is not null then return new; end if;
  v_type := case when new.category = 'symptom' then 'symptom' when new.category = 'medication' then 'medication_course'
    when new.category = 'food' then 'food_transition' when new.category = 'behavior' then 'behavior_change'
    when new.category = 'vet_visit' then 'vet_visit' else null end;
  if v_type is null then return new; end if;
  v_key := coalesce(v_key, regexp_replace(lower(coalesce(nullif(btrim(new.title), ''), new.category)), '[^a-z0-9]+', '_', 'g'));

  select episode_row.* into v_episode from public.pet_care_episodes as episode_row
  where episode_row.user_id = new.user_id and episode_row.pet_profile_id = new.pet_profile_id
    and episode_row.normalized_key = v_key and episode_row.status in ('active', 'monitoring')
  order by episode_row.sequence_number desc limit 1 for update;

  if new.state_action_type = 'reopen_concern' or (v_episode.id is null and v_text ~* '(again|recurred|returned|back)') then
    select episode_row.* into v_prior from public.pet_care_episodes as episode_row
    where episode_row.user_id = new.user_id and episode_row.pet_profile_id = new.pet_profile_id
      and episode_row.normalized_key = v_key
    order by episode_row.sequence_number desc limit 1 for update;
    v_sequence := coalesce(v_prior.sequence_number, 0) + 1;
    insert into public.pet_care_episodes(user_id, pet_profile_id, episode_type, normalized_key, title, status, severity,
      sequence_number, recurrence_of, linked_concern_id, started_at, last_event_at, summary, source_type)
    values(new.user_id, new.pet_profile_id, v_type, v_key, coalesce(nullif(new.title, ''), 'Care episode'), 'active', v_severity,
      v_sequence, v_prior.id, new.concern_id, new.occurred_at, new.occurred_at,
      jsonb_build_object('eventCount', 1, 'latestStatus', 'active', 'sourceRecordIds', jsonb_build_array(new.id)), 'care_event')
    returning * into v_episode;
  elsif v_episode.id is null then
    select coalesce(max(sequence_number), 0) + 1 into v_sequence from public.pet_care_episodes
    where user_id = new.user_id and pet_profile_id = new.pet_profile_id and normalized_key = v_key;
    v_status := case when new.state_action_type = 'resolve_concern' then 'resolved' else 'active' end;
    insert into public.pet_care_episodes(user_id, pet_profile_id, episode_type, normalized_key, title, status, severity,
      sequence_number, linked_concern_id, started_at, last_event_at, resolved_at, summary, source_type)
    values(new.user_id, new.pet_profile_id, v_type, v_key, coalesce(nullif(new.title, ''), 'Care episode'), v_status, v_severity,
      v_sequence, new.concern_id, new.occurred_at, new.occurred_at, case when v_status = 'resolved' then new.occurred_at end,
      jsonb_build_object('eventCount', 1, 'latestStatus', v_status, 'sourceRecordIds', jsonb_build_array(new.id)), 'care_event')
    returning * into v_episode;
  else
    v_status := case when new.state_action_type = 'resolve_concern' then 'resolved' else v_episode.status end;
    update public.pet_care_episodes set status = v_status, last_event_at = greatest(last_event_at, new.occurred_at),
      resolved_at = case when v_status = 'resolved' then new.occurred_at else resolved_at end,
      severity = case when v_severity = 'urgent' then 'urgent' else severity end,
      linked_concern_id = coalesce(linked_concern_id, new.concern_id), updated_at = now(),
      summary = jsonb_set(jsonb_set(summary, '{eventCount}', to_jsonb(coalesce((summary->>'eventCount')::integer, 0) + 1)),
        '{latestStatus}', to_jsonb(v_status)) || jsonb_build_object('sourceRecordIds', coalesce(summary->'sourceRecordIds', '[]'::jsonb) || jsonb_build_array(new.id))
    where id = v_episode.id returning * into v_episode;
  end if;
  new.episode_id := v_episode.id;
  if new.concern_id is not null then
    update public.pet_concerns set active_episode_id = case when v_episode.status = 'resolved' then null else v_episode.id end where id = new.concern_id;
  end if;
  return new;
end;
$$;

drop trigger if exists pet_care_entries_assign_episode on public.pet_care_entries;
create trigger pet_care_entries_assign_episode before insert on public.pet_care_entries for each row execute function public.assign_pet_care_episode();
revoke all on function public.assign_pet_care_episode() from public, anon, authenticated;

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
      count(*)::integer as event_count,
      bool_or(entries.state_action_type = 'resolve_concern') as is_resolved,
      max(concern_row.normalized_key) as normalized_key
    from public.pet_care_entries as entries
    join public.pet_concerns as concern_row on concern_row.id = entries.concern_id
    where entries.concern_id is not null and entries.care_event_metadata ? 'episodeSequence'
      and (p_pet_id is null or entries.pet_profile_id = p_pet_id)
    group by entries.user_id, entries.pet_profile_id, entries.concern_id, (entries.care_event_metadata->>'episodeSequence')::integer
    order by entries.pet_profile_id, sequence_number
  loop
    v_created := false;
    select episode_row.id into v_episode_id from public.pet_care_episodes as episode_row where episode_row.user_id = candidate.user_id
      and episode_row.pet_profile_id = candidate.pet_profile_id and episode_row.normalized_key = candidate.normalized_key
      and episode_row.sequence_number = candidate.sequence_number;
    if v_episode_id is null and not p_dry_run then
      select episode_row.id into v_prior_id from public.pet_care_episodes as episode_row where episode_row.user_id = candidate.user_id
        and episode_row.pet_profile_id = candidate.pet_profile_id and episode_row.normalized_key = candidate.normalized_key
        and episode_row.sequence_number < candidate.sequence_number order by episode_row.sequence_number desc limit 1;
      insert into public.pet_care_episodes(user_id, pet_profile_id, episode_type, normalized_key, title, status, severity,
        sequence_number, recurrence_of, linked_concern_id, started_at, last_event_at, resolved_at, summary, source_type)
      values(candidate.user_id, candidate.pet_profile_id, 'symptom', candidate.normalized_key, initcap(replace(candidate.normalized_key, '_', ' ')),
        case when candidate.is_resolved then 'resolved' else 'active' end, 'urgent', candidate.sequence_number, v_prior_id,
        candidate.concern_id, candidate.started_at, candidate.last_event_at, case when candidate.is_resolved then candidate.last_event_at end,
        jsonb_build_object('eventCount', candidate.event_count, 'latestStatus', case when candidate.is_resolved then 'resolved' else 'active' end), 'compatibility_backfill')
      returning id into v_episode_id;
      v_created := true;
      update public.pet_care_entries as entry_row set episode_id = v_episode_id where entry_row.concern_id = candidate.concern_id
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
