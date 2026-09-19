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


-- Each scenario is a distinct source turn. All fixtures roll back.
do $$
declare
  n integer;
  source_id uuid;
  assistant_id uuid;
  request_id uuid;
  capability_id uuid;
  payload jsonb;
  result record;
  replay record;
  before_count integer;
  owner_id uuid := '91000000-0000-4000-8000-000000000001';
  pet_id uuid := '91000000-0000-4000-8000-000000000011';
  conversation_id uuid := '91000000-0000-4000-8000-000000000031';
begin
  perform set_config('request.jwt.claim.role','service_role',true);
  for n in 1..7 loop
    source_id := gen_random_uuid(); assistant_id := gen_random_uuid();
    request_id := gen_random_uuid(); capability_id := gen_random_uuid();
    insert into public.ask_conversation_messages(id,conversation_id,user_id,role,sequence_number,user_text,response_data,request_id)
      values(source_id,conversation_id,owner_id,'user',n*2-1,'Maple had a 12 minute play session today. Save this update to care history.',null,request_id),
      (assistant_id,conversation_id,owner_id,'furvise',n*2,null,'{}',request_id);
    payload := jsonb_build_object('id',request_id::text || ':save','kind','care_history.add','petId',pet_id,
      'sourceMessageId',source_id,'safetyClass','LOW_RISK_REVERSIBLE','mutationClass','mutation',
      'confirmationPolicy','explicit_intent','authorizationScope','owned_pet','explicitIntent',n <> 4,
      'input',jsonb_build_object('field',null,'value',null,'title','Play session','detail','12 minute play session today','category','activity','target','selected'),
      'evidence','Save this update to care history','status','proposed','label','Add to care history',
      'description','Save this update.','href',null,'resultMessage',null,'errorMessage',null);
    insert into public.ask_action_capabilities(id,user_id,assistant_message_id,source_message_id,source_action_id,action_kind,pet_profile_id,
      safety_class,mutation_class,confirmation_policy,authorization_scope,explicit_intent,action_payload)
      values(capability_id,owner_id,assistant_id,source_id,request_id::text || ':save','care_history.add',pet_id,
      'LOW_RISK_REVERSIBLE','mutation','explicit_intent','owned_pet',n <> 4,payload);
    if n <> 2 then
      insert into public.pet_care_entries(user_id,pet_profile_id,category,title,note,occurred_at,intelligence_source_message_id)
        values(owner_id,case when n = 3 then '91000000-0000-4000-8000-000000000012'::uuid else pet_id end,
          'activity','Play session','12 minute play session today',now(),source_id);
    end if;
    if n = 6 then
      begin
      insert into public.pet_care_entries(user_id,pet_profile_id,category,title,note,occurred_at,intelligence_source_message_id)
        values(owner_id,pet_id,'general','Another entry','Different observation',now(),source_id);
      raise exception 'source-turn uniqueness missing';
      exception when unique_violation then null;
      end;
    end if;
    if n = 7 then
      payload := payload || jsonb_build_object('id',request_id::text || ':second');
      insert into public.ask_action_capabilities(id,user_id,assistant_message_id,source_message_id,source_action_id,action_kind,pet_profile_id,
        safety_class,mutation_class,confirmation_policy,authorization_scope,explicit_intent,action_payload)
        values(gen_random_uuid(),owner_id,assistant_id,source_id,request_id::text || ':second','care_history.add',pet_id,
        'LOW_RISK_REVERSIBLE','mutation','explicit_intent','owned_pet',true,payload);
    end if;
    select count(*) into before_count from public.pet_care_entries where user_id=owner_id;
    if (select count(*) from public.execute_ask_action_capability(capability_id,assistant_id,
      '92000000-0000-4000-8000-000000000002','auto',null)) <> 0 then raise exception 'foreign owner accessed capability'; end if;
    select * into result from public.execute_ask_action_capability(capability_id,assistant_id,owner_id,case when n=5 then 'cancel' else 'auto' end,null);
    if n in (1,2,3,6) and result.action->>'status' <> 'succeeded' then raise exception 'case % save failed: %',n,result.action; end if;
    if n in (4,7) and result.action->>'status' <> 'failed' then raise exception 'case % unsafe reconciliation accepted',n; end if;
    if n=5 and result.action->>'status' <> 'cancelled' then raise exception 'cancel was reconciled as success'; end if;
    if (select count(*) from public.pet_care_entries where user_id=owner_id) <> before_count + (case when n in (2,3) then 1 else 0 end) then
      raise exception 'case % duplicate created or new observation lost',n;
    end if;
    select * into replay from public.execute_ask_action_capability(capability_id,assistant_id,owner_id,'auto',null);
    if replay.changed or replay.action is distinct from result.action then raise exception 'case % replay changed receipt',n; end if;
  end loop;
  if has_function_privilege('service_role','private.execute_ask_action_capability(uuid,uuid,uuid,text,uuid)','execute')
    or has_function_privilege('authenticated','public.execute_ask_action_capability(uuid,uuid,uuid,text,uuid)','execute')
    or has_function_privilege('anon','public.execute_ask_action_capability(uuid,uuid,uuid,text,uuid)','execute') then
    raise exception 'executor authority expanded';
  end if;
end;
$$;
rollback;
