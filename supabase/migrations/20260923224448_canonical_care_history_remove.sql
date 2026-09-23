-- Canonical REMOVE reuses the existing structural safe-record policy.
-- The non-Ask compatibility helper remains unchanged and unreachable from this executor.
create function private.canonical_remove_matches(c public.ask_action_capabilities)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare j jsonb:=c.action_payload->'removeJob'; t jsonb; s jsonb; r jsonb; original text; source_time timestamptz;
  prefix text; pos integer; js_start integer; js_length integer;
begin
 if c.action_kind<>'care_history.remove' then return false;end if;
 if jsonb_typeof(j) is distinct from 'object' or j-array['operation','domain','target','petId','sourceMessageId','asOf','instruction','resolvedTarget']<>'{}'
 or not(j ?& array['operation','domain','target','petId','sourceMessageId','asOf','instruction','resolvedTarget'])
 or j->>'operation' is distinct from 'remove' or j->>'domain' is distinct from 'care_history'
 or j->>'petId' is distinct from c.pet_profile_id::text or j->>'sourceMessageId' is distinct from c.source_message_id::text
 or c.action_payload->>'kind' is distinct from c.action_kind or c.action_payload->>'petId' is distinct from c.pet_profile_id::text
 or c.action_payload->>'sourceMessageId' is distinct from c.source_message_id::text
 or c.action_payload->>'targetSourceId' is distinct from 'care:'||c.target_id::text
 or c.explicit_intent or c.action_payload->>'explicitIntent' is distinct from 'false'
 or c.confirmation_policy<>'always'
 or c.action_payload ?| array['replaceJob','appendJob','fieldMutationJob','stateTransitionJob']
 or c.action_payload->'input' is distinct from jsonb_build_object('field',null,'value',null,'title',null,'detail',null,'category',null,'target','specified') then return false;end if;
 select user_text,created_at into original,source_time from public.ask_conversation_messages
 where id=c.source_message_id and user_id=c.user_id and role='user';
 if original is null or (j->>'asOf')::timestamptz is distinct from source_time then return false;end if;
 s:=j->'instruction';
 if jsonb_typeof(s) is distinct from 'object' or s-array['start','end','text']<>'{}' or not(s ?& array['start','end','text'])
 or nullif(s->>'text','') is null then return false;end if;
 pos:=strpos(original,s->>'text');
 if pos=0 then return false;end if;
 -- Only source-span equality, never command interpretation.
 prefix:=substr(original,1,pos-1);
 if btrim(prefix,E' \t\r\n')<>'' or btrim(substr(original,pos+length(s->>'text')),E' \t\r\n')<>'' then return false;end if;
 js_start:=length(prefix)+length(regexp_replace(prefix,U&'[^\+010000-\+10FFFF]','','g'));
 js_length:=length(s->>'text')+length(regexp_replace(s->>'text',U&'[^\+010000-\+10FFFF]','','g'));
 if js_length>1600 or (s->>'start')::integer is distinct from js_start or (s->>'end')::integer is distinct from js_start+js_length then return false;end if;
 r:=j->'resolvedTarget';
 if jsonb_typeof(r) is distinct from 'object' or r-array['recordId','updatedAt']<>'{}' or not(r ?& array['recordId','updatedAt'])
 or r->>'recordId' is distinct from c.target_id::text or (r->>'updatedAt')::timestamptz is distinct from c.target_updated_at then return false;end if;
 t:=j->'target';
 if t='"last_event_for_subject"'::jsonb then return true;end if;
 return jsonb_typeof(t)='object' and t-array['kind','ref','recordId','updatedAt']='{}'
 and t ?& array['kind','ref','recordId','updatedAt'] and t->>'kind'='exact_record'
 and length(t->>'ref') between 1 and 160 and t->>'recordId'=c.target_id::text and (t->>'updatedAt')::timestamptz=c.target_updated_at;
exception when invalid_text_representation or datetime_field_overflow or numeric_value_out_of_range then return false;
end $$;
revoke all on function private.canonical_remove_matches(public.ask_action_capabilities) from public,anon,authenticated,service_role;

create function private.bind_canonical_remove_capability()
returns trigger language plpgsql security definer set search_path='' as $$
declare expected uuid;
begin
 if new.action_kind<>'care_history.remove' then return new;end if;
 if private.canonical_remove_matches(new) is not true then raise exception using errcode='23514',message='REMOVE_CANONICAL_BINDING_REQUIRED';end if;
 if new.action_payload#>>'{removeJob,target}'='last_event_for_subject' then
   select e.id into expected from public.pet_care_entries e where e.user_id=new.user_id and e.pet_profile_id=new.pet_profile_id
   and e.deleted_at is null and e.created_at<=(new.action_payload#>>'{removeJob,asOf}')::timestamptz order by e.created_at desc,e.id desc limit 1;
   if expected is distinct from new.target_id then raise exception using errcode='23514',message='REMOVE_SELECTOR_TARGET_MISMATCH';end if;
 end if;
 return new;
end $$;
revoke all on function private.bind_canonical_remove_capability() from public,anon,authenticated,service_role;
create trigger zz_bind_canonical_remove before insert on public.ask_action_capabilities for each row execute function private.bind_canonical_remove_capability();

create function private.remove_canonical_ask_care_entry(c public.ask_action_capabilities)
returns boolean language plpgsql security definer set search_path='' as $$
declare e public.pet_care_entries%rowtype; affected integer;
begin
 if private.canonical_remove_matches(c) is not true then return false;end if;
 select * into e from public.pet_care_entries where id=c.target_id and user_id=c.user_id and pet_profile_id=c.pet_profile_id for update;
 if e.id is null or e.deleted_at is not null or e.updated_at is distinct from c.target_updated_at
 or not private.canonical_ask_replace_safe(e.id,c.user_id,c.pet_profile_id) then return false;end if;
 update public.pet_care_entries set deleted_at=clock_timestamp(),deleted_by=c.user_id,deletion_reason='user_removed',updated_at=clock_timestamp()
 where id=e.id and user_id=c.user_id and pet_profile_id=c.pet_profile_id and deleted_at is null and updated_at=c.target_updated_at;
 get diagnostics affected=row_count;
 return affected=1;
end $$;
revoke all on function private.remove_canonical_ask_care_entry(public.ask_action_capabilities) from public,anon,authenticated,service_role;

do $migration$
declare definition text; revised text;
begin
 definition:=pg_get_functiondef('private.execute_ask_action_capability(uuid,uuid,uuid,text,uuid)'::regprocedure);
 revised:=replace(definition,'(v.action_kind=''care_history.remove''','((v.action_kind=''care_history.remove'' and private.canonical_remove_matches(v) is not true)');
 revised:=replace(revised,'private.remove_ask_action_care_entry(v.user_id, v.target_id)','private.remove_canonical_ask_care_entry(v)');
 if revised=definition or position('private.remove_ask_action_care_entry' in revised)>0 or position('private.canonical_remove_matches(v)' in revised)=0 then
 raise exception 'Unexpected canonical removal executor';end if;
 execute revised;
end $migration$;
