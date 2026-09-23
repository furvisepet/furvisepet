-- A profile generation is a deterministic freshness guard, not copied profile facts.
create function private.touch_pet_remove_generation()
returns trigger language plpgsql set search_path='' as $$
begin new.updated_at:=clock_timestamp();return new;end $$;
revoke all on function private.touch_pet_remove_generation() from public,anon,authenticated,service_role;
create trigger touch_pet_remove_generation before update on public.dog_profiles
 for each row execute function private.touch_pet_remove_generation();

-- Preserve the existing capability as the sole immutable terminal receipt.
-- UUIDs retain provenance after parent deletion; authenticated account FK stays intact.
alter table public.ask_action_capabilities
 drop constraint ask_action_capabilities_pet_profile_id_fkey,
 drop constraint ask_action_capabilities_source_message_id_fkey,
 drop constraint ask_action_capabilities_assistant_message_id_fkey;
alter table public.ask_action_capabilities drop constraint ask_action_capabilities_version_binding_check;
-- Retire pre-canonical pending pet deletion rather than authorizing it retroactively.
update public.ask_action_capabilities set status='failed',receipt=action_payload||jsonb_build_object('id',id,'status','failed','resultMessage',null,'errorMessage','That action must be prepared again.'),terminal_at=clock_timestamp(),updated_at=clock_timestamp()
where status='pending' and action_kind='pet.delete_permanently';
alter table public.ask_action_capabilities add constraint ask_action_capabilities_version_binding_check check (
 (action_kind in ('care_history.edit','care_history.remove','care_state.resolve','care_state.reopen') and target_updated_at is not null)
 or (action_kind='pet.delete_permanently' and (status<>'pending' or target_updated_at is not null))
 or (action_kind not in ('care_history.edit','care_history.remove','care_state.resolve','care_state.reopen','pet.delete_permanently') and target_updated_at is null));
CREATE OR REPLACE FUNCTION private.validate_ask_action_capability()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_source public.ask_conversation_messages%rowtype;
  v_assistant public.ask_conversation_messages%rowtype;
  v_pet public.dog_profiles%rowtype;
  v_entry public.pet_care_entries%rowtype;
  v_concern public.pet_concerns%rowtype;
begin
  if new.status<>'pending' or new.receipt is not null or new.terminal_at is not null then raise exception 'CAPABILITY_MUST_START_PENDING';end if;
  select * into v_source from public.ask_conversation_messages
  where id = new.source_message_id and user_id = new.user_id and role = 'user' for key share;
  select * into v_assistant from public.ask_conversation_messages
  where id = new.assistant_message_id and user_id = new.user_id and role = 'furvise' for key share;
  if v_source.id is null or v_assistant.id is null
    or v_source.conversation_id <> v_assistant.conversation_id
    or v_source.request_id is null or v_source.request_id is distinct from v_assistant.request_id
    or v_assistant.sequence_number <> v_source.sequence_number + 1
    or new.source_action_id not like v_source.request_id::text || ':%' then
    raise exception using errcode = '23514', message = 'ACTION_CAPABILITY_MESSAGE_BINDING_INVALID';
  end if;
  select p.* into v_pet from public.ask_conversations c
    join public.dog_profiles p on p.id = new.pet_profile_id and p.user_id = c.user_id
    where c.id = v_source.conversation_id and c.user_id = new.user_id
      and private.ask_action_pet_matches_turn(c.pet_profile_id, v_assistant.persistence_governance, new.pet_profile_id) for key share of p,c;
  if v_pet.id is null then
    raise exception using errcode = '23514', message = 'ACTION_CAPABILITY_OWNER_PET_BINDING_INVALID';
  end if;

  if new.action_kind='pet.delete_permanently' then
    new.target_updated_at:=v_pet.updated_at;
  end if;
  if new.action_kind in ('care_history.edit', 'care_history.remove') then
    select e.* into v_entry from public.pet_care_entries e
    where e.id = new.target_id and e.user_id = new.user_id
      and e.pet_profile_id = new.pet_profile_id and e.deleted_at is null;
    if v_entry.id is null then
      raise exception using errcode = '23514', message = 'ACTION_CAPABILITY_TARGET_BINDING_INVALID';
    end if;
    new.target_updated_at := v_entry.updated_at;
  elsif new.action_kind in ('care_state.resolve', 'care_state.reopen') then
    select c.* into v_concern from public.pet_concerns c
    where c.id = new.target_id and c.user_id = new.user_id and c.pet_profile_id = new.pet_profile_id
      and ((new.action_kind = 'care_state.resolve' and c.status in ('active','monitoring','reopened'))
        or (new.action_kind = 'care_state.reopen' and c.status = 'resolved'));
    if v_concern.id is null then
      raise exception using errcode = '23514', message = 'ACTION_CAPABILITY_TARGET_BINDING_INVALID';
    end if;
    new.target_updated_at := v_concern.updated_at;
  end if;
  if new.action_kind in ('pet.mark_deceased', 'pet.mark_active', 'pet.archive') then
    new.lifecycle_status_at_mint := v_pet.lifecycle_status;
    new.lifecycle_changed_at_at_mint := v_pet.lifecycle_changed_at;
  end if;

  new.created_at := clock_timestamp();
  new.updated_at := new.created_at;
  new.expires_at := new.created_at + interval '15 minutes';
  return new;
end;
$function$;


-- Canonical REMOVE reuses the existing structural safe-record policy.
-- The non-Ask compatibility helper remains unchanged and unreachable from this executor.
create or replace function private.canonical_remove_matches(c public.ask_action_capabilities)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare j jsonb:=c.action_payload->'removeJob'; t jsonb; s jsonb; r jsonb; original text; source_time timestamptz;
  prefix text; pos integer; js_start integer; js_length integer;
begin
 if c.action_kind not in ('care_history.remove','pet.delete_permanently') then return false;end if;
 if jsonb_typeof(j) is distinct from 'object' or j-array['operation','domain','target','petId','sourceMessageId','asOf','instruction','resolvedTarget']<>'{}'
 or not(j ?& array['operation','domain','target','petId','sourceMessageId','asOf','instruction','resolvedTarget'])
 or j->>'operation' is distinct from 'remove' or j->>'domain' is distinct from (case c.action_kind when 'care_history.remove' then 'care_history' else 'pet_profile' end)
 or j->>'petId' is distinct from c.pet_profile_id::text or j->>'sourceMessageId' is distinct from c.source_message_id::text
 or c.action_payload->>'kind' is distinct from c.action_kind or c.action_payload->>'petId' is distinct from c.pet_profile_id::text
 or c.action_payload->>'sourceMessageId' is distinct from c.source_message_id::text
 or (c.action_kind='care_history.remove' and c.action_payload->>'targetSourceId' is distinct from 'care:'||c.target_id::text)
 or (c.action_kind='pet.delete_permanently' and c.action_payload ? 'targetSourceId')
 or c.explicit_intent or c.action_payload->>'explicitIntent' is distinct from 'false'
 or c.confirmation_policy<>'always'
 or c.action_payload ?| array['replaceJob','appendJob','fieldMutationJob','stateTransitionJob']
 or c.action_payload->'input' is distinct from jsonb_build_object('field',null,'value',null,'title',null,'detail',null,'category',null,'target',case c.action_kind when 'care_history.remove' then 'specified' else 'selected' end) then return false;end if;
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
 or r->>'recordId' is distinct from (case c.action_kind when 'care_history.remove' then c.target_id else c.pet_profile_id end)::text or (r->>'updatedAt')::timestamptz is distinct from c.target_updated_at then return false;end if;
 t:=j->'target';
 if c.action_kind='pet.delete_permanently' then return t='"subject_profile"'::jsonb;end if;
 if t='"last_event_for_subject"'::jsonb then return true;end if;
 return jsonb_typeof(t)='object' and t-array['kind','ref','recordId','updatedAt']='{}'
 and t ?& array['kind','ref','recordId','updatedAt'] and t->>'kind'='exact_record'
 and length(t->>'ref') between 1 and 160 and t->>'recordId'=c.target_id::text and (t->>'updatedAt')::timestamptz=c.target_updated_at;
exception when invalid_text_representation or datetime_field_overflow or numeric_value_out_of_range then return false;
end $$;
revoke all on function private.canonical_remove_matches(public.ask_action_capabilities) from public,anon,authenticated,service_role;


create or replace function private.bind_canonical_remove_capability()
returns trigger language plpgsql security definer set search_path='' as $$
declare expected uuid;
begin
 if new.action_kind not in ('care_history.remove','pet.delete_permanently') then return new;end if;
 if private.canonical_remove_matches(new) is not true then raise exception using errcode='23514',message='REMOVE_CANONICAL_BINDING_REQUIRED';end if;
 if new.action_payload#>>'{removeJob,target}'='last_event_for_subject' then
   select e.id into expected from public.pet_care_entries e where e.user_id=new.user_id and e.pet_profile_id=new.pet_profile_id
   and e.deleted_at is null and e.created_at<=(new.action_payload#>>'{removeJob,asOf}')::timestamptz order by e.created_at desc,e.id desc limit 1;
   if expected is distinct from new.target_id then raise exception using errcode='23514',message='REMOVE_SELECTOR_TARGET_MISMATCH';end if;
 end if;
 return new;
end $$;
revoke all on function private.bind_canonical_remove_capability() from public,anon,authenticated,service_role;

-- Revoked provenance cannot leave executable pending capabilities. Terminal rows are untouched.
create function private.cancel_orphaned_ask_capabilities()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 -- Account deletion retains its existing FK cascade; do not recreate/update a child of a removed owner.
 if not exists(select 1 from auth.users where id=old.user_id) then return old;end if;
 update public.ask_action_capabilities c set status='cancelled',
 receipt=c.action_payload||jsonb_build_object('id',c.id,'status','cancelled','resultMessage','The action was cancelled because its target or source was removed.','errorMessage',null),
 terminal_at=clock_timestamp(),updated_at=clock_timestamp()
 where c.status='pending' and c.user_id=old.user_id and
 ((tg_table_name='dog_profiles' and c.pet_profile_id=old.id) or
  (tg_table_name='ask_conversation_messages' and (c.source_message_id=old.id or c.assistant_message_id=old.id)));
 return old;
end $$;
revoke all on function private.cancel_orphaned_ask_capabilities() from public,anon,authenticated,service_role;
create trigger cancel_ask_capabilities_before_pet_delete before delete on public.dog_profiles
 for each row execute function private.cancel_orphaned_ask_capabilities();
create trigger cancel_ask_capabilities_before_source_delete before delete on public.ask_conversation_messages
 for each row execute function private.cancel_orphaned_ask_capabilities();

CREATE OR REPLACE FUNCTION private.execute_ask_action_capability(p_capability_id uuid, p_assistant_message_id uuid, p_user_id uuid, p_mode text, p_correction_source_message_id uuid)
 RETURNS TABLE(action jsonb, changed boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v public.ask_action_capabilities%rowtype;
  v_action jsonb;
  v_now timestamptz := clock_timestamp();
  v_changed boolean := false;
  v_error text := null;
  v_result text := null;
  v_pet public.dog_profiles%rowtype;
  v_entry public.pet_care_entries%rowtype;
  v_concern public.pet_concerns%rowtype;
  v_category text;
  v_detail text;
  v_title text;
  v_row_count integer := 0;
  v_same_turn_entries integer := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_mode not in ('confirm', 'cancel', 'auto') then
    raise exception using errcode = '22023', message = 'ACTION_CAPABILITY_MODE_INVALID';
  end if;
  if p_correction_source_message_id is not null and p_mode <> 'cancel' then
    raise exception using errcode = '22023', message = 'ACTION_CAPABILITY_CORRECTION_MODE_INVALID';
  end if;

  select * into v from public.ask_action_capabilities
  where id = p_capability_id and assistant_message_id=p_assistant_message_id and user_id=p_user_id
  for update;
  if v.id is null then return; end if;

  -- A correction is authoritative only when the service binds it to a later
  -- user message in the same conversation. Capability locking then gives the
  -- correction and confirmation a single deterministic terminal order.
  if p_correction_source_message_id is not null and (
    v.action_kind not in ('pet.mark_deceased', 'pet.mark_active', 'pet.archive')
    or not exists (
      select 1 from public.ask_conversation_messages source_message
      join public.ask_conversation_messages correction_message
        on correction_message.conversation_id = source_message.conversation_id
        and correction_message.id = p_correction_source_message_id
        and correction_message.user_id = v.user_id
        and correction_message.role = 'user'
        and correction_message.sequence_number > source_message.sequence_number
      where source_message.id = v.source_message_id
        and source_message.user_id = v.user_id
        and source_message.role = 'user'
    )
  ) then
    raise exception using errcode = '23514', message = 'ACTION_CAPABILITY_CORRECTION_MESSAGE_BINDING_INVALID';
  end if;

  -- Stable duplicate replay: terminal rows can never be reopened or re-executed.
  if v.status <> 'pending' then
    return query select v.receipt, false;
    return;
  end if;

  -- Foreign keys alone do not prove roles, ownership, common conversation, or
  -- that the server-validated turn still authorizes the capability's exact pet.
  if not exists (
    select 1 from public.ask_conversation_messages source_message
    join public.ask_conversation_messages assistant_message
      on assistant_message.conversation_id = source_message.conversation_id
      and assistant_message.id = v.assistant_message_id
      and assistant_message.user_id = v.user_id and assistant_message.role = 'furvise'
    join public.ask_conversations conversation_row
      on conversation_row.id = source_message.conversation_id
      and conversation_row.user_id = v.user_id
      and private.ask_action_pet_matches_turn(conversation_row.pet_profile_id, assistant_message.persistence_governance, v.pet_profile_id)
    where source_message.id = v.source_message_id
      and source_message.user_id = v.user_id and source_message.role = 'user'
      and source_message.request_id is not null
      and source_message.request_id = assistant_message.request_id
      and assistant_message.sequence_number = source_message.sequence_number + 1
  ) then
    v_error := 'That action is no longer available.';
  end if;

  select * into v_pet from public.dog_profiles
  where id = v.pet_profile_id and user_id = v.user_id for update;
  if v_error is null and v_pet.id is null then
    v_error := 'This action is not available for that pet.';
  end if;

  if v_error is null and p_mode = 'cancel' then
    v_action := v.action_payload || jsonb_build_object(
      'id', v.id,
      'status', 'cancelled',
      'resultMessage', case when p_correction_source_message_id is null
        then 'The action was cancelled.'
        else 'The unconfirmed lifecycle report was cleared. The saved profile was not changed.' end,
      'errorMessage', null
    );
    update public.ask_action_capabilities set status='cancelled',receipt=v_action,terminal_at=v_now,updated_at=v_now
    where id=v.id;
    return query select v_action, false;
    return;
  end if;

  if v_error is null and p_mode = 'auto' and not (
    v.safety_class = 'LOW_RISK_REVERSIBLE'
    and v.confirmation_policy = 'explicit_intent'
    and v.confirmation_policy <> 'always'
    and v.explicit_intent
  ) then
    v_error := 'That action requires confirmation.';
  end if;

  if v_error is null and v.action_kind='care_history.edit' and private.canonical_replace_matches(v) is not true then
    v_error:='That replacement requires canonical authority.';
  end if;
  if v_error is null and ((v.action_kind='care_history.remove' and private.canonical_remove_matches(v) is not true)
    or (v.action_kind='care_history.add' and not(v.action_payload ? 'appendJob'))) then
    v_error:='That history operation is not supported by canonical authority yet.';
  end if;
  if v_error is null and v.action_kind = 'care_history.add' and v.action_payload ? 'appendJob' then
    if p_mode <> 'confirm' or v.explicit_intent
      or v.action_payload#>>'{appendJob,operation}' is distinct from 'append'
      or v.action_payload#>>'{appendJob,petId}' is distinct from v.pet_profile_id::text
      or v.action_payload#>>'{appendJob,sourceMessageId}' is distinct from v.source_message_id::text then
      raise exception 'APPEND_CAPABILITY_NOT_AUTHORIZED';
    end if;
    v_changed := private.persist_furvise_append_items(v.user_id,v.pet_profile_id,v.source_message_id,v.action_payload#>'{appendJob,items}');
    v_result := 'The requested records were added to care history.';
  elsif v_error is null and v.action_kind = 'care_history.add' then
    v_detail := nullif(btrim(v.action_payload#>>'{input,detail}'), '');
    v_title := nullif(btrim(v.action_payload#>>'{input,title}'), '');
    v_category := lower(regexp_replace(coalesce(v.action_payload#>>'{input,category}', ''), '[^a-z0-9]+', '_', 'g'));
    -- The canonical care writer runs before action execution. Reconcile only
    -- its exact owned source-turn effect, never an older similar observation.
    -- Existing source, ownership, cancellation and auto-authority checks above
    -- remain mandatory; the public wrapper still enforces expiry/freshness.
    if v.explicit_intent and v_detail is not null then
      for v_entry in
        select entry.* from public.pet_care_entries entry
        where entry.user_id = v.user_id and entry.pet_profile_id = v.pet_profile_id
          and entry.intelligence_source_message_id = v.source_message_id
          and entry.deleted_at is null
        for update
      loop
        v_same_turn_entries := v_same_turn_entries + 1;
      end loop;
      if v_same_turn_entries > 0 and (
        select count(*) from public.ask_action_capabilities sibling
        where sibling.user_id = v.user_id and sibling.pet_profile_id = v.pet_profile_id
          and sibling.source_message_id = v.source_message_id
          and sibling.action_kind = 'care_history.add'
      ) <> 1 then
        v_same_turn_entries := 2;
      end if;
    end if;
    if v_detail is null then
      v_error := 'That care-history update is incomplete.';
    elsif v_same_turn_entries > 1 then
      v_error := 'That save could not be matched to one care-history update.';
    elsif v_same_turn_entries = 1 then
      v_result := 'The update was added to care history.';
    else
      insert into public.pet_care_entries(
        user_id, pet_profile_id, category, title, note, occurred_at,
        intelligence_source_message_id, intelligence_source_type, idempotency_key
      ) values (
        v.user_id, v.pet_profile_id,
        case when v_category in ('symptom','food','medication','activity','grooming','vet_visit','behavior','general') then v_category else 'general' end,
        left(coalesce(v_title, 'Care update'), 120), left(v_detail, 1000), v_now,
        v.source_message_id, 'ask_application_action', v.id
      ) on conflict do nothing;
      get diagnostics v_row_count = row_count;
      v_changed := v_row_count > 0;
      if not v_changed and not exists (
        select 1 from public.pet_care_entries where user_id=v.user_id and pet_profile_id=v.pet_profile_id
          and idempotency_key=v.id
      ) then
        v_error := 'That update could not be added to care history.';
      else
        v_result := case when v_changed then 'The update was added to care history.' else 'That update was already in care history.' end;
      end if;
    end if;
  elsif v_error is null and v.action_kind in ('care_history.edit', 'care_history.remove') then
    select * into v_entry from public.pet_care_entries
    where id=v.target_id and user_id=v.user_id and pet_profile_id=v.pet_profile_id
      and deleted_at is null for update;
    if v_entry.id is null then
      v_error := 'The original history update is no longer available.';
    elsif v.action_kind = 'care_history.remove' then
      v_changed := private.remove_canonical_ask_care_entry(v);
      if v_changed then v_result := 'The history update was removed.';
      else v_error := 'The original history update is no longer available.';
      end if;
    else
      v_detail := v.action_payload#>>'{input,detail}';
      v_title := nullif(btrim(v.action_payload#>>'{input,title}'), '');
      v_category := lower(regexp_replace(coalesce(v.action_payload#>>'{input,category}', ''), '[^a-z0-9]+', '_', 'g'));
      if v_entry.updated_at is distinct from v.target_updated_at then
        v_error := 'That history update changed after this action was prepared.';
      elsif not private.canonical_ask_replace_safe(v.target_id,v.user_id,v.pet_profile_id) then
        v_error:='That record cannot be safely replaced without changing derived state.';
      elsif v_detail is null or btrim(v_detail) = '' then
        v_error := 'That care-history update is incomplete.';
      elsif char_length(v_detail) > 1000 then
        v_error := 'That care-history update exceeds the body limit.';
      else
        update public.pet_care_entries set
          note=v_detail,
          title=case when v_title is null then title else left(v_title,120) end,
          category=case when v_category in ('symptom','food','medication','activity','grooming','vet_visit','behavior','general') then v_category else category end,
          updated_at=v_now
        where id=v.target_id and user_id=v.user_id and pet_profile_id=v.pet_profile_id
          and deleted_at is null and updated_at = v.target_updated_at;
        get diagnostics v_row_count = row_count;
        v_changed := v_row_count > 0;
        if v_changed then v_result := 'The history update was edited.';
        else v_error := 'The original history update is no longer available.';
        end if;
      end if;
    end if;
  elsif v_error is null and v.action_kind in ('care_state.resolve', 'care_state.reopen') then
    select * into v_concern from public.pet_concerns
    where id=v.target_id and user_id=v.user_id and pet_profile_id=v.pet_profile_id
      and ((v.action_kind='care_state.resolve' and status in ('active','monitoring','reopened'))
        or (v.action_kind='care_state.reopen' and status='resolved'))
    for update;
    if v_concern.id is null then
      v_error := 'The original concern is no longer available.';
    elsif v.action_kind = 'care_state.resolve' then
      update public.pet_concerns set status='resolved',resolved_at=v_now,updated_at=v_now
      where id=v.target_id and user_id=v.user_id and pet_profile_id=v.pet_profile_id
        and status in ('active','monitoring','reopened');
      get diagnostics v_row_count = row_count;
      v_changed := v_row_count > 0;
      v_result := 'The concern was marked resolved.';
    else
      update public.pet_concerns set status='reopened',resolved_at=null,updated_at=v_now
      where id=v.target_id and user_id=v.user_id and pet_profile_id=v.pet_profile_id and status='resolved';
      get diagnostics v_row_count = row_count;
      v_changed := v_row_count > 0;
      v_result := 'The concern was reopened.';
    end if;
  elsif v_error is null and v.action_kind in ('pet.mark_deceased','pet.mark_active','pet.archive') then
    if v_pet.lifecycle_status is distinct from v.lifecycle_status_at_mint
      or v_pet.lifecycle_changed_at is distinct from v.lifecycle_changed_at_at_mint then
      v_error := 'The pet profile lifecycle changed after this action was prepared.';
    elsif (v.action_kind='pet.mark_deceased' and v_pet.lifecycle_status <> 'active')
      or (v.action_kind='pet.mark_active' and v_pet.lifecycle_status not in ('deceased','archived'))
      or (v.action_kind='pet.archive' and v_pet.lifecycle_status not in ('active','deceased')) then
      v_error := 'The pet profile state changed before this action was confirmed.';
    else
      update public.dog_profiles set lifecycle_status=case v.action_kind
        when 'pet.mark_deceased' then 'deceased'
        when 'pet.mark_active' then 'active'
        else 'archived' end
      where id=v.pet_profile_id and user_id=v.user_id;
      get diagnostics v_row_count = row_count;
      v_changed := v_row_count > 0;
      if v.action_kind='pet.mark_deceased' then
        insert into public.pet_care_entries(
          user_id,pet_profile_id,category,title,note,severity,occurred_at,
          intelligence_source_message_id,intelligence_source_type,idempotency_key,canonical_ask_isolated
        ) values (
          v.user_id,v.pet_profile_id,'general',left(coalesce(v_pet.name,'The pet') || ' died',120),
          left('Owner reported that ' || coalesce(v_pet.name,'the pet') || ' died. ' || (v.action_payload->>'evidence'),1000),
          'moderate',v_now,v.source_message_id,'ask_application_action',v.id,true
        ) on conflict do nothing;
        if not exists (
          select 1 from public.pet_care_entries where user_id=v.user_id and pet_profile_id=v.pet_profile_id
            and idempotency_key=v.id
        ) then
          raise exception using errcode = '23514', message = 'ACTION_CAPABILITY_DEATH_HISTORY_REQUIRED';
        end if;
        v_result := 'The profile was marked as passed away. Its history was preserved.';
      elsif v.action_kind='pet.mark_active' then
        v_result := 'The pet profile was marked active.';
      else
        v_result := 'The pet profile was archived.';
      end if;
    end if;
  elsif v_error is null and v.action_kind='pet.delete_permanently' then
    if p_mode<>'confirm' or private.canonical_remove_matches(v) is not true then
      v_error:='That removal requires canonical confirmed authority.';
    elsif clock_timestamp()>=v.expires_at then
      v_error:='That action expired before it was confirmed.';
    elsif v_pet.updated_at is distinct from v.target_updated_at then
      v_error:='That pet profile changed after this action was prepared.';
    else
      -- Persist the one Heart receipt before the cascade. Any deletion failure rolls it back.
      v_action:=v.action_payload||jsonb_build_object('id',v.id,'status','succeeded','resultMessage','The pet profile and its linked data were permanently deleted.','errorMessage',null);
      update public.ask_action_capabilities set status='succeeded',receipt=v_action,terminal_at=v_now,updated_at=v_now where id=v.id;
      delete from public.dog_profiles where id=v.pet_profile_id and user_id=v.user_id;
      get diagnostics v_row_count=row_count;
      if v_row_count<>1 then raise exception 'PET_REMOVE_RECEIPT_ATOMICITY_FAILED';end if;
      return query select v_action,true;
      return;
    end if;
  elsif v_error is null then
    -- Unsupported mutation kinds never fall back to response_data or application code.
    v_error := 'That action is not available yet.';
  end if;

  if v_error is null then
    v_action := v.action_payload || jsonb_build_object(
      'id',v.id,'status','succeeded','resultMessage',v_result,'errorMessage',null
    );
  else
    v_changed := false;
    v_action := v.action_payload || jsonb_build_object(
      'id',v.id,'status','failed','resultMessage',null,'errorMessage',v_error
    );
  end if;
  update public.ask_action_capabilities set
    status=case when v_action->>'status'='succeeded' then 'succeeded' else 'failed' end,
    receipt=v_action,terminal_at=v_now,updated_at=v_now
  where id=v.id;
  return query select v_action, v_changed;
end;
$function$;


revoke all on function private.validate_ask_action_capability() from public,anon,authenticated,service_role;
revoke all on function private.execute_ask_action_capability(uuid,uuid,uuid,text,uuid) from public,anon,authenticated,service_role;

-- A REMOVE receipt preserves every immutable payload field, not only its subject IDs.
alter table public.ask_action_capabilities add constraint canonical_remove_receipt_payload_check check (
 status='pending' or not(action_payload ? 'removeJob') or
 receipt-array['id','status','resultMessage','errorMessage']=action_payload-array['id','status','resultMessage','errorMessage']);
