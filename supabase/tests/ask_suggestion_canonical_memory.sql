begin;
insert into auth.users(id, aud, role, email, encrypted_password, created_at, updated_at)
values ('51000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'canonical-save@example.test', '', now(), now());
insert into public.dog_profiles(id, user_id, name, species)
values ('51000000-0000-4000-8000-000000000011', '51000000-0000-4000-8000-000000000001', 'Maple', 'dog');
insert into public.ai_update_suggestions(id, user_id, pet_profile_id, type, title, details, payload, status)
values ('51000000-0000-4000-8000-000000000021', '51000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000011',
'memory', 'Remember this', 'Maple hides during thunderstorms.', '{"memoryType":"behavior"}', 'pending');
do $$
begin
  if has_function_privilege('authenticated', 'public.save_ask_memory_suggestion(uuid,uuid,uuid,text,text)', 'execute')
    or has_function_privilege('anon', 'public.save_ask_memory_suggestion(uuid,uuid,uuid,text,text)', 'execute')
    or not has_function_privilege('service_role', 'public.save_ask_memory_suggestion(uuid,uuid,uuid,text,text)', 'execute') then
    raise exception 'incorrect RPC permissions';
  end if;
end $$;
set local role service_role;
do $$
declare r record; first_id uuid;
begin
  begin
    perform * from public.save_ask_memory_suggestion('51000000-0000-4000-8000-000000000001',
      '51000000-0000-4000-8000-000000000021', '51000000-0000-4000-8000-000000000011', 'changed', 'behavior');
    raise exception 'changed evidence accepted';
  exception when serialization_failure then null;
  end;
  if (select status from public.ai_update_suggestions where id='51000000-0000-4000-8000-000000000021') <> 'pending'
    or exists(select 1 from public.furvise_memories where user_id='51000000-0000-4000-8000-000000000001') then
    raise exception 'failed save mutated state';
  end if;
  select * into r from public.save_ask_memory_suggestion('51000000-0000-4000-8000-000000000001',
    '51000000-0000-4000-8000-000000000021', '51000000-0000-4000-8000-000000000011', 'Maple hides during thunderstorms.', 'behavior');
  if r.apply_status <> 'applied' or r.memory_id is null then raise exception 'save failed'; end if;
  first_id := r.memory_id;
  select * into r from public.save_ask_memory_suggestion('51000000-0000-4000-8000-000000000001',
    '51000000-0000-4000-8000-000000000021', '51000000-0000-4000-8000-000000000011', '', '');
  if r.apply_status <> 'already_applied' or r.memory_id <> first_id then raise exception 'retry mismatch'; end if;
  if (select count(*) from public.furvise_memories where user_id='51000000-0000-4000-8000-000000000001') <> 1 then raise exception 'duplicate'; end if;
  if exists(select 1 from public.dog_memories where user_id='51000000-0000-4000-8000-000000000001') then raise exception 'legacy write'; end if;
  delete from public.furvise_memories where id=first_id;
  select * into r from public.save_ask_memory_suggestion('51000000-0000-4000-8000-000000000001',
    '51000000-0000-4000-8000-000000000021', '51000000-0000-4000-8000-000000000011', '', '');
  if r.apply_status <> 'already_applied' or r.memory_id is not null then raise exception 'forgotten memory recreated'; end if;
end $$;
reset role;
rollback;
