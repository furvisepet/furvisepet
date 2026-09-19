begin;

insert into auth.users(id, aud, role, email, encrypted_password, created_at, updated_at) values
  ('31000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'tenant-link-a@example.test', '', now(), now()),
  ('32000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'tenant-link-b@example.test', '', now(), now());

insert into public.dog_profiles(id, user_id, name, species) values
  ('31000000-0000-4000-8000-000000000011', '31000000-0000-4000-8000-000000000001', 'Tenant A one', 'dog'),
  ('31000000-0000-4000-8000-000000000012', '31000000-0000-4000-8000-000000000001', 'Tenant A two', 'dog'),
  ('32000000-0000-4000-8000-000000000021', '32000000-0000-4000-8000-000000000002', 'Tenant B one', 'dog'),
  ('32000000-0000-4000-8000-000000000022', '32000000-0000-4000-8000-000000000002', 'Tenant B two', 'dog');

insert into public.furvise_memories(
  id, user_id, pet_id, subject_type, category, fact_key, fact_value,
  normalized_value, confidence, importance, durability, source_type, dedupe_key
) values (
  '32000000-0000-4000-8000-000000000031', '32000000-0000-4000-8000-000000000002',
  '32000000-0000-4000-8000-000000000021', 'pet', 'test', 'tenant_b_private',
  '{"value":"private"}', 'private', 0.9, 'medium', 'ongoing', 'tenant_link_test', 'tenant-link-b-private'
);
insert into public.pet_care_episodes(
  id, user_id, pet_profile_id, episode_type, normalized_key, title,
  status, severity, sequence_number, started_at, last_event_at
) values (
  '32000000-0000-4000-8000-000000000032', '32000000-0000-4000-8000-000000000002',
  '32000000-0000-4000-8000-000000000021', 'care_tracking', 'tenant_b_private',
  'Tenant B private', 'active', 'routine', 1, now(), now()
);
insert into public.pet_current_state(pet_profile_id, user_id, state) values (
  '32000000-0000-4000-8000-000000000021',
  '32000000-0000-4000-8000-000000000002',
  '{"wellbeing":{"overall":"routine"}}'
);

-- Test RLS independently of the production decision that generated episode and
-- state rows are not directly updateable by authenticated sessions. Grants are
-- transaction-local because the entire verification rolls back.
grant insert, update on public.pet_care_episodes, public.pet_current_state to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '31000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.furvise_memories(
  id, user_id, pet_id, subject_type, category, fact_key, fact_value,
  normalized_value, confidence, importance, durability, source_type, dedupe_key
) values (
  '31000000-0000-4000-8000-000000000041', '31000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000011', 'pet', 'test', 'owned_pet',
  '{"value":"owned"}', 'owned', 0.9, 'medium', 'ongoing', 'tenant_link_test', 'tenant-link-a-owned'
);

insert into public.furvise_memories(
  id, user_id, pet_id, subject_type, category, fact_key, fact_value,
  normalized_value, confidence, importance, durability, source_type, dedupe_key
) values (
  '31000000-0000-4000-8000-000000000042', '31000000-0000-4000-8000-000000000001',
  null, 'owner', 'test', 'owner_nullable', '{"value":"owner"}', 'owner',
  0.9, 'medium', 'ongoing', 'tenant_link_test', 'tenant-link-a-owner-null'
);

do $$
begin
  begin
    insert into public.furvise_memories(
      user_id, pet_id, subject_type, category, fact_key, fact_value,
      normalized_value, confidence, importance, durability, source_type, dedupe_key
    ) values (
      '31000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000021',
      'pet', 'test', 'cross_insert', '{"value":"blocked"}', 'blocked', 0.9,
      'medium', 'ongoing', 'tenant_link_test', 'tenant-link-cross-insert'
    );
    raise exception 'cross-tenant memory insert succeeded';
  exception when insufficient_privilege or check_violation then null;
  end;

  begin
    insert into public.furvise_memories(
      user_id, pet_id, subject_type, category, fact_key, fact_value,
      normalized_value, confidence, importance, durability, source_type, dedupe_key
    ) values (
      '31000000-0000-4000-8000-000000000001', null, 'pet', 'test', 'missing_pet',
      '{"value":"blocked"}', 'blocked', 0.9, 'medium', 'ongoing',
      'tenant_link_test', 'tenant-link-missing-pet'
    );
    raise exception 'pet memory accepted a null pet link';
  exception when insufficient_privilege or check_violation then null;
  end;

  begin
    insert into public.furvise_memories(
      user_id, pet_id, subject_type, category, fact_key, fact_value,
      normalized_value, confidence, importance, durability, source_type, dedupe_key
    ) values (
      '31000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000011',
      'owner', 'test', 'owner_with_pet', '{"value":"blocked"}', 'blocked', 0.9,
      'medium', 'ongoing', 'tenant_link_test', 'tenant-link-owner-with-pet'
    );
    raise exception 'owner memory accepted a non-null pet link';
  exception when insufficient_privilege or check_violation then null;
  end;

  update public.furvise_memories
    set pet_id = '31000000-0000-4000-8000-000000000012'
    where id = '31000000-0000-4000-8000-000000000041';
  if not found then raise exception 'owned memory pet reassignment failed'; end if;

  begin
    update public.furvise_memories
      set pet_id = '32000000-0000-4000-8000-000000000021'
      where id = '31000000-0000-4000-8000-000000000041';
    raise exception 'cross-tenant memory pet update succeeded';
  exception when insufficient_privilege or check_violation then null;
  end;

  begin
    update public.furvise_memories
      set user_id = '32000000-0000-4000-8000-000000000002'
      where id = '31000000-0000-4000-8000-000000000041';
    raise exception 'memory ownership update succeeded';
  exception when insufficient_privilege then null;
  end;
end;
$$;

insert into public.pet_care_episodes(
  id, user_id, pet_profile_id, episode_type, normalized_key, title,
  status, severity, sequence_number, started_at, last_event_at
) values (
  '31000000-0000-4000-8000-000000000051', '31000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000011', 'care_tracking', 'owned_episode',
  'Owned episode', 'active', 'routine', 1, now(), now()
);

insert into public.pet_current_state(
  pet_profile_id, user_id, state, active_episode_ids, source_event_ids
) values (
  '31000000-0000-4000-8000-000000000011', '31000000-0000-4000-8000-000000000001',
  '{"wellbeing":{"overall":"routine"}}',
  array['31000000-0000-4000-8000-000000000051'::uuid], '{}'
);

do $$
begin
  begin
    insert into public.pet_care_episodes(
      user_id, pet_profile_id, episode_type, normalized_key, title,
      status, severity, sequence_number, started_at, last_event_at
    ) values (
      '31000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000021',
      'care_tracking', 'cross_episode', 'Blocked', 'active', 'routine', 1, now(), now()
    );
    raise exception 'cross-tenant episode insert succeeded';
  exception when insufficient_privilege or check_violation then null;
  end;

  begin
    insert into public.pet_current_state(pet_profile_id, user_id, state) values (
      '32000000-0000-4000-8000-000000000022',
      '31000000-0000-4000-8000-000000000001',
      '{"wellbeing":{"overall":"blocked"}}'
    );
    raise exception 'cross-tenant state insert succeeded';
  exception when insufficient_privilege or check_violation then null;
  end;

  begin
    update public.pet_care_episodes
      set pet_profile_id = '32000000-0000-4000-8000-000000000021'
      where id = '31000000-0000-4000-8000-000000000051';
    raise exception 'cross-tenant episode pet update succeeded';
  exception when insufficient_privilege or check_violation then null;
  end;

  begin
    update public.pet_current_state
      set pet_profile_id = '32000000-0000-4000-8000-000000000021'
      where pet_profile_id = '31000000-0000-4000-8000-000000000011';
    raise exception 'cross-tenant state pet update succeeded';
  exception when insufficient_privilege or check_violation then null;
  end;

  begin
    update public.pet_care_episodes
      set user_id = '32000000-0000-4000-8000-000000000002'
      where id = '31000000-0000-4000-8000-000000000051';
    raise exception 'episode ownership update succeeded';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.pet_current_state
      set user_id = '32000000-0000-4000-8000-000000000002'
      where pet_profile_id = '31000000-0000-4000-8000-000000000011';
    raise exception 'state ownership update succeeded';
  exception when insufficient_privilege then null;
  end;

  if exists (
    select 1 from public.furvise_memories
    where id = '32000000-0000-4000-8000-000000000031'
  ) then raise exception 'cross-tenant memory read succeeded'; end if;
  if exists (
    select 1 from public.pet_care_episodes
    where id = '32000000-0000-4000-8000-000000000032'
  ) then raise exception 'cross-tenant episode read succeeded'; end if;
  if exists (
    select 1 from public.pet_current_state
    where pet_profile_id = '32000000-0000-4000-8000-000000000021'
  ) then raise exception 'cross-tenant state read succeeded'; end if;

  delete from public.furvise_memories
    where id = '31000000-0000-4000-8000-000000000042';
  if found then null; else raise exception 'existing owned-memory delete behavior failed'; end if;
end;
$$;

reset role;
revoke insert, update on public.pet_care_episodes, public.pet_current_state from authenticated;

do $$
begin
  if has_column_privilege('authenticated', 'public.furvise_memories', 'user_id', 'UPDATE') then
    raise exception 'authenticated can update memory user_id';
  end if;
  if has_table_privilege('authenticated', 'public.pet_care_episodes', 'UPDATE')
    or has_table_privilege('authenticated', 'public.pet_current_state', 'UPDATE')
  then
    raise exception 'authenticated retains generated-table UPDATE';
  end if;
  if not has_function_privilege('service_role', 'public.backfill_pet_care_episodes(uuid,boolean)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.recompute_pet_current_state(uuid,boolean)', 'EXECUTE')
  then
    raise exception 'service-role maintenance RPC privilege was lost';
  end if;
end;
$$;

set local role service_role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'service_role', true);

insert into public.pet_care_episodes(
  id, user_id, pet_profile_id, episode_type, normalized_key, title,
  status, severity, sequence_number, started_at, last_event_at
) values (
  '31000000-0000-4000-8000-000000000061', '31000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000012', 'care_tracking', 'service_repair',
  'Service repair', 'active', 'routine', 1, now(), now()
);
update public.pet_care_episodes
  set user_id = '32000000-0000-4000-8000-000000000002',
      pet_profile_id = '32000000-0000-4000-8000-000000000021'
  where id = '31000000-0000-4000-8000-000000000061';

select * from public.backfill_pet_care_episodes(null, true);
select * from public.recompute_pet_current_state('31000000-0000-4000-8000-000000000011', true);

rollback;
