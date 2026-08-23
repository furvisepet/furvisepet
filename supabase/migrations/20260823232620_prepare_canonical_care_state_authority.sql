-- Expand phase: make the trusted server boundary available before application
-- callers switch. Existing authenticated grants, policies, and RPC privileges
-- intentionally remain unchanged until the contract migration.

grant select, insert, update, delete
  on table public.pet_concerns, public.ai_update_suggestions
  to service_role;

create or replace function private.set_furvise_server_actor(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' or p_user_id is null then
    raise exception using errcode = '42501', message = 'FURVISE_SERVER_AUTHORITY_REQUIRED';
  end if;

  -- Retained persistence implementations bind ownership to auth.uid(). The
  -- trusted server supplies an independently verified user id and keeps its
  -- service_role claim while delegating to those implementations.
  perform set_config('request.jwt.claim.sub', p_user_id::text, true);
end;
$$;

revoke all on function private.set_furvise_server_actor(uuid)
  from public, anon, authenticated, service_role;

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

create or replace function public.persist_furvise_server_care_event(
  p_user_id uuid,
  p_pet_id uuid,
  p_source_message_id uuid,
  p_care_action jsonb,
  p_suggestion_id uuid default null
)
returns table(
  persistence_status text,
  care_entry_ids uuid[],
  concern_ids uuid[],
  current_safety_state text,
  already_persisted boolean,
  error_code text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform private.set_furvise_server_actor(p_user_id);
  return query
  select * from public.persist_furvise_care_event(
    p_user_id, p_pet_id, p_source_message_id, p_care_action, p_suggestion_id
  );
end;
$$;

create or replace function public.apply_furvise_server_state_suggestion(
  p_user_id uuid,
  p_suggestion_id uuid
)
returns table(
  apply_status text,
  suggestion_id uuid,
  concern_id uuid,
  care_entry_id uuid,
  concern_status text,
  applied_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform private.set_furvise_server_actor(p_user_id);
  return query
  select * from public.apply_furvise_state_suggestion(p_user_id, p_suggestion_id);
end;
$$;

revoke all on function public.persist_furvise_server_semantic_event(uuid, uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.persist_furvise_server_care_event(uuid, uuid, uuid, jsonb, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.apply_furvise_server_state_suggestion(uuid, uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.persist_furvise_server_semantic_event(uuid, uuid, uuid, jsonb)
  to service_role;
grant execute on function public.persist_furvise_server_care_event(uuid, uuid, uuid, jsonb, uuid)
  to service_role;
grant execute on function public.apply_furvise_server_state_suggestion(uuid, uuid)
  to service_role;
