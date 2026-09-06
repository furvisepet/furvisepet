-- Small correctness fixture beyond the former 32-episode / 64-source caps.
-- Real server writer and census; all data is rolled back.
begin;
set local statement_timeout='8s';
insert into auth.users(id) values('95000000-0000-4000-8000-000000000001');
insert into public.dog_profiles(id,user_id,name,species) values
 ('95000000-0000-4000-8000-000000000011','95000000-0000-4000-8000-000000000001','Milo','dog');
insert into public.ask_conversations(id,user_id,pet_profile_id,title) values
 ('95000000-0000-4000-8000-000000000021','95000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000011','Census bounds');
select set_config('request.jwt.claim.sub','95000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','service_role',true);
do $$ declare i integer; step integer; msg uuid; prior uuid; note text; event_time timestamptz; transition text; payload jsonb; r record; inventory jsonb;
begin
 for i in 1..35 loop
  prior:=null;
  for step in 0..1 loop
   msg:=gen_random_uuid();event_time:='2011-01-01'::timestamptz+make_interval(days=>i*3+step);
   transition:=case when step=0 then 'started' else 'resolved' end;
   note:=case when step=0 then 'Milo had a separate bout of vomiting' else 'Milo stopped vomiting completely' end
     || ' on ' || event_time::date::text || '.';
   insert into public.ask_conversation_messages(id,conversation_id,user_id,role,sequence_number,user_text) values
    (msg,'95000000-0000-4000-8000-000000000021','95000000-0000-4000-8000-000000000001','user',i*2+step,note);
   payload:=jsonb_build_object('subject',jsonb_build_object('type','pet','name','Milo'),'domain','health','topic','vomiting',
    'eventTitle','Vomiting report','transition',transition,'state',case when step=0 then 'active' else 'resolved' end,
    'importance','important','confidence',0.99,'sourceExcerpt',note,
    'temporal',jsonb_build_object('occurredAt',event_time,'explicitTime',event_time::date::text),
    'recordedEvidence',jsonb_build_object('version','ask-governed-source.v1',
     'petId','95000000-0000-4000-8000-000000000011','topic','vomiting','inventoryTopic','vomiting',
     'transition',transition,'priorEpisodeId',prior,
     'sourceHash',encode(extensions.digest(convert_to(note,'UTF8'),'sha256'),'hex'),
     'noteHash',encode(extensions.digest(convert_to(note,'UTF8'),'sha256'),'hex'),
     'assessment',jsonb_build_object('policy','ask-semantic-boundary.v1','kind',case when step=0 then 'opening' else 'resolution' end,'evidence',note,'confidence',0.99)));
   select * into r from public.persist_furvise_server_semantic_event('95000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000011',msg,payload);
   prior:=r.episode_id;
  end loop;
 end loop;
 inventory:=public.read_ask_episode_sources('95000000-0000-4000-8000-000000000011',array['vomiting','vomit']);
 if inventory#>>'{recorded_census,episodeCount}' is distinct from '35'
   or inventory#>>'{recorded_census,sourceCount}' is distinct from '70'
   or jsonb_array_length(inventory->'episodes')>9 or jsonb_array_length(inventory->'sources')>64 then
   raise exception 'database census incorrectly coupled to bounded evidence: %',inventory; end if;
 if (select count(*) from public.pet_care_episodes where user_id=auth.uid() and recurrence_of is not null)<>34 then
   raise exception 'recurrence chain was lost'; end if;
end $$;
rollback;
