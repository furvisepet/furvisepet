-- Repair stale care-entry references without changing History or unrelated state.
do $$
declare
  v_dangling_before bigint;
  v_dangling_after bigint;
  v_rows_repaired bigint;
begin
  select count(*) into v_dangling_before
  from public.pet_current_state as state_row
  cross join lateral unnest(state_row.source_event_ids) as linked(source_event_id)
  where not exists (
    select 1 from public.pet_care_entries as entry_row
    where entry_row.id = linked.source_event_id
      and entry_row.user_id = state_row.user_id
      and entry_row.pet_profile_id = state_row.pet_profile_id
  );

  with repaired as (
    select
      state_row.pet_profile_id,
      coalesce(
        array_agg(linked.source_event_id order by linked.ordinality)
          filter (where entry_row.id is not null),
        '{}'::uuid[]
      ) as valid_source_event_ids,
      count(*) filter (where entry_row.id is null) as dangling_count
    from public.pet_current_state as state_row
    cross join lateral unnest(state_row.source_event_ids) with ordinality
      as linked(source_event_id, ordinality)
    left join public.pet_care_entries as entry_row
      on entry_row.id = linked.source_event_id
      and entry_row.user_id = state_row.user_id
      and entry_row.pet_profile_id = state_row.pet_profile_id
    group by state_row.pet_profile_id
  )
  update public.pet_current_state as state_row
  set source_event_ids = repaired.valid_source_event_ids,
      state_version = state_row.state_version + 1,
      computed_at = now(),
      updated_at = now()
  from repaired
  where state_row.pet_profile_id = repaired.pet_profile_id
    and repaired.dangling_count > 0;
  get diagnostics v_rows_repaired = row_count;

  select count(*) into v_dangling_after
  from public.pet_current_state as state_row
  cross join lateral unnest(state_row.source_event_ids) as linked(source_event_id)
  where not exists (
    select 1 from public.pet_care_entries as entry_row
    where entry_row.id = linked.source_event_id
      and entry_row.user_id = state_row.user_id
      and entry_row.pet_profile_id = state_row.pet_profile_id
  );

  if v_dangling_after <> 0 then
    raise exception using errcode = '23514', message = 'PET_STATE_SOURCE_REPAIR_INCOMPLETE';
  end if;
  raise notice 'pet_current_state source repair: dangling_before=%, rows_repaired=%, dangling_after=%',
    v_dangling_before, v_rows_repaired, v_dangling_after;
end;
$$;

-- A user-owned History deletion must remove only that exact state reference.
create or replace function public.prune_deleted_care_event_from_pet_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.pet_current_state as state_row
  set source_event_ids = array(
        select linked.source_event_id
        from unnest(state_row.source_event_ids) with ordinality
          as linked(source_event_id, ordinality)
        where linked.source_event_id <> old.id
        order by linked.ordinality
      ),
      state_version = state_row.state_version + 1,
      computed_at = now(),
      updated_at = now()
  where state_row.pet_profile_id = old.pet_profile_id
    and state_row.user_id = old.user_id
    and old.id = any(state_row.source_event_ids);
  return old;
end;
$$;

revoke all on function public.prune_deleted_care_event_from_pet_state() from public, anon, authenticated, service_role;

drop trigger if exists pet_care_entries_prune_current_state_after_delete on public.pet_care_entries;
create trigger pet_care_entries_prune_current_state_after_delete
after delete on public.pet_care_entries
for each row execute function public.prune_deleted_care_event_from_pet_state();

-- Trusted care-event application defensively retains only existing same-tenant
-- sources before appending the new event. The strict ownership trigger remains
-- responsible for rejecting arbitrary cross-user or cross-pet state writes.
create or replace function public.apply_care_event_to_pet_state()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_text text := coalesce(new.title, '') || ' ' || coalesce(new.note, '');
  v_previous public.pet_current_state%rowtype;
  v_state jsonb;
  v_active uuid[];
  v_monitoring uuid[];
  v_sources uuid[];
  v_breathing_status text;
  v_overall text;
  v_active_safety boolean;
begin
  select * into v_previous
  from public.pet_current_state
  where pet_profile_id = new.pet_profile_id
  for update;

  v_state := coalesce(v_previous.state, '{}'::jsonb);
  if v_text ~* '(breath|breathing)' then
    v_breathing_status := case
      when new.state_action_type = 'resolve_concern'
        or v_text ~* '(returned to normal|back to normal|normal again|breathing is normal)' then 'normal'
      when new.state_action_type = 'reopen_concern'
        or new.severity in ('moderate', 'severe')
        or v_text ~* '(difficult|deep breaths?|trouble breathing|recurred|problem.*back)' then 'abnormal'
      else 'uncertain'
    end;
    v_state := jsonb_set(v_state, '{breathing}', jsonb_build_object(
      'status', v_breathing_status,
      'confidence', coalesce(new.intelligence_confidence, 1),
      'lastObservedAt', new.occurred_at,
      'sourceEventId', new.id
    ));
  else
    v_breathing_status := v_state#>>'{breathing,status}';
  end if;

  select coalesce(array_agg(id order by last_event_at), '{}') into v_active
  from public.pet_care_episodes
  where user_id = new.user_id and pet_profile_id = new.pet_profile_id and status = 'active';
  select coalesce(array_agg(id order by last_event_at), '{}') into v_monitoring
  from public.pet_care_episodes
  where user_id = new.user_id and pet_profile_id = new.pet_profile_id and status = 'monitoring';
  select exists (
    select 1 from public.pet_care_episodes
    where user_id = new.user_id and pet_profile_id = new.pet_profile_id
      and status = 'active' and episode_type = 'symptom'
  ) into v_active_safety;

  select coalesce(array_agg(linked.source_event_id order by linked.ordinality), '{}') into v_sources
  from unnest(coalesce(v_previous.source_event_ids, '{}'::uuid[])) with ordinality
    as linked(source_event_id, ordinality)
  where exists (
    select 1 from public.pet_care_entries as entry_row
    where entry_row.id = linked.source_event_id
      and entry_row.user_id = new.user_id
      and entry_row.pet_profile_id = new.pet_profile_id
  );
  if not new.id = any(v_sources) then
    v_sources := array_append(v_sources, new.id);
  end if;

  v_overall := case
    when v_breathing_status = 'abnormal' or v_active_safety then 'urgent'
    when v_breathing_status = 'normal' then 'monitoring'
    else coalesce(v_state#>>'{wellbeing,overall}', 'uncertain')
  end;
  v_state := jsonb_set(
    jsonb_set(v_state, '{wellbeing}', jsonb_build_object('overall', v_overall)),
    '{lastMeaningfulUpdateAt}',
    to_jsonb(new.occurred_at)
  );

  insert into public.pet_current_state(
    pet_profile_id, user_id, state_version, state, active_episode_ids,
    monitoring_episode_ids, source_event_ids, computed_at, updated_at
  ) values (
    new.pet_profile_id, new.user_id, 1, v_state, v_active,
    v_monitoring, v_sources, now(), now()
  )
  on conflict(pet_profile_id) do update set
    state_version = public.pet_current_state.state_version + 1,
    state = excluded.state,
    active_episode_ids = excluded.active_episode_ids,
    monitoring_episode_ids = excluded.monitoring_episode_ids,
    source_event_ids = excluded.source_event_ids,
    computed_at = now(),
    updated_at = now();
  return new;
end;
$$;

revoke all on function public.apply_care_event_to_pet_state() from public, anon, authenticated, service_role;

-- The server uses the authenticated user's RLS-bound client to reconcile only
-- assistant response and care-persistence JSON after the atomic care write.
drop policy if exists "ask_conversation_messages_update_own_reconciliation" on public.ask_conversation_messages;
create policy "ask_conversation_messages_update_own_reconciliation"
on public.ask_conversation_messages
for update
using (
  user_id = auth.uid()
  and role = 'furvise'
  and exists (
    select 1 from public.ask_conversations as conversation_row
    where conversation_row.id = ask_conversation_messages.conversation_id
      and conversation_row.user_id = auth.uid()
  )
)
with check (
  user_id = auth.uid()
  and role = 'furvise'
  and exists (
    select 1 from public.ask_conversations as conversation_row
    where conversation_row.id = ask_conversation_messages.conversation_id
      and conversation_row.user_id = auth.uid()
  )
);

revoke update on table public.ask_conversation_messages from authenticated;
grant update (care_persistence, response_data) on public.ask_conversation_messages to authenticated;
