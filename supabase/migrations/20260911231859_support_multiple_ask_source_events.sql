-- Keep legacy single-note identity at slot zero, and bind each explicit batch
-- member to its source order. Existing rows and their evidence hashes do not change.
create unique index pet_care_entries_intelligence_source_event_unique
on public.pet_care_entries(user_id, pet_profile_id, intelligence_source_message_id,
  (coalesce(care_event_metadata->>'sourceNoteIndex','0')))
where intelligence_source_message_id is not null;
do $migration$
declare proc regprocedure; definition text; pattern text := 'on[[:space:]]+conflict[[:space:]]*\([[:space:]]*user_id[[:space:]]*,[[:space:]]*pet_profile_id[[:space:]]*,[[:space:]]*intelligence_source_message_id[[:space:]]*\)';
begin
 foreach proc in array array[
  'public.persist_furvise_intelligence(uuid,uuid,jsonb,jsonb)'::regprocedure,
  'public.persist_furvise_care_event_with_concern(uuid,uuid,uuid,jsonb,uuid)'::regprocedure,
  'public.persist_furvise_care_event_before_destination_routing(uuid,uuid,uuid,jsonb,uuid)'::regprocedure
 ] loop
  definition:=pg_get_functiondef(proc);
  if regexp_count(definition,pattern)<>1 then raise exception 'Unexpected care source conflict contract: %',proc; end if;
  definition:=regexp_replace(definition,pattern,
   'on conflict (user_id, pet_profile_id, intelligence_source_message_id, (coalesce(care_event_metadata->>''sourceNoteIndex'',''0'')))','g');
  execute definition;
 end loop;
end $migration$;
drop index public.pet_care_entries_intelligence_source_pet_unique;

create function public.persist_furvise_server_note_batch(p_user_id uuid,p_pet_id uuid,p_source_message_id uuid,p_notes jsonb)
returns table(persistence_status text,care_entry_ids uuid[],already_persisted boolean)
language plpgsql security definer set search_path=pg_catalog as $function$
declare source_text text; source_time timestamptz; item jsonb; note_text text; date_text text; event_time timestamptz;
 index integer:=0; ids uuid[]:='{}'; existing public.pet_care_entries; entry_id uuid; replay boolean:=true; expected_count integer;
begin
 perform private.set_furvise_server_actor(p_user_id);
 if not exists(select 1 from public.dog_profiles where id=p_pet_id and user_id=p_user_id) then
  raise exception using errcode='42501',message='NOTE_BATCH_PET_NOT_OWNED'; end if;
 select m.user_text,m.created_at into source_text,source_time from public.ask_conversation_messages m
 join public.ask_conversations c on c.id=m.conversation_id
 where m.id=p_source_message_id and m.user_id=p_user_id and m.role='user' and c.user_id=p_user_id for share of m,c;
 if source_text is null then raise exception using errcode='42501',message='NOTE_BATCH_SOURCE_NOT_OWNED'; end if;
 if jsonb_typeof(p_notes) is distinct from 'array' then raise exception using errcode='22023',message='NOTE_BATCH_INVALID'; end if;
 expected_count:=jsonb_array_length(p_notes);
 if expected_count not between 2 and 8 then raise exception using errcode='22023',message='NOTE_BATCH_INVALID'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||':'||p_pet_id::text||':semantic-source:'||p_source_message_id::text,0));
 if exists(select 1 from public.pet_care_entries e where e.user_id=p_user_id and e.pet_profile_id=p_pet_id
  and e.intelligence_source_message_id=p_source_message_id and coalesce(e.care_event_metadata->>'sourceNoteIndex','0')='0') then
  raise exception using errcode='22023',message='NOTE_BATCH_EXISTING_SINGLE_RECORD'; end if;
 for item in select value from jsonb_array_elements(p_notes) loop
  index:=index+1; note_text:=item->>'note'; date_text:=item->>'dateText';
  if jsonb_typeof(item) is distinct from 'object' or note_text is null or date_text is null
   or length(note_text) not between 1 and 1000 or position(note_text in source_text)=0
   or position(date_text||':' in note_text)<>1
   or date_text !~* '^(January|February|March|April|May|June|July|August|September|October|November|December) [0-9]{1,2},? [0-9]{4}$|^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
   raise exception using errcode='22023',message='NOTE_BATCH_SOURCE_INVALID'; end if;
  event_time:=(date_text::date)::timestamp at time zone 'UTC';
  if event_time is distinct from (item->>'occurredAt')::timestamptz or event_time>source_time or not isfinite(event_time) then
   raise exception using errcode='22023',message='NOTE_BATCH_DATE_INVALID'; end if;
  select e.* into existing from public.pet_care_entries e where e.user_id=p_user_id and e.pet_profile_id=p_pet_id
   and e.intelligence_source_message_id=p_source_message_id and e.care_event_metadata->>'sourceNoteIndex'=index::text for update;
  if existing.id is not null then
   if existing.note is distinct from note_text or existing.occurred_at is distinct from event_time or existing.deleted_at is not null then
    raise exception using errcode='22023',message='NOTE_BATCH_REPLAY_MISMATCH'; end if;
   entry_id:=existing.id;
  else
   replay:=false;
   insert into public.pet_care_entries(user_id,pet_profile_id,category,title,note,occurred_at,
    intelligence_source_message_id,intelligence_source_type,intelligence_confidence,care_event_metadata)
   values(p_user_id,p_pet_id,'general','Dated care note',note_text,event_time,p_source_message_id,'ask_explicit_note_batch',1,
    jsonb_build_object('sourceNoteIndex',index,'sourceNoteCount',expected_count,'source','ask_furvise')) returning id into entry_id;
  end if;
  ids:=array_append(ids,entry_id);
 end loop;
 if (select count(*) from public.pet_care_entries e where e.user_id=p_user_id and e.pet_profile_id=p_pet_id
  and e.intelligence_source_message_id=p_source_message_id)<>expected_count then
  raise exception using errcode='22023',message='NOTE_BATCH_REPLAY_COUNT_MISMATCH'; end if;
 return query select 'persisted'::text,ids,replay;
end $function$;
revoke all on function public.persist_furvise_server_note_batch(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.persist_furvise_server_note_batch(uuid,uuid,uuid,jsonb) to service_role;
