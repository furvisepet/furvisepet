-- Stage 2: apply only after the application uses update_my_care_entry().
-- RLS remains enabled for read/insert tenant isolation, but direct UPDATE is
-- removed entirely and INSERT is reduced to the existing add-flow columns.
revoke update on table public.pet_care_entries from public, anon, authenticated;
revoke update (
  id, user_id, pet_profile_id, category, title, note, severity, occurred_at,
  created_at, updated_at, concern_id, intelligence_source_message_id,
  intelligence_request_id, intelligence_source_type, state_suggestion_id,
  state_source_message_id, state_action_type, intelligence_confidence,
  care_event_metadata, episode_id, idempotency_key, deleted_at, deleted_by,
  deletion_reason
) on table public.pet_care_entries from public, anon, authenticated;

revoke insert on table public.pet_care_entries from public, anon, authenticated;
revoke insert (
  id, user_id, pet_profile_id, category, title, note, severity, occurred_at,
  created_at, updated_at, concern_id, intelligence_source_message_id,
  intelligence_request_id, intelligence_source_type, state_suggestion_id,
  state_source_message_id, state_action_type, intelligence_confidence,
  care_event_metadata, episode_id, idempotency_key, deleted_at, deleted_by,
  deletion_reason
) on table public.pet_care_entries from public, anon, authenticated;
grant insert (
  user_id, pet_profile_id, category, title, note, severity, occurred_at,
  idempotency_key
) on table public.pet_care_entries to authenticated;

-- With no authenticated UPDATE grant, retaining an UPDATE policy would be
-- misleading and would make an accidental future re-grant immediately useful.
drop policy if exists "Users can update their care entries" on public.pet_care_entries;

do $$
declare
  v_column text;
begin
  if not (
    select class.relrowsecurity
    from pg_catalog.pg_class class
    join pg_catalog.pg_namespace namespace on namespace.oid = class.relnamespace
    where namespace.nspname = 'public' and class.relname = 'pet_care_entries'
  ) then
    raise exception 'pet_care_entries RLS must remain enabled';
  end if;

  if has_table_privilege('authenticated', 'public.pet_care_entries', 'update') then
    raise exception 'authenticated retained table UPDATE on pet_care_entries';
  end if;
  foreach v_column in array array[
    'id', 'user_id', 'pet_profile_id', 'category', 'title', 'note', 'severity',
    'occurred_at', 'created_at', 'updated_at', 'concern_id',
    'intelligence_source_message_id', 'intelligence_request_id',
    'intelligence_source_type', 'state_suggestion_id', 'state_source_message_id',
    'state_action_type', 'intelligence_confidence', 'care_event_metadata',
    'episode_id', 'idempotency_key', 'deleted_at', 'deleted_by', 'deletion_reason'
  ] loop
    if has_column_privilege('authenticated', 'public.pet_care_entries', v_column, 'update') then
      raise exception 'authenticated retained UPDATE on pet_care_entries.%', v_column;
    end if;
  end loop;

  foreach v_column in array array[
    'id', 'created_at', 'updated_at', 'concern_id',
    'intelligence_source_message_id', 'intelligence_request_id',
    'intelligence_source_type', 'state_suggestion_id', 'state_source_message_id',
    'state_action_type', 'intelligence_confidence', 'care_event_metadata',
    'episode_id', 'deleted_at', 'deleted_by', 'deletion_reason'
  ] loop
    if has_column_privilege('authenticated', 'public.pet_care_entries', v_column, 'insert') then
      raise exception 'authenticated retained protected INSERT on pet_care_entries.%', v_column;
    end if;
  end loop;

  foreach v_column in array array[
    'user_id', 'pet_profile_id', 'category', 'title', 'note', 'severity',
    'occurred_at', 'idempotency_key'
  ] loop
    if not has_column_privilege('authenticated', 'public.pet_care_entries', v_column, 'insert') then
      raise exception 'authenticated lost intended INSERT on pet_care_entries.%', v_column;
    end if;
  end loop;

  if has_table_privilege('anon', 'public.pet_care_entries', 'insert')
    or has_table_privilege('anon', 'public.pet_care_entries', 'update') then
    raise exception 'anon retained a pet_care_entries write grant';
  end if;
  if has_table_privilege('authenticated', 'public.pet_care_entries', 'delete') then
    raise exception 'authenticated direct DELETE must remain denied';
  end if;
  if not has_table_privilege('authenticated', 'public.pet_care_entries', 'select') then
    raise exception 'authenticated Care History reads must remain available';
  end if;
  if not has_table_privilege('service_role', 'public.pet_care_entries', 'select,insert,update,delete') then
    raise exception 'service_role Care History authority changed unexpectedly';
  end if;
  if exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'pet_care_entries'
      and cmd = 'UPDATE'
  ) then
    raise exception 'pet_care_entries retained a direct UPDATE policy';
  end if;
end;
$$;

notify pgrst, 'reload schema';
