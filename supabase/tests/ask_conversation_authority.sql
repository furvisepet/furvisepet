begin;

select extensions.plan(1);

do $$
declare
  v_relation regclass;
  v_function regprocedure;
begin
  foreach v_relation in array array[
    'public.ask_conversations'::regclass,
    'public.ask_conversation_messages'::regclass
  ] loop
    if not pg_catalog.has_table_privilege('authenticated', v_relation, 'SELECT')
      or pg_catalog.has_table_privilege('authenticated', v_relation, 'INSERT')
      or pg_catalog.has_table_privilege('authenticated', v_relation, 'UPDATE')
      or pg_catalog.has_table_privilege('authenticated', v_relation, 'DELETE')
      or pg_catalog.has_table_privilege('authenticated', v_relation, 'TRUNCATE')
      or pg_catalog.has_table_privilege('authenticated', v_relation, 'TRIGGER')
      or pg_catalog.has_table_privilege('authenticated', v_relation, 'REFERENCES') then
      raise exception 'authenticated Ask grants are not SELECT-only for %', v_relation;
    end if;
    if not (
      select class.relrowsecurity and class.relforcerowsecurity
      from pg_catalog.pg_class as class where class.oid = v_relation
    ) then
      raise exception 'RLS/FORCE RLS missing for %', v_relation;
    end if;
  end loop;

  foreach v_function in array array[
    'public.create_ask_conversation_exchange(uuid,uuid,uuid,text,text,text,jsonb,jsonb,jsonb)'::regprocedure,
    'public.append_ask_conversation_exchange(uuid,uuid,uuid,text,text,jsonb,jsonb,jsonb)'::regprocedure,
    'public.begin_ask_conversation_turn(uuid,uuid,uuid,uuid,text,text,text)'::regprocedure,
    'public.complete_ask_conversation_turn(uuid,uuid,uuid,uuid,text,jsonb,jsonb,jsonb,jsonb,jsonb)'::regprocedure,
    'public.update_ask_assistant_response(uuid,uuid,jsonb)'::regprocedure,
    'public.finalize_ask_assistant_response(uuid,uuid,jsonb,jsonb)'::regprocedure,
    'public.rename_ask_conversation(uuid,uuid,text)'::regprocedure,
    'public.delete_ask_conversation(uuid,uuid)'::regprocedure
  ] loop
    if not pg_catalog.has_function_privilege('service_role', v_function, 'EXECUTE')
      or pg_catalog.has_function_privilege('authenticated', v_function, 'EXECUTE')
      or pg_catalog.has_function_privilege('anon', v_function, 'EXECUTE') then
      raise exception 'Ask RPC execution grant drift for %', v_function;
    end if;
    if not (
      select proc.prosecdef
        and proc.proconfig @> array['search_path=""']::text[]
      from pg_catalog.pg_proc as proc where proc.oid = v_function
    ) then
      raise exception 'Ask RPC security mode drift for %', v_function;
    end if;
  end loop;
end;
$$;

insert into auth.users (
  id, aud, role, email, encrypted_password, created_at, updated_at, email_confirmed_at
) values
  ('61000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'ask-authority-one@example.test', '', now(), now(), now()),
  ('62000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'ask-authority-two@example.test', '', now(), now(), now());

insert into public.dog_profiles (id, user_id, name, species) values
  ('61000000-0000-4000-8000-000000000011', '61000000-0000-4000-8000-000000000001', 'Authority One', 'dog'),
  ('62000000-0000-4000-8000-000000000022', '62000000-0000-4000-8000-000000000002', 'Authority Two', 'dog'),
  ('61000000-0000-4000-8000-000000000033', '61000000-0000-4000-8000-000000000001', 'Archived', 'dog');
update public.dog_profiles
set lifecycle_status = 'archived'
where id = '61000000-0000-4000-8000-000000000033';

-- Read-only inspection for this rollback-only fixture. Production service
-- authority remains RPC-only; the migration itself grants no direct table IO.
grant select on table public.ask_conversations to service_role;
grant select on table public.ask_conversation_messages to service_role;

set local role service_role;
select set_config('request.jwt.claims', '', true);
select set_config('request.jwt.claim.role', '', true);

do $$
declare
  v_conversation_id uuid;
  v_title text;
  v_preview text;
  v_pet_id uuid;
  v_status text;
  v_created_at timestamptz;
  v_user_one uuid := '61000000-0000-4000-8000-000000000001';
  v_user_two uuid := '62000000-0000-4000-8000-000000000002';
  v_pet_one uuid := '61000000-0000-4000-8000-000000000011';
  v_pet_two uuid := '62000000-0000-4000-8000-000000000022';
  v_archived_pet uuid := '61000000-0000-4000-8000-000000000033';
  v_request_create uuid := '61000000-0000-4000-8000-000000000101';
  v_request_append uuid := '61000000-0000-4000-8000-000000000102';
  v_request_turn_a uuid := '61000000-0000-4000-8000-000000000103';
  v_request_turn_b uuid := '61000000-0000-4000-8000-000000000104';
  v_turn_a record;
  v_turn_b record;
  v_result boolean;
begin
  select created.conversation_id into strict v_conversation_id
  from public.create_ask_conversation_exchange(
    v_user_one, v_pet_one, v_request_create, 'First title', 'First answer',
    'First question', '{"directAnswer":"First answer"}'::jsonb, null, null
  ) as created
  limit 1;
  if (
    select count(*) from public.ask_conversation_messages
    where conversation_id = v_conversation_id
  ) <> 2 or not exists (
    select 1 from public.ask_conversation_messages
    where conversation_id = v_conversation_id and role = 'user' and sequence_number = 1
  ) or not exists (
    select 1 from public.ask_conversation_messages
    where conversation_id = v_conversation_id and role = 'furvise' and sequence_number = 2
  ) then
    raise exception 'atomic server create did not produce one canonical exchange';
  end if;

  -- Identical replay is idempotent; changed identity is rejected.
  perform public.create_ask_conversation_exchange(
    v_user_one, v_pet_one, v_request_create, 'First title', 'First answer',
    'First question', '{"directAnswer":"First answer"}'::jsonb, null, null
  );
  if (select count(*) from public.ask_conversations where idempotency_key = v_request_create) <> 1
    or (select count(*) from public.ask_conversation_messages where request_id = v_request_create) <> 2 then
    raise exception 'create replay duplicated conversation state';
  end if;
  begin
    perform public.create_ask_conversation_exchange(
      v_user_one, v_pet_one, v_request_create, 'First title', 'First answer',
      'Changed question', '{"directAnswer":"First answer"}'::jsonb, null, null
    );
    raise exception 'stale create identity was accepted';
  exception when invalid_parameter_value then null;
  end;

  -- Wrong-owner and archived-pet writes fail before creating partial state.
  begin
    perform public.create_ask_conversation_exchange(
      v_user_one, v_pet_two, '61000000-0000-4000-8000-000000000105',
      'Wrong pet', 'No', 'Question', '{"directAnswer":"No"}'::jsonb, null, null
    );
    raise exception 'unowned pet create was accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.create_ask_conversation_exchange(
      v_user_one, v_archived_pet, '61000000-0000-4000-8000-000000000106',
      'Archived pet', 'No', 'Question', '{"directAnswer":"No"}'::jsonb, null, null
    );
    raise exception 'archived pet create was accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.create_ask_conversation_exchange(
      v_user_one, v_pet_one, '61000000-0000-4000-8000-000000000107',
      'Malformed', 'No', 'Question', '[]'::jsonb, null, null
    );
    raise exception 'malformed response data was accepted';
  exception when invalid_parameter_value then null;
  end;
  if exists (
    select 1 from public.ask_conversations
    where idempotency_key in (
      '61000000-0000-4000-8000-000000000105',
      '61000000-0000-4000-8000-000000000106',
      '61000000-0000-4000-8000-000000000107'
    )
  ) then
    raise exception 'failed create left partial conversation state';
  end if;

  perform public.append_ask_conversation_exchange(
    v_user_one, v_conversation_id, v_request_append, 'Second answer',
    'Second question', '{"directAnswer":"Second answer"}'::jsonb, null, null
  );
  perform public.append_ask_conversation_exchange(
    v_user_one, v_conversation_id, v_request_append, 'Second answer',
    'Second question', '{"directAnswer":"Second answer"}'::jsonb, null, null
  );
  if (select count(*) from public.ask_conversation_messages where request_id = v_request_append) <> 2
    or not exists (
      select 1 from public.ask_conversation_messages
      where request_id = v_request_append and role = 'user' and sequence_number = 3
    ) or not exists (
      select 1 from public.ask_conversation_messages
      where request_id = v_request_append and role = 'furvise' and sequence_number = 4
    ) then
    raise exception 'append/replay contract failed';
  end if;

  begin
    perform public.append_ask_conversation_exchange(
      v_user_two, v_conversation_id, '62000000-0000-4000-8000-000000000108',
      'No', 'Question', '{"directAnswer":"No"}'::jsonb, null, null
    );
    raise exception 'cross-tenant append was accepted';
  exception when insufficient_privilege then null;
  end;

  -- Reserve two turns before either assistant completes, then complete them in
  -- reverse order. Each response must retain the slot adjacent to its user.
  select * into strict v_turn_a from public.begin_ask_conversation_turn(
    v_user_one, v_pet_one, v_conversation_id, v_request_turn_a,
    'Ignored title', 'Turn A', 'Turn A question'
  );
  select * into strict v_turn_b from public.begin_ask_conversation_turn(
    v_user_one, v_pet_one, v_conversation_id, v_request_turn_b,
    'Ignored title', 'Turn B', 'Turn B question'
  );
  perform public.complete_ask_conversation_turn(
    v_user_one, v_conversation_id, v_turn_b.user_message_id, v_request_turn_b,
    'Turn B answer', '{"directAnswer":"Turn B answer"}'::jsonb,
    null, null, null, null
  );
  perform public.complete_ask_conversation_turn(
    v_user_one, v_conversation_id, v_turn_a.user_message_id, v_request_turn_a,
    'Turn A answer', '{"directAnswer":"Turn A answer"}'::jsonb,
    null, null, null, null
  );
  if exists (
    select sequence_number from public.ask_conversation_messages
    where conversation_id = v_conversation_id
    group by sequence_number having count(*) > 1
  ) or not exists (
    select 1 from public.ask_conversation_messages as user_message
    join public.ask_conversation_messages as assistant_message
      on assistant_message.conversation_id = user_message.conversation_id
      and assistant_message.request_id = user_message.request_id
      and assistant_message.role = 'furvise'
      and assistant_message.sequence_number = user_message.sequence_number + 1
    where user_message.conversation_id = v_conversation_id
      and user_message.role = 'user'
      and user_message.request_id in (v_request_turn_a, v_request_turn_b)
    group by user_message.conversation_id
    having count(*) = 2
  ) then
    raise exception 'overlapping turns corrupted sequence ordering';
  end if;

  select title, preview, pet_profile_id, status, created_at
  into strict v_title, v_preview, v_pet_id, v_status, v_created_at
  from public.ask_conversations where id = v_conversation_id;
  select public.rename_ask_conversation(v_user_one, v_conversation_id, 'Renamed') into v_result;
  if not v_result or not exists (
    select 1 from public.ask_conversations
    where id = v_conversation_id and title = 'Renamed'
      and preview = v_preview and pet_profile_id = v_pet_id
      and status = v_status and created_at = v_created_at
  ) then
    raise exception 'rename changed fields beyond title';
  end if;
  select public.rename_ask_conversation(v_user_two, v_conversation_id, 'Forged') into v_result;
  if v_result or exists (
    select 1 from public.ask_conversations where id = v_conversation_id and title = 'Forged'
  ) then
    raise exception 'cross-tenant rename succeeded';
  end if;

  select public.delete_ask_conversation(v_user_two, v_conversation_id) into v_result;
  if v_result then raise exception 'cross-tenant delete succeeded'; end if;
  select public.delete_ask_conversation(v_user_one, v_conversation_id) into v_result;
  if not v_result or exists (
    select 1 from public.ask_conversation_messages where conversation_id = v_conversation_id
  ) then
    raise exception 'owner delete or message cascade failed';
  end if;
  select public.delete_ask_conversation(v_user_one, v_conversation_id) into v_result;
  if v_result then raise exception 'repeated delete was not safely idempotent'; end if;
end;
$$;

reset role;

-- Seed readable owner/cross-tenant rows as database owner for RLS verification.
insert into public.ask_conversations (
  id, user_id, pet_profile_id, title, preview, next_sequence_number
) values
  ('61000000-0000-4000-8000-000000000201', '61000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000011', 'Own', 'Own', 2),
  ('62000000-0000-4000-8000-000000000202', '62000000-0000-4000-8000-000000000002', '62000000-0000-4000-8000-000000000022', 'Other', 'Other', 2);
insert into public.ask_conversation_messages (
  id, conversation_id, user_id, role, sequence_number, user_text
) values
  ('61000000-0000-4000-8000-000000000211', '61000000-0000-4000-8000-000000000201', '61000000-0000-4000-8000-000000000001', 'user', 1, 'Own'),
  ('62000000-0000-4000-8000-000000000212', '62000000-0000-4000-8000-000000000202', '62000000-0000-4000-8000-000000000002', 'user', 1, 'Other');

set local role authenticated;
select set_config('request.jwt.claim.sub', '61000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
begin
  if not exists (
    select 1 from public.ask_conversations where id = '61000000-0000-4000-8000-000000000201'
  ) or exists (
    select 1 from public.ask_conversations where id = '62000000-0000-4000-8000-000000000202'
  ) or not exists (
    select 1 from public.ask_conversation_messages where id = '61000000-0000-4000-8000-000000000211'
  ) or exists (
    select 1 from public.ask_conversation_messages where id = '62000000-0000-4000-8000-000000000212'
  ) then
    raise exception 'owner/cross-tenant SELECT boundary failed';
  end if;

  begin
    insert into public.ask_conversations (user_id, pet_profile_id, title)
    values ('61000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000011', 'forged');
    raise exception 'authenticated conversation INSERT succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.ask_conversations set title = 'forged'
    where id = '61000000-0000-4000-8000-000000000201';
    raise exception 'authenticated conversation UPDATE succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.ask_conversations
    where id = '61000000-0000-4000-8000-000000000201';
    raise exception 'authenticated conversation DELETE succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.ask_conversation_messages (
      conversation_id, user_id, role, sequence_number, response_data
    ) values (
      '61000000-0000-4000-8000-000000000201',
      '61000000-0000-4000-8000-000000000001', 'furvise', 2,
      '{"directAnswer":"forged"}'::jsonb
    );
    raise exception 'authenticated role forgery INSERT succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.ask_conversation_messages set user_text = 'forged'
    where id = '61000000-0000-4000-8000-000000000211';
    raise exception 'authenticated message UPDATE succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.ask_conversation_messages
    where id = '61000000-0000-4000-8000-000000000211';
    raise exception 'authenticated message DELETE succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    truncate table public.ask_conversations;
    raise exception 'authenticated conversation TRUNCATE succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    truncate table public.ask_conversation_messages;
    raise exception 'authenticated message TRUNCATE succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.create_ask_conversation_exchange(
      '61000000-0000-4000-8000-000000000001',
      '61000000-0000-4000-8000-000000000011',
      '61000000-0000-4000-8000-000000000301',
      'No', 'No', 'No', '{"directAnswer":"No"}'::jsonb, null, null
    );
    raise exception 'authenticated role executed server-only Ask RPC';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
set local role anon;
do $$
begin
  begin
    perform public.delete_ask_conversation(
      '61000000-0000-4000-8000-000000000001',
      '61000000-0000-4000-8000-000000000201'
    );
    raise exception 'anon executed server-only Ask RPC';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
select set_config('request.jwt.claim.role', 'service_role', true);
do $$
declare
  v_result record;
begin
  select * into strict v_result
  from public.prepare_account_deletion(
    '61000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-000000000401',
    repeat('a', 64)
  );
  if v_result.deletion_status <> 'application_deleted'
    or exists (
      select 1 from public.ask_conversations
      where user_id = '61000000-0000-4000-8000-000000000001'
    ) or exists (
      select 1 from public.ask_conversation_messages
      where user_id = '61000000-0000-4000-8000-000000000001'
    ) then
    raise exception 'account deletion did not remove Ask history';
  end if;
end;
$$;
select extensions.pass('Ask conversation mutation authority is locked and functional');
select * from extensions.finish();
rollback;
