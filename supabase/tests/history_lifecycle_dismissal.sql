begin;

insert into auth.users(id, aud, role, email, encrypted_password, created_at, updated_at) values
  ('41000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'history-dismiss-a@example.test', '', now(), now()),
  ('42000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'history-dismiss-b@example.test', '', now(), now());

insert into public.dog_profiles(id, user_id, name, species) values
  ('41000000-0000-4000-8000-000000000011', '41000000-0000-4000-8000-000000000001', 'Tracked pet', 'dog'),
  ('41000000-0000-4000-8000-000000000012', '41000000-0000-4000-8000-000000000001', 'Other owned pet', 'cat'),
  ('42000000-0000-4000-8000-000000000021', '42000000-0000-4000-8000-000000000002', 'Other user pet', 'dog');

insert into public.pet_care_episodes(
  id, user_id, pet_profile_id, episode_type, normalized_key, title, status,
  severity, sequence_number, started_at, last_event_at, summary
) values
  ('41000000-0000-4000-8000-000000000101', '41000000-0000-4000-8000-000000000001',
    '41000000-0000-4000-8000-000000000011', 'symptom', 'health_vomiting', 'Vomiting',
    'active', 'urgent', 1, now(), now(), '{"latestStatus":"active"}'),
  ('41000000-0000-4000-8000-000000000102', '41000000-0000-4000-8000-000000000001',
    '41000000-0000-4000-8000-000000000012', 'symptom', 'health_vomiting', 'Other pet vomiting',
    'monitoring', 'urgent', 1, now(), now(), '{"latestStatus":"monitoring"}'),
  ('42000000-0000-4000-8000-000000000201', '42000000-0000-4000-8000-000000000002',
    '42000000-0000-4000-8000-000000000021', 'symptom', 'health_vomiting', 'Private vomiting',
    'active', 'urgent', 1, now(), now(), '{"latestStatus":"active"}');

insert into public.pet_care_entries(
  id, user_id, pet_profile_id, category, title, note, severity, state_action_type,
  care_event_metadata, episode_id, occurred_at
) values
  ('41000000-0000-4000-8000-000000000110', '41000000-0000-4000-8000-000000000001',
    '41000000-0000-4000-8000-000000000011', 'general', 'Old grooming note',
    'Historical only', null, null, '{}', null, now() - interval '2 days'),
  ('41000000-0000-4000-8000-000000000111', '41000000-0000-4000-8000-000000000001',
    '41000000-0000-4000-8000-000000000011', 'symptom', 'Vomiting started',
    'Vomiting started today', 'mild', 'semantic_started',
    '{"semanticDomain":"health","semanticTopic":"vomiting","semanticTransition":"started"}',
    '41000000-0000-4000-8000-000000000101', now()),
  ('41000000-0000-4000-8000-000000000112', '41000000-0000-4000-8000-000000000001',
    '41000000-0000-4000-8000-000000000012', 'symptom', 'Other pet vomiting',
    'Other pet is vomiting', 'mild', 'semantic_started',
    '{"semanticDomain":"health","semanticTopic":"vomiting","semanticTransition":"started"}',
    '41000000-0000-4000-8000-000000000102', now()),
  ('42000000-0000-4000-8000-000000000211', '42000000-0000-4000-8000-000000000002',
    '42000000-0000-4000-8000-000000000021', 'symptom', 'Private vomiting',
    'Private symptom', 'mild', 'semantic_started',
    '{"semanticDomain":"health","semanticTopic":"vomiting","semanticTransition":"started"}',
    '42000000-0000-4000-8000-000000000201', now());

insert into public.pet_concerns(
  id, user_id, pet_profile_id, title, normalized_key, status, severity,
  source_care_entry_id, lifecycle_episode_id, active_episode_id, identity_provenance
) values (
  '41000000-0000-4000-8000-000000000121', '41000000-0000-4000-8000-000000000001',
  '41000000-0000-4000-8000-000000000011', 'Vomiting', 'health_vomiting', 'active', 'urgent',
  '41000000-0000-4000-8000-000000000111', '41000000-0000-4000-8000-000000000101',
  '41000000-0000-4000-8000-000000000101', 'canonical_episode'
);
update public.pet_care_episodes set linked_concern_id = '41000000-0000-4000-8000-000000000121'
where id = '41000000-0000-4000-8000-000000000101';
update public.pet_care_entries set concern_id = '41000000-0000-4000-8000-000000000121'
where id = '41000000-0000-4000-8000-000000000111';
update public.pet_current_state set
  state = jsonb_set(state, '{semanticStates}', jsonb_build_object('health_vomiting', jsonb_build_object(
    'domain', 'health', 'topic', 'vomiting', 'status', 'active',
    'episodeId', '41000000-0000-4000-8000-000000000101',
    'sourceEventId', '41000000-0000-4000-8000-000000000111'
  )), true),
  active_episode_ids = array['41000000-0000-4000-8000-000000000101'::uuid],
  source_event_ids = array['41000000-0000-4000-8000-000000000111'::uuid]
where pet_profile_id = '41000000-0000-4000-8000-000000000011';

set local role authenticated;
select set_config('request.jwt.claim.sub', '41000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
declare
  v_result record;
  v_entry_count integer;
  v_other_pet_status text;
begin
  select status into strict v_other_pet_status from public.pet_care_episodes
  where id = '41000000-0000-4000-8000-000000000102';
  select * into v_result from public.remove_my_care_entry('41000000-0000-4000-8000-000000000110', true);
  if not exists(select 1 from public.pet_care_entries where id = v_result.entry_id and deleted_at is not null) then
    raise exception 'inactive historical entry was not tombstoned';
  end if;

  select count(*) into v_entry_count from public.pet_care_entries
  where pet_profile_id = '41000000-0000-4000-8000-000000000011';
  select * into v_result from public.remove_my_care_entry('41000000-0000-4000-8000-000000000111', true);
  if not v_result.lifecycle_dismissed or v_result.lifecycle_still_active then
    raise exception 'History deletion did not dismiss the lifecycle';
  end if;
  if not exists(select 1 from public.pet_care_episodes where id = '41000000-0000-4000-8000-000000000101'
    and status = 'dismissed' and dismissal_reason = 'user_removed' and resolved_at is null) then
    raise exception 'episode was not non-clinically dismissed';
  end if;
  if not exists(select 1 from public.pet_concerns where id = '41000000-0000-4000-8000-000000000121'
    and status = 'dismissed' and dismissal_reason = 'user_removed' and resolved_at is null and active_episode_id is null) then
    raise exception 'canonical concern was not dismissed';
  end if;
  if exists(select 1 from public.pet_current_state where pet_profile_id = '41000000-0000-4000-8000-000000000011'
    and ('41000000-0000-4000-8000-000000000101'::uuid = any(active_episode_ids)
      or '41000000-0000-4000-8000-000000000101'::uuid = any(monitoring_episode_ids)
      or '41000000-0000-4000-8000-000000000111'::uuid = any(source_event_ids)
      or state->'semanticStates' ? 'health_vomiting')) then
    raise exception 'dismissed lifecycle remained in current state';
  end if;
  if not exists(select 1 from public.pet_care_episode_events where care_entry_id = '41000000-0000-4000-8000-000000000111'
    and episode_id = '41000000-0000-4000-8000-000000000101') then
    raise exception 'episode provenance was removed';
  end if;
  if (select count(*) from public.pet_care_entries where pet_profile_id = '41000000-0000-4000-8000-000000000011') <> v_entry_count then
    raise exception 'dismissal fabricated a History row';
  end if;
  if exists(select 1 from public.pet_care_entries where pet_profile_id = '41000000-0000-4000-8000-000000000011'
    and state_action_type = 'resolve_concern') then
    raise exception 'History deletion fabricated clinical resolution History';
  end if;
  if exists(select 1 from public.pet_care_episodes where id = '41000000-0000-4000-8000-000000000101'
    and status in ('active', 'monitoring')) then
    raise exception 'Ask-active episode retrieval includes dismissed lifecycle';
  end if;
  if exists(select 1 from public.pet_concerns where id = '41000000-0000-4000-8000-000000000121'
    and status in ('active', 'monitoring', 'reopened')) then
    raise exception 'Ask-active concern retrieval includes dismissed lifecycle';
  end if;

  select * into v_result from public.remove_my_care_entry('41000000-0000-4000-8000-000000000111', true);
  if not v_result.already_tombstoned or not v_result.lifecycle_dismissed then
    raise exception 'repeated dismissal was not idempotent';
  end if;
  if not exists(select 1 from public.pet_care_episodes where id = '41000000-0000-4000-8000-000000000102' and status = v_other_pet_status) then
    raise exception 'dismissal crossed into another owned pet';
  end if;

  select * into v_result from public.remove_my_care_entry('41000000-0000-4000-8000-000000000112', true);
  if not v_result.lifecycle_dismissed or not exists(
    select 1 from public.pet_care_episodes where id = '41000000-0000-4000-8000-000000000102'
      and status = 'dismissed' and dismissal_reason = 'user_removed' and resolved_at is null
  ) then
    raise exception 'monitoring lifecycle was not dismissed by History deletion';
  end if;

  begin
    perform public.remove_my_care_entry('42000000-0000-4000-8000-000000000211', true);
    raise exception 'cross-user dismissal succeeded';
  exception when no_data_found then null;
  end;
end;
$$;

reset role;
do $$ begin
  if not exists(select 1 from public.pet_care_episodes where id = '42000000-0000-4000-8000-000000000201' and status = 'active') then
    raise exception 'cross-user lifecycle was changed';
  end if;
end $$;

rollback;
