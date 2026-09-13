begin;

do $$
declare
  v_rls boolean;
  v_force_rls boolean;
begin
  if not has_table_privilege('service_role', 'public.pet_care_episode_events', 'select') then
    raise exception 'service_role lacks the trusted lifecycle-event read required by account export';
  end if;
  if has_table_privilege('anon', 'public.pet_care_episode_events', 'select') then
    raise exception 'anon unexpectedly gained lifecycle-event read access';
  end if;
  if not has_table_privilege('authenticated', 'public.pet_care_episode_events', 'select') then
    raise exception 'the pre-existing authenticated owner-read grant is missing';
  end if;

  select relrowsecurity, relforcerowsecurity into strict v_rls, v_force_rls
  from pg_catalog.pg_class
  where oid = 'public.pet_care_episode_events'::regclass;
  if not v_rls or not v_force_rls then
    raise exception 'lifecycle-event RLS is not enabled and forced';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'pet_care_episode_events'
      and policyname = 'Users can select their episode events'
      and cmd = 'SELECT'
      and regexp_replace(qual, '[[:space:]]', '', 'g') = '(user_id=auth.uid())'
  ) then
    raise exception 'the authenticated lifecycle-event owner-read policy changed';
  end if;
end;
$$;

insert into auth.users(id, aud, role, email, encrypted_password, created_at, updated_at) values
  ('61000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'event-grant-a@example.test', '', now(), now()),
  ('62000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'event-grant-b@example.test', '', now(), now());

insert into public.dog_profiles(id, user_id, name, species) values
  ('61000000-0000-4000-8000-000000000011', '61000000-0000-4000-8000-000000000001', 'Event grant A', 'dog'),
  ('62000000-0000-4000-8000-000000000022', '62000000-0000-4000-8000-000000000002', 'Event grant B', 'dog');

insert into public.pet_care_episodes(
  id, user_id, pet_profile_id, episode_type, normalized_key, title,
  status, severity, sequence_number, started_at, last_event_at
) values
  ('61000000-0000-4000-8000-000000000101', '61000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-000000000011', 'symptom', 'event_grant_a',
    'Event grant A', 'active', 'routine', 1, now(), now()),
  ('62000000-0000-4000-8000-000000000202', '62000000-0000-4000-8000-000000000002',
    '62000000-0000-4000-8000-000000000022', 'symptom', 'event_grant_b',
    'Event grant B', 'active', 'routine', 1, now(), now());

insert into public.pet_care_entries(
  id, user_id, pet_profile_id, category, title, note, severity, state_action_type,
  care_event_metadata, episode_id, occurred_at
) values
  ('61000000-0000-4000-8000-000000000111', '61000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-000000000011', 'symptom', 'Event A', 'Owned event',
    'mild', 'semantic_started', '{"semanticDomain":"health","semanticTopic":"event_grant_a","semanticTransition":"started"}',
    '61000000-0000-4000-8000-000000000101', now()),
  ('62000000-0000-4000-8000-000000000222', '62000000-0000-4000-8000-000000000002',
    '62000000-0000-4000-8000-000000000022', 'symptom', 'Event B', 'Other user event',
    'mild', 'semantic_started', '{"semanticDomain":"health","semanticTopic":"event_grant_b","semanticTransition":"started"}',
    '62000000-0000-4000-8000-000000000202', now());

set local role authenticated;
select set_config('request.jwt.claim.sub', '61000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
begin
  if (select count(*) from public.pet_care_episode_events) <> 1 then
    raise exception 'authenticated lifecycle-event reads are not restricted to the owner';
  end if;
  if exists (
    select 1 from public.pet_care_episode_events
    where user_id = '62000000-0000-4000-8000-000000000002'
  ) then
    raise exception 'authenticated user read another user lifecycle event';
  end if;
end;
$$;

reset role;
set local role anon;
do $$
begin
  begin
    perform 1 from public.pet_care_episode_events limit 1;
    raise exception 'anon read lifecycle events';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
set local role service_role;
do $$
begin
  if (select count(*) from public.pet_care_episode_events) <> 2 then
    raise exception 'trusted lifecycle-event read did not span both test owners';
  end if;
end;
$$;

rollback;
