-- Resolution events close matching episodes; they must never open a new concern.
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
  if new.state_action_type = 'resolve_concern'
    or v_text ~* '(returned to normal|back to normal|normal again|no longer showing|resolved|recovered)' then
    return new;
  end if;

  v_concerning := new.state_action_type = 'reopen_concern'
    or (new.category = 'symptom' and new.severity in ('moderate', 'severe'))
    or v_text ~* '(trouble breathing|short(ness|age) of breath|labored breathing|open.?mouth breathing|deep breaths?|breathing problem|collapse|seizure|severe bleeding|cannot urinate|inability to urinate|toxin|extreme lethargy|repeated vomiting)';
  if not v_concerning then return new; end if;

  v_key := case when v_text ~* '(breath|breathing)' then 'breathing'
    else regexp_replace(lower(coalesce(nullif(btrim(new.title), ''), new.category)), '[^a-z0-9]+', '_', 'g') end;
  v_severity := case
    when new.severity = 'severe' or v_text ~* '(trouble breathing|short(ness|age) of breath|labored breathing|open.?mouth breathing|breathing problem|collapse|seizure|severe bleeding|cannot urinate|inability to urinate|toxin)'
      then 'urgent' else 'important' end;

  select concern_row.* into v_existing from public.pet_concerns as concern_row
  where concern_row.user_id = new.user_id and concern_row.pet_profile_id = new.pet_profile_id
    and concern_row.normalized_key = v_key
  order by concern_row.updated_at desc limit 1 for update;

  if v_existing.id is null then
    insert into public.pet_concerns(user_id, pet_profile_id, title, normalized_key, status, severity, source_care_entry_id, opened_at, updated_at)
    values (new.user_id, new.pet_profile_id, coalesce(nullif(btrim(new.title), ''), 'Care concern'), v_key, 'active', v_severity, new.id, new.occurred_at, now());
  elsif v_existing.status = 'resolved' then
    update public.pet_concerns set status = 'reopened', severity = v_severity, source_care_entry_id = new.id,
      opened_at = new.occurred_at, reopened_at = new.occurred_at, updated_at = now(), resolved_at = null, resolution_note = null
    where id = v_existing.id;
  else
    update public.pet_concerns set status = case when status = 'monitoring' then 'monitoring' else 'active' end,
      severity = case when v_severity = 'urgent' then 'urgent' else severity end,
      source_care_entry_id = new.id, updated_at = now() where id = v_existing.id;
  end if;
  return new;
end;
$$;

revoke all on function public.sync_pet_concern_from_care_entry() from public, anon, authenticated;

create function public.finish_maple_qa_consistency_repair(p_dry_run boolean default true)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_pet_id constant uuid := '75db72b1-64fe-476d-a62a-70f4f6aee7cd';
  v_recovery_id constant uuid := '2612c81b-4f16-4591-ad45-480ca2e705cb';
  v_recurrence_episode_id constant uuid := '3694e416-6bb9-4e1e-9442-efd1dbb43b83';
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_dry_run then return jsonb_build_object('dryRun', true, 'recoveryEntryId', v_recovery_id, 'targetEpisodeId', v_recurrence_episode_id); end if;

  delete from public.pet_concerns as concern_row using public.pet_care_entries as source_entry
  where concern_row.pet_profile_id = v_pet_id and concern_row.source_care_entry_id = source_entry.id
    and source_entry.pet_profile_id = v_pet_id
    and ((source_entry.category = 'behavior' and (source_entry.title ~* '(more playful|playful today)' or source_entry.note ~* '(more playful|playful today)'))
      or source_entry.state_action_type = 'resolve_concern');

  update public.pet_care_entries set episode_id = v_recurrence_episode_id, concern_id = null
  where id = v_recovery_id and pet_profile_id = v_pet_id
    and intelligence_source_message_id = 'b54fcfea-dbb3-4498-a926-4f086de45d58';

  update public.pet_care_episodes set status = 'resolved', resolved_at = (
      select occurred_at from public.pet_care_entries where id = v_recovery_id
    ), last_event_at = greatest(last_event_at, (select occurred_at from public.pet_care_entries where id = v_recovery_id)), updated_at = now(),
    summary = jsonb_set(summary, '{latestStatus}', '"resolved"'::jsonb)
      || jsonb_build_object('sourceRecordIds', coalesce(summary->'sourceRecordIds', '[]'::jsonb) || jsonb_build_array(v_recovery_id))
  where id = v_recurrence_episode_id and pet_profile_id = v_pet_id;

  return jsonb_build_object('dryRun', false, 'applied', true, 'recoveryEntryId', v_recovery_id, 'targetEpisodeId', v_recurrence_episode_id);
end;
$$;

revoke all on function public.finish_maple_qa_consistency_repair(boolean) from public, anon, authenticated;
grant execute on function public.finish_maple_qa_consistency_repair(boolean) to service_role;
