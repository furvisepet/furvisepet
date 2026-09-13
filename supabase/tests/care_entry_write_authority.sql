begin;

insert into auth.users(id, aud, role, email, encrypted_password, created_at, updated_at, email_confirmed_at) values
  ('86000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'f8-owner@example.test', '', now(), now(), now()),
  ('87000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'f8-other@example.test', '', now(), now(), now());

insert into public.dog_profiles(id, user_id, name, species) values
  ('86000000-0000-4000-8000-000000000011', '86000000-0000-4000-8000-000000000001', 'F8 Owner Pet', 'dog'),
  ('86000000-0000-4000-8000-000000000012', '86000000-0000-4000-8000-000000000001', 'F8 Other Owned Pet', 'cat'),
  ('87000000-0000-4000-8000-000000000021', '87000000-0000-4000-8000-000000000002', 'F8 Other User Pet', 'dog');

insert into public.pet_care_entries(id, user_id, pet_profile_id, category, title, note, occurred_at) values
  ('86000000-0000-4000-8000-000000000101', '86000000-0000-4000-8000-000000000001', '86000000-0000-4000-8000-000000000011', 'general', 'Editable', 'Original edit state', now() - interval '3 hours'),
  ('86000000-0000-4000-8000-000000000102', '86000000-0000-4000-8000-000000000001', '86000000-0000-4000-8000-000000000011', 'general', 'Removable', 'Original remove state', now() - interval '2 hours'),
  ('86000000-0000-4000-8000-000000000103', '86000000-0000-4000-8000-000000000001', '86000000-0000-4000-8000-000000000012', 'general', 'Wrong pet', 'Wrong pet state', now() - interval '1 hour'),
  ('87000000-0000-4000-8000-000000000104', '87000000-0000-4000-8000-000000000002', '87000000-0000-4000-8000-000000000021', 'general', 'Other user', 'Other user state', now());

do $$
declare
  v_column text;
begin
  if has_table_privilege('authenticated', 'public.pet_care_entries', 'update') then
    raise exception 'A: authenticated retained table UPDATE';
  end if;
  foreach v_column in array array[
    'id', 'user_id', 'pet_profile_id', 'category', 'title', 'note', 'severity',
    'occurred_at', 'created_at', 'updated_at', 'concern_id',
    'intelligence_source_message_id', 'intelligence_request_id',
    'intelligence_source_type', 'state_suggestion_id', 'state_source_message_id',
    'state_action_type', 'intelligence_confidence', 'care_event_metadata',
    'episode_id', 'idempotency_key', 'deleted_at', 'deleted_by', 'deletion_reason'
  ] loop
    if has_column_privilege('authenticated', 'public.pet_care_entries', v_column, 'update') then
      raise exception 'B: authenticated retained UPDATE on %', v_column;
    end if;
  end loop;
  if has_table_privilege('anon', 'public.pet_care_entries', 'update') then
    raise exception 'E: anon retained UPDATE';
  end if;
  if has_table_privilege('authenticated', 'public.pet_care_entries', 'delete') then
    raise exception 'F: authenticated DELETE restriction regressed';
  end if;
  if not has_table_privilege('service_role', 'public.pet_care_entries', 'select,insert,update,delete') then
    raise exception 'service_role boundary changed';
  end if;
  raise notice 'A/B/E/F: privilege catalog checks passed';
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '86000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
begin
  begin
    update public.pet_care_entries set note = 'Direct owner bypass'
    where id = '86000000-0000-4000-8000-000000000101';
    raise exception 'A: authenticated owner direct UPDATE succeeded';
  exception when insufficient_privilege then null; end;
  begin
    update public.pet_care_entries set
      user_id = '86000000-0000-4000-8000-000000000001',
      pet_profile_id = '86000000-0000-4000-8000-000000000012',
      deleted_at = now(), deleted_by = '86000000-0000-4000-8000-000000000001',
      deletion_reason = 'user_removed', concern_id = null, episode_id = null,
      created_at = now(), updated_at = now()
    where id = '86000000-0000-4000-8000-000000000101';
    raise exception 'B/D: authenticated protected UPDATE succeeded';
  exception when insufficient_privilege then null; end;
  begin
    update public.pet_care_entries set note = 'Cross-user bypass'
    where id = '87000000-0000-4000-8000-000000000104';
    raise exception 'C: cross-user direct UPDATE reached the table';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.pet_care_entries where id = '86000000-0000-4000-8000-000000000101';
    raise exception 'F: authenticated direct DELETE succeeded';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.pet_care_entries(
      user_id, pet_profile_id, category, title, note, deleted_at, deleted_by, deletion_reason
    ) values (
      '86000000-0000-4000-8000-000000000001', '86000000-0000-4000-8000-000000000011',
      'general', 'Protected insert', 'Must fail', now(),
      '86000000-0000-4000-8000-000000000001', 'user_removed'
    );
    raise exception 'T: authenticated protected INSERT succeeded';
  exception when insufficient_privilege then null; end;
  raise notice 'A-F/T: direct adversarial statements were denied';
end;
$$;

do $$
declare
  v_before timestamptz;
  v_after timestamptz;
  v_episode uuid;
  v_concern uuid;
  v_result public.pet_care_entries%rowtype;
begin
  select updated_at, episode_id, concern_id into v_before, v_episode, v_concern
  from public.pet_care_entries where id = '86000000-0000-4000-8000-000000000101';

  select * into v_result from public.update_my_care_entry(
    '86000000-0000-4000-8000-000000000101',
    '86000000-0000-4000-8000-000000000011',
    v_before,
    'symptom', 'Controlled edit', 'Controlled edit succeeded', 'mild', now() - interval '30 minutes'
  );
  if v_result.id is null or v_result.note <> 'Controlled edit succeeded' then
    raise exception 'G: controlled edit failed';
  end if;
  if v_result.user_id <> '86000000-0000-4000-8000-000000000001'
    or v_result.pet_profile_id <> '86000000-0000-4000-8000-000000000011'
    or v_result.deleted_at is not null
    or v_result.episode_id is distinct from v_episode then
    raise exception 'G/N/O: controlled edit changed protected identity or lifecycle state';
  end if;
  select updated_at into v_after from public.pet_care_entries
  where id = '86000000-0000-4000-8000-000000000101';
  if v_after <= v_before then raise exception 'N: updated_at did not advance'; end if;

  begin
    perform public.update_my_care_entry(
      '86000000-0000-4000-8000-000000000101',
      '86000000-0000-4000-8000-000000000011',
      v_before,
      'general', null, 'Stale overwrite', null, now()
    );
    raise exception 'L/N: stale controlled edit succeeded';
  exception when serialization_failure then null; end;

  begin
    perform public.update_my_care_entry(
      '86000000-0000-4000-8000-000000000101',
      '86000000-0000-4000-8000-000000000012',
      v_after,
      'general', null, 'Wrong pet overwrite', null, now()
    );
    raise exception 'D: controlled RPC accepted the wrong pet';
  exception when no_data_found then null; end;

  begin
    perform public.update_my_care_entry(
      '87000000-0000-4000-8000-000000000104',
      '87000000-0000-4000-8000-000000000021',
      v_after,
      'general', null, 'Other user overwrite', null, now()
    );
    raise exception 'C/Q: controlled RPC accepted another user';
  exception when no_data_found then null; end;

  if exists (
    select 1
    from public.pet_care_entries entry
    left join public.pet_care_episodes episode on episode.id = entry.episode_id
    left join public.pet_concerns concern on concern.id = entry.concern_id
    where entry.id = '86000000-0000-4000-8000-000000000101'
      and ((episode.id is not null and (episode.user_id, episode.pet_profile_id) is distinct from (entry.user_id, entry.pet_profile_id))
        or (concern.id is not null and (concern.user_id, concern.pet_profile_id) is distinct from (entry.user_id, entry.pet_profile_id)))
  ) then
    raise exception 'O: concern/episode tenant integrity changed';
  end if;
  raise notice 'C/D/G/L/N/O/Q: controlled edit checks passed';
end;
$$;

do $$
declare
  v_first record;
  v_retry record;
begin
  select * into v_first from public.remove_my_care_entry(
    '86000000-0000-4000-8000-000000000102', true
  );
  select * into v_retry from public.remove_my_care_entry(
    '86000000-0000-4000-8000-000000000102', true
  );
  if v_first.entry_id is null or v_first.already_tombstoned then
    raise exception 'H: fresh controlled removal failed';
  end if;
  if not v_retry.already_tombstoned or v_retry.tombstoned_at is distinct from v_first.tombstoned_at then
    raise exception 'P: removal retry was not idempotent';
  end if;
  raise notice 'H/P: controlled removal and retry checks passed';
end;
$$;

insert into public.pet_care_entries(
  user_id, pet_profile_id, category, title, note, severity, occurred_at, idempotency_key
) values (
  '86000000-0000-4000-8000-000000000001', '86000000-0000-4000-8000-000000000011',
  'general', 'Allowed direct add', 'Safe authorable fields only', null, now(),
  '86000000-0000-4000-8000-000000000201'
);

do $$
begin
  if not exists (
    select 1 from public.pet_care_entries
    where user_id = '86000000-0000-4000-8000-000000000001'
      and pet_profile_id = '86000000-0000-4000-8000-000000000011'
      and idempotency_key = '86000000-0000-4000-8000-000000000201'
      and deleted_at is null and created_at is not null and updated_at is not null
  ) then
    raise exception 'I/T: intended direct add did not succeed';
  end if;
  if exists (
    select 1 from public.pet_care_entries
    where user_id = '87000000-0000-4000-8000-000000000002'
  ) then
    raise exception 'Q/R: tenant read isolation regressed';
  end if;
  raise notice 'I/Q/R/T: safe add and tenant reads passed';
end;
$$;

reset role;
set local role anon;
do $$
begin
  begin
    update public.pet_care_entries set note = 'Anonymous bypass'
    where id = '86000000-0000-4000-8000-000000000101';
    raise exception 'E: anonymous UPDATE succeeded';
  exception when insufficient_privilege then null; end;
  raise notice 'E: anonymous UPDATE denied';
end;
$$;

reset role;
set local role service_role;
update public.pet_care_entries set note = 'Trusted service mutation'
where id = '87000000-0000-4000-8000-000000000104';
reset role;

do $$
begin
  if (select note from public.pet_care_entries where id = '87000000-0000-4000-8000-000000000104')
    <> 'Trusted service mutation' then
    raise exception 'service_role controlled authority regressed';
  end if;
  raise notice 'service_role authority remains available';
end;
$$;

-- J/K/L/M are executed against the same database by
-- ask_action_capability_target_freshness_expiry.sql. S is covered by the
-- repository export/history tests; this file proves its underlying SELECT.
rollback;
