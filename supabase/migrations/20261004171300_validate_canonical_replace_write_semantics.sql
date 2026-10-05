-- Align canonical REPLACE with the source-semantics.v1 WRITE contract.
-- Legacy absent semantics remain unknown at the existing atomic stamp trigger.
-- No records, receipts, effective edges, grants to clients, or historical migrations change.
begin;
do $precondition$
begin
  if to_regprocedure('private.canonical_replace_matches(public.ask_action_capabilities)') is null
    or to_regprocedure('private.stamp_canonical_source_semantics()') is null then
    raise exception 'CANONICAL_REPLACE_SEMANTICS_DEPENDENCY_MISSING';
  end if;
end $precondition$;

-- source-semantics-instant.v1, identical lexical/calendar/zone bounds to TypeScript.
create function private.canonical_replace_instant_valid(v jsonb)
returns boolean language plpgsql immutable security invoker set search_path=pg_catalog as $$
declare s text; m text[]; y integer; mo integer; d integer; h integer; mi integer; se integer;
  zh integer; zm integer; zone text; days integer[];
begin
  if jsonb_typeof(v) is distinct from 'string' then return false; end if;
  s:=v#>>'{}';
  m:=regexp_match(s,'^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})([.][0-9]{1,3})?(Z|[+-][0-9]{2}:[0-9]{2})$');
  if m is null or s<>m[1]||'-'||m[2]||'-'||m[3]||'T'||m[4]||':'||m[5]||':'||m[6]||coalesce(m[7],'')||m[8] then return false; end if;
  y:=m[1]::integer; mo:=m[2]::integer; d:=m[3]::integer; h:=m[4]::integer; mi:=m[5]::integer; se:=m[6]::integer;
  if y<1 or mo<1 or mo>12 or d<1 or h>23 or mi>59 or se>59 then return false; end if;
  days:=array[31,case when y%4=0 and (y%100<>0 or y%400=0) then 29 else 28 end,31,30,31,30,31,31,30,31,30,31];
  if d>days[mo] then return false; end if;
  zone:=m[8];
  if zone<>'Z' then
    zh:=substring(zone from 2 for 2)::integer; zm:=substring(zone from 5 for 2)::integer;
    if zone='-00:00' or zh>14 or zm>59 or (zh=14 and zm<>0) then return false; end if;
  end if;
  return true;
end $$;
revoke all on function private.canonical_replace_instant_valid(jsonb) from public,anon,authenticated,service_role;

create function private.canonical_replace_write_semantics_valid(j jsonb)
returns boolean language plpgsql stable security invoker set search_path=pg_catalog as $$
declare s jsonb; t jsonb; boundary jsonb; from_at timestamptz; to_at timestamptz;
begin
  if jsonb_typeof(j) is distinct from 'object' then return false; end if;
  if not (j ? 'semantics') then return true; end if;
  s:=j->'semantics';
  if jsonb_typeof(s) is distinct from 'object'
    or s-array['classification','target']<>'{}'::jsonb
    or not (s ?& array['classification','target'])
    or jsonb_typeof(s->'classification') is distinct from 'string' then return false; end if;
  t:=s->'target';
  if s->>'classification' in ('observation','unknown') then return t='null'::jsonb; end if;
  if s->>'classification' is distinct from 'attributed_correction'
    or jsonb_typeof(t) is distinct from 'object' then return false; end if;
  if t->>'kind'='target_unknown' then return t=jsonb_build_object('kind','target_unknown'); end if;
  if t->>'kind' is distinct from 'scope'
    or t-array['kind','from','to','conceptKey']<>'{}'::jsonb
    or not (t ?& array['kind','from','to','conceptKey'])
    or t->'conceptKey' is distinct from 'null'::jsonb then return false; end if;
  -- Match the WRITE boundary's string-or-null temporal scope, not a source/claim ID.
  foreach boundary in array array[t->'from',t->'to'] loop
    if boundary is distinct from 'null'::jsonb then
      if private.canonical_replace_instant_valid(boundary) is not true then return false; end if;
    end if;
  end loop;
  from_at:=(t->>'from')::timestamptz; to_at:=(t->>'to')::timestamptz;
  if from_at is not null and to_at is not null and from_at>=to_at then return false; end if;
  return true;
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow
  or numeric_value_out_of_range then return false;
end $$;
revoke all on function private.canonical_replace_write_semantics_valid(jsonb) from public,anon,authenticated,service_role;

create or replace function private.canonical_replace_matches(c public.ask_action_capabilities)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare j jsonb:=c.action_payload->'replaceJob'; t jsonb; body text; original text; source_time timestamptz;
  start_pos integer; js_start integer; js_length integer; prefix text;
begin
  if c.action_kind<>'care_history.edit' then return false;end if;
  if jsonb_typeof(j) is distinct from 'object' or j-array['operation','target','petId','sourceMessageId','asOf','body','constraints','semantics']<>'{}'
    or not(j ?& array['operation','target','petId','sourceMessageId','asOf','body','constraints'])
    or j->>'operation' is distinct from 'replace'
    or j->>'petId' is distinct from c.pet_profile_id::text
    or j->>'sourceMessageId' is distinct from c.source_message_id::text
    or c.action_payload->>'targetSourceId' is distinct from 'care:'||c.target_id::text
    or c.action_payload->>'kind' is distinct from c.action_kind
    or c.action_payload->>'petId' is distinct from c.pet_profile_id::text
    or c.action_payload->>'sourceMessageId' is distinct from c.source_message_id::text
    or c.explicit_intent or c.action_payload->>'explicitIntent' is distinct from 'false'
    or c.action_payload ?| array['appendJob','fieldMutationJob','stateTransitionJob'] then return false;end if;
  if private.canonical_replace_write_semantics_valid(j) is not true then return false; end if;
  body:=j#>>'{body,text}';
  js_length:=length(body)+length(regexp_replace(body,U&'[^\+010000-\+10FFFF]','','g'));
  if body is null or btrim(body)='' or js_length>1000
    or c.action_payload#>'{input}' is distinct from jsonb_build_object('field',null,'value',null,'title',null,'detail',body,'category',null,'target','specified')
    or j#>>'{constraints,effectiveCount}' is distinct from '1'
    or j#>>'{constraints,allowAdditionalCopy}' is distinct from 'false'
    or jsonb_typeof(j#>'{constraints,spans}') is distinct from 'array' then return false;end if;
  select user_text,created_at into original,source_time from public.ask_conversation_messages
    where id=c.source_message_id and user_id=c.user_id and role='user';
  if original is null or (j->>'asOf')::timestamptz is distinct from source_time then return false;end if;
  start_pos:=strpos(original,body);
  if start_pos=0 or strpos(substr(original,start_pos+1),body)>0 then return false;end if;
  prefix:=substr(original,1,start_pos-1);
  js_start:=length(prefix)+length(regexp_replace(prefix,U&'[^\+010000-\+10FFFF]','','g'));
  if (j#>>'{body,start}')::integer is distinct from js_start
    or (j#>>'{body,end}')::integer is distinct from js_start+js_length then return false;end if;
  t:=j->'target';
  if t='"last_event_for_subject"'::jsonb then return true;end if;
  return jsonb_typeof(t)='object' and t-array['kind','ref','recordId','updatedAt']='{}'
    and t ?& array['kind','ref','recordId','updatedAt'] and t->>'kind'='exact_record'
    and length(t->>'ref')>0 and t->>'recordId'=c.target_id::text
    and (t->>'updatedAt')::timestamptz=c.target_updated_at;
exception when invalid_text_representation or datetime_field_overflow or numeric_value_out_of_range then return false;
end $$;
revoke all on function private.canonical_replace_matches(public.ask_action_capabilities) from public,anon,authenticated,service_role;

commit;
