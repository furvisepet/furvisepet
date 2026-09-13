create or replace function public.enforce_pet_profile_plan_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_plan text;
  existing_count integer;
  maximum_pets integer;
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.user_id <> auth.uid() then
    raise exception using errcode = '42501', message = 'Pet ownership does not match the signed-in user.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));
  current_plan := coalesce(auth.jwt() -> 'app_metadata' ->> 'plan', 'free');
  maximum_pets := case when current_plan = 'plus' then 10 else 1 end;

  select count(*) into existing_count
  from public.dog_profiles
  where user_id = new.user_id;

  if existing_count >= maximum_pets then
    raise exception using
      errcode = 'P0001',
      message = 'PET_LIMIT_REACHED',
      detail = format('The %s plan allows %s active pet profiles.', current_plan, maximum_pets);
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_pet_profile_plan_limit_before_insert on public.dog_profiles;
create trigger enforce_pet_profile_plan_limit_before_insert
before insert on public.dog_profiles
for each row execute function public.enforce_pet_profile_plan_limit();

revoke all on function public.enforce_pet_profile_plan_limit() from public;
