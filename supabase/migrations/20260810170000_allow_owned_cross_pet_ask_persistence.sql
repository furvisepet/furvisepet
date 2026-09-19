-- Ask conversations retain a primary pet, but an authenticated turn may be
-- authoritatively resolved to another pet owned by the same account. Keep the
-- source message and target pet ownership checks independent so conversation
-- context cannot override the governed per-turn subject.
do $migration$
declare
  v_procedure regprocedure;
  v_definition text;
  v_guard_count integer;
begin
  foreach v_procedure in array array[
    'public.persist_furvise_semantic_event_exact_20260807(uuid,uuid,uuid,jsonb)'::regprocedure,
    'public.persist_furvise_care_event_with_concern(uuid,uuid,uuid,jsonb,uuid)'::regprocedure,
    'public.persist_furvise_intelligence(uuid,uuid,jsonb,jsonb)'::regprocedure
  ]
  loop
    select pg_get_functiondef(v_procedure) into strict v_definition;
    v_guard_count := regexp_count(v_definition, 'conversation_row\.pet_profile_id = p_pet_id');
    if v_guard_count <> 1 then
      raise exception using
        errcode = '55000',
        message = 'ASK_PERSISTENCE_SOURCE_GUARD_UNEXPECTED',
        detail = v_procedure::text;
    end if;

    -- Each function continues to require an owned source message in an owned
    -- conversation and independently verifies that p_pet_id belongs to the
    -- same authenticated user. Only the obsolete equality between those two
    -- owned resources is removed.
    v_definition := regexp_replace(
      v_definition,
      '\s+and conversation_row\.pet_profile_id = p_pet_id',
      '',
      'g'
    );
    execute v_definition;
  end loop;
end;
$migration$;

-- Preserve the existing authority boundary after replacing function bodies.
revoke all on function public.persist_furvise_semantic_event_exact_20260807(uuid, uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.persist_furvise_care_event_with_concern(uuid, uuid, uuid, jsonb, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.persist_furvise_intelligence(uuid, uuid, jsonb, jsonb)
  from public, anon, service_role;
grant execute on function public.persist_furvise_intelligence(uuid, uuid, jsonb, jsonb)
  to authenticated;
