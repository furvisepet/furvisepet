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
