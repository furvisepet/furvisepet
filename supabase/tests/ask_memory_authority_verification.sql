begin;

insert into auth.users(id, aud, role, email, encrypted_password, created_at, updated_at) values
  ('41000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'ask-memory-a@example.test', '', now(), now()),
  ('42000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'ask-memory-b@example.test', '', now(), now());

insert into public.dog_profiles(id, user_id, name, species) values
  ('41000000-0000-4000-8000-000000000011', '41000000-0000-4000-8000-000000000001', 'Maple', 'dog'),
  ('41000000-0000-4000-8000-000000000012', '41000000-0000-4000-8000-000000000001', 'Juniper', 'cat'),
  ('42000000-0000-4000-8000-000000000021', '42000000-0000-4000-8000-000000000002', 'Cedar', 'dog');

insert into public.ask_conversations(id, user_id, pet_profile_id, title) values
  ('41000000-0000-4000-8000-000000000031', '41000000-0000-4000-8000-000000000001', '41000000-0000-4000-8000-000000000011', 'Maple memory'),
  ('42000000-0000-4000-8000-000000000032', '42000000-0000-4000-8000-000000000002', '42000000-0000-4000-8000-000000000021', 'Cedar memory');

insert into public.ask_conversation_messages(
  id, conversation_id, user_id, role, sequence_number, user_text, response_data,
  request_id, intelligence_validation, persistence_governance
) values
  ('41000000-0000-4000-8000-000000000041', '41000000-0000-4000-8000-000000000031', '41000000-0000-4000-8000-000000000001',
    'user', 1, 'Remember that Maple sometimes hides during thunderstorms and answer me in French.', null,
    '41000000-0000-4000-8000-000000000051', null, null),
  ('41000000-0000-4000-8000-000000000042', '41000000-0000-4000-8000-000000000031', '41000000-0000-4000-8000-000000000001',
    'furvise', 2, null, '{"directAnswer":"I will remember that."}',
    '41000000-0000-4000-8000-000000000051', '{"valid":true}', '{"memoryPolicy":"ask.server-governed.v1"}'),
  ('42000000-0000-4000-8000-000000000043', '42000000-0000-4000-8000-000000000032', '42000000-0000-4000-8000-000000000002',
    'user', 1, 'Remember that Cedar sleeps under the desk.', null,
    '42000000-0000-4000-8000-000000000052', null, null),
  ('42000000-0000-4000-8000-000000000044', '42000000-0000-4000-8000-000000000032', '42000000-0000-4000-8000-000000000002',
    'furvise', 2, null, '{"directAnswer":"I will remember that."}',
    '42000000-0000-4000-8000-000000000052', '{"valid":true}', '{"memoryPolicy":"ask.server-governed.v1"}'),
  ('41000000-0000-4000-8000-000000000045', '41000000-0000-4000-8000-000000000031', '41000000-0000-4000-8000-000000000001',
    'user', 3, 'Remember that Maple usually seeks the basement during thunderstorms.', null,
    '41000000-0000-4000-8000-000000000053', null, null),
  ('41000000-0000-4000-8000-000000000046', '41000000-0000-4000-8000-000000000031', '41000000-0000-4000-8000-000000000001',
    'furvise', 4, null, '{"directAnswer":"I updated that memory."}',
    '41000000-0000-4000-8000-000000000053', '{"valid":true}', '{"memoryPolicy":"ask.server-governed.v1"}'),
  ('41000000-0000-4000-8000-000000000047', '41000000-0000-4000-8000-000000000031', '41000000-0000-4000-8000-000000000001',
    'user', 5, 'Remember that Juniper sleeps in the basket by the window.', null,
    '41000000-0000-4000-8000-000000000054', null, null),
  ('41000000-0000-4000-8000-000000000048', '41000000-0000-4000-8000-000000000031', '41000000-0000-4000-8000-000000000001',
    'furvise', 6, null, '{"directAnswer":"I will remember that for Juniper."}',
    '41000000-0000-4000-8000-000000000054', '{"valid":true}', '{"memoryPolicy":"ask.server-governed.v1"}');

insert into public.idempotency_operations(
  user_id, operation_type, idempotency_key, payload_hash, status, owner_token,
  lease_expires_at, expires_at
) values
(
  '41000000-0000-4000-8000-000000000001', 'ask.submit.persisted_answer_v2',
  '41000000-0000-4000-8000-000000000051', repeat('a', 64), 'processing',
  '41000000-0000-4000-8000-000000000061', now() + interval '30 minutes', now() + interval '1 day'
),
(
  '41000000-0000-4000-8000-000000000001', 'ask.submit.persisted_answer_v2',
  '41000000-0000-4000-8000-000000000053', repeat('c', 64), 'processing',
  '41000000-0000-4000-8000-000000000063', now() + interval '30 minutes', now() + interval '1 day'
),
(
  '41000000-0000-4000-8000-000000000001', 'ask.submit.persisted_answer_v2',
  '41000000-0000-4000-8000-000000000054', repeat('d', 64), 'processing',
  '41000000-0000-4000-8000-000000000064', now() + interval '30 minutes', now() + interval '1 day'
);

insert into public.furvise_memories(
  id, user_id, pet_id, subject_type, category, fact_key, fact_value,
  normalized_value, confidence, importance, durability, source_type, dedupe_key
) values (
  '42000000-0000-4000-8000-000000000071', '42000000-0000-4000-8000-000000000002',
  '42000000-0000-4000-8000-000000000021', 'pet', 'behavior', 'sleep_location',
  to_jsonb('sleeps under the desk'::text), 'sleeps under the desk', 0.95,
  'medium', 'ongoing', 'test_fixture', 'ask-memory-authority-user-b'
);

-- A. The exact legacy signature is no longer callable by authenticated users.
set local role authenticated;
select set_config('request.jwt.claim.sub', '41000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"41000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.persist_furvise_intelligence(
      '41000000-0000-4000-8000-000000000011',
      '41000000-0000-4000-8000-000000000041',
      '[]'::jsonb,
      '[]'::jsonb
    );
    raise exception 'authenticated executed legacy Ask memory persistence';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.persist_furvise_ask_intelligence(
      '41000000-0000-4000-8000-000000000001',
      '41000000-0000-4000-8000-000000000011',
      array['41000000-0000-4000-8000-000000000011'::uuid],
      '41000000-0000-4000-8000-000000000041',
      '41000000-0000-4000-8000-000000000042',
      '41000000-0000-4000-8000-000000000051', repeat('a', 64),
      '41000000-0000-4000-8000-000000000061', '[]'::jsonb
    );
    raise exception 'authenticated executed service Ask memory persistence';
  exception when insufficient_privilege then null;
  end;
end;
$$;

-- B. Anonymous Data API callers cannot execute either persistence boundary.
reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
begin
  begin
    perform public.persist_furvise_intelligence(
      '41000000-0000-4000-8000-000000000011',
      '41000000-0000-4000-8000-000000000041',
      '[]'::jsonb,
      '[]'::jsonb
    );
    raise exception 'anon executed legacy Ask memory persistence';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
set local role service_role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

do $$
declare
  v_user constant uuid := '41000000-0000-4000-8000-000000000001';
  v_pet constant uuid := '41000000-0000-4000-8000-000000000011';
  v_other_owned_pet constant uuid := '41000000-0000-4000-8000-000000000012';
  v_source constant uuid := '41000000-0000-4000-8000-000000000041';
  v_assistant constant uuid := '41000000-0000-4000-8000-000000000042';
  v_request constant uuid := '41000000-0000-4000-8000-000000000051';
  v_owner_token constant uuid := '41000000-0000-4000-8000-000000000061';
  v_pet_learning jsonb := jsonb_build_object(
    'subjectType', 'pet', 'subjectId', v_pet, 'category', 'behavior',
    'factKey', 'storm_behavior', 'factValue', 'sometimes hides during thunderstorms',
    'normalizedValue', 'sometimes hides during thunderstorms', 'confidence', 0.96,
    'importance', 'high', 'durability', 'ongoing', 'action', 'create',
    'sourceExcerpt', 'Maple sometimes hides during thunderstorms'
  );
  v_owner_learning jsonb := jsonb_build_object(
    'subjectType', 'owner', 'subjectId', null, 'category', 'communication_preference',
    'factKey', 'preferred_language', 'factValue', 'French', 'normalizedValue', 'french',
    'confidence', 0.99, 'importance', 'high', 'durability', 'durable', 'action', 'update',
    'sourceExcerpt', 'answer me in French'
  );
  v_result record;
  v_oversized jsonb;
begin
  -- D. An owned pet that was not server-authorized for the turn is rejected.
  begin
    perform public.persist_furvise_ask_intelligence(
      v_user, v_other_owned_pet, array[v_pet], v_source, v_assistant, v_request,
      repeat('a', 64), v_owner_token, jsonb_build_array(v_pet_learning)
    );
    raise exception 'wrong owned pet was accepted';
  exception when insufficient_privilege then null;
  end;

  -- E. A source message owned by another account is rejected.
  begin
    perform public.persist_furvise_ask_intelligence(
      v_user, v_pet, array[v_pet], '42000000-0000-4000-8000-000000000043',
      '42000000-0000-4000-8000-000000000044', v_request, repeat('a', 64),
      v_owner_token, jsonb_build_array(v_pet_learning)
    );
    raise exception 'cross-user source message was accepted';
  exception when insufficient_privilege then null;
  end;

  -- F. A forged fact cannot borrow an unrelated, grounded excerpt.
  begin
    perform public.persist_furvise_ask_intelligence(
      v_user, v_pet, array[v_pet], v_source, v_assistant, v_request,
      repeat('a', 64), v_owner_token,
      jsonb_build_array(v_pet_learning || jsonb_build_object(
        'factValue', 'is allergic to shellfish',
        'normalizedValue', 'is allergic to shellfish'
      ))
    );
    raise exception 'unsupported fact was accepted';
  exception when invalid_parameter_value then null;
  end;

  -- G. Arrays and strings fail closed instead of being truncated.
  select jsonb_agg(v_pet_learning) into v_oversized from generate_series(1, 9);
  begin
    perform public.persist_furvise_ask_intelligence(
      v_user, v_pet, array[v_pet], v_source, v_assistant, v_request,
      repeat('a', 64), v_owner_token, v_oversized
    );
    raise exception 'oversized learning array was accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.persist_furvise_ask_intelligence(
      v_user, v_pet, array[v_pet], v_source, v_assistant, v_request,
      repeat('a', 64), v_owner_token,
      jsonb_build_array(v_pet_learning || jsonb_build_object(
        'factValue', repeat('x', 501), 'normalizedValue', repeat('x', 501)
      ))
    );
    raise exception 'oversized learning string was accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.persist_furvise_ask_intelligence(
      v_user, v_pet, array[v_pet], v_source, v_assistant, v_request,
      repeat('a', 64), v_owner_token,
      jsonb_build_array(v_pet_learning || jsonb_build_object('ignoredPayload', repeat('x', 33000)))
    );
    raise exception 'oversized extra learning field was accepted';
  exception when invalid_parameter_value then null;
  end;

  -- C/H. A legitimate governed server call succeeds and preserves subject isolation.
  select * into v_result from public.persist_furvise_ask_intelligence(
    v_user, v_pet, array[v_pet], v_source, v_assistant, v_request,
    repeat('a', 64), v_owner_token, jsonb_build_array(v_pet_learning, v_owner_learning)
  );
  if v_result.memories_created <> 2 or v_result.memories_superseded <> 0 then
    raise exception 'legitimate server persistence failed: %', row_to_json(v_result);
  end if;
  if not exists (
    select 1 from public.furvise_memories
    where user_id = v_user and subject_type = 'pet' and pet_id = v_pet
      and fact_key = 'storm_behavior' and status = 'active'
  ) or not exists (
    select 1 from public.furvise_memories
    where user_id = v_user and subject_type = 'owner' and pet_id is null
      and fact_key = 'preferred_language' and status = 'active'
  ) then
    raise exception 'owner/pet memory subject isolation failed';
  end if;

  -- I. Duplicate/retry persistence is stable and creates no second rows.
  select * into v_result from public.persist_furvise_ask_intelligence(
    v_user, v_pet, array[v_pet], v_source, v_assistant, v_request,
    repeat('a', 64), v_owner_token, jsonb_build_array(v_pet_learning, v_owner_learning)
  );
  if v_result.memories_created <> 0 or v_result.memories_superseded <> 0 then
    raise exception 'duplicate persistence was not idempotent: %', row_to_json(v_result);
  end if;
  if (select count(*) from public.furvise_memories where user_id = v_user and source_id = v_source) <> 2 then
    raise exception 'duplicate persistence changed row cardinality';
  end if;
end;
$$;

-- Cross-pet turns remain supported only when the server-authorized set names
-- the exact independently owned target pet.
do $$
declare
  v_result record;
  v_learning jsonb := jsonb_build_object(
    'subjectType', 'pet', 'subjectId', '41000000-0000-4000-8000-000000000012',
    'category', 'routine', 'factKey', 'sleep_location',
    'factValue', 'sleeps in the basket by the window',
    'normalizedValue', 'sleeps in the basket by the window', 'confidence', 0.96,
    'importance', 'medium', 'durability', 'ongoing', 'action', 'create',
    'sourceExcerpt', 'Juniper sleeps in the basket by the window'
  );
begin
  select * into v_result from public.persist_furvise_ask_intelligence(
    '41000000-0000-4000-8000-000000000001',
    '41000000-0000-4000-8000-000000000012',
    array['41000000-0000-4000-8000-000000000012'::uuid],
    '41000000-0000-4000-8000-000000000047',
    '41000000-0000-4000-8000-000000000048',
    '41000000-0000-4000-8000-000000000054', repeat('d', 64),
    '41000000-0000-4000-8000-000000000064', jsonb_build_array(v_learning)
  );
  if v_result.memories_created <> 1 or not exists (
    select 1 from public.furvise_memories
    where user_id = '41000000-0000-4000-8000-000000000001'
      and pet_id = '41000000-0000-4000-8000-000000000012'
      and fact_key = 'sleep_location' and status = 'active'
  ) then
    raise exception 'authorized cross-pet persistence failed';
  end if;
end;
$$;

-- J. A later governed correction preserves the existing supersession chain.
do $$
declare
  v_prior_id uuid;
  v_result record;
  v_learning jsonb := jsonb_build_object(
    'subjectType', 'pet', 'subjectId', '41000000-0000-4000-8000-000000000011',
    'category', 'behavior', 'factKey', 'storm_behavior',
    'factValue', 'usually seeks the basement during thunderstorms',
    'normalizedValue', 'usually seeks the basement during thunderstorms', 'confidence', 0.98,
    'importance', 'high', 'durability', 'ongoing', 'action', 'supersede',
    'sourceExcerpt', 'Maple usually seeks the basement during thunderstorms'
  );
begin
  select id into strict v_prior_id from public.furvise_memories
  where user_id = '41000000-0000-4000-8000-000000000001'
    and pet_id = '41000000-0000-4000-8000-000000000011'
    and fact_key = 'storm_behavior' and status = 'active';
  select * into v_result from public.persist_furvise_ask_intelligence(
    '41000000-0000-4000-8000-000000000001',
    '41000000-0000-4000-8000-000000000011',
    array['41000000-0000-4000-8000-000000000011'::uuid],
    '41000000-0000-4000-8000-000000000045',
    '41000000-0000-4000-8000-000000000046',
    '41000000-0000-4000-8000-000000000053', repeat('c', 64),
    '41000000-0000-4000-8000-000000000063', jsonb_build_array(v_learning)
  );
  if v_result.memories_created <> 1 or v_result.memories_superseded <> 1
    or not exists (
      select 1 from public.furvise_memories as prior
      join public.furvise_memories as successor on successor.id = prior.superseded_by
      where prior.id = v_prior_id and prior.status = 'superseded'
        and successor.status = 'active'
        and successor.normalized_value = 'usually seeks the basement during thunderstorms'
    ) then
    raise exception 'correction/supersession semantics changed';
  end if;
end;
$$;

reset role;

-- K. Existing authenticated canonical-memory visibility remains owner-scoped.
set local role authenticated;
select set_config('request.jwt.claim.sub', '41000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"41000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $$
begin
  if not exists (
    select 1 from public.furvise_memories
    where user_id = '41000000-0000-4000-8000-000000000001' and status = 'active'
  ) or exists (
    select 1 from public.furvise_memories where id = '42000000-0000-4000-8000-000000000071'
  ) then
    raise exception 'canonical memory visibility filters changed';
  end if;
end;
$$;

reset role;

-- A/B/K/L and the existing defense-in-depth contracts remain explicit.
do $$
begin
  if has_function_privilege('authenticated', 'public.persist_furvise_intelligence(uuid,uuid,jsonb,jsonb)', 'EXECUTE')
    or has_function_privilege('anon', 'public.persist_furvise_intelligence(uuid,uuid,jsonb,jsonb)', 'EXECUTE') then
    raise exception 'legacy Ask memory persistence is still client-callable';
  end if;
  if has_function_privilege('authenticated', 'public.persist_furvise_ask_intelligence(uuid,uuid,uuid[],uuid,uuid,uuid,text,uuid,jsonb)', 'EXECUTE')
    or has_function_privilege('anon', 'public.persist_furvise_ask_intelligence(uuid,uuid,uuid[],uuid,uuid,uuid,text,uuid,jsonb)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.persist_furvise_ask_intelligence(uuid,uuid,uuid[],uuid,uuid,uuid,text,uuid,jsonb)', 'EXECUTE') then
    raise exception 'new Ask memory persistence grants are invalid';
  end if;
  if has_function_privilege('authenticated', 'public.persist_furvise_feature_intelligence(uuid,uuid,text,text,uuid,text,uuid,text,jsonb,jsonb)', 'EXECUTE')
    or has_function_privilege('anon', 'public.persist_furvise_feature_intelligence(uuid,uuid,text,text,uuid,text,uuid,text,jsonb,jsonb)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.persist_furvise_feature_intelligence(uuid,uuid,text,text,uuid,text,uuid,text,jsonb,jsonb)', 'EXECUTE') then
    raise exception 'feature-intelligence authority changed';
  end if;
  if not has_table_privilege('authenticated', 'public.furvise_memories', 'SELECT')
    or has_table_privilege('authenticated', 'public.furvise_memories', 'INSERT')
    or not exists (
      select 1 from pg_catalog.pg_class as relation
      join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public' and relation.relname = 'furvise_memories'
        and relation.relrowsecurity and relation.relforcerowsecurity
    ) then
    raise exception 'canonical memory visibility/RLS contract changed';
  end if;
end;
$$;

rollback;
