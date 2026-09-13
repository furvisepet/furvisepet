-- History removal is presentation-only unless the owner explicitly asks Furvise
-- to stop tracking the associated lifecycle. Dismissal is non-clinical and keeps
-- the immutable event-to-episode provenance graph intact.

alter table public.pet_care_episodes drop constraint if exists pet_care_episodes_status_check;
alter table public.pet_care_episodes
  add constraint pet_care_episodes_status_check
  check (status in ('active', 'monitoring', 'resolved', 'dismissed', 'superseded', 'archived')),
  add column if not exists dismissed_at timestamptz,
  add column if not exists dismissal_reason text;

alter table public.pet_concerns drop constraint if exists pet_concerns_status_check;
alter table public.pet_concerns
  add constraint pet_concerns_status_check
  check (status in ('active', 'monitoring', 'resolved', 'reopened', 'dismissed')),
  add column if not exists dismissed_at timestamptz,
  add column if not exists dismissal_reason text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'pet_care_episodes_dismissal_consistency') then
    alter table public.pet_care_episodes add constraint pet_care_episodes_dismissal_consistency check (
      (status = 'dismissed' and dismissed_at is not null and dismissal_reason = 'user_removed' and resolved_at is null)
      or (status <> 'dismissed' and dismissed_at is null and dismissal_reason is null)
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pet_concerns_dismissal_consistency') then
    alter table public.pet_concerns add constraint pet_concerns_dismissal_consistency check (
      (status = 'dismissed' and dismissed_at is not null and dismissal_reason = 'user_removed' and resolved_at is null)
      or (status <> 'dismissed' and dismissed_at is null and dismissal_reason is null)
    );
  end if;
end $$;

create or replace function public.preserve_dismissed_episode_terminal_state()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'dismissed' then
    new.status := 'dismissed';
    new.dismissed_at := old.dismissed_at;
    new.dismissal_reason := old.dismissal_reason;
    new.resolved_at := null;
    new.summary := jsonb_set(coalesce(new.summary, '{}'::jsonb), '{latestStatus}', '"dismissed"'::jsonb, true);
  end if;
  return new;
end;
$$;
revoke all on function public.preserve_dismissed_episode_terminal_state() from public, anon, authenticated;
drop trigger if exists pet_care_episodes_preserve_dismissal on public.pet_care_episodes;
create trigger pet_care_episodes_preserve_dismissal
before update on public.pet_care_episodes for each row
execute function public.preserve_dismissed_episode_terminal_state();

create or replace function public.preserve_dismissed_concern_terminal_state()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'dismissed' then
    new.status := 'dismissed';
    new.dismissed_at := old.dismissed_at;
    new.dismissal_reason := old.dismissal_reason;
    new.resolved_at := null;
    new.active_episode_id := null;
  end if;
  return new;
end;
$$;
revoke all on function public.preserve_dismissed_concern_terminal_state() from public, anon, authenticated;
drop trigger if exists pet_concerns_preserve_dismissal on public.pet_concerns;
create trigger pet_concerns_preserve_dismissal
before update on public.pet_concerns for each row
execute function public.preserve_dismissed_concern_terminal_state();

-- Any current-state writer, including a later repair or rebuild, must exclude
-- dismissed lifecycle projections while leaving pet_care_episode_events intact.
create or replace function public.sanitize_dismissed_pet_current_state()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_dismissed_episode_ids uuid[];
  v_dismissed_event_ids uuid[];
  v_semantic jsonb;
  v_medications jsonb;
  v_state jsonb;
begin
  select coalesce(array_agg(ep.id), '{}') into v_dismissed_episode_ids
  from public.pet_care_episodes ep
  where ep.user_id = new.user_id and ep.pet_profile_id = new.pet_profile_id and ep.status = 'dismissed';

  select coalesce(array_agg(m.care_entry_id), '{}') into v_dismissed_event_ids
  from public.pet_care_episode_events m
  where m.user_id = new.user_id and m.pet_profile_id = new.pet_profile_id
    and m.episode_id = any(v_dismissed_episode_ids);

  new.active_episode_ids := coalesce((select array_agg(kept.id order by kept.id)
    from unnest(new.active_episode_ids) as kept(id) where not kept.id = any(v_dismissed_episode_ids)), '{}');
  new.monitoring_episode_ids := coalesce((select array_agg(kept.id order by kept.id)
    from unnest(new.monitoring_episode_ids) as kept(id) where not kept.id = any(v_dismissed_episode_ids)), '{}');
  new.source_event_ids := coalesce((select array_agg(kept.id order by kept.id)
    from unnest(new.source_event_ids) as kept(id) where not kept.id = any(v_dismissed_event_ids)), '{}');

  select coalesce(jsonb_object_agg(item.key, item.value), '{}'::jsonb) into v_semantic
  from jsonb_each(coalesce(new.state->'semanticStates', '{}'::jsonb)) item
  where coalesce(item.value->>'episodeId', '') <> all(
    select dismissed_id::text from unnest(v_dismissed_episode_ids) dismissed_id
  ) and coalesce(item.value->>'sourceEventId', '') <> all(
    select dismissed_id::text from unnest(v_dismissed_event_ids) dismissed_id
  );

  select coalesce(jsonb_agg(item.value), '[]'::jsonb) into v_medications
  from jsonb_array_elements(coalesce(new.state->'currentMedications', '[]'::jsonb)) item(value)
  where coalesce(item.value->>'sourceEventId', '') <> all(
    select dismissed_id::text from unnest(v_dismissed_event_ids) dismissed_id
  );

  select coalesce(jsonb_object_agg(item.key, item.value), '{}'::jsonb) into v_state
  from jsonb_each(coalesce(new.state, '{}'::jsonb)) item
  where item.key in ('semanticStates', 'currentMedications')
    or coalesce(item.value->>'sourceEventId', '') = ''
    or coalesce(item.value->>'sourceEventId', '') <> all(
      select dismissed_id::text from unnest(v_dismissed_event_ids) dismissed_id
    );
  new.state := jsonb_set(jsonb_set(v_state, '{semanticStates}', v_semantic, true), '{currentMedications}', v_medications, true);
  return new;
end;
$$;
revoke all on function public.sanitize_dismissed_pet_current_state() from public, anon, authenticated;
drop trigger if exists pet_current_state_sanitize_dismissed on public.pet_current_state;
create trigger pet_current_state_sanitize_dismissed
before insert or update on public.pet_current_state for each row
execute function public.sanitize_dismissed_pet_current_state();

create or replace function public.get_my_care_entry_removal_impact(p_entry_id uuid)
returns table(
  lifecycle_still_active boolean,
  active_episode_id uuid,
  active_concern_exists boolean
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_entry public.pet_care_entries%rowtype;
begin
  if v_user is null then raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED'; end if;
  select * into v_entry from public.pet_care_entries
  where id = p_entry_id and user_id = v_user;
  if v_entry.id is null then raise exception using errcode = 'P0002', message = 'CARE_ENTRY_NOT_FOUND'; end if;

  select ep.id into active_episode_id from public.pet_care_episodes ep
  where ep.id = v_entry.episode_id and ep.user_id = v_user and ep.pet_profile_id = v_entry.pet_profile_id
    and ep.status in ('active', 'monitoring');
  lifecycle_still_active := active_episode_id is not null;
  active_concern_exists := lifecycle_still_active and exists (
    select 1 from public.pet_concerns c
    where c.user_id = v_user and c.pet_profile_id = v_entry.pet_profile_id
      and c.status in ('active', 'monitoring', 'reopened')
      and (c.lifecycle_episode_id = active_episode_id or c.active_episode_id = active_episode_id
        or c.id = v_entry.concern_id)
  );
  return next;
end;
$$;
revoke all on function public.get_my_care_entry_removal_impact(uuid) from public, anon;
grant execute on function public.get_my_care_entry_removal_impact(uuid) to authenticated;

create or replace function public.remove_my_care_entry(
  p_entry_id uuid,
  p_stop_tracking boolean default false
)
returns table(
  entry_id uuid,
  tombstoned_at timestamptz,
  already_tombstoned boolean,
  lifecycle_still_active boolean,
  active_episode_id uuid,
  active_concern_exists boolean,
  lifecycle_dismissed boolean
)
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_entry public.pet_care_entries%rowtype;
  v_episode public.pet_care_episodes%rowtype;
  v_was_active boolean := false;
  v_remaining_active boolean;
  v_remaining_urgent boolean;
begin
  if v_user is null then raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED'; end if;
  select * into v_entry from public.pet_care_entries
  where id = p_entry_id and user_id = v_user for update;
  if v_entry.id is null then raise exception using errcode = 'P0002', message = 'CARE_ENTRY_NOT_FOUND'; end if;

  entry_id := v_entry.id;
  already_tombstoned := v_entry.deleted_at is not null;
  if not already_tombstoned then
    update public.pet_care_entries set deleted_at = now(), deleted_by = v_user,
      deletion_reason = 'user_removed', updated_at = now()
    where id = v_entry.id returning deleted_at into v_entry.deleted_at;
  end if;
  tombstoned_at := v_entry.deleted_at;

  if v_entry.episode_id is not null then
    select * into v_episode from public.pet_care_episodes ep
    where ep.id = v_entry.episode_id and ep.user_id = v_user and ep.pet_profile_id = v_entry.pet_profile_id
    for update;
  end if;
  v_was_active := v_episode.status in ('active', 'monitoring');

  if p_stop_tracking and (v_was_active or v_episode.status = 'dismissed') then
    if v_was_active then
      update public.pet_care_episodes set status = 'dismissed', dismissed_at = now(),
        dismissal_reason = 'user_removed', resolved_at = null, updated_at = now(),
        summary = jsonb_set(coalesce(summary, '{}'::jsonb), '{latestStatus}', '"dismissed"'::jsonb, true)
      where id = v_episode.id;

    end if;
    update public.pet_concerns c set status = 'dismissed', dismissed_at = coalesce(c.dismissed_at, now()),
      dismissal_reason = 'user_removed', active_episode_id = null, resolved_at = null,
      resolution_note = null, updated_at = now()
    where c.user_id = v_user and c.pet_profile_id = v_entry.pet_profile_id
      and c.status in ('active', 'monitoring', 'reopened', 'dismissed')
      and (c.lifecycle_episode_id = v_episode.id or c.active_episode_id = v_episode.id
        or (c.id = v_entry.concern_id and c.identity_provenance = 'canonical_episode'));
    lifecycle_dismissed := true;
  else
    lifecycle_dismissed := false;
  end if;

  select exists(select 1 from public.pet_care_episodes ep where ep.user_id = v_user
    and ep.pet_profile_id = v_entry.pet_profile_id and ep.status in ('active', 'monitoring')),
    exists(select 1 from public.pet_care_episodes ep where ep.user_id = v_user
      and ep.pet_profile_id = v_entry.pet_profile_id and ep.status = 'active'
      and (ep.episode_type = 'symptom' or ep.severity = 'urgent'))
  into v_remaining_active, v_remaining_urgent;

  if p_stop_tracking and lifecycle_dismissed then
    update public.pet_current_state pcs set
      active_episode_ids = array_remove(pcs.active_episode_ids, v_episode.id),
      monitoring_episode_ids = array_remove(pcs.monitoring_episode_ids, v_episode.id),
      state = jsonb_set(coalesce(pcs.state, '{}'::jsonb), '{wellbeing}', jsonb_build_object(
        'overall', case when v_remaining_urgent then 'urgent' when v_remaining_active then 'monitoring' else 'uncertain' end
      ), true),
      state_version = pcs.state_version + 1, computed_at = now(), updated_at = now()
    where pcs.pet_profile_id = v_entry.pet_profile_id and pcs.user_id = v_user;
  end if;

  if v_episode.status = 'dismissed' or (p_stop_tracking and lifecycle_dismissed) then
    active_episode_id := null;
    lifecycle_still_active := false;
  elsif v_was_active then
    active_episode_id := v_episode.id;
    lifecycle_still_active := true;
  else
    active_episode_id := null;
    lifecycle_still_active := false;
  end if;
  active_concern_exists := exists (
    select 1 from public.pet_concerns c where c.user_id = v_user and c.pet_profile_id = v_entry.pet_profile_id
      and c.status in ('active', 'monitoring', 'reopened')
      and v_episode.id is not null
      and (c.lifecycle_episode_id = v_episode.id or c.active_episode_id = v_episode.id or c.id = v_entry.concern_id)
  );
  return next;
end;
$$;
revoke all on function public.remove_my_care_entry(uuid, boolean) from public, anon;
grant execute on function public.remove_my_care_entry(uuid, boolean) to authenticated;

-- Full privacy erasure intentionally remains out of scope. It requires a separate
-- explicit contract covering History content, episode membership/projections,
-- current state, concerns, memories, conversation content/provenance, and stored
-- context metadata. Neither RPC above performs privacy erasure.
