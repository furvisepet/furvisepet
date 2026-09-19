begin;

-- These tables already scoped visible rows by user_id, but their UPDATE checks
-- did not prove that the resulting pet link still belonged to that user.
-- Keep the RLS checks explicit even where column privileges add another layer.

-- Do not silently preserve a pre-existing cross-tenant link. Operators must
-- repair any reported row with service-role tooling before retrying migration.
do $$
begin
  if exists (
    select 1 from public.furvise_memories as memory_row
    where (memory_row.subject_type = 'owner' and memory_row.pet_id is not null)
      or (memory_row.subject_type = 'pet' and (
        memory_row.pet_id is null or not exists (
          select 1 from public.dog_profiles as pet_row
          where pet_row.id = memory_row.pet_id and pet_row.user_id = memory_row.user_id
        )
      ))
  ) then
    raise exception using errcode = '23514', message = 'EXISTING_MEMORY_PET_OWNER_MISMATCH';
  end if;
  if exists (
    select 1 from public.pet_care_episodes as episode_row
    where not exists (
      select 1 from public.dog_profiles as pet_row
      where pet_row.id = episode_row.pet_profile_id and pet_row.user_id = episode_row.user_id
    )
  ) then
    raise exception using errcode = '23514', message = 'EXISTING_EPISODE_PET_OWNER_MISMATCH';
  end if;
  if exists (
    select 1 from public.pet_current_state as state_row
    where not exists (
      select 1 from public.dog_profiles as pet_row
      where pet_row.id = state_row.pet_profile_id and pet_row.user_id = state_row.user_id
    )
  ) then
    raise exception using errcode = '23514', message = 'EXISTING_STATE_PET_OWNER_MISMATCH';
  end if;
end;
$$;

drop policy if exists "furvise_memories_insert_own" on public.furvise_memories;
create policy "furvise_memories_insert_own"
  on public.furvise_memories for insert
  with check (
    user_id = auth.uid()
    and (
      (subject_type = 'owner' and pet_id is null)
      or (
        subject_type = 'pet'
        and pet_id is not null
        and exists (
          select 1 from public.dog_profiles as pet_row
          where pet_row.id = furvise_memories.pet_id
            and pet_row.user_id = auth.uid()
        )
      )
    )
  );

drop policy if exists "furvise_memories_update_own" on public.furvise_memories;
create policy "furvise_memories_update_own"
  on public.furvise_memories for update
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (
      (subject_type = 'owner' and pet_id is null)
      or (
        subject_type = 'pet'
        and pet_id is not null
        and exists (
          select 1 from public.dog_profiles as pet_row
          where pet_row.id = furvise_memories.pet_id
            and pet_row.user_id = auth.uid()
        )
      )
    )
  );

drop policy if exists "Users can insert their care episodes" on public.pet_care_episodes;
create policy "Users can insert their care episodes"
  on public.pet_care_episodes for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.dog_profiles as pet_row
      where pet_row.id = pet_care_episodes.pet_profile_id
        and pet_row.user_id = auth.uid()
    )
  );

drop policy if exists "Users can update their care episodes" on public.pet_care_episodes;
create policy "Users can update their care episodes"
  on public.pet_care_episodes for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.dog_profiles as pet_row
      where pet_row.id = pet_care_episodes.pet_profile_id
        and pet_row.user_id = auth.uid()
    )
  );

drop policy if exists "Users can insert their pet state" on public.pet_current_state;
create policy "Users can insert their pet state"
  on public.pet_current_state for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.dog_profiles as pet_row
      where pet_row.id = pet_current_state.pet_profile_id
        and pet_row.user_id = auth.uid()
    )
  );

drop policy if exists "Users can update their pet state" on public.pet_current_state;
create policy "Users can update their pet state"
  on public.pet_current_state for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.dog_profiles as pet_row
      where pet_row.id = pet_current_state.pet_profile_id
        and pet_row.user_id = auth.uid()
    )
  );

-- Validate secondary tenant links in the same rows without recursive RLS
-- policy lookups. These triggers run as their owner, reveal no row data, and
-- are not directly executable by application roles.
create or replace function public.enforce_furvise_memory_tenant_links()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
    and auth.role() = 'authenticated'
    and new.user_id is distinct from old.user_id
  then
    raise exception using errcode = '42501', message = 'ROW_OWNER_IMMUTABLE';
  end if;

  if (new.subject_type = 'owner' and new.pet_id is not null)
    or (new.subject_type = 'pet' and (
      new.pet_id is null or not exists (
        select 1 from public.dog_profiles as pet_row
        where pet_row.id = new.pet_id and pet_row.user_id = new.user_id
      )
    ))
  then
    raise exception using errcode = '23514', message = 'MEMORY_SUBJECT_PET_MISMATCH';
  end if;
  if new.superseded_by is not null and not exists (
    select 1 from public.furvise_memories as target_row
    where target_row.id = new.superseded_by
      and target_row.user_id = new.user_id
      and target_row.pet_id is not distinct from new.pet_id
  ) then
    raise exception using errcode = '23514', message = 'MEMORY_SUPERSESSION_OWNER_MISMATCH';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_pet_care_episode_tenant_links()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
    and auth.role() = 'authenticated'
    and new.user_id is distinct from old.user_id
  then
    raise exception using errcode = '42501', message = 'ROW_OWNER_IMMUTABLE';
  end if;
  if not exists (
    select 1 from public.dog_profiles as pet_row
    where pet_row.id = new.pet_profile_id and pet_row.user_id = new.user_id
  ) then
    raise exception using errcode = '23514', message = 'PET_OWNER_MISMATCH';
  end if;
  if new.recurrence_of is not null and not exists (
    select 1 from public.pet_care_episodes as target_row
    where target_row.id = new.recurrence_of
      and target_row.user_id = new.user_id
      and target_row.pet_profile_id = new.pet_profile_id
  ) then
    raise exception using errcode = '23514', message = 'EPISODE_RECURRENCE_OWNER_MISMATCH';
  end if;
  if new.linked_concern_id is not null and not exists (
    select 1 from public.pet_concerns as target_row
    where target_row.id = new.linked_concern_id
      and target_row.user_id = new.user_id
      and target_row.pet_profile_id = new.pet_profile_id
  ) then
    raise exception using errcode = '23514', message = 'EPISODE_CONCERN_OWNER_MISMATCH';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_pet_current_state_tenant_links()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
    and auth.role() = 'authenticated'
    and new.user_id is distinct from old.user_id
  then
    raise exception using errcode = '42501', message = 'ROW_OWNER_IMMUTABLE';
  end if;
  if not exists (
    select 1 from public.dog_profiles as pet_row
    where pet_row.id = new.pet_profile_id and pet_row.user_id = new.user_id
  ) then
    raise exception using errcode = '23514', message = 'PET_OWNER_MISMATCH';
  end if;
  if exists (
    select 1 from unnest(new.active_episode_ids || new.monitoring_episode_ids) as linked(linked_id)
    where not exists (
      select 1 from public.pet_care_episodes as episode_row
      where episode_row.id = linked.linked_id
        and episode_row.user_id = new.user_id
        and episode_row.pet_profile_id = new.pet_profile_id
    )
  ) then
    raise exception using errcode = '23514', message = 'PET_STATE_EPISODE_OWNER_MISMATCH';
  end if;
  if exists (
    select 1 from unnest(new.source_event_ids) as linked(linked_id)
    where not exists (
      select 1 from public.pet_care_entries as entry_row
      where entry_row.id = linked.linked_id
        and entry_row.user_id = new.user_id
        and entry_row.pet_profile_id = new.pet_profile_id
    )
  ) then
    raise exception using errcode = '23514', message = 'PET_STATE_SOURCE_OWNER_MISMATCH';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_furvise_memory_tenant_links() from public, anon, authenticated;
revoke all on function public.enforce_pet_care_episode_tenant_links() from public, anon, authenticated;
revoke all on function public.enforce_pet_current_state_tenant_links() from public, anon, authenticated;

drop trigger if exists enforce_tenant_pet_link_integrity on public.furvise_memories;
create trigger enforce_tenant_pet_link_integrity
before insert or update on public.furvise_memories
for each row execute function public.enforce_furvise_memory_tenant_links();

drop trigger if exists enforce_tenant_pet_link_integrity on public.pet_care_episodes;
create trigger enforce_tenant_pet_link_integrity
before insert or update on public.pet_care_episodes
for each row execute function public.enforce_pet_care_episode_tenant_links();

drop trigger if exists enforce_tenant_pet_link_integrity on public.pet_current_state;
create trigger enforce_tenant_pet_link_integrity
before insert or update on public.pet_current_state
for each row execute function public.enforce_pet_current_state_tenant_links();

-- Memories remain directly readable/insertable/deletable for compatibility,
-- but ordinary users cannot update row identity or ownership columns.
revoke update on table public.furvise_memories from authenticated;
grant update (
  pet_id, subject_type, category, fact_key, fact_value, normalized_value,
  confidence, importance, durability, status, source_type, source_id,
  source_excerpt, dedupe_key, first_observed_at, last_confirmed_at,
  superseded_by, updated_at, observed_at, expires_at, freshness_class,
  base_confidence, current_confidence, decay_policy,
  confirmation_required_after, stale_at
) on public.furvise_memories to authenticated;

-- Repository update paths generate episodes and current state through validated
-- SECURITY DEFINER triggers/RPCs. Remove direct authenticated UPDATE without
-- changing any pre-existing INSERT or DELETE privilege decision.
revoke all on table public.pet_care_episodes, public.pet_current_state from anon;
revoke update on table public.pet_care_episodes, public.pet_current_state from authenticated;
grant select on table public.pet_care_episodes, public.pet_current_state to authenticated;

grant all privileges on table
  public.furvise_memories,
  public.pet_care_episodes,
  public.pet_current_state
to service_role;

commit;
