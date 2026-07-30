-- The current Supabase secret-key flow is authorized by the PostgREST database
-- role rather than a legacy request.jwt.claim.role setting. EXECUTE remains the
-- service boundary for this SECURITY DEFINER repair function.
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
  v_duplicate_ids uuid[] := '{}';
  v_legacy_ids uuid[] := '{}';
  v_active jsonb := '[]'::jsonb;
begin
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
