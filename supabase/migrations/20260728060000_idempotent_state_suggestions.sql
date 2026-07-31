-- Make Ask state suggestions atomic, idempotent, and reconcilable with automatic intelligence persistence.

alter table public.ai_update_suggestions
  add column if not exists applied_at timestamptz,
  add column if not exists care_entry_id uuid references public.pet_care_entries(id) on delete set null;

alter table public.pet_care_entries
  add column if not exists state_suggestion_id uuid references public.ai_update_suggestions(id) on delete set null,
  add column if not exists state_source_message_id uuid references public.ask_conversation_messages(id) on delete set null,
  add column if not exists state_action_type text;

alter table public.pet_concerns
  add column if not exists reopened_at timestamptz;

create unique index if not exists pet_care_entries_state_suggestion_unique
  on public.pet_care_entries(user_id, state_suggestion_id)
  where state_suggestion_id is not null;

create unique index if not exists pet_care_entries_state_effect_unique
  on public.pet_care_entries(
    user_id,
    state_source_message_id,
    state_action_type,
    coalesce(concern_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where state_source_message_id is not null and state_action_type is not null;

create index if not exists ai_update_suggestions_effect_lookup_idx
  on public.ai_update_suggestions(user_id, source_message_id, type, concern_id, status);

create or replace function public.apply_furvise_state_suggestion(
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
declare
  v_auth_user_id uuid := auth.uid();
  v_suggestion public.ai_update_suggestions%rowtype;
  v_concern public.pet_concerns%rowtype;
  v_entry_id uuid;
  v_note text;
  v_title text;
  v_category text;
  v_severity text;
  v_applied_at timestamptz;
  v_was_applied boolean := false;
begin
  if v_auth_user_id is null then
    raise exception using errcode = '42501', message = 'SUGGESTION_FORBIDDEN';
  end if;
  if p_user_id is null or p_user_id <> v_auth_user_id then
    raise exception using errcode = '42501', message = 'SUGGESTION_FORBIDDEN';
  end if;
  if p_suggestion_id is null then
    raise exception using errcode = '22023', message = 'SUGGESTION_INVALID';
  end if;

  select suggestion_row.* into v_suggestion
  from public.ai_update_suggestions as suggestion_row
  where suggestion_row.id = p_suggestion_id
  for update;

  if v_suggestion.id is null then
    raise exception using errcode = 'P0002', message = 'SUGGESTION_NOT_FOUND';
  end if;
  if v_suggestion.user_id <> p_user_id then
    raise exception using errcode = '42501', message = 'SUGGESTION_FORBIDDEN';
  end if;

  select entry_row.id into v_entry_id
  from public.pet_care_entries as entry_row
  where entry_row.user_id = p_user_id
    and (
      entry_row.id = v_suggestion.care_entry_id
      or entry_row.state_suggestion_id = v_suggestion.id
      or (
        entry_row.state_source_message_id = v_suggestion.source_message_id
        and entry_row.state_action_type = case
          when v_suggestion.type = 'concern_resolution' then 'resolve_concern'
          when v_suggestion.type = 'concern_opening' then 'reopen_concern'
          else 'create_entry'
        end
        and entry_row.concern_id is not distinct from v_suggestion.concern_id
      )
    )
  order by entry_row.created_at desc
  limit 1
  for update;

  if v_suggestion.status = 'saved' then
    return query select 'already_applied'::text, v_suggestion.id, v_suggestion.concern_id,
      coalesce(v_suggestion.care_entry_id, v_entry_id),
      (select concern_row.status from public.pet_concerns as concern_row where concern_row.id = v_suggestion.concern_id),
      coalesce(v_suggestion.applied_at, v_suggestion.actioned_at);
    return;
  end if;
  if v_suggestion.status <> 'pending' or v_suggestion.type not in ('history', 'concern_resolution', 'concern_opening') then
    raise exception using errcode = '22023', message = 'SUGGESTION_INVALID';
  end if;

  v_note := coalesce(
    nullif(btrim(v_suggestion.payload->>'resolutionNote'), ''),
    nullif(btrim(v_suggestion.details), ''),
    nullif(btrim(v_suggestion.payload->>'note'), '')
  );
  if v_note is null then
    raise exception using errcode = '22023', message = 'SUGGESTION_INVALID';
  end if;
  v_title := coalesce(nullif(btrim(v_suggestion.payload->>'title'), ''),
    case when v_suggestion.type = 'concern_resolution' then 'Concern resolved' else 'Care update' end);
  v_category := case
    when v_suggestion.type in ('concern_resolution', 'concern_opening') then 'symptom'
    when v_suggestion.payload->>'category' in ('symptom', 'food', 'medication', 'activity', 'grooming', 'vet_visit', 'behavior', 'general')
      then v_suggestion.payload->>'category'
    else 'general'
  end;
  v_severity := case
    when v_suggestion.payload->>'severity' in ('urgent', 'emergency', 'severe') then 'severe'
    when v_suggestion.payload->>'severity' = 'moderate' then 'moderate'
    when v_suggestion.payload->>'severity' = 'mild' then 'mild'
    else null
  end;

  if v_suggestion.concern_id is not null then
    select concern_row.* into v_concern
    from public.pet_concerns as concern_row
    where concern_row.id = v_suggestion.concern_id
      and concern_row.user_id = p_user_id
      and concern_row.pet_profile_id = v_suggestion.pet_profile_id
    for update;
  end if;

  if v_suggestion.type = 'concern_resolution' then
    if v_concern.id is null and v_entry_id is null then
      raise exception using errcode = '22023', message = 'SUGGESTION_INVALID';
    end if;
    if v_concern.status = 'resolved' or v_concern.resolved_at is not null then
      v_was_applied := true;
    end if;
  end if;

  if not v_was_applied and v_entry_id is null then
    insert into public.pet_care_entries(
      user_id, pet_profile_id, category, title, note, occurred_at, severity, concern_id,
      state_suggestion_id, state_source_message_id, state_action_type
    ) values (
      p_user_id, v_suggestion.pet_profile_id, v_category, left(v_title, 120), left(v_note, 1000), now(),
      v_severity, v_suggestion.concern_id, v_suggestion.id, v_suggestion.source_message_id,
      case when v_suggestion.type = 'concern_resolution' then 'resolve_concern'
        when v_suggestion.type = 'concern_opening' then 'reopen_concern' else 'create_entry' end
    )
    on conflict do nothing
    returning id into v_entry_id;

    if v_entry_id is null then
      select entry_row.id into v_entry_id
      from public.pet_care_entries as entry_row
      where entry_row.user_id = p_user_id
        and (
          entry_row.state_suggestion_id = v_suggestion.id
          or (
            entry_row.state_source_message_id = v_suggestion.source_message_id
            and entry_row.state_action_type = case
              when v_suggestion.type = 'concern_resolution' then 'resolve_concern'
              when v_suggestion.type = 'concern_opening' then 'reopen_concern'
              else 'create_entry'
            end
            and entry_row.concern_id is not distinct from v_suggestion.concern_id
          )
        )
      limit 1;
      v_was_applied := true;
    end if;
  elsif v_entry_id is not null then
    v_was_applied := true;
  end if;

  if v_suggestion.type = 'concern_resolution' and v_concern.id is not null
      and v_concern.status <> 'resolved' and v_concern.resolved_at is null then
    update public.pet_concerns as concern_row
    set status = 'resolved', resolution_note = left(v_note, 1000), resolved_at = now(), updated_at = now()
    where concern_row.id = v_concern.id;
  end if;

  update public.ai_update_suggestions as suggestion_row
  set status = 'saved', actioned_at = coalesce(suggestion_row.actioned_at, now()),
    applied_at = coalesce(suggestion_row.applied_at, now()), care_entry_id = coalesce(suggestion_row.care_entry_id, v_entry_id)
  where suggestion_row.id = v_suggestion.id
  returning suggestion_row.applied_at into v_applied_at;

  return query select case when v_was_applied then 'already_applied' else 'applied' end,
    v_suggestion.id, v_suggestion.concern_id, v_entry_id,
    (select concern_row.status from public.pet_concerns as concern_row where concern_row.id = v_suggestion.concern_id),
    v_applied_at;
end;
$$;

revoke all on function public.apply_furvise_state_suggestion(uuid, uuid) from public, anon;
grant execute on function public.apply_furvise_state_suggestion(uuid, uuid) to authenticated;

-- Reconcile stale pending resolution suggestions whose requested final state is already canonical.
update public.ai_update_suggestions as suggestion_row
set status = 'saved', actioned_at = coalesce(suggestion_row.actioned_at, now()),
  applied_at = coalesce(suggestion_row.applied_at, suggestion_row.actioned_at, now())
from public.pet_concerns as concern_row
where suggestion_row.type = 'concern_resolution'
  and suggestion_row.status = 'pending'
  and concern_row.id = suggestion_row.concern_id
  and concern_row.user_id = suggestion_row.user_id
  and concern_row.pet_profile_id = suggestion_row.pet_profile_id
  and (concern_row.status = 'resolved' or concern_row.resolved_at is not null);

-- Prevent duplicate active suggestions for the same assistant message/action/concern.
with duplicates as (
  select id, row_number() over (
    partition by user_id, source_message_id, type, coalesce(concern_id, '00000000-0000-0000-0000-000000000000'::uuid)
    order by created_at, id
  ) as duplicate_number
  from public.ai_update_suggestions
  where status = 'pending' and source_message_id is not null
)
update public.ai_update_suggestions as suggestion_row
set status = 'dismissed', actioned_at = coalesce(suggestion_row.actioned_at, now())
from duplicates
where suggestion_row.id = duplicates.id and duplicates.duplicate_number > 1;

create unique index if not exists ai_update_suggestions_pending_effect_unique
  on public.ai_update_suggestions(
    user_id,
    source_message_id,
    type,
    coalesce(concern_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where status = 'pending' and source_message_id is not null;

with concern_duplicates as (
  select id, row_number() over (
    partition by user_id, type, concern_id
    order by created_at, id
  ) as duplicate_number
  from public.ai_update_suggestions
  where status = 'pending' and concern_id is not null
)
update public.ai_update_suggestions as suggestion_row
set status = 'dismissed', actioned_at = coalesce(suggestion_row.actioned_at, now())
from concern_duplicates
where suggestion_row.id = concern_duplicates.id and concern_duplicates.duplicate_number > 1;

create unique index if not exists ai_update_suggestions_pending_concern_unique
  on public.ai_update_suggestions(user_id, type, concern_id)
  where status = 'pending' and concern_id is not null;

create or replace function public.resolve_concern_suggestion(p_suggestion_id uuid)
returns table(concern_status text, care_entry_id uuid)
language sql
security definer
set search_path = public, pg_temp
as $$
  select result.concern_status, result.care_entry_id
  from public.apply_furvise_state_suggestion(auth.uid(), p_suggestion_id) as result;
$$;

revoke all on function public.resolve_concern_suggestion(uuid) from public, anon;
grant execute on function public.resolve_concern_suggestion(uuid) to authenticated;

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
  if new.concern_id is not null and (
    new.state_action_type = 'resolve_concern'
    or v_text ~* '(returned to normal|back to normal|normal again|no longer showing|resolved|recovered)'
  ) then
    return new;
  end if;

  v_concerning := new.state_action_type = 'reopen_concern'
    or (new.category = 'symptom' and new.severity in ('moderate', 'severe'))
    or v_text ~* '(trouble breathing|short(ness|age) of breath|labored breathing|open.?mouth breathing|deep breaths?|breathing problem|collapse|seizure|severe bleeding|cannot urinate|inability to urinate|toxin|extreme lethargy|repeated vomiting)';
  if not v_concerning then return new; end if;

  v_key := case
    when v_text ~* '(breath|breathing)' then 'breathing'
    else regexp_replace(lower(coalesce(nullif(btrim(new.title), ''), new.category)), '[^a-z0-9]+', '_', 'g')
  end;
  v_severity := case
    when new.severity = 'severe' or v_text ~* '(trouble breathing|short(ness|age) of breath|labored breathing|open.?mouth breathing|breathing problem|collapse|seizure|severe bleeding|cannot urinate|inability to urinate|toxin)'
      then 'urgent'
    else 'important'
  end;

  select concern_row.* into v_existing
  from public.pet_concerns as concern_row
  where concern_row.user_id = new.user_id
    and concern_row.pet_profile_id = new.pet_profile_id
    and concern_row.normalized_key = v_key
  order by concern_row.updated_at desc
  limit 1
  for update;

  if v_existing.id is null then
    insert into public.pet_concerns(user_id, pet_profile_id, title, normalized_key, status, severity, source_care_entry_id, opened_at, updated_at)
    values (new.user_id, new.pet_profile_id, coalesce(nullif(btrim(new.title), ''), 'Care concern'), v_key, 'active', v_severity, new.id, new.occurred_at, now());
  elsif v_existing.status = 'resolved' then
    update public.pet_concerns as concern_row
    set status = 'reopened', severity = v_severity, source_care_entry_id = new.id,
      opened_at = new.occurred_at, reopened_at = new.occurred_at, updated_at = now(), resolved_at = null, resolution_note = null
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
