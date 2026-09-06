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
rollback;
