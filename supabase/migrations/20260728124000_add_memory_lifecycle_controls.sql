create or replace function public.manage_furvise_memory(
  p_memory_id uuid,
  p_action text,
  p_fact_value text default null
)
returns table(action_status text, memory_id uuid, previous_memory_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_memory public.furvise_memories%rowtype;
  v_existing public.furvise_memories%rowtype;
  v_new_id uuid;
  v_value text := nullif(regexp_replace(btrim(coalesce(p_fact_value, '')), '\s+', ' ', 'g'), '');
  v_normalized text;
begin
  if v_user_id is null then raise exception 'MEMORY_FORBIDDEN' using errcode = '42501'; end if;
  if p_action not in ('confirm', 'edit', 'forget') then raise exception 'MEMORY_INVALID' using errcode = '22023'; end if;

  select * into v_memory from public.furvise_memories where id = p_memory_id and user_id = v_user_id for update;
  if not found then raise exception 'MEMORY_NOT_FOUND' using errcode = 'P0002'; end if;

  if p_action = 'forget' then
    if v_memory.status <> 'rejected' then
      update public.furvise_memories set status = 'rejected', updated_at = now() where id = v_memory.id;
    end if;
    return query select 'forgotten'::text, v_memory.id, v_memory.id;
    return;
  end if;

  if p_action = 'confirm' then
    if v_memory.status <> 'active' then raise exception 'MEMORY_CONFLICT' using errcode = '40001'; end if;
    update public.furvise_memories set
      last_confirmed_at = now(), current_confidence = coalesce(base_confidence, confidence),
      stale_at = null, expires_at = null, confirmation_required_after = null, updated_at = now()
    where id = v_memory.id;
    return query select 'confirmed'::text, v_memory.id, v_memory.id;
    return;
  end if;

  if v_memory.status = 'superseded' and v_memory.superseded_by is not null then
    return query select 'already_edited'::text, v_memory.superseded_by, v_memory.id;
    return;
  end if;
  if v_memory.status <> 'active' or v_value is null or char_length(v_value) > 500 then
    raise exception 'MEMORY_INVALID' using errcode = '22023';
  end if;
  v_normalized := lower(regexp_replace(v_value, '[^[:alnum:]]+', ' ', 'g'));

  select * into v_existing from public.furvise_memories
  where user_id = v_user_id and subject_type = v_memory.subject_type
    and pet_id is not distinct from v_memory.pet_id and fact_key = v_memory.fact_key
    and status = 'active' and normalized_value = v_normalized and id <> v_memory.id
  order by last_confirmed_at desc limit 1 for update;

  if found then
    v_new_id := v_existing.id;
  else
    insert into public.furvise_memories (
      user_id, pet_id, subject_type, category, fact_key, fact_value, normalized_value,
      confidence, importance, durability, status, source_type, source_id, source_excerpt,
      dedupe_key, first_observed_at, last_confirmed_at, observed_at, freshness_class,
      base_confidence, current_confidence, decay_policy
    ) values (
      v_memory.user_id, v_memory.pet_id, v_memory.subject_type, v_memory.category, v_memory.fact_key, to_jsonb(v_value), v_normalized,
      greatest(v_memory.confidence, 0.99), v_memory.importance, v_memory.durability, 'active', 'user_edit', v_memory.source_id, v_memory.source_excerpt,
      md5(v_memory.user_id::text || ':' || v_memory.id::text || ':' || v_normalized), v_memory.first_observed_at, now(), now(), v_memory.freshness_class,
      greatest(coalesce(v_memory.base_confidence, v_memory.confidence), 0.99), greatest(coalesce(v_memory.base_confidence, v_memory.confidence), 0.99), v_memory.decay_policy
    ) returning id into v_new_id;
  end if;
  update public.furvise_memories set status = 'superseded', superseded_by = v_new_id, updated_at = now() where id = v_memory.id;
  return query select 'edited'::text, v_new_id, v_memory.id;
end;
$$;

revoke all on function public.manage_furvise_memory(uuid, text, text) from public, anon;
grant execute on function public.manage_furvise_memory(uuid, text, text) to authenticated;
