create or replace function public.delete_pet_profile_for_user(
  p_user_id uuid,
  p_pet_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted boolean := false;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_user_id is null or p_pet_id is null then
    raise exception using errcode = '22023', message = 'PET_DELETE_INPUT_INVALID';
  end if;

  delete from public.dog_profiles
  where id = p_pet_id and user_id = p_user_id;
  v_deleted := found;
  return v_deleted;
end;
$$;

revoke all on function public.delete_pet_profile_for_user(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.delete_pet_profile_for_user(uuid, uuid)
  to service_role;
