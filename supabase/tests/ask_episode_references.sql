\set ON_ERROR_STOP on
begin;
set local statement_timeout='8s';
set local lock_timeout='2s';
insert into auth.users(id,aud,role,email,created_at,updated_at) values
 ('96000000-0000-4000-8000-000000000001','authenticated','authenticated','episode-a@example.test',now(),now()),
 ('96000000-0000-4000-8000-000000000002','authenticated','authenticated','episode-b@example.test',now(),now());
insert into public.dog_profiles(id,user_id,name,species) values
 ('96000000-0000-4000-8000-000000000011','96000000-0000-4000-8000-000000000001','Synthetic Milo','dog'),
 ('96000000-0000-4000-8000-000000000012','96000000-0000-4000-8000-000000000002','Foreign pet','dog');
insert into public.pet_care_episodes(id,user_id,pet_profile_id,episode_type,normalized_key,title,status,severity,sequence_number,started_at,last_event_at)
select ('97000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
 '96000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000011','symptom','vomiting','Synthetic episode','resolved','routine',i,
 '2011-01-01'::timestamptz+i*interval '1 year','2011-01-02'::timestamptz+i*interval '1 year' from generate_series(1,12)i;
insert into public.pet_care_entries(id,user_id,pet_profile_id,episode_id,category,note,occurred_at)
select ('98000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
 '96000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000011',
 '97000000-0000-4000-8000-000000000001','symptom',case when i=1 then 'Synthetic Milo had a vomiting episode.' else 'Synthetic update within the same episode.' end,
 '2012-01-01'::timestamptz+i*interval '1 minute' from generate_series(1,12)i;
insert into public.pet_care_entries(id,user_id,pet_profile_id,episode_id,category,note,occurred_at,deleted_at,deletion_reason) values
 ('98000000-0000-4000-8000-000000000021','96000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000011',
 '97000000-0000-4000-8000-000000000002','symptom','Deleted source','2013-01-01',now(),'Synthetic test'),
 ('98000000-0000-4000-8000-000000000022','96000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000011',
 '97000000-0000-4000-8000-000000000002','symptom',repeat('x',2001),'2013-01-02',null,null);
insert into public.ask_conversations(id,user_id,pet_profile_id,title) values
 ('96000000-0000-4000-8000-000000000031','96000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000011','Synthetic episodes');
-- Actual existing service-only completion boundary, rather than direct client JSON.
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select * from public.begin_ask_conversation_turn(
 '96000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000011',
 '96000000-0000-4000-8000-000000000031','96000000-0000-4000-8000-000000000041',
 'List episodes','Synthetic episodes','List episodes');
reset role;
select set_config('episode.test.user_message',(select id::text from public.ask_conversation_messages where request_id='96000000-0000-4000-8000-000000000041' and role='user'),true);
set local role service_role;
select * from public.complete_ask_conversation_turn(
 '96000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000031',
 current_setting('episode.test.user_message')::uuid,'96000000-0000-4000-8000-000000000041','Synthetic list',
 '{"directAnswer":"Synthetic list","episodeReferences":{"version":"ask-episodes.v1","items":[{"id":"episode:97000000-0000-4000-8000-000000000002","ordinal":1}]}}',null,null,null,null);
reset role;
-- Later assistant prose must not displace the separately indexed displayed list.
insert into public.ask_conversation_messages(conversation_id,user_id,role,sequence_number,response_data)
select '96000000-0000-4000-8000-000000000031','96000000-0000-4000-8000-000000000001','furvise',i,'{"directAnswer":"Unrelated turn"}' from generate_series(4,31)i;
set local role authenticated;
select set_config('request.jwt.claim.sub','96000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
do $$ declare r jsonb; begin
 r:=public.read_ask_episode_sources('96000000-0000-4000-8000-000000000011',array['vomiting']);
 if jsonb_array_length(r->'episodes')<>9 or jsonb_array_length(r->'sources')<>11 then raise exception 'Episode/member bounds'; end if;
 if r->'episodes'->0->>'id'<>'97000000-0000-4000-8000-000000000001' then raise exception 'Old episode missing'; end if;
 if not exists(select 1 from jsonb_array_elements(r->'sources') s where s->>'deleted_at' is not null) then raise exception 'Deletion status omitted'; end if;
 if not exists(select 1 from jsonb_array_elements(r->'sources') s where s->>'content_omitted'='true' and s->'note'='null'::jsonb) then raise exception 'Oversized source accepted'; end if;
 r:=public.read_ask_episode_sources('96000000-0000-4000-8000-000000000011',array['vomiting'],array['97000000-0000-4000-8000-000000000012'::uuid]);
 if jsonb_array_length(r->'episodes')<>1 or r->'episodes'->0->>'sequence_number'<>'12' then raise exception 'Pinned old list reference reranked'; end if;
 r:=public.read_ask_episode_sources('96000000-0000-4000-8000-000000000011',array['vomiting'],null,'2023-01-01','2024-01-01');
 if jsonb_array_length(r->'episodes')<>1 or r->'episodes'->0->>'sequence_number'<>'12' then raise exception 'Period applied after discovery limit'; end if;
 r:=public.read_ask_episode_sources('96000000-0000-4000-8000-000000000011',array['vomiting'],null,'2022-01-01','2023-01-01');
 if jsonb_array_length(r->'episodes')<>1 or r->'episodes'->0->>'sequence_number'<>'11' then raise exception 'Half-open period boundary'; end if;
 begin perform public.read_ask_episode_sources('96000000-0000-4000-8000-000000000011',array['vomiting'],null,'2023-01-01',null);raise exception 'Incomplete period accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.read_ask_episode_sources('96000000-0000-4000-8000-000000000011',array['vomiting'],null,'2024-01-01','2023-01-01');raise exception 'Reversed period accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.read_ask_episode_sources('96000000-0000-4000-8000-000000000011',array['vomiting'],null,'-infinity','infinity');raise exception 'Infinite period accepted'; exception when invalid_parameter_value then null; end;
 r:=public.read_ask_episode_references('96000000-0000-4000-8000-000000000031');
 if r->'items'->0->>'id'<>'episode:97000000-0000-4000-8000-000000000002' then raise exception 'Reference lost after reload/other turns'; end if;
 begin perform public.read_ask_episode_sources('96000000-0000-4000-8000-000000000012',array['vomiting']);raise exception 'Foreign pet accepted'; exception when insufficient_privilege then null; end;
 begin update public.ask_conversation_messages set response_data='{}' where conversation_id='96000000-0000-4000-8000-000000000031';raise exception 'Client reference forgery accepted'; exception when insufficient_privilege then null; end;
 begin perform public.read_ask_episode_sources('96000000-0000-4000-8000-000000000011',array['bad']);raise exception 'Bad topic accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.read_ask_episode_sources('96000000-0000-4000-8000-000000000011',array['vomiting'],array_fill('97000000-0000-4000-8000-000000000001'::uuid,array[9]));raise exception 'Unbounded IDs accepted'; exception when invalid_parameter_value then null; end;
 raise notice 'PASS bounded episode/source lookup, stable service-persisted references, client write denial';
end $$;
set local statement_timeout='0';
do $$ begin
 begin perform public.read_ask_episode_sources('96000000-0000-4000-8000-000000000011',array['vomiting']);raise exception 'Unbounded timeout accepted'; exception when object_not_in_prerequisite_state then null; end;
end $$;
set local statement_timeout='8s';
select set_config('request.jwt.claim.sub','96000000-0000-4000-8000-000000000002',true);
do $$ begin
 begin perform public.read_ask_episode_references('96000000-0000-4000-8000-000000000031');raise exception 'Foreign conversation accepted'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
 if exists(select 1 from pg_proc where proname in ('read_ask_episode_sources','read_ask_episode_references') and prosecdef) then raise exception 'Unexpected definer authority'; end if;
 if has_function_privilege('anon','public.read_ask_episode_sources(uuid,text[],uuid[],timestamptz,timestamptz)','execute') or has_function_privilege('service_role','public.read_ask_episode_references(uuid)','execute') then raise exception 'Excess RPC grants'; end if;
 if exists(select 1 from pg_trigger where tgrelid='public.pet_care_entries'::regclass and not tgisinternal and tgenabled<>'O') then raise exception 'Disabled care trigger'; end if;
 raise notice 'PASS RLS invoker authority, grants, timeout prerequisite, enabled triggers';
end $$;
rollback;
