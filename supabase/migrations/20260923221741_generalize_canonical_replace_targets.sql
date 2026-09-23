-- Exact supplied targets extend REPLACE; source spans and the existing safe-write policy remain mandatory.
create function public.list_ask_replace_targets(p_user_id uuid,p_pet_ids uuid[],p_as_of timestamptz)
returns table(id uuid,user_id uuid,pet_profile_id uuid,note text,occurred_at timestamptz,created_at timestamptz,updated_at timestamptz)
language plpgsql security definer set search_path='' as $$
begin
  perform private.require_service_role_request();
  perform private.set_furvise_server_actor(p_user_id);
  -- This is only a bounded catalog of available mutation handles, never a complete factual read.
  return query select e.id,e.user_id,e.pet_profile_id,e.note,e.occurred_at,e.created_at,e.updated_at
    from public.pet_care_entries e
    where e.user_id=p_user_id and e.pet_profile_id=any(p_pet_ids) and e.created_at<=p_as_of
      and private.canonical_ask_replace_safe(e.id,p_user_id,e.pet_profile_id)
    order by e.created_at desc,e.id desc limit 40;
end $$;
revoke all on function public.list_ask_replace_targets(uuid,uuid[],timestamptz) from public,anon,authenticated;
grant execute on function public.list_ask_replace_targets(uuid,uuid[],timestamptz) to service_role;

create function private.canonical_replace_matches(c public.ask_action_capabilities)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare j jsonb:=c.action_payload->'replaceJob'; t jsonb; body text; original text; source_time timestamptz;
  start_pos integer; js_start integer; js_length integer; prefix text;
begin
  if c.action_kind<>'care_history.edit' then return false;end if;
  if jsonb_typeof(j) is distinct from 'object' or j-array['operation','target','petId','sourceMessageId','asOf','body','constraints']<>'{}'
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

create function private.bind_canonical_replace_capability()
returns trigger language plpgsql security definer set search_path='' as $$
declare expected uuid;
begin
  if new.action_kind<>'care_history.edit' then return new;end if;
  if private.canonical_replace_matches(new) is not true then
    raise exception using errcode='23514',message='REPLACE_CANONICAL_BINDING_REQUIRED';end if;
  if new.action_payload#>>'{replaceJob,target}'='last_event_for_subject' then
    select e.id into expected from public.pet_care_entries e
      where e.user_id=new.user_id and e.pet_profile_id=new.pet_profile_id and e.deleted_at is null
        and e.created_at<=(new.action_payload#>>'{replaceJob,asOf}')::timestamptz
      order by e.created_at desc,e.id desc limit 1;
    if expected is distinct from new.target_id then
      raise exception using errcode='23514',message='REPLACE_SELECTOR_TARGET_MISMATCH';end if;
  end if;
  return new;
end $$;
revoke all on function private.bind_canonical_replace_capability() from public,anon,authenticated,service_role;
-- Run after the existing owner/target binder has captured target_updated_at.
create trigger zz_bind_canonical_replace before insert on public.ask_action_capabilities
  for each row execute function private.bind_canonical_replace_capability();

-- Legacy pending edits cannot execute; terminal receipts remain historical.
-- Keep the existing executor, locks, freshness, isolation and safe-target policy.
do $migration$
declare definition text; revised text; marker text:='  if v_error is null and (v.action_kind=''care_history.remove''';
begin
  definition:=pg_get_functiondef('private.execute_ask_action_capability(uuid,uuid,uuid,text,uuid)'::regprocedure);
  revised:=replace(definition,marker,
    E'  if v_error is null and v.action_kind=''care_history.edit'' and private.canonical_replace_matches(v) is not true then\n'
    || E'    v_error:=''That replacement requires canonical authority.'';\n  end if;\n'||marker);
  if revised=definition then raise exception 'Missing governed history executor';end if;
  execute revised;
end $migration$;
