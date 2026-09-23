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
declare candidate record;
begin
  for candidate in select * from (values
    ('51000000-0000-4000-8000-000000000001'::uuid,'51000000-0000-4000-8000-000000000011'::uuid,'Maple hides during thunderstorms.'),
    ('52000000-0000-4000-8000-000000000001'::uuid,'51000000-0000-4000-8000-000000000011'::uuid,'Maple hides during thunderstorms.'),
    ('51000000-0000-4000-8000-000000000001'::uuid,'52000000-0000-4000-8000-000000000011'::uuid,'Maple hides during thunderstorms.'),
    ('51000000-0000-4000-8000-000000000001'::uuid,'51000000-0000-4000-8000-000000000011'::uuid,'changed'),
    ('51000000-0000-4000-8000-000000000001'::uuid,'51000000-0000-4000-8000-000000000011'::uuid,'')
  ) v(owner_id,pet_id,detail) loop
    begin
      perform * from public.save_ask_memory_suggestion(candidate.owner_id,
        '51000000-0000-4000-8000-000000000021',candidate.pet_id,candidate.detail,'behavior');
      raise exception 'proofless memory continuation accepted';
    exception when invalid_parameter_value then
      if sqlerrm <> 'CANONICAL_SUGGESTION_REQUIRED' then raise;end if;
    end;
  end loop;
  if (select status from public.ai_update_suggestions where id='51000000-0000-4000-8000-000000000021') is distinct from 'pending'
    or exists(select 1 from public.furvise_memories where user_id='51000000-0000-4000-8000-000000000001')
    or exists(select 1 from public.dog_memories where user_id='51000000-0000-4000-8000-000000000001') then
    raise exception 'unsupported continuation changed factual state';
  end if;
end $$;
reset role;
rollback;
