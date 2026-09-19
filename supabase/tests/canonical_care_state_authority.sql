begin;
select plan(1);

insert into auth.users(id, aud, role, email, encrypted_password, created_at, updated_at, email_confirmed_at) values
  ('93000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'care-authority@example.test', '', now(), now(), now());

insert into public.dog_profiles(id, user_id, name, species) values
  ('93000000-0000-4000-8000-000000000011', '93000000-0000-4000-8000-000000000001', 'Authority Pet', 'dog');

insert into public.ask_conversations(id, user_id, pet_profile_id, title) values
  ('93000000-0000-4000-8000-000000000021', '93000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000011', 'Authority checks');

insert into public.ask_conversation_messages(
  id, conversation_id, user_id, role, sequence_number, user_text, response_data, request_id
) values
  ('93000000-0000-4000-8000-000000000031', '93000000-0000-4000-8000-000000000021', '93000000-0000-4000-8000-000000000001',
    'user', 1, 'Authority Pet started scratching both ears today.', null, '93000000-0000-4000-8000-000000000101'),
  ('93000000-0000-4000-8000-000000000032', '93000000-0000-4000-8000-000000000021', '93000000-0000-4000-8000-000000000001',
    'furvise', 2, null, '{}'::jsonb, '93000000-0000-4000-8000-000000000101'),
  ('93000000-0000-4000-8000-000000000033', '93000000-0000-4000-8000-000000000021', '93000000-0000-4000-8000-000000000001',
    'user', 3, 'Authority Pet vomited once after breakfast.', null, '93000000-0000-4000-8000-000000000102'),
  ('93000000-0000-4000-8000-000000000034', '93000000-0000-4000-8000-000000000021', '93000000-0000-4000-8000-000000000001',
    'furvise', 4, null, '{}'::jsonb, '93000000-0000-4000-8000-000000000102'),
  ('93000000-0000-4000-8000-000000000035', '93000000-0000-4000-8000-000000000021', '93000000-0000-4000-8000-000000000001',
    'user', 5, 'Authority Pet had a loose stool this afternoon.', null, '93000000-0000-4000-8000-000000000103'),
  ('93000000-0000-4000-8000-000000000036', '93000000-0000-4000-8000-000000000021', '93000000-0000-4000-8000-000000000001',
    'furvise', 6, null, '{}'::jsonb, '93000000-0000-4000-8000-000000000103');

insert into public.ai_update_suggestions(
  id, user_id, pet_profile_id, conversation_id, source_message_id, type, title, details, payload
) values (
  '93000000-0000-4000-8000-000000000041', '93000000-0000-4000-8000-000000000001',
  '93000000-0000-4000-8000-000000000011', '93000000-0000-4000-8000-000000000021',
  '93000000-0000-4000-8000-000000000036', 'history', 'Loose stool',
  'Authority Pet had a loose stool this afternoon.',
  '{"category":"symptom","title":"Loose stool","note":"Authority Pet had a loose stool this afternoon.","severity":"mild"}'::jsonb
);

do $$
declare
  v_function record;
  v_role text;
begin
  for v_function in
    select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'persist_furvise_semantic_event', 'persist_furvise_semantic_event_exact_20260807',
      'persist_furvise_care_event', 'persist_furvise_care_event_before_destination_routing',
      'persist_furvise_care_event_with_concern', 'apply_furvise_state_suggestion',
      'resolve_concern_suggestion'
    )
  loop
    foreach v_role in array array['anon', 'authenticated'] loop
      if has_function_privilege(v_role, v_function.oid, 'execute') then
        raise exception '% can execute legacy canonical function %(%)', v_role, v_function.proname, v_function.args;
      end if;
    end loop;
  end loop;

  for v_function in
    select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'persist_furvise_server_semantic_event', 'persist_furvise_server_care_event',
      'apply_furvise_server_state_suggestion'
    )
  loop
    if has_function_privilege('anon', v_function.oid, 'execute')
      or has_function_privilege('authenticated', v_function.oid, 'execute')
      or not has_function_privilege('service_role', v_function.oid, 'execute') then
      raise exception 'server wrapper privilege contract failed for %', v_function.oid::regprocedure;
    end if;
  end loop;

  if has_function_privilege('service_role', 'private.set_furvise_server_actor(uuid)', 'execute') then
    raise exception 'service_role can invoke the private actor helper directly';
  end if;

  foreach v_role in array array['anon', 'authenticated'] loop
    if has_table_privilege(v_role, 'public.pet_concerns', 'insert,update,delete')
      or has_table_privilege(v_role, 'public.ai_update_suggestions', 'insert,update,delete') then
      raise exception '% retained canonical table DML', v_role;
    end if;
  end loop;
  if not has_table_privilege('service_role', 'public.pet_concerns', 'select,insert,update,delete')
    or not has_table_privilege('service_role', 'public.ai_update_suggestions', 'select,insert,update,delete') then
    raise exception 'service_role canonical table authority is incomplete';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename in ('pet_concerns', 'ai_update_suggestions')
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  ) then
    raise exception 'browser-era canonical write policy remains';
  end if;

  -- Existing Care History authority remains intentionally asymmetric.
  if has_table_privilege('authenticated', 'public.pet_care_entries', 'update')
    or has_table_privilege('authenticated', 'public.pet_care_entries', 'delete') then
    raise exception 'authenticated Care History broad write restriction regressed';
  end if;
  if not has_column_privilege('authenticated', 'public.pet_care_entries', 'note', 'insert')
    or has_column_privilege('authenticated', 'public.pet_care_entries', 'care_event_metadata', 'insert') then
    raise exception 'authenticated Care History INSERT allowlist regressed';
  end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '93000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
begin
  begin
    insert into public.pet_concerns(user_id, pet_profile_id, title, normalized_key)
    values ('93000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000011', 'Browser concern', 'browser_concern');
    raise exception 'authenticated direct concern INSERT succeeded';
  exception when insufficient_privilege then null; end;
  begin
    update public.ai_update_suggestions set status = 'dismissed'
    where id = '93000000-0000-4000-8000-000000000041';
    raise exception 'authenticated direct suggestion UPDATE succeeded';
  exception when insufficient_privilege then null; end;
  begin
    perform public.persist_furvise_care_event(
      '93000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000011',
      '93000000-0000-4000-8000-000000000033', '{"action":"create_entry"}'::jsonb, null
    );
    raise exception 'authenticated legacy care RPC succeeded';
  exception when insufficient_privilege then null; end;
end;
$$;

insert into public.pet_care_entries(
  user_id, pet_profile_id, category, title, note, occurred_at, idempotency_key
) values (
  '93000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000011',
  'general', 'Owner observation', 'Owner-entered raw Care History remains available.', now(),
  '93000000-0000-4000-8000-000000000201'
);

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
    '93000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000011',
    '93000000-0000-4000-8000-000000000031',
    jsonb_build_object(
      'subject', jsonb_build_object('type', 'pet', 'name', 'Authority Pet'),
      'domain', 'health', 'topic', 'ear_scratching', 'eventTitle', 'Started ear scratching',
      'transition', 'started', 'state', 'active',
      'temporal', jsonb_build_object('occurredAt', null, 'explicitTime', 'today'),
      'importance', 'important', 'confidence', 0.99,
      'sourceExcerpt', 'started scratching both ears'
    )
  );
  if v_semantic.persistence_status <> 'persisted' or v_semantic.care_entry_id is null then
    raise exception 'trusted semantic persistence failed: %', row_to_json(v_semantic);
  end if;

  select * into v_care from public.persist_furvise_server_care_event(
    '93000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000011',
    '93000000-0000-4000-8000-000000000033',
    '{"action":"create_entry","category":"symptom","title":"Vomited once","details":"Authority Pet vomited once after breakfast.","severity":"mild","confidence":0.99}'::jsonb,
    null
  );
  if v_care.persistence_status <> 'persisted' or cardinality(v_care.care_entry_ids) <> 1 then
    raise exception 'trusted care persistence failed: %', row_to_json(v_care);
  end if;

  select * into v_apply from public.apply_furvise_server_state_suggestion(
    '93000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000041'
  );
  if v_apply.apply_status not in ('applied', 'already_applied') or v_apply.care_entry_id is null then
    raise exception 'trusted suggestion persistence failed: %', row_to_json(v_apply);
  end if;
end;
$$;

reset role;

do $$
begin
  if not exists (
    select 1 from public.pet_care_entries
    where user_id = '93000000-0000-4000-8000-000000000001'
      and idempotency_key = '93000000-0000-4000-8000-000000000201'
  ) then
    raise exception 'owner-entered raw Care History flow failed';
  end if;
  if (select status from public.ai_update_suggestions where id = '93000000-0000-4000-8000-000000000041') <> 'saved' then
    raise exception 'trusted suggestion was not finalized';
  end if;
end;
$$;

select pass('canonical care state authority contract and legitimate flows passed');
select * from finish();
rollback;
