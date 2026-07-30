alter table public.dog_memories
  add column if not exists status text not null default 'active',
  add column if not exists superseded_by uuid references public.dog_memories(id) on delete set null;

alter table public.furvise_memories drop constraint if exists furvise_memories_status_check;
alter table public.furvise_memories add constraint furvise_memories_status_check
  check (status in ('active', 'unconfirmed', 'resolved', 'superseded', 'rejected', 'expired'));

alter table public.dog_memories drop constraint if exists dog_memories_status_check;
alter table public.dog_memories add constraint dog_memories_status_check
  check (status in ('active', 'superseded', 'rejected'));

create index if not exists dog_memories_active_owner_pet_idx
  on public.dog_memories(user_id, dog_profile_id, created_at desc)
  where status = 'active';

create or replace function public.supersede_previous_active_furvise_memory()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.status = 'active' then
    perform pg_advisory_xact_lock(hashtextextended(
      new.user_id::text || ':' || new.subject_type || ':' || coalesce(new.pet_id::text, 'owner') || ':' ||
      lower(btrim(new.category)) || ':' || regexp_replace(lower(new.fact_key), '[^a-z0-9]+', '', 'g'), 0
    ));
    update public.furvise_memories
      set status = 'superseded',
          superseded_by = case when tg_op = 'UPDATE' then new.id else null end,
          updated_at = now()
    where user_id = new.user_id
      and subject_type = new.subject_type
      and pet_id is not distinct from new.pet_id
      and lower(btrim(category)) = lower(btrim(new.category))
      and regexp_replace(lower(fact_key), '[^a-z0-9]+', '', 'g') = regexp_replace(lower(new.fact_key), '[^a-z0-9]+', '', 'g')
      and status = 'active'
      and id <> new.id;
  end if;
  return new;
end;
$$;

create or replace function public.link_superseded_furvise_memory()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  update public.furvise_memories
    set superseded_by = new.id, updated_at = now()
  where user_id = new.user_id
    and subject_type = new.subject_type
    and pet_id is not distinct from new.pet_id
    and lower(btrim(category)) = lower(btrim(new.category))
    and regexp_replace(lower(fact_key), '[^a-z0-9]+', '', 'g') = regexp_replace(lower(new.fact_key), '[^a-z0-9]+', '', 'g')
    and status = 'superseded'
    and superseded_by is null
    and id <> new.id;
  return new;
end;
$$;

drop trigger if exists furvise_memories_supersede_previous_active on public.furvise_memories;
create trigger furvise_memories_supersede_previous_active
before insert or update of status, fact_key, category, pet_id on public.furvise_memories
for each row execute function public.supersede_previous_active_furvise_memory();

drop trigger if exists furvise_memories_link_superseded on public.furvise_memories;
create trigger furvise_memories_link_superseded
after insert on public.furvise_memories
for each row when (new.status = 'active') execute function public.link_superseded_furvise_memory();

create unique index if not exists furvise_memories_one_active_fact_idx
  on public.furvise_memories(
    user_id,
    subject_type,
    coalesce(pet_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(btrim(category)),
    regexp_replace(lower(fact_key), '[^a-z0-9]+', '', 'g')
  ) where status = 'active';

comment on index public.furvise_memories_one_active_fact_idx is
  'One canonical active value per normalized owner/pet fact identity; lifecycle history remains immutable.';

create or replace function public.repair_pet_memory_lifecycle(
  p_user_id uuid,
  p_pet_id uuid,
  p_dry_run boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  v_duplicate_ids uuid[] := '{}';
  v_legacy_ids uuid[] := '{}';
  v_active jsonb := '[]'::jsonb;
begin
  if v_role <> 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501'; end if;
  if not exists (select 1 from public.dog_profiles where id = p_pet_id and user_id = p_user_id) then
    raise exception 'PET_NOT_FOUND' using errcode = 'P0002';
  end if;

  with ranked as (
    select id, row_number() over (
      partition by user_id, subject_type, coalesce(pet_id, '00000000-0000-0000-0000-000000000000'::uuid),
        lower(btrim(category)), regexp_replace(lower(fact_key), '[^a-z0-9]+', '', 'g')
      order by last_confirmed_at desc, created_at desc, id desc
    ) as position
    from public.furvise_memories
    where user_id = p_user_id and status = 'active' and (pet_id = p_pet_id or pet_id is null)
  ) select coalesce(array_agg(id), '{}') into v_duplicate_ids from ranked where position > 1;

  select coalesce(array_agg(legacy.id), '{}') into v_legacy_ids
  from public.dog_memories legacy
  where legacy.user_id = p_user_id and legacy.dog_profile_id = p_pet_id and legacy.status = 'active'
    and exists (
      select 1 from public.furvise_memories memory
      where memory.user_id = p_user_id and memory.status = 'active' and (memory.pet_id = p_pet_id or memory.pet_id is null)
        and regexp_replace(lower(memory.fact_value #>> '{}'), '[^a-z0-9]+', '', 'g') = regexp_replace(lower(legacy.text), '[^a-z0-9]+', '', 'g')
    );

  if not p_dry_run then
    update public.furvise_memories set status = 'superseded', updated_at = now() where id = any(v_duplicate_ids);
    update public.dog_memories set status = 'superseded' where id = any(v_legacy_ids);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'subjectType', subject_type, 'petId', pet_id, 'category', category,
    'factKey', fact_key, 'factValue', fact_value, 'updatedAt', updated_at
  ) order by last_confirmed_at desc), '[]'::jsonb) into v_active
  from public.furvise_memories
  where user_id = p_user_id and status = 'active' and (pet_id = p_pet_id or pet_id is null);

  return jsonb_build_object(
    'dryRun', p_dry_run,
    'petId', p_pet_id,
    'duplicateActiveIds', to_jsonb(v_duplicate_ids),
    'legacyDuplicateIds', to_jsonb(v_legacy_ids),
    'repairedIds', case when p_dry_run then '[]'::jsonb else to_jsonb(v_duplicate_ids || v_legacy_ids) end,
    'activeCanonicalMemories', v_active,
    'embeddingReferences', '[]'::jsonb
  );
end;
$$;

revoke all on function public.repair_pet_memory_lifecycle(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.repair_pet_memory_lifecycle(uuid, uuid, boolean) to service_role;
