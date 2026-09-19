-- LOCAL ONLY, rollback-only behavioral test after applying local migrations.
begin;
insert into auth.users(id, aud, role, email, encrypted_password, created_at, updated_at) values
 ('82000000-0000-4000-8000-000000000001','authenticated','authenticated','history-a@example.test','',now(),now()),
 ('82000000-0000-4000-8000-000000000002','authenticated','authenticated','history-b@example.test','',now(),now());
insert into public.dog_profiles(id,user_id,name,species) values
 ('82000000-0000-4000-8000-000000000011','82000000-0000-4000-8000-000000000001','Synthetic Milo','dog'),
 ('82000000-0000-4000-8000-000000000012','82000000-0000-4000-8000-000000000001','Synthetic Bruno','dog'),
 ('82000000-0000-4000-8000-000000000013','82000000-0000-4000-8000-000000000002','Foreign pet','dog');
insert into public.pet_care_entries(id,user_id,pet_profile_id,category,note,occurred_at,created_at) values
 ('82000000-0000-4000-8000-000000000021','82000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000011','symptom','Milo vomited.','2014-07-09','2014-07-09'),
 ('82000000-0000-4000-8000-000000000022','82000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000012','symptom','Bruno vomited, not Milo.','2014-07-09','2026-08-20'),
 ('82000000-0000-4000-8000-000000000023','82000000-0000-4000-8000-000000000002','82000000-0000-4000-8000-000000000013','symptom','Foreign secret.','2014-07-09','2014-07-09');
set local role service_role;
select set_config('request.jwt.claim.sub','',true);
select * from public.import_legacy_semantic_claims_v2('82000000-0000-4000-8000-000000000001','pet_care_entries',null,'history.stage2.local',50);
select * from public.import_legacy_semantic_claims_v2('82000000-0000-4000-8000-000000000002','pet_care_entries',null,'history.stage2.local',50);
reset role;
update public.semantic_claims set operation_type = 'correct'
 where id in (select claim_id from public.semantic_claim_legacy_lineage where legacy_row_id = '82000000-0000-4000-8000-000000000022');
insert into public.semantic_claim_relations(user_id,from_claim_id,to_claim_id,relation_type,source_local_relation_key)
 select '82000000-0000-4000-8000-000000000001', replacement.claim_id, original.claim_id, 'corrects','history_test_correction'
 from public.semantic_claim_legacy_lineage original, public.semantic_claim_legacy_lineage replacement
 where original.legacy_row_id = '82000000-0000-4000-8000-000000000021'
   and replacement.legacy_row_id = '82000000-0000-4000-8000-000000000022';
set local role authenticated;
select set_config('request.jwt.claim.sub','82000000-0000-4000-8000-000000000001',true);
do $$ declare page jsonb; begin
 page := public.read_ask_history_correction_page(array['82000000-0000-4000-8000-000000000021'::uuid], '{}');
 if jsonb_array_length(page->'claims') <> 2 or jsonb_array_length(page->'relations') <> 1 then raise exception 'late relation closure missing'; end if;
 page := public.read_ask_history_correction_page('{}', '{}', array['82000000-0000-4000-8000-000000000012'::uuid], '2014-01-01', '2015-01-01', array['vomit']);
 if jsonb_array_length(page->'claims') <> 2 or jsonb_array_length(page->'relations') <> 1 then raise exception 'reassigned subject seed missing'; end if;
 page := public.read_ask_history_correction_page(array['82000000-0000-4000-8000-000000000023'::uuid], '{}');
 if jsonb_array_length(page->'sources') <> 0 or jsonb_array_length(page->'claims') <> 0 then raise exception 'cross-owner leak'; end if;
 begin
  perform public.read_ask_history_correction_page(array_fill('82000000-0000-4000-8000-000000000021'::uuid,array[65]), '{}');
  raise exception 'unbounded input accepted';
 exception when invalid_parameter_value then null; end;
end $$;
reset role;
-- Exercise SQL permissions, not merely auth.uid() checks under a privileged role.
do $$ declare signature regprocedure := 'public.read_ask_history_correction_page(uuid[],uuid[],uuid[],timestamptz,timestamptz,text[])'; begin
 if not has_function_privilege('authenticated',signature,'execute') then raise exception 'owner RPC grant missing'; end if;
 if has_function_privilege('anon',signature,'execute') or has_function_privilege('service_role',signature,'execute') then raise exception 'RPC grant too broad'; end if;
 if has_table_privilege('authenticated','public.ask_history_removed_relation_targets','select') then raise exception 'private markers exposed'; end if;
end $$;
set local role anon;
do $$ begin
 begin perform public.read_ask_history_correction_page('{}','{}'); raise exception 'anon read accepted';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
-- A real foreign claim ID is invisible even if supplied directly.
select set_config('history.test.foreign_claim', (select claim_id::text from public.semantic_claim_legacy_lineage where legacy_row_id='82000000-0000-4000-8000-000000000023'),true);
set local role authenticated;
do $$ declare page jsonb; begin
 page := public.read_ask_history_correction_page('{}',array[current_setting('history.test.foreign_claim')::uuid]);
 if page->'claims' <> '[]'::jsonb or page->'lineage' <> '[]'::jsonb or page->'sources' <> '[]'::jsonb then raise exception 'foreign claim exposed'; end if;
 begin perform public.read_ask_history_correction_page('{}',array_fill(gen_random_uuid(),array[65])); raise exception 'claim bound missing'; exception when invalid_parameter_value then null; end;
 begin perform public.read_ask_history_correction_page('{}','{}',array_fill(gen_random_uuid(),array[4])); raise exception 'pet bound missing'; exception when invalid_parameter_value then null; end;
 begin perform public.read_ask_history_correction_page('{}','{}','{}',null,null,array_fill('vomit'::text,array[7])); raise exception 'term bound missing'; exception when invalid_parameter_value then null; end;
end $$;
reset role;
savepoint relation_updates;
update public.semantic_claim_relations set metadata='{"synthetic":true}' where user_id='82000000-0000-4000-8000-000000000001';
do $$ begin if exists(select 1 from public.ask_history_removed_relation_targets) then raise exception 'non-authority update created marker'; end if; end $$;
update public.semantic_claim_relations set relation_type='supersedes' where user_id='82000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ declare page jsonb; begin
 page := public.read_ask_history_correction_page(array['82000000-0000-4000-8000-000000000021'::uuid],'{}');
 if jsonb_array_length(page->'withheld_claim_ids') <> 1 then raise exception 'relation update lost withholding'; end if;
end $$;
rollback to relation_updates;
savepoint lineage_updates;
update public.semantic_claim_legacy_lineage set legacy_row_id='82000000-0000-4000-8000-000000000099' where legacy_row_id='82000000-0000-4000-8000-000000000021';
set local role authenticated;
do $$ declare page jsonb; begin
 page := public.read_ask_history_correction_page(array['82000000-0000-4000-8000-000000000021'::uuid],'{}');
 if jsonb_array_length(page->'withheld_source_ids') <> 1 then raise exception 'lineage update lost withholding'; end if;
end $$;
rollback to lineage_updates;
savepoint correction_cascade;
delete from public.semantic_claims where id in (select claim_id from public.semantic_claim_legacy_lineage where legacy_row_id='82000000-0000-4000-8000-000000000022');
set local role authenticated;
do $$ declare page jsonb; begin
 page := public.read_ask_history_correction_page(array['82000000-0000-4000-8000-000000000021'::uuid],'{}');
 if jsonb_array_length(page->'withheld_claim_ids') <> 1 or page->'relations' <> '[]'::jsonb then raise exception 'correction cascade lost target marker'; end if;
end $$;
rollback to correction_cascade;
savepoint original_cascade;
delete from public.semantic_claims where id in (select claim_id from public.semantic_claim_legacy_lineage where legacy_row_id='82000000-0000-4000-8000-000000000021');
set local role authenticated;
do $$ declare page jsonb; begin
 page := public.read_ask_history_correction_page(array['82000000-0000-4000-8000-000000000021'::uuid],'{}');
 if jsonb_array_length(page->'withheld_source_ids') <> 1 then raise exception 'original cascade resurrected source'; end if;
end $$;
rollback to original_cascade;
savepoint owner_cascade;
delete from auth.users where id='82000000-0000-4000-8000-000000000001';
do $$ begin
 if exists(select 1 from public.ask_history_removed_relation_targets where user_id='82000000-0000-4000-8000-000000000001') then raise exception 'owner cascade left markers'; end if;
end $$;
rollback to owner_cascade;
reset role;
delete from public.semantic_claim_relations where user_id = '82000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ declare page jsonb; begin
 page := public.read_ask_history_correction_page(array['82000000-0000-4000-8000-000000000021'::uuid], '{}');
 if jsonb_array_length(page->'withheld_claim_ids') <> 1 then raise exception 'removed edge resurrected target'; end if;
end $$;
reset role;
delete from public.semantic_claim_legacy_lineage where legacy_row_id = '82000000-0000-4000-8000-000000000021';
set local role authenticated;
do $$ declare page jsonb; begin
 page := public.read_ask_history_correction_page(array['82000000-0000-4000-8000-000000000021'::uuid], '{}');
 if jsonb_array_length(page->'withheld_source_ids') <> 1 then raise exception 'removed lineage resurrected legacy source'; end if;
end $$;
select set_config('request.jwt.claim.sub','',true);
do $$ begin
 begin
  perform public.read_ask_history_correction_page('{}','{}');
  raise exception 'unauthenticated read accepted';
 exception when insufficient_privilege then null; end;
end $$;
rollback;
