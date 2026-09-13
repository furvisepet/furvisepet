-- Dismiss/monitor share the same row lock as save. No presentation client can
-- execute this function; the server supplies an authenticated owner identity.
create or replace function public.transition_ask_suggestion(
  p_user_id uuid, p_suggestion_id uuid, p_action text
) returns table(apply_status text, suggestion_id uuid, concern_id uuid,
  care_entry_id uuid, concern_status text, applied_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
declare
  s public.ai_update_suggestions%rowtype;
  c public.pet_concerns%rowtype;
  v_lifecycle text;
begin
  perform private.require_service_role_request();
  perform private.set_furvise_server_actor(p_user_id);
  if p_suggestion_id is null or p_action is null or p_action not in ('dismiss', 'monitor') then
    raise exception using errcode = '22023', message = 'SUGGESTION_INVALID';
  end if;
  select * into s from public.ai_update_suggestions
    where id = p_suggestion_id and user_id = p_user_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'SUGGESTION_NOT_FOUND';
  end if;
  if s.concern_id is not null then
    select * into c from public.pet_concerns
      where id = s.concern_id and user_id = p_user_id and pet_profile_id = s.pet_profile_id for update;
  end if;
  if s.status = 'saved' then
    return query select 'already_applied'::text, s.id, s.concern_id, s.care_entry_id, c.status, s.applied_at;
    return;
  end if;
  if p_action = 'dismiss' then
    if s.status = 'pending' then
      update public.ai_update_suggestions set status = 'dismissed', actioned_at = now()
        where id = s.id and user_id = p_user_id;
    end if;
    return query select 'dismissed'::text, s.id, s.concern_id, s.care_entry_id, c.status, s.applied_at;
    return;
  end if;
  if s.status <> 'pending' then
    raise exception using errcode = '40001', message = 'SUGGESTION_CONFLICT';
  end if;
  if s.type = 'memory' or s.concern_id is null then
    raise exception using errcode = '22023', message = 'SUGGESTION_INVALID';
  end if;
  select lifecycle_status into v_lifecycle from public.dog_profiles
    where id = s.pet_profile_id and user_id = p_user_id for share;
  if not found or v_lifecycle is distinct from 'active' or c.id is null
    or c.status not in ('active', 'monitoring', 'reopened') or c.resolved_at is not null
    or c.updated_at > s.created_at then
    raise exception using errcode = '40001', message = 'SUGGESTION_CONFLICT';
  end if;
  update public.pet_concerns set status = 'monitoring', updated_at = now()
    where id = c.id and user_id = p_user_id;
  update public.ai_update_suggestions set status = 'saved', actioned_at = now(), applied_at = now()
    where id = s.id and user_id = p_user_id;
  return query select 'applied'::text, s.id, c.id, s.care_entry_id, 'monitoring'::text, now();
end;
$$;
revoke all on function public.transition_ask_suggestion(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.transition_ask_suggestion(uuid, uuid, text) to service_role;
