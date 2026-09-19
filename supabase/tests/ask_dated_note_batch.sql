begin;
insert into auth.users(id,aud,role,email,created_at,updated_at) values
 ('89000000-0000-4000-8000-000000000001','authenticated','authenticated','batch@example.test',now(),now());
insert into public.dog_profiles(id,user_id,name,species) values
 ('89000000-0000-4000-8000-000000000011','89000000-0000-4000-8000-000000000001','Batch test','dog');
insert into public.ask_conversations(id,user_id,pet_profile_id,title) values
 ('89000000-0000-4000-8000-000000000021','89000000-0000-4000-8000-000000000001','89000000-0000-4000-8000-000000000011','Batch test');
insert into public.ask_conversation_messages(id,conversation_id,user_id,role,sequence_number,user_text) values
 ('89000000-0000-4000-8000-000000000031','89000000-0000-4000-8000-000000000021','89000000-0000-4000-8000-000000000001','user',1,
 'Save these notes: September 1, 2026: ate food. September 3, 2026: drank water.');
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
do $$ declare result record; notes jsonb := '[{"note":"September 1, 2026: ate food.","dateText":"September 1, 2026","occurredAt":"2026-09-01T00:00:00.000Z"},{"note":"September 3, 2026: drank water.","dateText":"September 3, 2026","occurredAt":"2026-09-03T00:00:00.000Z"}]'; begin
 -- A bad second record must roll back a valid first insertion.
 begin
  perform public.persist_furvise_server_note_batch('89000000-0000-4000-8000-000000000001','89000000-0000-4000-8000-000000000011','89000000-0000-4000-8000-000000000031',jsonb_set(notes,'{1,occurredAt}','"2026-09-04T00:00:00Z"'));
  raise exception 'invalid date accepted'; exception when invalid_parameter_value then null; end;
 if exists(select 1 from public.pet_care_entries where pet_profile_id='89000000-0000-4000-8000-000000000011') then raise exception 'partial batch committed'; end if;
 select * into result from public.persist_furvise_server_note_batch('89000000-0000-4000-8000-000000000001','89000000-0000-4000-8000-000000000011','89000000-0000-4000-8000-000000000031',notes);
 if cardinality(result.care_entry_ids)<>2 or result.already_persisted then raise exception 'batch incomplete'; end if;
 select * into result from public.persist_furvise_server_note_batch('89000000-0000-4000-8000-000000000001','89000000-0000-4000-8000-000000000011','89000000-0000-4000-8000-000000000031',notes);
 if not result.already_persisted or (select count(*) from public.pet_care_entries where pet_profile_id='89000000-0000-4000-8000-000000000011')<>2 then raise exception 'retry duplicated records'; end if;
 if (select array_agg(occurred_at::date order by occurred_at) from public.pet_care_entries where pet_profile_id='89000000-0000-4000-8000-000000000011')<>array['2026-09-01'::date,'2026-09-03'::date] then raise exception 'wrong dates'; end if;
 begin
  perform public.persist_furvise_server_note_batch('89000000-0000-4000-8000-000000000002','89000000-0000-4000-8000-000000000011','89000000-0000-4000-8000-000000000031',notes);
  raise exception 'foreign pet accepted'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
 if has_function_privilege('authenticated','public.persist_furvise_server_note_batch(uuid,uuid,uuid,jsonb)','EXECUTE') or has_function_privilege('anon','public.persist_furvise_server_note_batch(uuid,uuid,uuid,jsonb)','EXECUTE') then raise exception 'batch writer exposed'; end if;
end $$;
rollback;
