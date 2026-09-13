-- Disposable stage2_validation only. Admission and privileges, all rolled back.
begin;
set local statement_timeout='8s';
insert into auth.users(id) values('94000000-0000-4000-8000-000000000001');
insert into public.dog_profiles(id,user_id,name,species) values
 ('94000000-0000-4000-8000-000000000011','94000000-0000-4000-8000-000000000001','Milo','dog');
insert into public.ask_conversations(id,user_id,pet_profile_id,title) values
 ('94000000-0000-4000-8000-000000000021','94000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000011','Time admission');
select set_config('request.jwt.claim.sub','94000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','service_role',true);
do $$ declare msg uuid; attempt record; payload jsonb; r record; counter integer:=0;
begin
 for attempt in select * from (values
   ('2011-02-01T12:00:00Z','2011-02-01',true),
   ('2010-02-01T12:00:00Z','2010-02-01',false),
   ('-infinity','2011-02-01',false),
   ('2099-02-01T12:00:00Z','2011-02-01',false)
 ) v(event_time,cue,allowed) loop
  msg:=gen_random_uuid();counter:=counter+1;
  insert into public.ask_conversation_messages(id,conversation_id,user_id,role,sequence_number,user_text)
  values(msg,'94000000-0000-4000-8000-000000000021','94000000-0000-4000-8000-000000000001','user',counter,'Milo coughed on 2011-02-01.');
  payload:=jsonb_build_object('subject',jsonb_build_object('type','pet','name','Milo'),'domain','health','topic','cough',
    'eventTitle','Cough report','transition','observed','state','historical','importance','important','confidence',0.99,
    'sourceExcerpt','Milo coughed on 2011-02-01.','temporal',jsonb_build_object('occurredAt',attempt.event_time,'explicitTime',attempt.cue));
  begin
   select * into r from public.persist_furvise_server_semantic_event('94000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000011',msg,payload);
   if not attempt.allowed then raise exception 'invalid historical time accepted: %',attempt.event_time; end if;
   if not exists(select 1 from public.pet_care_entries where id=r.care_entry_id and occurred_at=attempt.event_time::timestamptz) then
    raise exception 'old recorded date lost'; end if;
  exception when invalid_parameter_value then
   if attempt.allowed or sqlerrm<>'SEMANTIC_EVENT_TIME_INVALID' then raise; end if;
  end;
 end loop;
 if has_function_privilege('anon','private.ask_native_episode_census(uuid,text[],timestamptz,timestamptz)','execute')
   or has_function_privilege('authenticated','private.ask_native_episode_census(uuid,text[],timestamptz,timestamptz)','execute')
   or has_function_privilege('service_role','private.ask_native_episode_census(uuid,text[],timestamptz,timestamptz)','execute')
   or has_table_privilege('authenticated','private.ask_recorded_source_evidence','select')
   or has_table_privilege('service_role','private.ask_recorded_source_evidence','insert')
   or has_function_privilege('authenticated','public.persist_furvise_server_semantic_event(uuid,uuid,uuid,jsonb)','execute') then
   raise exception 'private authority exposed'; end if;
 if not has_function_privilege('authenticated','public.read_ask_episode_sources(uuid,text[],uuid[],timestamptz,timestamptz)','execute')
   or not has_function_privilege('service_role','public.persist_furvise_server_semantic_event(uuid,uuid,uuid,jsonb)','execute') then
   raise exception 'required privilege missing'; end if;
end $$;
-- Scope receipt privilege and conservative unknown-source checks.
do $$ declare owner_id uuid:='94000000-0000-4000-8000-000000000001'; pet_id uuid:='94000000-0000-4000-8000-000000000011';
 ids uuid[];
begin
 ids:=private.ask_removed_pet_scope(owner_id,'{}');
 if ids<>array[pet_id] then raise exception 'unknown deletion lost current pet scope'; end if;
 if private.ask_removed_pet_scope(owner_id,jsonb_build_object('pet_profile_id',pet_id))<>array[pet_id]
   or private.ask_removed_pet_scope(owner_id,jsonb_build_object('subject_type','pet','subject_id',pet_id))<>array[pet_id] then
   raise exception 'known deletion subject lost'; end if;
 if has_function_privilege('anon','private.ask_removed_pet_scope(uuid,jsonb)','execute')
   or has_function_privilege('authenticated','private.ask_removed_pet_scope(uuid,jsonb)','execute')
   or has_function_privilege('service_role','private.ask_removed_pet_scope(uuid,jsonb)','execute')
   or has_function_privilege('authenticated','private.capture_ask_removed_pet_scope()','execute')
   or has_table_privilege('authenticated','public.ask_recorded_inventory_removals','update')
   or has_table_privilege('service_role','public.ask_history_removed_relation_targets','update') then
   raise exception 'deletion receipt authority exposed'; end if;
 -- Legacy backfill semantics: keep the old pet's uncertainty; a later-created
 -- pet cannot inherit an identity that did not exist when scope was captured.
 insert into public.ask_recorded_inventory_removals(user_id,affected_pet_ids) values(owner_id,ids);
 -- Seed the second synthetic pet as fixture setup, before authenticating its owner.
 perform set_config('request.jwt.claim.sub','',true);
 insert into public.dog_profiles(id,user_id,name,species) values
 ('94000000-0000-4000-8000-000000000012',owner_id,'Luna','cat');
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 if exists(select 1 from public.ask_recorded_inventory_removals where user_id=owner_id
   and '94000000-0000-4000-8000-000000000012'::uuid=any(affected_pet_ids)) then
   raise exception 'old uncertainty leaked to a new pet'; end if;
 if private.ask_native_episode_census(pet_id,array['vomiting'],null,null) is not null then
   raise exception 'old deletion uncertainty cleared'; end if;
 if (private.ask_native_episode_census('94000000-0000-4000-8000-000000000012',array['vomiting'],null,null)->>'episodeCount')::integer is distinct from 0 then
   raise exception 'new empty pet register cannot certify zero'; end if;
 -- An unresolved removed relation is scoped to all pets that exist NOW.
 insert into public.ask_history_removed_relation_targets(user_id,target_claim_id,relation_id)
 values(owner_id,gen_random_uuid(),gen_random_uuid());
 if private.ask_native_episode_census('94000000-0000-4000-8000-000000000012',array['vomiting'],null,null) is not null then
   raise exception 'unresolved relation no longer blocks possible target'; end if;
end $$;
rollback;
