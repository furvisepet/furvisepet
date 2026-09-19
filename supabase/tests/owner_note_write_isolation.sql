begin;
insert into auth.users(id,aud,role,email,created_at,updated_at) values
 ('89100000-0000-4000-8000-000000000001','authenticated','authenticated','owner-note@example.test',now(),now());
insert into public.dog_profiles(id,user_id,name,species) values
 ('89100000-0000-4000-8000-000000000011','89100000-0000-4000-8000-000000000001','Rowan','dog');
insert into public.ask_conversations(id,user_id,pet_profile_id,title) values
 ('89100000-0000-4000-8000-000000000021','89100000-0000-4000-8000-000000000001','89100000-0000-4000-8000-000000000011','Owner note test');
insert into public.ask_conversation_messages(id,conversation_id,user_id,request_id,role,sequence_number,user_text) values
 ('89100000-0000-4000-8000-000000000031','89100000-0000-4000-8000-000000000021','89100000-0000-4000-8000-000000000001','89100000-0000-4000-8000-000000000041','user',1,
 'Rowan might be tired, but ate normally. Save this note.');
-- Keep the secret in a transaction-local variable; never print it.
do $$ begin perform set_config('test.note_worker_token',(select token from private.owner_note_worker_config where id),true); end $$;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
do $$
declare receipt jsonb; replay jsonb; jobs jsonb; j jsonb; v_note_id uuid; original_lease uuid;
begin
 receipt:=public.persist_ask_owner_note('89100000-0000-4000-8000-000000000001','89100000-0000-4000-8000-000000000011','89100000-0000-4000-8000-000000000031','89100000-0000-4000-8000-000000000041','Rowan might be tired, but ate normally.');
 v_note_id:=(receipt->>'entryId')::uuid;
 replay:=public.persist_ask_owner_note('89100000-0000-4000-8000-000000000001','89100000-0000-4000-8000-000000000011','89100000-0000-4000-8000-000000000031','89100000-0000-4000-8000-000000000041','Rowan might be tired, but ate normally.');
 if receipt->>'entryId'<>replay->>'entryId' or replay->>'alreadyPersisted'<>'true' then raise exception 'save replay failed'; end if;
 if (select count(*) from public.pet_care_entries where id=v_note_id)<>1 or (select count(*) from public.owner_note_jobs where owner_note_jobs.entry_id=v_note_id)<>1 then raise exception 'note/outbox atomicity or duplication failed'; end if;
 if exists(select 1 from public.pet_care_entries where id=v_note_id and (episode_id is not null or concern_id is not null or intelligence_confidence is not null or care_event_metadata->>'occurrenceBasis'<>'recorded_at')) then raise exception 'clinical inference leaked into raw write'; end if;
 begin
  perform public.persist_ask_owner_note('89100000-0000-4000-8000-000000000099','89100000-0000-4000-8000-000000000011','89100000-0000-4000-8000-000000000031','89100000-0000-4000-8000-000000000041','Rowan might be tired, but ate normally.');
  raise exception 'foreign account accepted'; exception when insufficient_privilege then null;
 end;
 begin
  perform public.persist_ask_owner_note('89100000-0000-4000-8000-000000000001','89100000-0000-4000-8000-000000000011','89100000-0000-4000-8000-000000000031','89100000-0000-4000-8000-000000000041','Fabricated replacement');
  raise exception 'altered source accepted'; exception when insufficient_privilege then null;
 end;
 begin perform public.claim_owner_note_jobs('bad token'); raise exception 'worker token accepted'; exception when insufficient_privilege then null; end;
 jobs:=public.claim_owner_note_jobs(current_setting('test.note_worker_token'));j:=jobs->0;
 if jsonb_array_length(jobs)<>1 or j->>'source_note'<>'Rowan might be tired, but ate normally.' then raise exception 'job source mismatch'; end if;
 if jsonb_array_length(public.claim_owner_note_jobs(current_setting('test.note_worker_token')))<>0 then raise exception 'active lease claimed twice'; end if;
 perform public.finish_owner_note_job((j->>'id')::uuid,(j->>'lease_token')::uuid,null,'provider offline');
 if not exists(select 1 from public.owner_note_jobs where id=(j->>'id')::uuid and status='pending' and attempts=1 and available_at>now()) then raise exception 'retry/backoff missing'; end if;
 if not exists(select 1 from public.pet_care_entries where id=v_note_id and note='Rowan might be tired, but ate normally.') then raise exception 'failed extraction lost note'; end if;
 update public.owner_note_jobs set available_at=now() where id=(j->>'id')::uuid;
 j:=public.claim_owner_note_jobs(current_setting('test.note_worker_token'))->0;
 original_lease:=(j->>'lease_token')::uuid;
 update public.owner_note_jobs set lease_until=now()-interval '1 second' where id=(j->>'id')::uuid;
 j:=public.claim_owner_note_jobs(current_setting('test.note_worker_token'))->0;
 if (j->>'lease_token')::uuid=original_lease then raise exception 'expired lease not replaced'; end if;
 if public.finish_owner_note_job((j->>'id')::uuid,original_lease,'{"version":"owner-note.v1","observations":[]}',null) then raise exception 'stale worker accepted'; end if;
 begin
  perform public.finish_owner_note_job((j->>'id')::uuid,(j->>'lease_token')::uuid,'{"version":"owner-note.v1","observations":[{"quote":"kidney disease","kind":"symptom","certainty":"reported","confidence":1}]}',null);
  raise exception 'fabricated extraction accepted'; exception when invalid_parameter_value then null;
 end;
 perform public.finish_owner_note_job((j->>'id')::uuid,(j->>'lease_token')::uuid,'{"version":"owner-note.v1","observations":[]}',null);
 if not exists(select 1 from public.owner_note_jobs where id=(j->>'id')::uuid and status='uninterpreted') then raise exception 'low confidence outcome missing'; end if;
 update public.pet_care_entries set note='Rowan is doing well.' where id=v_note_id;
 if not exists(select 1 from public.owner_note_jobs where id=(j->>'id')::uuid and status='superseded' and result is null) then raise exception 'edited projection retained'; end if;
 j:=public.claim_owner_note_jobs(current_setting('test.note_worker_token'))->0;
 update public.pet_care_entries set note='Rowan might be tired, but ate normally.' where id=v_note_id;
 if public.finish_owner_note_job((j->>'id')::uuid,(j->>'lease_token')::uuid,'{"version":"owner-note.v1","observations":[]}',null) then raise exception 'edited source accepted late result'; end if;
 j:=public.claim_owner_note_jobs(current_setting('test.note_worker_token'))->0;
 if j is null then raise exception 'restored source not requeued'; end if;
 update public.pet_care_entries set deleted_at=now(),deleted_by='89100000-0000-4000-8000-000000000001',deletion_reason='test' where id=v_note_id;
 if public.finish_owner_note_job((j->>'id')::uuid,(j->>'lease_token')::uuid,'{"version":"owner-note.v1","observations":[]}',null) then raise exception 'deleted source accepted late result'; end if;
 begin
  perform public.persist_ask_owner_note('89100000-0000-4000-8000-000000000001','89100000-0000-4000-8000-000000000011','89100000-0000-4000-8000-000000000031','89100000-0000-4000-8000-000000000041','Rowan might be tired, but ate normally.');
  raise exception 'retry resurrected source'; exception when invalid_parameter_value then null;
 end;
end $$;
reset role;
do $$ begin
 if has_function_privilege('authenticated','public.persist_ask_owner_note(uuid,uuid,uuid,uuid,text,timestamptz,text)','EXECUTE') or has_function_privilege('anon','public.persist_ask_owner_note(uuid,uuid,uuid,uuid,text,timestamptz,text)','EXECUTE')
  or has_function_privilege('authenticated','public.claim_owner_note_jobs(text)','EXECUTE') or has_function_privilege('anon','public.finish_owner_note_job(uuid,uuid,jsonb,text)','EXECUTE')
  or has_table_privilege('authenticated','public.owner_note_jobs','SELECT') or has_table_privilege('anon','public.owner_note_jobs','SELECT')
  or has_table_privilege('authenticated','private.owner_note_worker_config','SELECT') then raise exception 'service-only boundary exposed'; end if;
end $$;
rollback;
