begin;

do $$
begin
  if has_function_privilege('anon', 'public.repair_resolved_concern_suggestions(boolean)', 'execute') then raise exception 'anon can execute repair RPC'; end if;
  if has_function_privilege('authenticated', 'public.repair_resolved_concern_suggestions(boolean)', 'execute') then raise exception 'authenticated can execute repair RPC'; end if;
  if has_function_privilege('anon', 'public.repair_pet_memory_lifecycle(uuid,uuid,boolean)', 'execute') then raise exception 'anon can execute memory repair RPC'; end if;
  if has_function_privilege('authenticated', 'public.repair_pet_memory_lifecycle(uuid,uuid,boolean)', 'execute') then raise exception 'authenticated can execute memory repair RPC'; end if;
  if has_function_privilege('anon', 'public.diagnose_furvise_integrity(uuid)', 'execute') or has_function_privilege('authenticated', 'public.diagnose_furvise_integrity(uuid)', 'execute') then raise exception 'normal role can execute diagnostic RPC'; end if;
  if has_function_privilege('anon', 'public.repair_furvise_recovery_events(boolean)', 'execute') or has_function_privilege('authenticated', 'public.repair_furvise_recovery_events(boolean)', 'execute') then raise exception 'normal role can execute recovery repair RPC'; end if;
  if has_function_privilege('anon', 'public.repair_maple_qa_consistency(boolean)', 'execute') or has_function_privilege('authenticated', 'public.repair_maple_qa_consistency(boolean)', 'execute') then raise exception 'normal role can execute QA repair RPC'; end if;
  if has_function_privilege('anon', 'public.finish_maple_qa_consistency_repair(boolean)', 'execute') or has_function_privilege('authenticated', 'public.finish_maple_qa_consistency_repair(boolean)', 'execute') then raise exception 'normal role can execute QA finish RPC'; end if;
  if has_function_privilege('anon', 'public.repair_maple_persistence_destinations(boolean)', 'execute') or has_function_privilege('authenticated', 'public.repair_maple_persistence_destinations(boolean)', 'execute') then raise exception 'normal role can execute persistence repair RPC'; end if;
  if has_function_privilege('anon', 'public.backfill_pet_care_episodes(uuid,boolean)', 'execute') or has_function_privilege('authenticated', 'public.backfill_pet_care_episodes(uuid,boolean)', 'execute') then raise exception 'normal role can execute episode backfill RPC'; end if;
  if has_function_privilege('anon', 'public.recompute_pet_current_state(uuid,boolean)', 'execute') or has_function_privilege('authenticated', 'public.recompute_pet_current_state(uuid,boolean)', 'execute') then raise exception 'normal role can execute state recompute RPC'; end if;
end;
$$;

insert into auth.users(id, aud, role, email, encrypted_password, created_at, updated_at) values
  ('11000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 's1-one@example.test', '', now(), now()),
  ('22000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 's1-two@example.test', '', now(), now());
insert into public.dog_profiles(id, user_id, name, species) values
  ('11000000-0000-4000-8000-000000000011', '11000000-0000-4000-8000-000000000001', 'S1 one', 'dog'),
  ('22000000-0000-4000-8000-000000000022', '22000000-0000-4000-8000-000000000002', 'S1 two', 'dog');
insert into public.pet_care_entries(id, user_id, pet_profile_id, category, note) values
  ('22000000-0000-4000-8000-000000000023', '22000000-0000-4000-8000-000000000002', '22000000-0000-4000-8000-000000000022', 'general', 'private test');
insert into public.ask_conversations(id, user_id, pet_profile_id, title, preview) values
  ('22000000-0000-4000-8000-000000000024', '22000000-0000-4000-8000-000000000002', '22000000-0000-4000-8000-000000000022', 'private test', 'private test');
insert into public.ask_conversation_messages(id, conversation_id, user_id, role, sequence_number, user_text) values
  ('22000000-0000-4000-8000-000000000025', '22000000-0000-4000-8000-000000000024', '22000000-0000-4000-8000-000000000002', 'user', 1, 'private test');
insert into public.pet_care_episodes(id, user_id, pet_profile_id, episode_type, normalized_key, title, status, severity, sequence_number, started_at, last_event_at) values
  ('22000000-0000-4000-8000-000000000026', '22000000-0000-4000-8000-000000000002', '22000000-0000-4000-8000-000000000022', 'care_tracking', 's1-private', 'private episode', 'active', 'routine', 1, now(), now());
insert into public.pet_concerns(id, user_id, pet_profile_id, title, normalized_key) values
  ('22000000-0000-4000-8000-000000000027', '22000000-0000-4000-8000-000000000002', '22000000-0000-4000-8000-000000000022', 'private concern', 's1-private');
insert into public.furvise_memories(id, user_id, pet_id, subject_type, category, fact_key, fact_value, normalized_value, confidence, importance, durability, source_type, dedupe_key) values
  ('22000000-0000-4000-8000-000000000028', '22000000-0000-4000-8000-000000000002', '22000000-0000-4000-8000-000000000022', 'pet', 'test', 'private', '{"value":"private"}', 'private', 0.9, 'medium', 'ongoing', 's1_test', 's1-private');
insert into public.ai_usage_events(id, user_id, request_id, feature, status, period_start) values
  ('22000000-0000-4000-8000-000000000029', '22000000-0000-4000-8000-000000000002', '22000000-0000-4000-8000-000000000129', 'ask', 'completed', current_date);
insert into public.ai_update_suggestions(id, user_id, pet_profile_id, type, title, details) values
  ('22000000-0000-4000-8000-000000000030', '22000000-0000-4000-8000-000000000002', '22000000-0000-4000-8000-000000000022', 'memory', 'private suggestion', 'private');
insert into public.vet_visit_briefs(id, user_id, pet_profile_id, date_range_start, date_range_end, confirmed_title, confirmed_data) values
  ('22000000-0000-4000-8000-000000000031', '22000000-0000-4000-8000-000000000002', '22000000-0000-4000-8000-000000000022', current_date - 1, current_date, 'private brief', '{"private":true}');
insert into public.dog_product_feedback(id, user_id, dog_profile_id, product_id, product_name, feedback_type) values
  ('22000000-0000-4000-8000-000000000032', '22000000-0000-4000-8000-000000000002', '22000000-0000-4000-8000-000000000022', 's1-private', 'private product', 'saved');

set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
begin
  if exists(select 1 from public.dog_profiles where id = '22000000-0000-4000-8000-000000000022') then raise exception 'cross-user profile visible'; end if;
  if exists(select 1 from public.pet_care_entries where id = '22000000-0000-4000-8000-000000000023') then raise exception 'cross-user care entry visible'; end if;
  if exists(select 1 from public.ask_conversations where id = '22000000-0000-4000-8000-000000000024') then raise exception 'cross-user conversation visible'; end if;
  if exists(select 1 from public.ask_conversation_messages where id = '22000000-0000-4000-8000-000000000025') then raise exception 'cross-user message visible'; end if;
  if exists(select 1 from public.pet_care_episodes where id = '22000000-0000-4000-8000-000000000026') then raise exception 'cross-user episode visible'; end if;
  if exists(select 1 from public.pet_current_state where pet_profile_id = '22000000-0000-4000-8000-000000000022') then raise exception 'cross-user pet state visible'; end if;
  if exists(select 1 from public.pet_concerns where id = '22000000-0000-4000-8000-000000000027') then raise exception 'cross-user concern visible'; end if;
  if exists(select 1 from public.furvise_memories where id = '22000000-0000-4000-8000-000000000028') then raise exception 'cross-user memory visible'; end if;
  if exists(select 1 from public.ai_usage_events where id = '22000000-0000-4000-8000-000000000029') then raise exception 'cross-user usage event visible'; end if;
  if exists(select 1 from public.ai_update_suggestions where id = '22000000-0000-4000-8000-000000000030') then raise exception 'cross-user suggestion visible'; end if;
  if exists(select 1 from public.vet_visit_briefs where id = '22000000-0000-4000-8000-000000000031') then raise exception 'cross-user Vet Brief visible'; end if;
  if exists(select 1 from public.dog_product_feedback where id = '22000000-0000-4000-8000-000000000032') then raise exception 'cross-user product feedback visible'; end if;
  begin
    insert into public.dog_profiles(user_id, name, species) values ('22000000-0000-4000-8000-000000000002', 'spoof', 'dog');
    raise exception 'client-supplied user_id bypassed auth.uid()';
  exception when insufficient_privilege then null; end;
  begin
    perform public.apply_furvise_state_suggestion('22000000-0000-4000-8000-000000000002', gen_random_uuid());
    raise exception 'RPC trusted client-supplied user_id';
  exception when insufficient_privilege then null; end;
end;
$$;

select public.reserve_ai_credit('11000000-0000-4000-8000-000000000101', 'ask', 50);
select public.reserve_ai_credit('11000000-0000-4000-8000-000000000101', 'ask', 50);
select public.complete_ai_credit('11000000-0000-4000-8000-000000000101', 50);
select public.complete_ai_credit('11000000-0000-4000-8000-000000000101', 50);
do $$ begin
  if (select count(*) from public.ai_usage_events where request_id = '11000000-0000-4000-8000-000000000101') <> 1
     or (select credits_used from public.ai_usage_events where request_id = '11000000-0000-4000-8000-000000000101') <> 1
  then raise exception 'duplicate request charged more than once'; end if;
end $$;

select public.reserve_ai_credit('11000000-0000-4000-8000-000000000102', 'ask', 50);
select public.release_ai_credit('11000000-0000-4000-8000-000000000102', 50);
do $$ begin
  if not exists(select 1 from public.ai_usage_events where request_id = '11000000-0000-4000-8000-000000000102' and status = 'released' and credits_used = 0)
  then raise exception 'failed request did not release credit'; end if;
end $$;

rollback;
