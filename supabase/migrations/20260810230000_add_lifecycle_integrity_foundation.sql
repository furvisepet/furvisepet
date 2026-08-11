-- Canonical lifecycle membership, non-destructive History removal, and rebuildable projections.
-- Compatibility JSON remains available, but pet_care_episode_events is authoritative.

alter table public.pet_care_entries
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null,
  add column if not exists deletion_reason text;

alter table public.pet_care_episodes
  alter column started_at drop not null,
  add column if not exists opening_provenance text not null default 'legacy_unknown',
  add column if not exists missing_source_event_ids uuid[] not null default '{}';

alter table public.pet_concerns
  add column if not exists canonical_concept_key text,
  add column if not exists lifecycle_episode_id uuid references public.pet_care_episodes(id) on delete set null,
  add column if not exists identity_provenance text not null default 'legacy_unverified';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'pet_care_entries_tombstone_consistency') then
    alter table public.pet_care_entries add constraint pet_care_entries_tombstone_consistency check (
      (deleted_at is null and deleted_by is null and deletion_reason is null)
      or (deleted_at is not null and deletion_reason is not null and btrim(deletion_reason) <> '')
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pet_care_episodes_opening_provenance_check') then
    alter table public.pet_care_episodes add constraint pet_care_episodes_opening_provenance_check check (
      opening_provenance in ('observed_opening', 'resolution_without_observed_opening', 'legacy_unknown')
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pet_concerns_identity_provenance_check') then
    alter table public.pet_concerns add constraint pet_concerns_identity_provenance_check check (
      identity_provenance in ('canonical_episode', 'legacy_exact', 'legacy_unverified')
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pet_care_episodes_tenant_identity_key') then
    alter table public.pet_care_episodes add constraint pet_care_episodes_tenant_identity_key unique (id, user_id, pet_profile_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pet_care_entries_tenant_identity_key') then
    alter table public.pet_care_entries add constraint pet_care_entries_tenant_identity_key unique (id, user_id, pet_profile_id);
  end if;
end $$;

create table if not exists public.pet_care_episode_events (
  care_entry_id uuid primary key,
  episode_id uuid not null,
  user_id uuid not null,
  pet_profile_id uuid not null,
  event_ordinal bigint not null check (event_ordinal > 0),
  event_role text not null check (event_role in (
    'opening', 'continuation', 'worsening', 'improvement', 'resolution', 'recurrence', 'correction', 'unknown_legacy'
  )),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint pet_care_episode_events_episode_tenant_fk
    foreign key (episode_id, user_id, pet_profile_id)
    references public.pet_care_episodes(id, user_id, pet_profile_id) on delete cascade,
  constraint pet_care_episode_events_entry_tenant_fk
    foreign key (care_entry_id, user_id, pet_profile_id)
    references public.pet_care_entries(id, user_id, pet_profile_id) on delete cascade,
  unique (episode_id, event_ordinal)
);

create index if not exists pet_care_entries_visible_pet_time_idx
  on public.pet_care_entries(user_id, pet_profile_id, occurred_at desc) where deleted_at is null;
create index if not exists pet_care_episode_events_episode_time_idx
  on public.pet_care_episode_events(episode_id, occurred_at, care_entry_id);
create index if not exists pet_care_episode_events_owner_pet_idx
  on public.pet_care_episode_events(user_id, pet_profile_id, occurred_at desc);
create unique index if not exists pet_concerns_one_live_per_canonical_episode_idx
  on public.pet_concerns(user_id, pet_profile_id, canonical_concept_key, lifecycle_episode_id)
  where lifecycle_episode_id is not null and canonical_concept_key is not null
    and status in ('active', 'monitoring', 'reopened');

alter table public.pet_care_episode_events enable row level security;
alter table public.pet_care_episode_events force row level security;
drop policy if exists "Users can select their episode events" on public.pet_care_episode_events;
create policy "Users can select their episode events" on public.pet_care_episode_events
  for select using (user_id = auth.uid());
revoke all on public.pet_care_episode_events from public, anon, authenticated;
grant select on public.pet_care_episode_events to authenticated;

-- Ordinary authenticated removal now goes through tombstone_my_care_entry().
drop policy if exists "Users can delete their care entries" on public.pet_care_entries;
revoke delete on public.pet_care_entries from authenticated;

create or replace function public.lifecycle_event_role(
  p_state_action_type text,
  p_metadata jsonb,
  p_is_first boolean
) returns text
language sql immutable set search_path = '' as $$
  select case
    when lower(coalesce(p_metadata->>'semanticTransition', '')) in ('resolved', 'resolution')
      or p_state_action_type in ('resolve_concern', 'semantic_resolved') then 'resolution'
    when lower(coalesce(p_metadata->>'semanticTransition', '')) in ('improved', 'improvement')
      or p_state_action_type = 'semantic_improved' then 'improvement'
    when lower(coalesce(p_metadata->>'semanticTransition', '')) in ('worsened', 'worsening')
      or p_state_action_type = 'semantic_worsened' then 'worsening'
    when lower(coalesce(p_metadata->>'semanticTransition', '')) in ('recurred', 'recurrence', 'reopened')
      or p_state_action_type in ('reopen_concern', 'semantic_recurred') then 'recurrence'
    when lower(coalesce(p_metadata->>'semanticTransition', '')) in ('corrected', 'correction')
      or p_state_action_type = 'semantic_corrected' then 'correction'
    when lower(coalesce(p_metadata->>'semanticTransition', '')) in ('continued', 'continuation')
      or p_state_action_type = 'semantic_continued' then 'continuation'
    when lower(coalesce(p_metadata->>'semanticTransition', '')) in ('started', 'observed', 'new', 'changed')
      or p_state_action_type in ('semantic_started', 'semantic_changed') then case when p_is_first then 'opening' else 'continuation' end
    when p_is_first and p_state_action_type is distinct from 'resolve_concern' then 'opening'
    else 'unknown_legacy'
  end
$$;
revoke all on function public.lifecycle_event_role(text, jsonb, boolean) from public, anon, authenticated;

create or replace function public.canonical_episode_concept(p_episode_id uuid)
returns text
language sql stable security definer set search_path = '' as $$
  select nullif(regexp_replace(lower(coalesce(
    nullif(e.summary->>'semanticDomain', '') || '_' || nullif(e.summary->>'semanticTopic', ''),
    nullif(e.normalized_key, '')
  )), '[^a-z0-9_]+', '_', 'g'), '')
  from public.pet_care_episodes e where e.id = p_episode_id
$$;
revoke all on function public.canonical_episode_concept(uuid) from public, anon, authenticated;

-- Concern creation may still use deterministic safety floors, but identity comes only
-- from the assigned canonical episode and never from the mutable presentation title.
create or replace function public.sync_pet_concern_from_care_entry()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_text text := coalesce(new.title, '') || ' ' || coalesce(new.note, '');
  v_concerning boolean;
  v_concept text;
  v_severity text;
  v_existing public.pet_concerns%rowtype;
begin
  if new.state_action_type = 'resolve_concern' then return new; end if;
  v_concerning := new.state_action_type = 'reopen_concern'
    or (new.category = 'symptom' and new.severity in ('moderate', 'severe'))
    or v_text ~* '(trouble breathing|short(ness|age) of breath|labored breathing|open.?mouth breathing|collapse|seizure|severe bleeding|cannot urinate|inability to urinate|toxin|extreme lethargy|repeated vomiting)';
  if not v_concerning or new.episode_id is null then return new; end if;
  v_concept := public.canonical_episode_concept(new.episode_id);
  if v_concept is null then return new; end if;
  v_severity := case when new.severity = 'severe' or v_text ~* '(trouble breathing|short(ness|age) of breath|labored breathing|open.?mouth breathing|collapse|seizure|severe bleeding|cannot urinate|inability to urinate|toxin)'
    then 'urgent' else 'important' end;

  select c.* into v_existing from public.pet_concerns c
  where c.user_id = new.user_id and c.pet_profile_id = new.pet_profile_id
    and c.canonical_concept_key = v_concept and c.lifecycle_episode_id = new.episode_id
  order by c.updated_at desc limit 1 for update;
  if v_existing.id is null then
    insert into public.pet_concerns(user_id, pet_profile_id, title, normalized_key, status, severity,
      source_care_entry_id, opened_at, updated_at, canonical_concept_key, lifecycle_episode_id,
      identity_provenance, active_episode_id)
    values(new.user_id, new.pet_profile_id, coalesce(nullif(btrim(new.title), ''), 'Care concern'),
      v_concept, 'active', v_severity, new.id, new.occurred_at, now(), v_concept,
      new.episode_id, 'canonical_episode', new.episode_id) returning * into v_existing;
  elsif v_existing.status = 'resolved' then
    update public.pet_concerns set status = 'reopened', severity = v_severity,
      source_care_entry_id = new.id, opened_at = new.occurred_at, reopened_at = new.occurred_at,
      updated_at = now(), resolved_at = null, resolution_note = null, active_episode_id = new.episode_id
    where id = v_existing.id returning * into v_existing;
  else
    update public.pet_concerns set status = case when status = 'monitoring' then 'monitoring' else 'active' end,
      severity = case when v_severity = 'urgent' then 'urgent' else severity end,
      source_care_entry_id = new.id, active_episode_id = new.episode_id, updated_at = now()
    where id = v_existing.id returning * into v_existing;
  end if;
  update public.pet_care_episodes set linked_concern_id = v_existing.id, updated_at = now()
    where id = new.episode_id and user_id = new.user_id and pet_profile_id = new.pet_profile_id;
  update public.pet_care_entries set concern_id = v_existing.id where id = new.id
    and user_id = new.user_id and pet_profile_id = new.pet_profile_id;
  return new;
end;
$$;
revoke all on function public.sync_pet_concern_from_care_entry() from public, anon, authenticated;

create or replace function public.rebuild_pet_care_episode(p_episode_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_episode public.pet_care_episodes%rowtype;
  v_count integer;
  v_ids jsonb;
  v_first timestamptz;
  v_last timestamptz;
  v_latest_role text;
  v_has_opening boolean;
  v_status text;
begin
  select * into v_episode from public.pet_care_episodes where id = p_episode_id for update;
  if v_episode.id is null then return; end if;

  select count(*)::integer,
    coalesce(jsonb_agg(m.care_entry_id order by m.occurred_at, m.event_ordinal, m.care_entry_id), '[]'::jsonb),
    min(m.occurred_at) filter (where m.event_role in ('opening', 'recurrence')),
    max(m.occurred_at),
    coalesce(bool_or(m.event_role in ('opening', 'recurrence')), false)
  into v_count, v_ids, v_first, v_last, v_has_opening
  from public.pet_care_episode_events m where m.episode_id = p_episode_id;

  select m.event_role into v_latest_role from public.pet_care_episode_events m
  where m.episode_id = p_episode_id order by m.occurred_at desc, m.event_ordinal desc, m.care_entry_id desc limit 1;

  v_status := case
    when v_latest_role = 'resolution' then 'resolved'
    when v_latest_role = 'improvement' then 'monitoring'
    when v_latest_role in ('opening', 'continuation', 'worsening', 'recurrence') then 'active'
    else v_episode.status
  end;

  update public.pet_care_episodes set
    opening_provenance = case
      when v_has_opening then 'observed_opening'
      when v_count > 0 and v_latest_role = 'resolution' then 'resolution_without_observed_opening'
      else opening_provenance
    end,
    started_at = case
      when v_has_opening then v_first
      when v_count > 0 and v_latest_role = 'resolution' then null
      else started_at
    end,
    last_event_at = coalesce(v_last, last_event_at),
    status = v_status,
    resolved_at = case when v_status = 'resolved' then v_last else null end,
    summary = (coalesce(summary, '{}'::jsonb) - 'eventCount' - 'sourceRecordIds' - 'latestStatus' - 'firstEventAt' - 'lastEventAt')
      || jsonb_build_object(
        'eventCount', v_count,
        'sourceRecordIds', v_ids,
        'latestStatus', v_status,
        'firstEventAt', v_first,
        'lastEventAt', v_last,
        'missingSourceRecordIds', to_jsonb(missing_source_event_ids)
      ),
    updated_at = now()
  where id = p_episode_id;
end;
$$;
revoke all on function public.rebuild_pet_care_episode(uuid) from public, anon, authenticated;
grant execute on function public.rebuild_pet_care_episode(uuid) to service_role;

create or replace function public.record_pet_care_episode_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_ordinal bigint;
  v_is_first boolean;
  v_role text;
begin
  if tg_op = 'UPDATE' and old.episode_id is distinct from new.episode_id then
    delete from public.pet_care_episode_events where care_entry_id = new.id;
    if old.episode_id is not null then perform public.rebuild_pet_care_episode(old.episode_id); end if;
  elsif tg_op = 'UPDATE' then
    return new;
  end if;
  if new.episode_id is null then return new; end if;
  perform 1 from public.pet_care_episodes where id = new.episode_id and user_id = new.user_id
    and pet_profile_id = new.pet_profile_id for update;
  if not found then
    raise exception using errcode = '23503', message = 'EPISODE_EVENT_TENANT_MISMATCH';
  end if;
  select not exists(select 1 from public.pet_care_episode_events where episode_id = new.episode_id),
    coalesce(max(event_ordinal), 0) + 1
  into v_is_first, v_ordinal from public.pet_care_episode_events where episode_id = new.episode_id;
  v_role := public.lifecycle_event_role(new.state_action_type, coalesce(new.care_event_metadata, '{}'::jsonb), v_is_first);
  insert into public.pet_care_episode_events(care_entry_id, episode_id, user_id, pet_profile_id, event_ordinal, event_role, occurred_at)
  values(new.id, new.episode_id, new.user_id, new.pet_profile_id, v_ordinal, v_role, new.occurred_at)
  on conflict (care_entry_id) do nothing;
  perform public.rebuild_pet_care_episode(new.episode_id);
  return new;
end;
$$;
revoke all on function public.record_pet_care_episode_event() from public, anon, authenticated;

create or replace function public.reconcile_canonical_concern_for_entry()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_concept text;
  v_linked uuid;
  v_generated uuid;
begin
  if new.episode_id is null then return new; end if;
  v_concept := public.canonical_episode_concept(new.episode_id);
  if v_concept is null then return new; end if;

  select id into v_linked from public.pet_concerns
  where user_id = new.user_id and pet_profile_id = new.pet_profile_id
    and lifecycle_episode_id = new.episode_id and canonical_concept_key = v_concept
  order by updated_at desc limit 1 for update;
  select id into v_generated from public.pet_concerns
  where user_id = new.user_id and pet_profile_id = new.pet_profile_id and source_care_entry_id = new.id
  order by updated_at desc limit 1 for update;

  if v_linked is null and v_generated is not null then
    update public.pet_concerns set canonical_concept_key = v_concept,
      lifecycle_episode_id = new.episode_id, identity_provenance = 'canonical_episode', updated_at = now()
    where id = v_generated;
    v_linked := v_generated;
  end if;
  if v_linked is not null then
    update public.pet_care_episodes set linked_concern_id = v_linked, updated_at = now() where id = new.episode_id;
    update public.pet_care_entries set concern_id = v_linked where id = new.id and concern_id is distinct from v_linked;
  end if;
  return new;
end;
$$;
revoke all on function public.reconcile_canonical_concern_for_entry() from public, anon, authenticated;
drop trigger if exists zzz_pet_care_entries_reconcile_canonical_concern on public.pet_care_entries;
create trigger zzz_pet_care_entries_reconcile_canonical_concern after insert on public.pet_care_entries
  for each row execute function public.reconcile_canonical_concern_for_entry();

create or replace function public.tombstone_my_care_entry(p_entry_id uuid, p_reason text default 'user_removed')
returns table(entry_id uuid, tombstoned_at timestamptz, already_tombstoned boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_entry public.pet_care_entries%rowtype;
begin
  if v_user is null then raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED'; end if;
  if nullif(btrim(p_reason), '') is null then raise exception using errcode = '22023', message = 'DELETION_REASON_REQUIRED'; end if;
  select * into v_entry from public.pet_care_entries where id = p_entry_id and user_id = v_user for update;
  if v_entry.id is null then raise exception using errcode = 'P0002', message = 'CARE_ENTRY_NOT_FOUND'; end if;
  if v_entry.deleted_at is not null then
    return query select v_entry.id, v_entry.deleted_at, true;
    return;
  end if;
  update public.pet_care_entries set deleted_at = now(), deleted_by = v_user,
    deletion_reason = left(btrim(p_reason), 200), updated_at = now()
  where id = v_entry.id returning deleted_at into v_entry.deleted_at;
  return query select v_entry.id, v_entry.deleted_at, false;
end;
$$;
revoke all on function public.tombstone_my_care_entry(uuid, text) from public, anon;
grant execute on function public.tombstone_my_care_entry(uuid, text) to authenticated;

create or replace function public.rebuild_pet_lifecycle_projections(p_pet_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid;
  v_episode record;
  v_active uuid[];
  v_monitoring uuid[];
  v_state jsonb;
  v_semantic jsonb;
  v_medications jsonb;
begin
  select user_id into v_owner from public.dog_profiles where id = p_pet_id;
  if v_owner is null then raise exception using errcode = 'P0002', message = 'PET_NOT_FOUND'; end if;
  for v_episode in select id from public.pet_care_episodes where pet_profile_id = p_pet_id and user_id = v_owner loop
    perform public.rebuild_pet_care_episode(v_episode.id);
  end loop;
  select coalesce(array_agg(id order by last_event_at, id), '{}') into v_active
    from public.pet_care_episodes where user_id = v_owner and pet_profile_id = p_pet_id and status = 'active';
  select coalesce(array_agg(id order by last_event_at, id), '{}') into v_monitoring
    from public.pet_care_episodes where user_id = v_owner and pet_profile_id = p_pet_id and status = 'monitoring';

  select state into v_state from public.pet_current_state where pet_profile_id = p_pet_id and user_id = v_owner for update;
  if found then
    v_state := coalesce(v_state, '{}'::jsonb);
    select coalesce(jsonb_object_agg(item.key, item.value), '{}'::jsonb) into v_semantic
    from jsonb_each(coalesce(v_state->'semanticStates', '{}'::jsonb)) item
    where nullif(item.value->>'sourceEventId', '') is null or exists (
      select 1 from public.pet_care_entries e where e.id::text = item.value->>'sourceEventId'
        and e.user_id = v_owner and e.pet_profile_id = p_pet_id
    );
    v_state := jsonb_set(v_state, '{semanticStates}', v_semantic, true);
    if nullif(v_state#>>'{breathing,sourceEventId}', '') is not null and not exists (
      select 1 from public.pet_care_entries e where e.id::text = v_state#>>'{breathing,sourceEventId}'
        and e.user_id = v_owner and e.pet_profile_id = p_pet_id
    ) then v_state := v_state - 'breathing'; end if;
    select coalesce(jsonb_agg(med.value), '[]'::jsonb) into v_medications
    from jsonb_array_elements(coalesce(v_state->'currentMedications', '[]'::jsonb)) med(value)
    where nullif(med.value->>'sourceEventId', '') is null or exists (
      select 1 from public.pet_care_entries e where e.id::text = med.value->>'sourceEventId'
        and e.user_id = v_owner and e.pet_profile_id = p_pet_id
    );
    v_state := jsonb_set(v_state, '{currentMedications}', v_medications, true);
    update public.pet_current_state set state = v_state, active_episode_ids = v_active,
      monitoring_episode_ids = v_monitoring,
      source_event_ids = coalesce((select array_agg(source_id order by source_id) from unnest(source_event_ids) source_id
        where exists(select 1 from public.pet_care_entries e where e.id = source_id and e.user_id = v_owner and e.pet_profile_id = p_pet_id)), '{}'),
      state_version = state_version + 1, computed_at = now(), updated_at = now()
    where pet_profile_id = p_pet_id and user_id = v_owner;
  end if;

  update public.pet_concerns c set
    canonical_concept_key = coalesce(c.canonical_concept_key, public.canonical_episode_concept(e.id)),
    lifecycle_episode_id = e.id,
    identity_provenance = 'canonical_episode',
    status = case when e.status = 'resolved' then 'resolved' when e.status = 'monitoring' then 'monitoring' else 'active' end,
    active_episode_id = case when e.status in ('active', 'monitoring') then e.id else null end,
    resolved_at = case when e.status = 'resolved' then e.resolved_at else null end,
    updated_at = now()
  from public.pet_care_episodes e where e.linked_concern_id = c.id and e.id = c.lifecycle_episode_id
    and e.user_id = v_owner and e.pet_profile_id = p_pet_id;
  return jsonb_build_object('petId', p_pet_id, 'activeEpisodeIds', v_active, 'monitoringEpisodeIds', v_monitoring);
end;
$$;
revoke all on function public.rebuild_pet_lifecycle_projections(uuid) from public, anon, authenticated;
grant execute on function public.rebuild_pet_lifecycle_projections(uuid) to service_role;

-- Import surviving references from both the relational entry link and legacy summary cache.
with summary_refs as (
  select ep.id episode_id, ep.user_id, ep.pet_profile_id, ref.value#>>'{}' care_entry_text
  from public.pet_care_episodes ep
  cross join lateral jsonb_array_elements(coalesce(ep.summary->'sourceRecordIds', '[]'::jsonb)) ref(value)
), valid_unique_refs as (
  select sr.episode_id, sr.user_id, sr.pet_profile_id, sr.care_entry_text::uuid care_entry_id
  from summary_refs sr join public.pet_care_entries ce on ce.id::text = sr.care_entry_text
    and ce.user_id = sr.user_id and ce.pet_profile_id = sr.pet_profile_id
  where sr.care_entry_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and 1 = (select count(*) from summary_refs other_ref where other_ref.care_entry_text = sr.care_entry_text)
)
update public.pet_care_entries ce set episode_id = refs.episode_id
from valid_unique_refs refs where ce.id = refs.care_entry_id and ce.episode_id is null;

with candidates as (
  select ce.id care_entry_id, ce.episode_id, ce.user_id, ce.pet_profile_id, ce.occurred_at, ce.created_at,
    row_number() over(partition by ce.episode_id order by ce.occurred_at, ce.created_at, ce.id)::bigint event_ordinal,
    row_number() over(partition by ce.episode_id order by ce.occurred_at, ce.created_at, ce.id) = 1 is_first,
    ce.state_action_type, ce.care_event_metadata
  from public.pet_care_entries ce join public.pet_care_episodes ep on ep.id = ce.episode_id
    and ep.user_id = ce.user_id and ep.pet_profile_id = ce.pet_profile_id
  where ce.episode_id is not null
)
insert into public.pet_care_episode_events(care_entry_id, episode_id, user_id, pet_profile_id, event_ordinal, event_role, occurred_at, created_at)
select care_entry_id, episode_id, user_id, pet_profile_id, event_ordinal,
  public.lifecycle_event_role(state_action_type, coalesce(care_event_metadata, '{}'::jsonb), is_first), occurred_at, created_at
from candidates on conflict (care_entry_id) do nothing;

drop trigger if exists zz_pet_care_entries_record_episode_event on public.pet_care_entries;
create trigger zz_pet_care_entries_record_episode_event after insert or update of episode_id on public.pet_care_entries
  for each row execute function public.record_pet_care_episode_event();

with summary_refs as (
  select ep.id episode_id, ep.user_id, ep.pet_profile_id, ref.value#>>'{}' ref_text
  from public.pet_care_episodes ep
  cross join lateral jsonb_array_elements(coalesce(ep.summary->'sourceRecordIds', '[]'::jsonb)) ref(value)
), missing as (
  select episode_id, array_agg(distinct ref_text::uuid order by ref_text::uuid) missing_ids
  from summary_refs where ref_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and not exists(select 1 from public.pet_care_entries ce where ce.id::text = summary_refs.ref_text
      and ce.user_id = summary_refs.user_id and ce.pet_profile_id = summary_refs.pet_profile_id)
  group by episode_id
)
update public.pet_care_episodes ep set missing_source_event_ids = coalesce(missing.missing_ids, '{}')
from (select episode_row.id, missing_rows.missing_ids from public.pet_care_episodes episode_row
  left join missing missing_rows on missing_rows.episode_id = episode_row.id) missing
where ep.id = missing.id;

-- Only an explicit episode/entry relationship proves legacy concern identity. When
-- more than one concern points to that exact lifecycle, retain one live canonical row
-- and resolve (never delete) the other projection rows.
with raw_links as (
  select ep.linked_concern_id concern_id, ep.id episode_id, ep.status episode_status, 1 priority
  from public.pet_care_episodes ep where ep.linked_concern_id is not null
  union all
  select c.id, c.active_episode_id, ep.status, 2 from public.pet_concerns c
    join public.pet_care_episodes ep on ep.id = c.active_episode_id
  union all
  select c.id, ce.episode_id, ep.status, 3 from public.pet_concerns c
    join public.pet_care_entries ce on ce.id = c.source_care_entry_id and ce.episode_id is not null
    join public.pet_care_episodes ep on ep.id = ce.episode_id
), selected_link as (
  select distinct on (concern_id) concern_id, episode_id, episode_status, priority
  from raw_links order by concern_id, priority, episode_id
), ranked as (
  select links.*, row_number() over(partition by episode_id order by priority, concern_id) live_rank
  from selected_link links where public.canonical_episode_concept(episode_id) is not null
)
update public.pet_concerns c set
  canonical_concept_key = public.canonical_episode_concept(ranked.episode_id),
  lifecycle_episode_id = ranked.episode_id,
  identity_provenance = 'canonical_episode',
  status = case when ranked.live_rank > 1 then 'resolved'
    when ranked.episode_status = 'resolved' then 'resolved'
    when ranked.episode_status = 'monitoring' then 'monitoring' else 'active' end,
  active_episode_id = case when ranked.live_rank = 1 and ranked.episode_status in ('active','monitoring') then ranked.episode_id else null end,
  resolved_at = case when ranked.live_rank > 1 or ranked.episode_status = 'resolved' then coalesce(c.resolved_at, now()) else null end,
  resolution_note = case when ranked.live_rank > 1 then 'Reconciled to the canonical lifecycle concern.' else c.resolution_note end,
  updated_at = now()
from ranked where c.id = ranked.concern_id;

with canonical_concern as (
  select distinct on (lifecycle_episode_id) lifecycle_episode_id, id concern_id
  from public.pet_concerns where lifecycle_episode_id is not null and identity_provenance = 'canonical_episode'
  order by lifecycle_episode_id,
    case when status in ('active','monitoring','reopened') then 0 else 1 end,
    updated_at desc, id
)
update public.pet_care_episodes ep set linked_concern_id = canonical_concern.concern_id, updated_at = now()
from canonical_concern where ep.id = canonical_concern.lifecycle_episode_id
  and ep.linked_concern_id is distinct from canonical_concern.concern_id;

do $$ declare r record; begin
  for r in select id from public.pet_care_episodes loop perform public.rebuild_pet_care_episode(r.id); end loop;
  for r in select id from public.dog_profiles where exists (
    select 1 from public.pet_care_episodes ep where ep.pet_profile_id = dog_profiles.id
    union all select 1 from public.pet_current_state pcs where pcs.pet_profile_id = dog_profiles.id
  ) loop perform public.rebuild_pet_lifecycle_projections(r.id); end loop;
end $$;

create or replace function public.run_furvise_lifecycle_integrity_audit()
returns table(issue_code text, issue_count bigint, details jsonb)
language sql security definer set search_path = '' as $$
  with issues as (
    select 'DANGLING_EPISODE_MEMBERSHIP'::text code, count(*)::bigint n, '[]'::jsonb details
    from public.pet_care_episode_events m left join public.pet_care_episodes ep on ep.id = m.episode_id
      left join public.pet_care_entries ce on ce.id = m.care_entry_id where ep.id is null or ce.id is null
    union all
    select 'SUMMARY_MEMBERSHIP_COUNT_MISMATCH', count(*)::bigint,
      coalesce(jsonb_agg(jsonb_build_object('episodeId', ep.id)), '[]'::jsonb)
    from public.pet_care_episodes ep where coalesce((ep.summary->>'eventCount')::integer, -1) <>
      (select count(*) from public.pet_care_episode_events m where m.episode_id = ep.id)
    union all
    select 'CARE_ENTRY_MISSING_MEMBERSHIP', count(*)::bigint,
      coalesce(jsonb_agg(jsonb_build_object('careEntryId', ce.id, 'episodeId', ce.episode_id)), '[]'::jsonb)
    from public.pet_care_entries ce where ce.episode_id is not null and not exists (
      select 1 from public.pet_care_episode_events m where m.care_entry_id = ce.id and m.episode_id = ce.episode_id)
    union all
    select 'NESTED_STATE_INVALID_SOURCE', count(*)::bigint,
      coalesce(jsonb_agg(jsonb_build_object('petId', pcs.pet_profile_id, 'sourceEventId', refs.source_id)), '[]'::jsonb)
    from public.pet_current_state pcs cross join lateral (
      select trim(both '"' from value::text) source_id from jsonb_path_query(pcs.state, '$.**.sourceEventId') value
    ) refs where refs.source_id ~* '^[0-9a-f-]{36}$' and not exists (
      select 1 from public.pet_care_entries ce where ce.id::text = refs.source_id
        and ce.user_id = pcs.user_id and ce.pet_profile_id = pcs.pet_profile_id)
    union all
    select 'MULTIPLE_LIVE_CONCERNS_FOR_CANONICAL_LIFECYCLE', coalesce(sum(group_count - 1), 0)::bigint,
      coalesce(jsonb_agg(jsonb_build_object('userId', user_id, 'petId', pet_profile_id,
        'concept', canonical_concept_key, 'episodeId', lifecycle_episode_id, 'count', group_count)), '[]'::jsonb)
    from (select user_id, pet_profile_id, canonical_concept_key, lifecycle_episode_id, count(*) group_count
      from public.pet_concerns where canonical_concept_key is not null and lifecycle_episode_id is not null
        and status in ('active', 'monitoring', 'reopened')
      group by user_id, pet_profile_id, canonical_concept_key, lifecycle_episode_id having count(*) > 1) duplicates
    union all
    select 'RESOLUTION_ONLY_WITHOUT_PROVENANCE', count(*)::bigint,
      coalesce(jsonb_agg(jsonb_build_object('episodeId', ep.id)), '[]'::jsonb)
    from public.pet_care_episodes ep where ep.started_at is null
      and ep.opening_provenance <> 'resolution_without_observed_opening'
    union all
    select 'ORPHANED_PROVENANCE_REFERENCE', coalesce(sum(cardinality(ep.missing_source_event_ids)), 0)::bigint,
      coalesce(jsonb_agg(jsonb_build_object('episodeId', ep.id, 'missingSourceEventIds', ep.missing_source_event_ids))
        filter(where cardinality(ep.missing_source_event_ids) > 0), '[]'::jsonb)
    from public.pet_care_episodes ep
    union all
    select 'AMBIGUOUS_LEGACY_CONCERN_IDENTITY', count(*)::bigint,
      coalesce(jsonb_agg(jsonb_build_object('concernId', c.id, 'petId', c.pet_profile_id)), '[]'::jsonb)
    from public.pet_concerns c where c.identity_provenance = 'legacy_unverified'
      and c.status in ('active', 'monitoring', 'reopened')
  ) select code, n, details from issues order by code
$$;
revoke all on function public.run_furvise_lifecycle_integrity_audit() from public, anon, authenticated;
grant execute on function public.run_furvise_lifecycle_integrity_audit() to service_role;
