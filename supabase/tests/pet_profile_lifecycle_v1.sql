begin;

insert into auth.users(id, aud, role, email, encrypted_password, created_at, updated_at) values
  ('71000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'pet-lifecycle-a@example.test', '', now(), now()),
  ('72000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'pet-lifecycle-b@example.test', '', now(), now());

insert into public.dog_profiles(id, user_id, name, species) values
  ('71000000-0000-4000-8000-000000000011', '71000000-0000-4000-8000-000000000001', 'Lifecycle A', 'cat'),
  ('72000000-0000-4000-8000-000000000021', '72000000-0000-4000-8000-000000000002', 'Lifecycle B', 'cat');

-- Even an attempted direct retained-state insert must start active so that the
-- first real transition is timestamped and audited.
insert into public.dog_profiles(id, user_id, name, species, lifecycle_status, lifecycle_changed_at, deceased_at)
values ('71000000-0000-4000-8000-000000000012', '71000000-0000-4000-8000-000000000001',
  'Lifecycle A deletion', 'dog', 'archived', now(), now());

insert into public.pet_care_entries(id, user_id, pet_profile_id, category, title, note, occurred_at) values
  ('71000000-0000-4000-8000-000000000101', '71000000-0000-4000-8000-000000000001',
   '71000000-0000-4000-8000-000000000011', 'general', 'Retained history', 'This history must remain readable.', now());

do $$
declare
  v_prepare_config text[];
  v_audit_config text[];
begin
  if not (
    has_table_privilege('authenticated', 'public.pet_profile_lifecycle_events', 'SELECT')
    and not has_table_privilege('authenticated', 'public.pet_profile_lifecycle_events', 'INSERT')
    and not has_table_privilege('authenticated', 'public.pet_profile_lifecycle_events', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.pet_profile_lifecycle_events', 'DELETE')
    and not has_table_privilege('authenticated', 'public.pet_profile_lifecycle_events', 'TRUNCATE')
  ) then raise exception 'authenticated lifecycle audit privileges are not select-only'; end if;

  if not (
    has_table_privilege('service_role', 'public.pet_profile_lifecycle_events', 'SELECT')
    and not has_table_privilege('service_role', 'public.pet_profile_lifecycle_events', 'INSERT')
    and not has_table_privilege('service_role', 'public.pet_profile_lifecycle_events', 'UPDATE')
    and not has_table_privilege('service_role', 'public.pet_profile_lifecycle_events', 'DELETE')
    and not has_table_privilege('service_role', 'public.pet_profile_lifecycle_events', 'TRUNCATE')
  ) then raise exception 'service-role lifecycle audit privileges are not select-only'; end if;

  if has_table_privilege('anon', 'public.pet_profile_lifecycle_events', 'SELECT')
    or has_table_privilege('anon', 'public.pet_profile_lifecycle_events', 'INSERT')
    or has_table_privilege('anon', 'public.pet_profile_lifecycle_events', 'UPDATE')
    or has_table_privilege('anon', 'public.pet_profile_lifecycle_events', 'DELETE')
    or has_table_privilege('anon', 'public.pet_profile_lifecycle_events', 'TRUNCATE')
  then raise exception 'anonymous lifecycle audit privileges were not fully revoked'; end if;

  if has_function_privilege('anon', 'private.prepare_pet_profile_lifecycle_transition()', 'EXECUTE')
    or has_function_privilege('authenticated', 'private.prepare_pet_profile_lifecycle_transition()', 'EXECUTE')
    or has_function_privilege('service_role', 'private.prepare_pet_profile_lifecycle_transition()', 'EXECUTE')
    or has_function_privilege('anon', 'private.audit_pet_profile_lifecycle_transition()', 'EXECUTE')
    or has_function_privilege('authenticated', 'private.audit_pet_profile_lifecycle_transition()', 'EXECUTE')
    or has_function_privilege('service_role', 'private.audit_pet_profile_lifecycle_transition()', 'EXECUTE')
  then raise exception 'an API role can directly execute a lifecycle trigger function'; end if;

  if has_schema_privilege('anon', 'private', 'USAGE')
    or has_schema_privilege('authenticated', 'private', 'USAGE')
    or has_schema_privilege('service_role', 'private', 'USAGE')
  then raise exception 'an API role retained private schema access'; end if;

  select proconfig into strict v_prepare_config
  from pg_catalog.pg_proc
  where oid = 'private.prepare_pet_profile_lifecycle_transition()'::regprocedure;
  select proconfig into strict v_audit_config
  from pg_catalog.pg_proc
  where oid = 'private.audit_pet_profile_lifecycle_transition()'::regprocedure;
  if not ('search_path=pg_catalog, pg_temp' = any(v_prepare_config))
    or not ('search_path=pg_catalog, pg_temp' = any(v_audit_config))
  then raise exception 'lifecycle trigger function search path is not hardened'; end if;

  if not exists (
    select 1 from pg_catalog.pg_class
    where oid = 'public.pet_profile_lifecycle_events'::regclass
      and relrowsecurity and relforcerowsecurity
  ) then raise exception 'lifecycle audit RLS is not enabled and forced'; end if;

  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'pet_profile_lifecycle_events'
      and policyname = 'Users can select their pet lifecycle events'
      and cmd = 'SELECT'
      and roles = array['authenticated'::name]
  ) then raise exception 'lifecycle audit policy is not authenticated-owner-only'; end if;
end;
$$;

do $$
begin
  if exists (select 1 from public.dog_profiles where lifecycle_status <> 'active') then
    raise exception 'existing/new profiles did not default to active';
  end if;
  if exists (select 1 from public.dog_profiles where lifecycle_changed_at is not null or deceased_at is not null) then
    raise exception 'initial active profiles unexpectedly have transition timestamps';
  end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

update public.dog_profiles
set lifecycle_status = 'deceased'
where id = '71000000-0000-4000-8000-000000000011';

do $$
declare
  v_deceased_at timestamptz;
  v_changed_at timestamptz;
begin
  select deceased_at, lifecycle_changed_at into strict v_deceased_at, v_changed_at
  from public.dog_profiles where id = '71000000-0000-4000-8000-000000000011';
  if v_deceased_at is null or v_changed_at is null or v_deceased_at <> v_changed_at then
    raise exception 'active to deceased timestamps are invalid';
  end if;
  if not exists (
    select 1 from public.pet_profile_lifecycle_events
    where pet_profile_id = '71000000-0000-4000-8000-000000000011'
      and from_status = 'active'
      and to_status = 'deceased'
      and actor_type = 'authenticated_user'
      and changed_by = '71000000-0000-4000-8000-000000000001'
  ) then raise exception 'authenticated lifecycle transition attribution is invalid'; end if;
  if (select count(*) from public.pet_care_entries where pet_profile_id = '71000000-0000-4000-8000-000000000011') <> 1 then
    raise exception 'deceased pet history is no longer readable';
  end if;
end;
$$;

create temporary table lifecycle_test_state(deceased_at timestamptz not null) on commit drop;
insert into lifecycle_test_state select deceased_at from public.dog_profiles where id = '71000000-0000-4000-8000-000000000011';

update public.dog_profiles set lifecycle_status = 'active'
where id = '71000000-0000-4000-8000-000000000011';

do $$
begin
  if not exists (
    select 1 from public.dog_profiles, lifecycle_test_state
    where id = '71000000-0000-4000-8000-000000000011'
      and lifecycle_status = 'active'
      and dog_profiles.deceased_at = lifecycle_test_state.deceased_at
      and dog_profiles.lifecycle_changed_at > lifecycle_test_state.deceased_at
  ) then raise exception 'deceased to active correction erased provenance or lacked a transition time'; end if;
end;
$$;

update public.dog_profiles set lifecycle_status = 'archived'
where id = '71000000-0000-4000-8000-000000000011';

do $$
begin
  if not exists (
    select 1 from public.dog_profiles, lifecycle_test_state
    where id = '71000000-0000-4000-8000-000000000011'
      and lifecycle_status = 'archived'
      and dog_profiles.deceased_at = lifecycle_test_state.deceased_at
  ) then raise exception 'active to archived did not preserve lifecycle provenance'; end if;
  if exists (
    select 1 from public.dog_profiles
    where user_id = '71000000-0000-4000-8000-000000000001' and lifecycle_status = 'active'
      and id = '71000000-0000-4000-8000-000000000011'
  ) then raise exception 'archived profile remained in the active workflow query'; end if;
end;
$$;

update public.dog_profiles set lifecycle_status = 'active'
where id = '71000000-0000-4000-8000-000000000011';

do $$
declare
  v_invalid_rejected boolean := false;
begin
  begin
    update public.dog_profiles set lifecycle_status = 'missing'
    where id = '71000000-0000-4000-8000-000000000011';
  exception when check_violation then
    v_invalid_rejected := true;
  end;
  if not v_invalid_rejected then raise exception 'invalid lifecycle state was accepted'; end if;

  update public.dog_profiles set lifecycle_status = 'archived'
  where id = '72000000-0000-4000-8000-000000000021';
  if found then raise exception 'cross-tenant lifecycle mutation succeeded'; end if;
  if (select count(*) from public.dog_profiles) <> 2 then
    raise exception 'normal profile ownership visibility changed';
  end if;
  if (select count(*) from public.pet_profile_lifecycle_events) <> 4 then
    raise exception 'owner did not receive exactly four lifecycle audit events';
  end if;
  if exists (select 1 from public.pet_profile_lifecycle_events where user_id <> auth.uid()) then
    raise exception 'cross-tenant lifecycle audit row was readable';
  end if;
end;
$$;

-- Permanent deletion remains distinct and continues to cascade retained data.
update public.dog_profiles set lifecycle_status = 'archived'
where id = '71000000-0000-4000-8000-000000000012';
delete from public.dog_profiles where id = '71000000-0000-4000-8000-000000000012';

do $$
begin
  if exists (select 1 from public.dog_profiles where id = '71000000-0000-4000-8000-000000000012') then
    raise exception 'permanent pet deletion was replaced by lifecycle state';
  end if;
  if exists (select 1 from public.pet_profile_lifecycle_events where pet_profile_id = '71000000-0000-4000-8000-000000000012') then
    raise exception 'permanently deleted pet retained lifecycle audit rows';
  end if;
end;
$$;

reset role;
set local role service_role;
-- A service request carrying a subject must still be attributed to the service,
-- never to the subject user.
select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'service_role', true);

update public.dog_profiles set lifecycle_status = 'archived'
where id = '72000000-0000-4000-8000-000000000021';

do $$
begin
  if not exists (
    select 1 from public.pet_profile_lifecycle_events
    where pet_profile_id = '72000000-0000-4000-8000-000000000021'
      and actor_type = 'service_role'
      and changed_by is null
  ) then raise exception 'service-role lifecycle transition was not audited'; end if;
end;
$$;

reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', '', true);

update public.dog_profiles set lifecycle_status = 'active'
where id = '72000000-0000-4000-8000-000000000021';

do $$
begin
  if not exists (
    select 1 from public.pet_profile_lifecycle_events
    where pet_profile_id = '72000000-0000-4000-8000-000000000021'
      and from_status = 'archived'
      and to_status = 'active'
      and actor_type = 'system'
      and changed_by is null
  ) then raise exception 'system lifecycle transition attribution is invalid'; end if;
end;
$$;

-- Account deletion still removes the profile, retained history, and audit data
-- through existing ON DELETE CASCADE ownership relationships.
delete from auth.users where id = '72000000-0000-4000-8000-000000000002';

do $$
begin
  if exists (select 1 from public.dog_profiles where user_id = '72000000-0000-4000-8000-000000000002') then
    raise exception 'account deletion left a pet profile behind';
  end if;
  if exists (select 1 from public.pet_profile_lifecycle_events where user_id = '72000000-0000-4000-8000-000000000002') then
    raise exception 'account deletion left lifecycle audit data behind';
  end if;
end;
$$;

rollback;
