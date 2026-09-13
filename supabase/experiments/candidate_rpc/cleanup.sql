\set ON_ERROR_STOP on
\timing on
-- Explicit identifiers belong only to this experiment. Never drop a database.
begin;
set local statement_timeout='120s';
set local lock_timeout='5s';
do $$ begin
 if current_database()<>'stage2_validation' then raise exception 'Wrong database'; end if;
 if (select count(*) from auth.users where id in
 ('93000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000002','93000000-0000-4000-8000-000000000003')
 and email like 'rpc-synthetic-%@example.test')<>3 then raise exception 'Fixture identity mismatch'; end if;
 if exists(select 1 from public.pet_care_entries where user_id in
 ('93000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000002','93000000-0000-4000-8000-000000000003')
 and id::text not like '94000000-%' and id::text not like '95000000-%') then raise exception 'Unexpected dependent data'; end if;
end $$;
-- Auth cascade removes only these three synthetic users and their fixture pets,
-- care rows and generated dependents. No trigger bypass during cleanup.
delete from auth.users where id in
 ('93000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000002','93000000-0000-4000-8000-000000000003');
drop function ask_candidate_experiment.search(uuid,text[],timestamptz,timestamptz,timestamptz,uuid,integer);
drop schema ask_candidate_experiment restrict;
revoke select on public.dog_profiles,public.pet_care_entries from ask_candidate_experiment_reader;
revoke execute on function auth.uid() from ask_candidate_experiment_reader;
revoke usage on schema public,auth from ask_candidate_experiment_reader;
drop role ask_candidate_experiment_reader;
do $$ begin
 if exists(select 1 from public.pet_care_entries where id::text like '94000000-%' or id::text like '95000000-%') then raise exception 'Fixture rows remain'; end if;
 if not exists(select 1 from pg_trigger where tgrelid='public.pet_care_entries'::regclass and tgname='pet_care_entries_apply_current_state' and tgenabled='O') then raise exception 'Trigger disabled'; end if;
end $$;
commit;
