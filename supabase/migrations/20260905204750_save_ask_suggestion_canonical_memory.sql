-- Atomic, server-only save of a user-confirmed Ask memory suggestion.
-- The existing semantic-integrity and tenant-link triggers remain authoritative.
create or replace function public.save_ask_memory_suggestion(
  p_user_id uuid, p_suggestion_id uuid, p_expected_pet_id uuid, p_expected_note text, p_expected_type text
) returns table(apply_status text, memory_id uuid)
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  s public.ai_update_suggestions%rowtype;
  v_note text;
  v_type text;
  v_memory_id uuid;
  v_key text;
begin
  if p_user_id is null or p_suggestion_id is null then
    raise exception using errcode = '42501', message = 'SUGGESTION_FORBIDDEN';
  end if;
  select * into s from public.ai_update_suggestions
    where id = p_suggestion_id and user_id = p_user_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'SUGGESTION_NOT_FOUND';
  end if;
  if s.pet_profile_id is distinct from p_expected_pet_id then
    raise exception using errcode = '40001', message = 'SUGGESTION_CONFLICT';
  end if;
  perform 1 from public.dog_profiles where id = s.pet_profile_id and user_id = p_user_id for share;
  if not found then
    raise exception using errcode = '42501', message = 'SUGGESTION_FORBIDDEN';
  end if;
  if s.type <> 'memory' then
    raise exception using errcode = '22023', message = 'SUGGESTION_INVALID';
  end if;
  v_key := 'ask_suggestion:' || p_suggestion_id::text;
  if s.status = 'saved' then
    select id into v_memory_id from public.furvise_memories
      where user_id = p_user_id and pet_id = s.pet_profile_id and dedupe_key = v_key;
    -- A forgotten memory stays forgotten; retries must not recreate it.
    return query select 'already_applied'::text, v_memory_id;
    return;
  end if;
  if s.status <> 'pending' then
    raise exception using errcode = '40001', message = 'SUGGESTION_CONFLICT';
  end if;
  v_note := coalesce(nullif(s.details, ''), btrim(s.payload->>'note'), '');
  v_type := coalesce(nullif(btrim(s.payload->>'memoryType'), ''), 'preference');
  if v_note is distinct from p_expected_note or v_type is distinct from p_expected_type then
    raise exception using errcode = '40001', message = 'SUGGESTION_CONFLICT';
  end if;
  if char_length(btrim(v_note)) not between 2 and 1000 or char_length(v_type) not between 1 and 80 then
    raise exception using errcode = '22023', message = 'SUGGESTION_INVALID';
  end if;
  insert into public.furvise_memories(
    user_id, pet_id, subject_type, category, fact_key, fact_value, normalized_value,
    confidence, importance, durability, status, source_type, source_id, source_excerpt, dedupe_key
  ) values (
    p_user_id, s.pet_profile_id, 'pet', v_type,
    'remembered_detail_' || replace(p_suggestion_id::text, '-', ''),
    to_jsonb(btrim(v_note)), lower(btrim(regexp_replace(v_note, '[[:space:]]+', ' ', 'g'))),
    1, 'high', 'durable', 'active', 'ask_suggestion', p_suggestion_id, btrim(v_note), v_key
  ) returning id into v_memory_id;
  update public.ai_update_suggestions set status = 'saved', actioned_at = now(), applied_at = now()
    where id = p_suggestion_id and user_id = p_user_id;
  return query select 'applied'::text, v_memory_id;
end;
$$;
revoke all on function public.save_ask_memory_suggestion(uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.save_ask_memory_suggestion(uuid, uuid, uuid, text, text) to service_role;
