create table if not exists public.pet_current_state (
  pet_profile_id uuid primary key references public.dog_profiles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  state_version bigint not null default 1 check (state_version > 0),
  state jsonb not null default '{}'::jsonb,
  active_episode_ids uuid[] not null default '{}',
  monitoring_episode_ids uuid[] not null default '{}',
  source_event_ids uuid[] not null default '{}',
  computed_at timestamptz not null default now(),
  valid_through timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, pet_profile_id)
);
create index if not exists pet_current_state_owner_idx on public.pet_current_state(user_id, updated_at desc);
alter table public.pet_current_state enable row level security;
create policy "Users can select their pet state" on public.pet_current_state for select using (auth.uid() = user_id);
create policy "Users can insert their pet state" on public.pet_current_state for insert with check (auth.uid() = user_id and exists (
  select 1 from public.dog_profiles where id = pet_profile_id and user_id = auth.uid()
));
create policy "Users can update their pet state" on public.pet_current_state for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.apply_care_event_to_pet_state()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_text text := coalesce(new.title, '') || ' ' || coalesce(new.note, '');
  v_previous public.pet_current_state%rowtype;
  v_state jsonb;
  v_active uuid[];
  v_monitoring uuid[];
  v_breathing_status text;
  v_overall text;
begin
  select * into v_previous from public.pet_current_state where pet_profile_id = new.pet_profile_id for update;
  v_state := coalesce(v_previous.state, '{}'::jsonb);
  if v_text ~* '(breath|breathing)' then
    v_breathing_status := case
      when new.state_action_type = 'resolve_concern' or v_text ~* '(returned to normal|back to normal|normal again|breathing is normal)' then 'normal'
      when new.state_action_type = 'reopen_concern' or new.severity in ('moderate', 'severe') or v_text ~* '(difficult|deep breaths?|trouble breathing|recurred|problem.*back)' then 'abnormal'
      else 'uncertain' end;
    v_state := jsonb_set(v_state, '{breathing}', jsonb_build_object(
      'status', v_breathing_status, 'confidence', coalesce(new.intelligence_confidence, 1),
      'lastObservedAt', new.occurred_at, 'sourceEventId', new.id
    ));
  end if;
  select coalesce(array_agg(id order by last_event_at), '{}') into v_active from public.pet_care_episodes
    where user_id = new.user_id and pet_profile_id = new.pet_profile_id and status = 'active';
  select coalesce(array_agg(id order by last_event_at), '{}') into v_monitoring from public.pet_care_episodes
    where user_id = new.user_id and pet_profile_id = new.pet_profile_id and status = 'monitoring';
  v_overall := case when v_breathing_status = 'abnormal' or cardinality(v_active) > 0 then 'urgent'
    when v_breathing_status = 'normal' and new.state_action_type = 'resolve_concern' then 'monitoring'
    else coalesce(v_state#>>'{wellbeing,overall}', 'uncertain') end;
  v_state := jsonb_set(jsonb_set(v_state, '{wellbeing}', jsonb_build_object('overall', v_overall)),
    '{lastMeaningfulUpdateAt}', to_jsonb(new.occurred_at));
  insert into public.pet_current_state(pet_profile_id, user_id, state_version, state, active_episode_ids,
    monitoring_episode_ids, source_event_ids, computed_at, updated_at)
  values(new.pet_profile_id, new.user_id, 1, v_state, v_active, v_monitoring, array[new.id], now(), now())
  on conflict (pet_profile_id) do update set
    state_version = public.pet_current_state.state_version + 1, state = excluded.state,
    active_episode_ids = excluded.active_episode_ids, monitoring_episode_ids = excluded.monitoring_episode_ids,
    source_event_ids = case when new.id = any(public.pet_current_state.source_event_ids) then public.pet_current_state.source_event_ids
      else public.pet_current_state.source_event_ids || new.id end,
    computed_at = now(), updated_at = now();
  return new;
end;
$$;
drop trigger if exists pet_care_entries_apply_current_state on public.pet_care_entries;
create trigger pet_care_entries_apply_current_state after insert on public.pet_care_entries for each row execute function public.apply_care_event_to_pet_state();
revoke all on function public.apply_care_event_to_pet_state() from public, anon, authenticated;

create or replace function public.recompute_pet_current_state(p_pet_id uuid, p_dry_run boolean default true)
returns table(pet_id uuid, previous_version bigint, computed_state jsonb, active_episode_ids uuid[], monitoring_episode_ids uuid[], source_event_ids uuid[], action text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_owner uuid; v_previous public.pet_current_state%rowtype; v_latest record; v_state jsonb := '{}'::jsonb;
  v_active uuid[]; v_monitoring uuid[]; v_sources uuid[]; v_status text; v_overall text;
begin
  if auth.role() <> 'service_role' and current_user not in ('postgres', 'supabase_admin') then
    raise exception using errcode = '42501', message = 'PET_STATE_RECOMPUTE_FORBIDDEN';
  end if;
  select user_id into v_owner from public.dog_profiles where id = p_pet_id;
  if v_owner is null then raise exception using errcode = 'P0002', message = 'PET_NOT_FOUND'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_owner::text || ':' || p_pet_id::text || ':pet-state', 0));
  select * into v_previous from public.pet_current_state where pet_profile_id = p_pet_id for update;
  select entry_row.id, entry_row.occurred_at, entry_row.state_action_type, entry_row.intelligence_confidence,
    entry_row.severity, coalesce(entry_row.title, '') || ' ' || entry_row.note as event_text
  into v_latest from public.pet_care_entries as entry_row where entry_row.user_id = v_owner and entry_row.pet_profile_id = p_pet_id
    and (coalesce(entry_row.title, '') || ' ' || entry_row.note) ~* '(breath|breathing)'
  order by entry_row.occurred_at desc, entry_row.created_at desc limit 1;
  if v_latest.id is not null then
    v_status := case when v_latest.state_action_type = 'resolve_concern' or v_latest.event_text ~* '(returned to normal|back to normal|normal again|breathing is normal)' then 'normal'
      when v_latest.state_action_type = 'reopen_concern' or v_latest.severity in ('moderate', 'severe') or v_latest.event_text ~* '(difficult|deep breaths?|trouble breathing|recurred|problem.*back)' then 'abnormal' else 'uncertain' end;
    v_state := jsonb_build_object('breathing', jsonb_build_object('status', v_status, 'confidence', coalesce(v_latest.intelligence_confidence, 1),
      'lastObservedAt', v_latest.occurred_at, 'sourceEventId', v_latest.id), 'lastMeaningfulUpdateAt', v_latest.occurred_at);
  end if;
  select coalesce(array_agg(id order by last_event_at), '{}') into v_active from public.pet_care_episodes where user_id = v_owner and pet_profile_id = p_pet_id and status = 'active';
  select coalesce(array_agg(id order by last_event_at), '{}') into v_monitoring from public.pet_care_episodes where user_id = v_owner and pet_profile_id = p_pet_id and status = 'monitoring';
  select coalesce(array_agg(id order by occurred_at), '{}') into v_sources from public.pet_care_entries where user_id = v_owner and pet_profile_id = p_pet_id;
  v_overall := case when v_status = 'abnormal' or cardinality(v_active) > 0 then 'urgent' when v_status = 'normal' then 'monitoring' else 'uncertain' end;
  v_state := jsonb_set(v_state, '{wellbeing}', jsonb_build_object('overall', v_overall));
  if not p_dry_run then
    insert into public.pet_current_state(pet_profile_id,user_id,state_version,state,active_episode_ids,monitoring_episode_ids,source_event_ids,computed_at,updated_at)
    values(p_pet_id,v_owner,coalesce(v_previous.state_version,0)+1,v_state,v_active,v_monitoring,v_sources,now(),now())
    on conflict(pet_profile_id) do update set state_version=public.pet_current_state.state_version+1,state=excluded.state,
      active_episode_ids=excluded.active_episode_ids,monitoring_episode_ids=excluded.monitoring_episode_ids,source_event_ids=excluded.source_event_ids,computed_at=now(),updated_at=now();
  end if;
  return query select p_pet_id, coalesce(v_previous.state_version,0), v_state, v_active, v_monitoring, v_sources,
    case when p_dry_run then 'would_recompute' else 'recomputed' end;
end;
$$;
revoke all on function public.recompute_pet_current_state(uuid, boolean) from public, anon, authenticated;
grant execute on function public.recompute_pet_current_state(uuid, boolean) to service_role;
