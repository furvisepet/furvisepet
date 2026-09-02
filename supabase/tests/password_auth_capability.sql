begin;

insert into auth.users (
  id, aud, role, email, encrypted_password, created_at, updated_at, email_confirmed_at
) values
  (
    '51000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'password-capability-owner@example.test',
    '',
    now(),
    now(),
    now()
  ),
  (
    '51000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'password-capability-other@example.test',
    '',
    now(),
    now(),
    now()
  ),
  (
    '51000000-0000-4000-8000-000000000003',
    'authenticated',
    'authenticated',
    'password-capability-insert@example.test',
    '',
    now(),
    now(),
    now()
  )
on conflict (id) do update set email_confirmed_at = excluded.email_confirmed_at;

delete from public.user_profiles
where user_id in (
  '51000000-0000-4000-8000-000000000001',
  '51000000-0000-4000-8000-000000000002',
  '51000000-0000-4000-8000-000000000003'
);
insert into public.user_profiles (user_id) values
  ('51000000-0000-4000-8000-000000000001'),
  ('51000000-0000-4000-8000-000000000002');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"51000000-0000-4000-8000-000000000001"}',
  true
);
select set_config('request.jwt.claim.sub', '51000000-0000-4000-8000-000000000001', true);

do $$
declare
  v_insert_denied boolean := false;
  v_other_rows integer := -1;
  v_update_denied boolean := false;
begin
  begin
    update public.user_profiles
    set password_auth_enabled_at = clock_timestamp()
    where user_id = '51000000-0000-4000-8000-000000000001';
  exception when insufficient_privilege then
    v_update_denied := true;
  end;
  if not v_update_denied then
    raise exception 'authenticated owner changed server-managed password capability';
  end if;

  begin
    insert into public.user_profiles (user_id, password_auth_enabled_at)
    values ('51000000-0000-4000-8000-000000000003', clock_timestamp());
  exception when insufficient_privilege then
    v_insert_denied := true;
  end;
  if not v_insert_denied then
    raise exception 'authenticated owner inserted a false password capability';
  end if;

  update public.user_profiles
  set password_auth_enabled_at = clock_timestamp()
  where user_id = '51000000-0000-4000-8000-000000000002';
  get diagnostics v_other_rows = row_count;
  if v_other_rows <> 0 then
    raise exception 'authenticated user changed another account password capability';
  end if;
end;
$$;

reset role;
set local role service_role;

update public.user_profiles
set password_auth_enabled_at = clock_timestamp()
where user_id = '51000000-0000-4000-8000-000000000001';

do $$
begin
  if not exists (
    select 1 from public.user_profiles
    where user_id = '51000000-0000-4000-8000-000000000001'
      and password_auth_enabled_at is not null
  ) then
    raise exception 'service role could not record password capability';
  end if;
end;
$$;

reset role;
rollback;
