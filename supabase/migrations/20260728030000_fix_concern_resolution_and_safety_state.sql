-- Keep owner-confirmed improvement saves atomic and prevent resolution entries from reopening concerns.

create or replace function public.sync_pet_concern_from_care_entry()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_key text;
  v_severity text;
  v_existing public.pet_concerns%rowtype;
  v_concerning boolean;
  v_text text := coalesce(new.title, '') || ' ' || coalesce(new.note, '');
begin
  -- A care entry linked to a concern and explicitly describing recovery is resolution
  -- evidence, not a new occurrence of the symptom named in that entry.
  if new.concern_id is not null and v_text ~* '(returned to normal|back to normal|normal again|no longer showing|resolved|recovered)' then
    return new;
  end if;

  v_concerning := (
    new.category = 'symptom' and new.severity in ('moderate', 'severe')
  ) or v_text ~* '(trouble breathing|short(ness|age) of breath|labored breathing|open.?mouth breathing|collapse|seizure|severe bleeding|cannot urinate|inability to urinate|toxin|extreme lethargy|repeated vomiting)';
  if not v_concerning then return new; end if;
  v_key := case
    when v_text ~* '(breath|breathing)' then 'breathing'
    else regexp_replace(lower(coalesce(nullif(btrim(new.title), ''), new.category)), '[^a-z0-9]+', '_', 'g')
  end;
  v_severity := case
    when new.severity = 'severe' or v_text ~* '(trouble breathing|short(ness|age) of breath|labored breathing|open.?mouth breathing|collapse|seizure|severe bleeding|cannot urinate|inability to urinate|toxin)' then 'urgent'
    else 'important'
  end;
  select concern_row.* into v_existing
  from public.pet_concerns as concern_row
  where concern_row.pet_profile_id = new.pet_profile_id
    and concern_row.normalized_key = v_key
  order by concern_row.updated_at desc limit 1;
  if v_existing.id is null then
    insert into public.pet_concerns(user_id, pet_profile_id, title, normalized_key, status, severity, source_care_entry_id, opened_at, updated_at)
    values (new.user_id, new.pet_profile_id, coalesce(nullif(btrim(new.title), ''), 'Care concern'), v_key, 'active', v_severity, new.id, new.occurred_at, now());
  elsif v_existing.status = 'resolved' then
    update public.pet_concerns as concern_row
    set status = 'reopened', severity = v_severity, source_care_entry_id = new.id,
      updated_at = now(), resolved_at = null, resolution_note = null
    where concern_row.id = v_existing.id;
  else
    update public.pet_concerns as concern_row
    set status = case when concern_row.status = 'monitoring' then 'monitoring' else 'active' end,
      severity = case when v_severity = 'urgent' then 'urgent' else concern_row.severity end,
      source_care_entry_id = new.id, updated_at = now()
    where concern_row.id = v_existing.id;
  end if;
  return new;
end;
$$;

revoke all on function public.sync_pet_concern_from_care_entry() from public, anon, authenticated;

create or replace function public.resolve_concern_suggestion(p_suggestion_id uuid)
returns table(concern_status text, care_entry_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_suggestion public.ai_update_suggestions%rowtype;
  v_concern public.pet_concerns%rowtype;
  v_entry_id uuid;
  v_note text;
  v_resolved_keys text[];
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'AUTH_REQUIRED'; end if;
  select suggestion_row.* into v_suggestion
  from public.ai_update_suggestions as suggestion_row
  where suggestion_row.id = p_suggestion_id and suggestion_row.user_id = v_user_id
  for update;
  if v_suggestion.id is null then raise exception using errcode = 'P0002', message = 'SUGGESTION_NOT_FOUND'; end if;
  if v_suggestion.status = 'saved' then
    return query select 'resolved'::text, null::uuid;
    return;
  end if;
  if v_suggestion.status <> 'pending' or v_suggestion.type <> 'concern_resolution' or v_suggestion.concern_id is null then
    raise exception using errcode = '22023', message = 'INVALID_CONCERN_SUGGESTION';
  end if;
  select concern_row.* into v_concern
  from public.pet_concerns as concern_row
  where concern_row.id = v_suggestion.concern_id
    and concern_row.pet_profile_id = v_suggestion.pet_profile_id
    and concern_row.user_id = v_user_id
  for update;
  if v_concern.id is null then raise exception using errcode = 'P0002', message = 'CONCERN_NOT_FOUND'; end if;

  select coalesce(array_agg(key_value), array[v_concern.normalized_key]) into v_resolved_keys
  from jsonb_array_elements_text(coalesce(v_suggestion.payload->'resolvedConcernKeys', jsonb_build_array(v_concern.normalized_key))) as key_value;
  v_note := coalesce(nullif(btrim(v_suggestion.payload->>'resolutionNote'), ''), nullif(btrim(v_suggestion.details), ''), 'Concern resolved.');

  -- Lock all explicitly named, still-open concerns before writing either side of the save.
  perform concern_row.id from public.pet_concerns as concern_row
  where concern_row.user_id = v_user_id
    and concern_row.pet_profile_id = v_suggestion.pet_profile_id
    and concern_row.status in ('active', 'monitoring', 'reopened')
    and concern_row.resolved_at is null
    and (concern_row.id = v_concern.id or concern_row.normalized_key = any(v_resolved_keys))
  for update;

  insert into public.pet_care_entries(user_id, pet_profile_id, category, title, note, occurred_at, severity, concern_id)
  values (
    v_user_id,
    v_suggestion.pet_profile_id,
    coalesce(nullif(btrim(v_suggestion.payload->>'category'), ''), 'symptom'),
    coalesce(nullif(btrim(v_suggestion.payload->>'title'), ''), 'Concern resolved'),
    coalesce(nullif(btrim(v_suggestion.details), ''), v_note),
    now(),
    null,
    v_concern.id
  ) returning id into v_entry_id;

  update public.pet_concerns as concern_row
  set status = 'resolved', resolution_note = v_note, resolved_at = now(), updated_at = now()
  where concern_row.user_id = v_user_id
    and concern_row.pet_profile_id = v_suggestion.pet_profile_id
    and concern_row.status in ('active', 'monitoring', 'reopened')
    and concern_row.resolved_at is null
    and (concern_row.id = v_concern.id or concern_row.normalized_key = any(v_resolved_keys));

  update public.ai_update_suggestions as suggestion_row
  set status = 'saved', actioned_at = now()
  where suggestion_row.id = v_suggestion.id;
  return query select 'resolved'::text, v_entry_id;
end;
$$;

revoke all on function public.resolve_concern_suggestion(uuid) from public, anon;
grant execute on function public.resolve_concern_suggestion(uuid) to authenticated;

-- Service-only, dry-run by default. It only considers owner-confirmed saved
-- resolution suggestions and concern keys explicitly present in their payload.
create or replace function public.repair_resolved_concern_suggestions(p_apply boolean default false)
returns table(suggestion_id uuid, concern_id uuid, normalized_key text, previous_status text, action text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  candidate record;
begin
  for candidate in
    select suggestion_row.id as suggestion_id,
      concern_row.id as concern_id,
      concern_row.normalized_key,
      concern_row.status as previous_status,
      coalesce(nullif(btrim(suggestion_row.payload->>'resolutionNote'), ''), suggestion_row.details, 'Concern resolved.') as resolution_note
    from public.ai_update_suggestions as suggestion_row
    join public.pet_concerns as primary_concern on primary_concern.id = suggestion_row.concern_id
    join public.pet_concerns as concern_row
      on concern_row.user_id = suggestion_row.user_id
      and concern_row.pet_profile_id = suggestion_row.pet_profile_id
    where suggestion_row.type = 'concern_resolution'
      and suggestion_row.status = 'saved'
      and concern_row.status in ('active', 'monitoring', 'reopened')
      and concern_row.resolved_at is null
      and (
        concern_row.id = suggestion_row.concern_id
        or concern_row.normalized_key in (
          select jsonb_array_elements_text(coalesce(suggestion_row.payload->'resolvedConcernKeys', '[]'::jsonb))
        )
      )
      and exists (
        select 1 from public.pet_care_entries as entry_row
        where entry_row.user_id = suggestion_row.user_id
          and entry_row.pet_profile_id = suggestion_row.pet_profile_id
          and entry_row.concern_id = suggestion_row.concern_id
          and entry_row.created_at >= suggestion_row.created_at
      )
  loop
    if p_apply then
      update public.pet_concerns as concern_row
      set status = 'resolved', resolved_at = now(), resolution_note = candidate.resolution_note, updated_at = now()
      where concern_row.id = candidate.concern_id
        and concern_row.status in ('active', 'monitoring', 'reopened')
        and concern_row.resolved_at is null;
    end if;
    suggestion_id := candidate.suggestion_id;
    concern_id := candidate.concern_id;
    normalized_key := candidate.normalized_key;
    previous_status := candidate.previous_status;
    action := case when p_apply then 'resolved' else 'would_resolve' end;
    return next;
  end loop;
end;
$$;

revoke all on function public.repair_resolved_concern_suggestions(boolean) from public, anon, authenticated;
grant execute on function public.repair_resolved_concern_suggestions(boolean) to service_role;
