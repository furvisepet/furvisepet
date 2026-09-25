-- Canonical append is cardinality 1..8 behind the existing confirmation capability.
-- This replaces the raw-text dated batch writer; there is no second write store.
create function private.persist_furvise_append_items(p_user_id uuid,p_pet_id uuid,p_source_message_id uuid,p_items jsonb)
returns boolean
language plpgsql security definer set search_path=pg_catalog as $function$
declare
 source_text text; source_time timestamptz; item jsonb; body text; date_text text; event_time timestamptz;
 item_index integer:=0; expected_count integer; source_start integer; source_end integer; spans int4range[]:='{}';
 source_span_id text; span int4range; existing public.pet_care_entries; changed boolean:=false;
 js_start integer; js_end integer; prefix text; actual_count integer;
begin
 perform private.set_furvise_server_actor(p_user_id);
 if not exists(select 1 from public.dog_profiles where id=p_pet_id and user_id=p_user_id) then
  raise exception using errcode='42501',message='APPEND_SUBJECT_NOT_OWNED'; end if;
 select m.user_text,m.created_at into source_text,source_time from public.ask_conversation_messages m
 join public.ask_conversations c on c.id=m.conversation_id and c.user_id=p_user_id
 where m.id=p_source_message_id and m.user_id=p_user_id and m.role='user' for share of m,c;
 if source_text is null or jsonb_typeof(p_items) is distinct from 'array' then
  raise exception using errcode='22023',message='APPEND_SOURCE_INVALID'; end if;
 expected_count:=jsonb_array_length(p_items);
 if expected_count not between 1 and 8 then raise exception 'APPEND_CARDINALITY_INVALID'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||':'||p_pet_id::text||':semantic-source:'||p_source_message_id::text,0));
 for item in select value from jsonb_array_elements(p_items) loop
  item_index:=item_index+1; body:=item#>>'{body,text}'; source_span_id:=item#>>'{body,id}';
  if jsonb_typeof(item) is distinct from 'object' or item-array['body','date','occurredAt']<>'{}'::jsonb
   or not(item ?& array['body','date','occurredAt']) or body is null or length(btrim(body))=0 or length(body)>1000
   or item#>>'{body,sourceMessageId}' is distinct from p_source_message_id::text then raise exception 'APPEND_ITEM_INVALID'; end if;
  source_start:=strpos(source_text,body);
  if source_start=0 or strpos(substr(source_text,source_start+1),body)>0 then raise exception 'APPEND_SOURCE_INVALID'; end if;
  source_end:=source_start+length(body); span:=int4range(source_start,source_end,'[)');
  if exists(select 1 from unnest(spans) other where other && span) then raise exception 'APPEND_SOURCE_OVERLAP'; end if;
  spans:=array_append(spans,span);
  -- JS source offsets are UTF-16. Astral codepoints contribute a second code unit.
  prefix:=substr(source_text,1,source_start-1);
  js_start:=length(prefix)+length(regexp_replace(prefix,U&'[^\+010000-\+10FFFF]','','g'));
  js_end:=js_start+length(body)+length(regexp_replace(body,U&'[^\+010000-\+10FFFF]','','g'));
  if (item#>>'{body,start}')::integer is distinct from js_start or (item#>>'{body,end}')::integer is distinct from js_end
   or source_span_id is distinct from p_source_message_id::text||':'||js_start::text||':'||js_end::text then
   raise exception 'APPEND_SPAN_INVALID'; end if;
  date_text:=item#>>'{date,text}';
  if item->'date'='null'::jsonb and item->'occurredAt'='null'::jsonb then event_time:=source_time;
  else
   if date_text is null or strpos(body,date_text)=0 or strpos(substr(source_text,strpos(source_text,date_text)+1),date_text)>0
    or item#>>'{date,sourceMessageId}' is distinct from p_source_message_id::text
    or date_text !~* '^(January|February|March|April|May|June|July|August|September|October|November|December) [0-9]{1,2},? [0-9]{4}$|^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception 'APPEND_DATE_SOURCE_INVALID'; end if;
   event_time:=(date_text::date)::timestamp at time zone 'UTC';
   if event_time is distinct from (item->>'occurredAt')::timestamptz or event_time>source_time or not isfinite(event_time) then
    raise exception 'APPEND_DATE_INVALID'; end if;
  end if;
  select e.* into existing from public.pet_care_entries e where e.user_id=p_user_id and e.pet_profile_id=p_pet_id
   and e.intelligence_source_message_id=p_source_message_id and e.care_event_metadata->>'sourceNoteIndex'=item_index::text for update;
  if existing.id is not null then
   if existing.note is distinct from body or existing.occurred_at is distinct from event_time or existing.deleted_at is not null
    or existing.care_event_metadata->>'sourceSpanId' is distinct from source_span_id then raise exception 'APPEND_REPLAY_MISMATCH'; end if;
  else
   insert into public.pet_care_entries(user_id,pet_profile_id,category,title,note,occurred_at,
    intelligence_source_message_id,intelligence_source_type,intelligence_confidence,care_event_metadata)
   values(p_user_id,p_pet_id,'general','Owner note',body,event_time,p_source_message_id,'ask_application_action',1,
    jsonb_build_object('sourceNoteIndex',item_index,'sourceNoteCount',expected_count,'sourceSpanId',source_span_id,'source','ask_furvise'));
   changed:=true;
  end if;
 end loop;
 select count(*) into actual_count from public.pet_care_entries e where e.user_id=p_user_id and e.pet_profile_id=p_pet_id
  and e.intelligence_source_message_id=p_source_message_id;
 if actual_count<>expected_count then raise exception 'APPEND_REPLAY_COUNT_MISMATCH'; end if;
 return changed;
end $function$;
revoke all on function private.persist_furvise_append_items(uuid,uuid,uuid,jsonb) from public,anon,authenticated,service_role;

-- Extend the existing locked, owner-bound, expiring capability execution.
-- All existing cancellation, authorization, freshness and terminal receipt checks remain.
do $migration$
declare definition text; old_branch text := '  if v_error is null and v.action_kind = ''care_history.add'' then';
new_branch text := $branch$
  if v_error is null and v.action_kind = 'care_history.add' and v.action_payload ? 'appendJob' then
    if p_mode <> 'confirm' or v.explicit_intent
      or v.action_payload#>>'{appendJob,operation}' is distinct from 'append'
      or v.action_payload#>>'{appendJob,petId}' is distinct from v.pet_profile_id::text
      or v.action_payload#>>'{appendJob,sourceMessageId}' is distinct from v.source_message_id::text then
      raise exception 'APPEND_CAPABILITY_NOT_AUTHORIZED';
    end if;
    v_changed := private.persist_furvise_append_items(v.user_id,v.pet_profile_id,v.source_message_id,v.action_payload#>'{appendJob,items}');
    v_result := 'The requested records were added to care history.';
  elsif v_error is null and v.action_kind = 'care_history.add' then$branch$;
begin
 definition:=pg_get_functiondef('private.execute_ask_action_capability(uuid,uuid,uuid,text,uuid)'::regprocedure);
 if (length(definition)-length(replace(definition,old_branch,'')))/length(old_branch)<>1 then
  raise exception 'Unexpected canonical capability executor'; end if;
 execute replace(definition,old_branch,new_branch);
end $migration$;
drop function public.persist_furvise_server_note_batch(uuid,uuid,uuid,jsonb);
