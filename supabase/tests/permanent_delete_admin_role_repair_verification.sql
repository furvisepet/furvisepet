insert into auth.users(id, aud, role, email, encrypted_password, created_at, updated_at) values
  ('83000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'delete-repair-a@example.test', '', now(), now()),
  ('84000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'delete-repair-b@example.test', '', now(), now());

insert into public.dog_profiles(id, user_id, name, species) values
  ('83000000-0000-4000-8000-000000000011', '83000000-0000-4000-8000-000000000001', 'Repair A JSON', 'dog'),
  ('83000000-0000-4000-8000-000000000012', '83000000-0000-4000-8000-000000000001', 'Repair A legacy', 'dog'),
  ('84000000-0000-4000-8000-000000000022', '84000000-0000-4000-8000-000000000002', 'Repair B', 'cat');

set local role authenticated;
select set_config('request.jwt.claim.role', '', true);
select set_config('request.jwt.claims', '{"role":"service_role","sub":"83000000-0000-4000-8000-000000000001"}', true);

do $$
begin
  perform public.delete_pet_profile_for_user(
    '83000000-0000-4000-8000-000000000001',
    '83000000-0000-4000-8000-000000000011'
  );
  raise exception 'authenticated caller forged service authority';
exception when insufficient_privilege then
  null;
end;
$$;

select set_config('request.jwt.claims', '{"role":"authenticated","sub":"83000000-0000-4000-8000-000000000001"}', true);

do $$
begin
  delete from public.dog_profiles where id = '83000000-0000-4000-8000-000000000011';
  raise exception 'authenticated direct pet delete succeeded';
exception when insufficient_privilege then
  null;
end;
$$;

do $$
begin
  update public.dog_profiles set lifecycle_status = 'deceased'
  where id = '83000000-0000-4000-8000-000000000011';
  raise exception 'authenticated lifecycle write succeeded';
exception when insufficient_privilege then
  null;
end;
$$;

update public.dog_profiles set name = 'Repair A ordinary edit'
where id = '83000000-0000-4000-8000-000000000011';

do $$
begin
  if not exists (
    select 1 from public.dog_profiles
    where id = '83000000-0000-4000-8000-000000000011'
      and name = 'Repair A ordinary edit'
  ) then
    raise exception 'ordinary authenticated profile edit failed';
  end if;
end;
$$;

reset role;
set local role service_role;
select set_config('request.jwt.claim.role', '', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

do $$
begin
  if public.delete_pet_profile_for_user(
    '83000000-0000-4000-8000-000000000001',
    '84000000-0000-4000-8000-000000000022'
  ) then
    raise exception 'JSON-claim service path deleted a foreign pet';
  end if;
  if not public.delete_pet_profile_for_user(
    '83000000-0000-4000-8000-000000000001',
    '83000000-0000-4000-8000-000000000011'
  ) then
    raise exception 'JSON-claim service path did not delete the owned pet';
  end if;
  if public.delete_pet_profile_for_user(
    '83000000-0000-4000-8000-000000000001',
    '83000000-0000-4000-8000-000000000011'
  ) then
    raise exception 'repeated JSON-claim deletion was not safe';
  end if;
end;
$$;

select set_config('request.jwt.claims', '', true);
select set_config('request.jwt.claim.role', 'service_role', true);

do $$
begin
  if not public.delete_pet_profile_for_user(
    '83000000-0000-4000-8000-000000000001',
    '83000000-0000-4000-8000-000000000012'
  ) then
    raise exception 'legacy scalar-claim service path did not delete the owned pet';
  end if;
  if not exists (
    select 1 from public.dog_profiles
    where id = '84000000-0000-4000-8000-000000000022'
  ) then
    raise exception 'service deletion changed another tenant';
  end if;
end;
$$;

reset role;
