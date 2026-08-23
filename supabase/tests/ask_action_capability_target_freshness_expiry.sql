begin;

insert into auth.users(id, aud, role, email, encrypted_password, created_at, updated_at) values
  ('91000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'action-cap-a@example.test', '', now(), now()),
  ('92000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'action-cap-b@example.test', '', now(), now());

insert into public.dog_profiles(id, user_id, name, species) values
  ('91000000-0000-4000-8000-000000000011', '91000000-0000-4000-8000-000000000001', 'Maple', 'dog'),
  ('91000000-0000-4000-8000-000000000012', '91000000-0000-4000-8000-000000000001', 'Juniper', 'cat'),
  ('92000000-0000-4000-8000-000000000021', '92000000-0000-4000-8000-000000000002', 'Cedar', 'dog');

insert into public.ask_conversations(id, user_id, pet_profile_id, title) values
  ('91000000-0000-4000-8000-000000000031', '91000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000011', 'Maple actions');

insert into public.ask_conversation_messages(
  id, conversation_id, user_id, role, sequence_number, user_text, response_data, request_id
) values
  ('91000000-0000-4000-8000-000000000041', '91000000-0000-4000-8000-000000000031', '91000000-0000-4000-8000-000000000001',
    'user', 1, 'Update the exact discussed record', null, '91000000-0000-4000-8000-000000000201'),
  ('91000000-0000-4000-8000-000000000042', '91000000-0000-4000-8000-000000000031', '91000000-0000-4000-8000-000000000001',
    'furvise', 2, null, '{}'::jsonb, '91000000-0000-4000-8000-000000000201');

insert into public.pet_care_entries(id, user_id, pet_profile_id, category, title, note, occurred_at) values
  ('91000000-0000-4000-8000-000000000101', '91000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000011', 'general', 'Exact older target', 'Exact record discussed by the owner.', now() - interval '2 days'),
  ('91000000-0000-4000-8000-000000000102', '91000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000011', 'general', 'Different newer record', 'This newer record must never be substituted.', now()),
  ('91000000-0000-4000-8000-000000000103', '91000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000011', 'general', 'Stale edit target', 'Original edit state.', now() - interval '1 day'),
  ('91000000-0000-4000-8000-000000000104', '91000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000011', 'general', 'Stale remove target', 'Original remove state.', now() - interval '1 day'),
  ('91000000-0000-4000-8000-000000000105', '91000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000011', 'general', 'Fresh edit target', 'Original fresh edit state.', now() - interval '1 day'),
  ('91000000-0000-4000-8000-000000000106', '91000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000011', 'general', 'Expired target', 'Original expired state.', now() - interval '1 day'),
  ('91000000-0000-4000-8000-000000000112', '91000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000012', 'general', 'Wrong pet target', 'Must not bind across pets.', now()),
  ('92000000-0000-4000-8000-000000000121', '92000000-0000-4000-8000-000000000002', '92000000-0000-4000-8000-000000000021', 'general', 'Other user target', 'Must not bind across users.', now());

insert into public.pet_concerns(id, user_id, pet_profile_id, title, normalized_key, status, severity) values
  ('91000000-0000-4000-8000-000000000151', '91000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000011', 'Concern transition', 'action_capability_concern', 'active', 'routine'),
  ('91000000-0000-4000-8000-000000000152', '91000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000011', 'Stale concern', 'action_capability_stale_concern', 'active', 'routine');

create function pg_temp.mint_action_capability(
  p_capability_id uuid,
  p_suffix text,
  p_kind text,
  p_target_id uuid,
  p_detail text default null
)
returns uuid
language plpgsql
as $$
declare
  v_source_action_id text := '91000000-0000-4000-8000-000000000201:' || p_suffix;
  v_confirmation text := case when p_kind in ('care_history.edit', 'care_history.remove') then 'always' else 'explicit_intent' end;
  v_safety text := case when p_kind in ('care_history.edit', 'care_history.remove') then 'CONFIRMATION_REQUIRED' else 'LOW_RISK_REVERSIBLE' end;
  v_scope text := case when p_kind in ('care_history.edit', 'care_history.remove') then 'owned_care_record' else 'owned_concern' end;
  v_payload jsonb;
begin
  v_payload := jsonb_build_object(
    'id', v_source_action_id,
    'kind', p_kind,
    'petId', '91000000-0000-4000-8000-000000000011',
    'sourceMessageId', '91000000-0000-4000-8000-000000000041',
    'safetyClass', v_safety,
    'mutationClass', 'mutation',
    'confirmationPolicy', v_confirmation,
    'authorizationScope', v_scope,
    'explicitIntent', true,
    'input', jsonb_build_object(
      'field', null, 'value', null, 'title', null, 'detail', p_detail,
      'category', null, 'target', 'specified'
    ),
    'evidence', 'Update the exact discussed record',
    'status', case when v_confirmation = 'always' then 'confirmation_required' else 'proposed' end,
    'label', 'Test action',
    'description', 'Test the exact target.',
    'href', null,
    'resultMessage', null,
    'errorMessage', null
  );

  insert into public.ask_action_capabilities(
    id, user_id, assistant_message_id, source_message_id, source_action_id,
    action_kind, pet_profile_id, target_id, safety_class, mutation_class,
    confirmation_policy, authorization_scope, explicit_intent, action_payload
  ) values (
    p_capability_id, '91000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000042', '91000000-0000-4000-8000-000000000041',
    v_source_action_id, p_kind, '91000000-0000-4000-8000-000000000011', p_target_id,
    v_safety, 'mutation', v_confirmation, v_scope, true, v_payload
  );
  return p_capability_id;
end;
$$;

do $$
declare
  v_result record;
  v_replay record;
  v_timestamp interval;
  v_denied boolean;
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);

  -- C/D: target authorization is checked at mint against exact user and pet.
  v_denied := false;
  begin
    perform pg_temp.mint_action_capability('91000000-0000-4000-8000-000000000311', 'wrong-pet', 'care_history.remove', '91000000-0000-4000-8000-000000000112');
  exception when check_violation then v_denied := sqlerrm = 'ACTION_CAPABILITY_TARGET_BINDING_INVALID';
  end;
  if not v_denied then raise exception 'C: wrong-pet target was not denied'; end if;

  v_denied := false;
  begin
    perform pg_temp.mint_action_capability('91000000-0000-4000-8000-000000000312', 'other-user', 'care_history.remove', '92000000-0000-4000-8000-000000000121');
  exception when check_violation then v_denied := sqlerrm = 'ACTION_CAPABILITY_TARGET_BINDING_INVALID';
  end;
  if not v_denied then raise exception 'D: other-user target was not denied'; end if;

  -- A/B/G/I/J/N: mutate the exact older record, keep the newer row intact, and
  -- return one stable receipt on replay.
  perform pg_temp.mint_action_capability('91000000-0000-4000-8000-000000000301', 'exact-remove', 'care_history.remove', '91000000-0000-4000-8000-000000000101');
  select * into v_result from public.execute_ask_action_capability(
    '91000000-0000-4000-8000-000000000301', '91000000-0000-4000-8000-000000000042',
    '91000000-0000-4000-8000-000000000001', 'confirm', null
  );
  if not v_result.changed or v_result.action->>'status' <> 'succeeded' then raise exception 'A/G/I: fresh exact removal failed: %', row_to_json(v_result); end if;
  if not exists(select 1 from public.pet_care_entries where id = '91000000-0000-4000-8000-000000000101' and deleted_at is not null) then raise exception 'A: exact discussed record was not removed'; end if;
  if not exists(select 1 from public.pet_care_entries where id = '91000000-0000-4000-8000-000000000102' and deleted_at is null) then raise exception 'B: newer record was silently substituted'; end if;
  select * into v_replay from public.execute_ask_action_capability(
    '91000000-0000-4000-8000-000000000301', '91000000-0000-4000-8000-000000000042',
    '91000000-0000-4000-8000-000000000001', 'confirm', null
  );
  if v_replay.changed or v_replay.action is distinct from v_result.action then raise exception 'J/N: replay did not return the stable first receipt'; end if;

  -- D at execution: a correct capability ID is still unavailable to another user.
  if (select count(*) from public.execute_ask_action_capability(
    '91000000-0000-4000-8000-000000000301', '91000000-0000-4000-8000-000000000042',
    '92000000-0000-4000-8000-000000000002', 'confirm', null
  )) <> 0 then raise exception 'D: another user could retrieve a capability receipt'; end if;

  -- E: stale edits fail without overwriting the intervening value.
  perform pg_temp.mint_action_capability('91000000-0000-4000-8000-000000000302', 'stale-edit', 'care_history.edit', '91000000-0000-4000-8000-000000000103', 'Stale capability overwrite attempt.');
  perform pg_sleep(0.002);
  execute 'alter table public.pet_care_entries disable trigger pet_care_entries_touch_updated_at';
  update public.pet_care_entries set note = 'Newer legitimate edit.', updated_at = clock_timestamp() where id = '91000000-0000-4000-8000-000000000103';
  execute 'alter table public.pet_care_entries enable trigger pet_care_entries_touch_updated_at';
  select * into v_result from public.execute_ask_action_capability(
    '91000000-0000-4000-8000-000000000302', '91000000-0000-4000-8000-000000000042',
    '91000000-0000-4000-8000-000000000001', 'confirm', null
  );
  if v_result.changed or v_result.action->>'errorMessage' <> 'That history update changed after this action was prepared.' then raise exception 'E: stale edit did not fail closed: %', row_to_json(v_result); end if;
  if (select note from public.pet_care_entries where id = '91000000-0000-4000-8000-000000000103') <> 'Newer legitimate edit.' then raise exception 'E: stale edit overwrote newer state'; end if;

  -- F: stale removals use the same target generation comparison.
  perform pg_temp.mint_action_capability('91000000-0000-4000-8000-000000000303', 'stale-remove', 'care_history.remove', '91000000-0000-4000-8000-000000000104');
  perform pg_sleep(0.002);
  execute 'alter table public.pet_care_entries disable trigger pet_care_entries_touch_updated_at';
  update public.pet_care_entries set note = 'Newer state before removal.', updated_at = clock_timestamp() where id = '91000000-0000-4000-8000-000000000104';
  execute 'alter table public.pet_care_entries enable trigger pet_care_entries_touch_updated_at';
  select * into v_result from public.execute_ask_action_capability(
    '91000000-0000-4000-8000-000000000303', '91000000-0000-4000-8000-000000000042',
    '91000000-0000-4000-8000-000000000001', 'confirm', null
  );
  if v_result.changed or v_result.action->>'errorMessage' <> 'That history update changed after this action was prepared.' then raise exception 'F: stale remove did not fail closed: %', row_to_json(v_result); end if;
  if not exists(select 1 from public.pet_care_entries where id = '91000000-0000-4000-8000-000000000104' and deleted_at is null) then raise exception 'F: stale remove deleted the record'; end if;

  -- M: ordinary fresh care edits and concern resolve/reopen remain supported.
  perform pg_temp.mint_action_capability('91000000-0000-4000-8000-000000000304', 'fresh-edit', 'care_history.edit', '91000000-0000-4000-8000-000000000105', 'Fresh exact edit succeeds.');
  select * into v_result from public.execute_ask_action_capability(
    '91000000-0000-4000-8000-000000000304', '91000000-0000-4000-8000-000000000042',
    '91000000-0000-4000-8000-000000000001', 'confirm', null
  );
  if not v_result.changed or (select note from public.pet_care_entries where id = '91000000-0000-4000-8000-000000000105') <> 'Fresh exact edit succeeds.' then raise exception 'M: fresh edit failed'; end if;

  perform pg_temp.mint_action_capability('91000000-0000-4000-8000-000000000306', 'concern-resolve', 'care_state.resolve', '91000000-0000-4000-8000-000000000151');
  select * into v_result from public.execute_ask_action_capability(
    '91000000-0000-4000-8000-000000000306', '91000000-0000-4000-8000-000000000042',
    '91000000-0000-4000-8000-000000000001', 'auto', null
  );
  if not v_result.changed or (select status from public.pet_concerns where id = '91000000-0000-4000-8000-000000000151') <> 'resolved' then raise exception 'M: concern resolve failed'; end if;
  perform pg_temp.mint_action_capability('91000000-0000-4000-8000-000000000307', 'concern-reopen', 'care_state.reopen', '91000000-0000-4000-8000-000000000151');
  select * into v_result from public.execute_ask_action_capability(
    '91000000-0000-4000-8000-000000000307', '91000000-0000-4000-8000-000000000042',
    '91000000-0000-4000-8000-000000000001', 'auto', null
  );
  if not v_result.changed or (select status from public.pet_concerns where id = '91000000-0000-4000-8000-000000000151') <> 'reopened' then raise exception 'M: concern reopen failed'; end if;

  -- Concern freshness is also target-generation-bound.
  perform pg_temp.mint_action_capability('91000000-0000-4000-8000-000000000308', 'stale-concern', 'care_state.resolve', '91000000-0000-4000-8000-000000000152');
  perform pg_sleep(0.002);
  update public.pet_concerns set title = 'Newer concern state', updated_at = clock_timestamp() where id = '91000000-0000-4000-8000-000000000152';
  select * into v_result from public.execute_ask_action_capability(
    '91000000-0000-4000-8000-000000000308', '91000000-0000-4000-8000-000000000042',
    '91000000-0000-4000-8000-000000000001', 'auto', null
  );
  if v_result.changed or v_result.action->>'errorMessage' <> 'That concern changed after this action was prepared.' then raise exception 'concern freshness failed: %', row_to_json(v_result); end if;

  -- L: immutable authority cannot be rebound after creation.
  v_denied := false;
  begin
    update public.ask_action_capabilities set target_id = '91000000-0000-4000-8000-000000000102'
    where id = '91000000-0000-4000-8000-000000000303';
  exception when sqlstate '55000' then v_denied := sqlerrm = 'ACTION_CAPABILITY_IMMUTABLE';
  end;
  if not v_denied then raise exception 'L: capability target could be rebound'; end if;

  -- Every new row receives one exact, database-authored TTL.
  select expires_at - created_at into v_timestamp from public.ask_action_capabilities
  where id = '91000000-0000-4000-8000-000000000304';
  if v_timestamp <> interval '15 minutes' then raise exception 'TTL was not exactly 15 minutes: %', v_timestamp; end if;
end;
$$;

-- H: age one test row without weakening production paths, then prove the public
-- executor terminalizes it without touching application state.
select pg_temp.mint_action_capability('91000000-0000-4000-8000-000000000305', 'expired-edit', 'care_history.edit', '91000000-0000-4000-8000-000000000106', 'Expired edit must not apply.');
alter table public.ask_action_capabilities disable trigger ask_action_capabilities_protect_update;
with aged as (select clock_timestamp() - interval '16 minutes' as created_at)
update public.ask_action_capabilities capability
set created_at = aged.created_at,
  expires_at = aged.created_at + interval '15 minutes'
from aged
where id = '91000000-0000-4000-8000-000000000305';
alter table public.ask_action_capabilities enable trigger ask_action_capabilities_protect_update;

do $$
declare v_result record;
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);
  select * into v_result from public.execute_ask_action_capability(
    '91000000-0000-4000-8000-000000000305', '91000000-0000-4000-8000-000000000042',
    '91000000-0000-4000-8000-000000000001', 'confirm', null
  );
  if v_result.changed or v_result.action->>'errorMessage' <> 'That action expired before it was confirmed.' then raise exception 'H: expired capability was not denied: %', row_to_json(v_result); end if;
  if (select note from public.pet_care_entries where id = '91000000-0000-4000-8000-000000000106') <> 'Original expired state.' then raise exception 'H: expired capability mutated application state'; end if;
  if has_function_privilege('service_role', 'private.execute_ask_action_capability(uuid,uuid,uuid,text,uuid)', 'execute') then raise exception 'private legacy executor remains callable by service_role'; end if;
  if not has_function_privilege('service_role', 'public.execute_ask_action_capability(uuid,uuid,uuid,text,uuid)', 'execute') then raise exception 'public hardened executor is unavailable to service_role'; end if;
end;
$$;

rollback;
