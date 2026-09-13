begin;
select plan(1);

insert into auth.users(id, aud, role, email, encrypted_password, created_at, updated_at, email_confirmed_at) values
  ('94000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'care-rollout@example.test', '', now(), now(), now());

insert into public.dog_profiles(id, user_id, name, species) values
  ('94000000-0000-4000-8000-000000000011', '94000000-0000-4000-8000-000000000001', 'Rollout Pet', 'dog');

insert into public.ask_conversations(id, user_id, pet_profile_id, title) values
  ('94000000-0000-4000-8000-000000000021', '94000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000011', 'Rollout checks');

insert into public.ask_conversation_messages(
  id, conversation_id, user_id, role, sequence_number, user_text, response_data, request_id
) values
  ('94000000-0000-4000-8000-000000000031', '94000000-0000-4000-8000-000000000021', '94000000-0000-4000-8000-000000000001',
    'user', 1, 'Rollout Pet started scratching both ears today.', null, '94000000-0000-4000-8000-000000000101'),
  ('94000000-0000-4000-8000-000000000032', '94000000-0000-4000-8000-000000000021', '94000000-0000-4000-8000-000000000001',
    'furvise', 2, null, '{}'::jsonb, '94000000-0000-4000-8000-000000000101'),
  ('94000000-0000-4000-8000-000000000033', '94000000-0000-4000-8000-000000000021', '94000000-0000-4000-8000-000000000001',
    'user', 3, 'Rollout Pet vomited once after breakfast.', null, '94000000-0000-4000-8000-000000000102'),
  ('94000000-0000-4000-8000-000000000034', '94000000-0000-4000-8000-000000000021', '94000000-0000-4000-8000-000000000001',
    'furvise', 4, null, '{}'::jsonb, '94000000-0000-4000-8000-000000000102'),
  ('94000000-0000-4000-8000-000000000035', '94000000-0000-4000-8000-000000000021', '94000000-0000-4000-8000-000000000001',
    'user', 5, 'Rollout Pet had a loose stool this afternoon.', null, '94000000-0000-4000-8000-000000000103'),
  ('94000000-0000-4000-8000-000000000036', '94000000-0000-4000-8000-000000000021', '94000000-0000-4000-8000-000000000001',
    'furvise', 6, null, '{}'::jsonb, '94000000-0000-4000-8000-000000000103'),
  ('94000000-0000-4000-8000-000000000037', '94000000-0000-4000-8000-000000000021', '94000000-0000-4000-8000-000000000001',
    'user', 7, 'Rollout Pet started limping after the walk.', null, '94000000-0000-4000-8000-000000000104'),
  ('94000000-0000-4000-8000-000000000038', '94000000-0000-4000-8000-000000000021', '94000000-0000-4000-8000-000000000001',
    'furvise', 8, null, '{}'::jsonb, '94000000-0000-4000-8000-000000000104'),
  ('94000000-0000-4000-8000-000000000039', '94000000-0000-4000-8000-000000000021', '94000000-0000-4000-8000-000000000001',
    'user', 9, 'Rollout Pet skipped dinner tonight.', null, '94000000-0000-4000-8000-000000000105'),
  ('94000000-0000-4000-8000-000000000040', '94000000-0000-4000-8000-000000000021', '94000000-0000-4000-8000-000000000001',
    'furvise', 10, null, '{}'::jsonb, '94000000-0000-4000-8000-000000000105');

insert into public.ai_update_suggestions(
  id, user_id, pet_profile_id, conversation_id, source_message_id, type, title, details, payload
) values
  ('94000000-0000-4000-8000-000000000051', '94000000-0000-4000-8000-000000000001',
    '94000000-0000-4000-8000-000000000011', '94000000-0000-4000-8000-000000000021',
    '94000000-0000-4000-8000-000000000036', 'history', 'Loose stool',
    'Rollout Pet had a loose stool this afternoon.',
    '{"category":"symptom","title":"Loose stool","note":"Rollout Pet had a loose stool this afternoon.","severity":"mild"}'::jsonb),
  ('94000000-0000-4000-8000-000000000052', '94000000-0000-4000-8000-000000000001',
    '94000000-0000-4000-8000-000000000011', '94000000-0000-4000-8000-000000000021',
    '94000000-0000-4000-8000-000000000040', 'history', 'Skipped dinner',
    'Rollout Pet skipped dinner tonight.',
    '{"category":"food","title":"Skipped dinner","note":"Rollout Pet skipped dinner tonight.","severity":"mild"}'::jsonb);

do $$
begin
  if not has_function_privilege('authenticated', 'public.persist_furvise_semantic_event(uuid,uuid,uuid,jsonb)', 'execute')
    or not has_function_privilege('authenticated', 'public.persist_furvise_care_event(uuid,uuid,uuid,jsonb,uuid)', 'execute')
    or not has_function_privilege('authenticated', 'public.apply_furvise_state_suggestion(uuid,uuid)', 'execute') then
    raise exception 'Phase 1 removed an old-application RPC permission';
  end if;
  if not has_table_privilege('authenticated', 'public.pet_concerns', 'select,insert,update,delete')
    or not has_table_privilege('authenticated', 'public.ai_update_suggestions', 'select,insert,update,delete') then
    raise exception 'Phase 1 removed old-application canonical table authority';
  end if;
  if not has_function_privilege('service_role', 'public.persist_furvise_server_semantic_event(uuid,uuid,uuid,jsonb)', 'execute')
    or not has_function_privilege('service_role', 'public.persist_furvise_server_care_event(uuid,uuid,uuid,jsonb,uuid)', 'execute')
    or not has_function_privilege('service_role', 'public.apply_furvise_server_state_suggestion(uuid,uuid)', 'execute') then
    raise exception 'Phase 1 did not install the new-application RPC authority';
  end if;
  if has_function_privilege('authenticated', 'public.persist_furvise_server_semantic_event(uuid,uuid,uuid,jsonb)', 'execute')
    or has_function_privilege('authenticated', 'public.persist_furvise_server_care_event(uuid,uuid,uuid,jsonb,uuid)', 'execute')
    or has_function_privilege('authenticated', 'public.apply_furvise_server_state_suggestion(uuid,uuid)', 'execute') then
    raise exception 'Phase 1 exposed a new server RPC to authenticated';
  end if;
  if not has_table_privilege('service_role', 'public.pet_concerns', 'select,insert,update,delete')
    or not has_table_privilege('service_role', 'public.ai_update_suggestions', 'select,insert,update,delete') then
    raise exception 'Phase 1 did not install new-application table authority';
  end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '94000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
declare
  v_semantic record;
  v_care record;
  v_apply record;
begin
  select * into v_semantic from public.persist_furvise_semantic_event(
    '94000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000011',
    '94000000-0000-4000-8000-000000000031',
    '{"subject":{"type":"pet","name":"Rollout Pet"},"domain":"health","topic":"ear_scratching","eventTitle":"Started ear scratching","transition":"started","state":"active","temporal":{"occurredAt":null,"explicitTime":"today"},"importance":"important","confidence":0.99,"sourceExcerpt":"started scratching both ears"}'::jsonb
  );
  if v_semantic.persistence_status <> 'persisted' then
    raise exception 'old application semantic RPC failed: %', row_to_json(v_semantic);
  end if;

  select * into v_care from public.persist_furvise_care_event(
    '94000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000011',
    '94000000-0000-4000-8000-000000000033',
    '{"action":"create_entry","category":"symptom","title":"Vomited once","details":"Rollout Pet vomited once after breakfast.","severity":"mild","confidence":0.99}'::jsonb,
    null
  );
  if v_care.persistence_status <> 'persisted' then
    raise exception 'old application care RPC failed: %', row_to_json(v_care);
  end if;

  insert into public.pet_concerns(id, user_id, pet_profile_id, title, normalized_key)
  values ('94000000-0000-4000-8000-000000000061', '94000000-0000-4000-8000-000000000001',
    '94000000-0000-4000-8000-000000000011', 'Old application concern', 'old_application_concern');
  update public.pet_concerns set status = 'monitoring'
  where id = '94000000-0000-4000-8000-000000000061';
  update public.ai_update_suggestions set details = 'Old application updated this suggestion.'
  where id = '94000000-0000-4000-8000-000000000051';

  select * into v_apply from public.apply_furvise_state_suggestion(
    '94000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000051'
  );
  if v_apply.apply_status not in ('applied', 'already_applied') then
    raise exception 'old application suggestion RPC failed: %', row_to_json(v_apply);
  end if;
end;
$$;

reset role;
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claim.sub', '', true);

do $$
declare
  v_semantic record;
  v_care record;
  v_apply record;
begin
  select * into v_semantic from public.persist_furvise_server_semantic_event(
    '94000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000011',
    '94000000-0000-4000-8000-000000000037',
    '{"subject":{"type":"pet","name":"Rollout Pet"},"domain":"health","topic":"limping","eventTitle":"Started limping","transition":"started","state":"active","temporal":{"occurredAt":null,"explicitTime":"after the walk"},"importance":"important","confidence":0.99,"sourceExcerpt":"started limping after the walk"}'::jsonb
  );
  if v_semantic.persistence_status <> 'persisted' then
    raise exception 'new application semantic RPC failed: %', row_to_json(v_semantic);
  end if;

  select * into v_care from public.persist_furvise_server_care_event(
    '94000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000011',
    '94000000-0000-4000-8000-000000000039',
    '{"action":"create_entry","category":"food","title":"Skipped dinner","details":"Rollout Pet skipped dinner tonight.","severity":"mild","confidence":0.99}'::jsonb,
    null
  );
  if v_care.persistence_status <> 'persisted' then
    raise exception 'new application care RPC failed: %', row_to_json(v_care);
  end if;

  insert into public.pet_concerns(id, user_id, pet_profile_id, title, normalized_key)
  values ('94000000-0000-4000-8000-000000000062', '94000000-0000-4000-8000-000000000001',
    '94000000-0000-4000-8000-000000000011', 'New application concern', 'new_application_concern');
  update public.pet_concerns set status = 'monitoring'
  where id = '94000000-0000-4000-8000-000000000062';
  update public.ai_update_suggestions set details = 'New application updated this suggestion.'
  where id = '94000000-0000-4000-8000-000000000052';

  select * into v_apply from public.apply_furvise_server_state_suggestion(
    '94000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000052'
  );
  if v_apply.apply_status not in ('applied', 'already_applied') then
    raise exception 'new application suggestion RPC failed: %', row_to_json(v_apply);
  end if;
end;
$$;

reset role;
select pass('Phase 1 supports old and new application canonical-care callers');
select * from finish();
rollback;
