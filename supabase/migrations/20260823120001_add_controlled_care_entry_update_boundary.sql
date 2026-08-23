-- Stage 1 of the Care History write-boundary rollout. Deploy this function
-- before the application starts using it; authenticated table UPDATE remains
-- available until the follow-up privilege migration is applied.
create or replace function public.update_my_care_entry(
  p_entry_id uuid,
  p_pet_profile_id uuid,
  p_expected_updated_at timestamptz,
  p_category text,
  p_title text,
  p_note text,
  p_severity text,
  p_occurred_at timestamptz
)
returns setof public.pet_care_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_entry public.pet_care_entries%rowtype;
  v_updated public.pet_care_entries%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if p_entry_id is null or p_pet_profile_id is null or p_expected_updated_at is null then
    raise exception using errcode = '22023', message = 'CARE_ENTRY_TARGET_REQUIRED';
  end if;
  if p_category is null or p_category not in (
    'symptom', 'food', 'medication', 'activity', 'grooming', 'vet_visit', 'behavior', 'general'
  ) then
    raise exception using errcode = '22023', message = 'CARE_ENTRY_CATEGORY_INVALID';
  end if;
  if p_note is null or btrim(p_note) = '' or char_length(p_note) > 4000 then
    raise exception using errcode = '22023', message = 'CARE_ENTRY_NOTE_INVALID';
  end if;
  if p_title is not null and char_length(p_title) > 200 then
    raise exception using errcode = '22023', message = 'CARE_ENTRY_TITLE_INVALID';
  end if;
  if p_severity is not null and p_severity not in ('mild', 'moderate', 'severe') then
    raise exception using errcode = '22023', message = 'CARE_ENTRY_SEVERITY_INVALID';
  end if;
  if p_occurred_at is null then
    raise exception using errcode = '22023', message = 'CARE_ENTRY_OCCURRED_AT_REQUIRED';
  end if;

  -- The function owner bypasses RLS, so authenticate and bind every authority
  -- dimension again inside the mutation boundary.
  if not exists (
    select 1
    from public.dog_profiles pet
    where pet.id = p_pet_profile_id
      and pet.user_id = v_user_id
  ) then
    raise exception using errcode = 'P0002', message = 'CARE_ENTRY_NOT_FOUND';
  end if;

  select entry.*
  into v_entry
  from public.pet_care_entries entry
  where entry.id = p_entry_id
    and entry.user_id = v_user_id
    and entry.pet_profile_id = p_pet_profile_id
    and entry.deleted_at is null
  for update;

  if v_entry.id is null then
    raise exception using errcode = 'P0002', message = 'CARE_ENTRY_NOT_FOUND';
  end if;
  if v_entry.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = '40001', message = 'CARE_ENTRY_STALE';
  end if;

  update public.pet_care_entries entry
  set category = p_category,
      title = p_title,
      note = p_note,
      severity = p_severity,
      occurred_at = p_occurred_at
  where entry.id = v_entry.id
    and entry.user_id = v_user_id
    and entry.pet_profile_id = p_pet_profile_id
    and entry.deleted_at is null
    and entry.updated_at = p_expected_updated_at
  returning entry.* into v_updated;

  if v_updated.id is null then
    raise exception using errcode = '40001', message = 'CARE_ENTRY_STALE';
  end if;

  return next v_updated;
end;
$$;

revoke all on function public.update_my_care_entry(
  uuid, uuid, timestamptz, text, text, text, text, timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.update_my_care_entry(
  uuid, uuid, timestamptz, text, text, text, text, timestamptz
) to authenticated;

do $$
begin
  if not has_function_privilege(
    'authenticated',
    'public.update_my_care_entry(uuid,uuid,timestamptz,text,text,text,text,timestamptz)',
    'execute'
  ) then
    raise exception 'authenticated must be able to execute update_my_care_entry';
  end if;
  if has_function_privilege(
    'anon',
    'public.update_my_care_entry(uuid,uuid,timestamptz,text,text,text,text,timestamptz)',
    'execute'
  ) or has_function_privilege(
    'service_role',
    'public.update_my_care_entry(uuid,uuid,timestamptz,text,text,text,text,timestamptz)',
    'execute'
  ) then
    raise exception 'update_my_care_entry has an unintended caller';
  end if;
end;
$$;

notify pgrst, 'reload schema';
