create or replace function public.persist_ask_owner_note(
  p_user_id uuid, p_pet_id uuid, p_source_message_id uuid, p_request_id uuid,
  p_note text, p_occurred_at timestamptz default null, p_explicit_time text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_entry public.pet_care_entries%rowtype;
  v_message public.ask_conversation_messages%rowtype;
  v_stored_note text;
  v_normalized_note text;
begin
  perform private.require_service_role_request();
  if p_user_id is null or p_pet_id is null or p_source_message_id is null or p_request_id is null
    or p_note is null or btrim(p_note)='' or char_length(p_note)>1200
    or char_length(coalesce(p_explicit_time,''))>120 then
    raise exception using errcode='22023', message='OWNER_NOTE_INVALID';
  end if;

  perform 1
  from public.ask_conversations c
  join public.ask_conversation_messages m on m.conversation_id=c.id
  where m.id=p_source_message_id and c.user_id=p_user_id and c.pet_profile_id=p_pet_id
  for update of c;
  if not found then
    raise exception using errcode='42501', message='OWNER_NOTE_SOURCE_NOT_OWNED';
  end if;

  select * into v_message
  from public.ask_conversation_messages
  where id=p_source_message_id and user_id=p_user_id and request_id=p_request_id and role='user'
  for update;
  if not found then
    raise exception using errcode='42501', message='OWNER_NOTE_SOURCE_MISMATCH';
  end if;

  v_normalized_note := private.normalize_owner_note_saved_text(v_message.user_text);
  if p_note is not distinct from v_normalized_note then
    v_stored_note := p_note;
  elsif position(p_note in v_message.user_text) > 0
    and v_message.user_text ~* '(^|[^[:alpha:]])(save|log|record|remember|add|store)([^[:alpha:]]|$)' then
    v_stored_note := p_note;
  else
    raise exception using errcode='42501', message='OWNER_NOTE_SOURCE_MISMATCH';
  end if;

  perform 1 from public.dog_profiles
  where id=p_pet_id and user_id=p_user_id and lifecycle_status<>'archived'
  for share;
  if not found then
    raise exception using errcode='42501', message='OWNER_NOTE_PET_NOT_OWNED';
  end if;

  select * into v_entry
  from public.pet_care_entries
  where user_id=p_user_id and intelligence_source_message_id=p_source_message_id
  for update;

  if v_entry.id is not null then
    if v_entry.deleted_at is not null or v_entry.pet_profile_id<>p_pet_id
      or (v_entry.note<>v_stored_note and v_entry.note<>v_message.user_text)
      or v_entry.intelligence_source_type is distinct from 'owner_note' then
      raise exception using errcode='22023', message='OWNER_NOTE_SOURCE_CHANGED';
    end if;
    return jsonb_build_object('entryId',v_entry.id,'alreadyPersisted',true);
  end if;

  insert into public.pet_care_entries(
    user_id,pet_profile_id,category,title,note,occurred_at,
    intelligence_source_message_id,intelligence_request_id,intelligence_source_type,care_event_metadata
  )
  values(
    p_user_id,p_pet_id,'general','Owner note',v_stored_note,coalesce(p_occurred_at,now()),
    p_source_message_id,p_request_id,'owner_note',jsonb_build_object(
      'authority','owner_report',
      'occurrenceBasis',case when p_occurred_at is null then 'recorded_at' else 'explicit' end,
      'explicitTime',p_explicit_time,
      'clinicalStatus','unconfirmed'
    )
  )
  returning * into v_entry;

  return jsonb_build_object('entryId',v_entry.id,'alreadyPersisted',false);
end;
$$;

revoke all on function public.persist_ask_owner_note(uuid,uuid,uuid,uuid,text,timestamptz,text)
  from public, anon, authenticated;
grant execute on function public.persist_ask_owner_note(uuid,uuid,uuid,uuid,text,timestamptz,text)
  to service_role;
