-- PREPARATION ONLY. Reverse recorded completeness first.
begin;
create or replace function public.persist_furvise_server_semantic_event(
  p_user_id uuid,
  p_pet_id uuid,
  p_source_message_id uuid,
  p_event jsonb
)
returns table(
  persistence_status text,
  care_entry_id uuid,
  episode_id uuid,
  normalized_topic text,
  resulting_state text,
  already_persisted boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform private.set_furvise_server_actor(p_user_id);
  return query
  select * from public.persist_furvise_semantic_event(
    p_user_id, p_pet_id, p_source_message_id, p_event
  );
end;
$$;
drop function private.read_ask_recorded_source_evidence(uuid);
drop table private.ask_recorded_source_evidence;
commit;
