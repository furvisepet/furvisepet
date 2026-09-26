-- Public V1: owner preference FieldMutationJobs execute through the same
-- immutable Ask capability executor. The executor consumes only the rebound
-- typed job persisted in action_payload. No user wording is interpreted here.

do $$
declare
  definition text;
  revised text;
  anchor text := E'  elsif v_error is null and v.action_kind in (''care_state.resolve'', ''care_state.reopen'') then\n';
  branch text := E'  elsif v_error is null and v.action_kind in (''memory.set_preference'', ''memory.forget_preference'') then\n'
    || E'    if v.action_payload#>>''{fieldMutationJob,domain}'' is distinct from ''owner_preference''\n'
    || E'      or v.action_payload#>>''{fieldMutationJob,ownerId}'' is distinct from v.user_id::text\n'
    || E'      or v.action_payload#>>''{fieldMutationJob,sourceMessageId}'' is distinct from v.source_message_id::text\n'
    || E'      or v.action_payload#>>''{fieldMutationJob,field}'' not in (''preferred_language'',''preferred_units'',''communication_style'') then\n'
    || E'      v_error := ''That preference change is no longer valid.'';\n'
    || E'    elsif v.action_kind = ''memory.set_preference'' then\n'
    || E'      if v.action_payload#>>''{fieldMutationJob,operation}'' is distinct from ''set_field''\n'
    || E'        or v.action_payload#>>''{fieldMutationJob,value,kind}'' is distinct from ''text''\n'
    || E'        or nullif(btrim(v.action_payload#>>''{fieldMutationJob,value,value}''), '''') is null\n'
    || E'        or length(v.action_payload#>>''{fieldMutationJob,value,value}'') > 100\n'
    || E'        or not public.is_valid_furvise_preference(''communication_preference'',\n'
    || E'          v.action_payload#>>''{fieldMutationJob,field}'', v.action_payload#>>''{fieldMutationJob,value,value}'',\n'
    || E'          v.action_payload#>>''{fieldMutationJob,instruction,text}'', true) then\n'
    || E'        v_error := ''That preference value is invalid.'';\n'
    || E'      else\n'
    || E'        insert into public.furvise_memories(\n'
    || E'          user_id,pet_id,subject_type,category,fact_key,fact_value,normalized_value,\n'
    || E'          confidence,importance,durability,status,source_type,source_id,source_excerpt,dedupe_key,\n'
    || E'          first_observed_at,last_confirmed_at,observed_at,base_confidence,current_confidence\n'
    || E'        ) values (\n'
    || E'          v.user_id,null,''owner'',''communication_preference'',v.action_payload#>>''{fieldMutationJob,field}'',\n'
    || E'          to_jsonb(v.action_payload#>>''{fieldMutationJob,value,value}''),\n'
    || E'          lower(regexp_replace(btrim(v.action_payload#>>''{fieldMutationJob,value,value}''), ''[^[:alnum:]]+'', '' '', ''g'')),\n'
    || E'          1,''high'',''durable'',''active'',''ask_message'',v.source_message_id,\n'
    || E'          v.action_payload#>>''{fieldMutationJob,instruction,text}'',\n'
    || E'          md5(v.user_id::text || '':'' || v.id::text || '':'' || v.action_payload#>>''{fieldMutationJob,field}'' || '':'' || lower(v.action_payload#>>''{fieldMutationJob,value,value}'')),\n'
    || E'          v_now,v_now,v_now,1,1\n'
    || E'        );\n'
    || E'        get diagnostics v_row_count = row_count;\n'
    || E'        v_changed := v_row_count > 0;\n'
    || E'        if v_changed then v_result := ''The preference was updated.''; else v_error := ''That preference could not be updated.''; end if;\n'
    || E'      end if;\n'
    || E'    else\n'
    || E'      if v.action_payload#>>''{fieldMutationJob,operation}'' is distinct from ''clear_field''\n'
    || E'        or jsonb_typeof(v.action_payload#>''{fieldMutationJob,value}'') is distinct from ''null''\n'
    || E'        or jsonb_typeof(v.action_payload#>''{fieldMutationJob,valueSource}'') is distinct from ''null'' then\n'
    || E'        v_error := ''That preference removal is no longer valid.'';\n'
    || E'      else\n'
    || E'        update public.furvise_memories set status=''rejected'',updated_at=v_now\n'
    || E'        where id = (\n'
    || E'          select m.id from public.furvise_memories m\n'
    || E'          where m.user_id=v.user_id and m.subject_type=''owner'' and m.pet_id is null\n'
    || E'            and m.status=''active'' and public.normalize_furvise_preference_key(m.fact_key)=v.action_payload#>>''{fieldMutationJob,field}''\n'
    || E'          order by m.last_confirmed_at desc,m.id desc limit 1 for update\n'
    || E'        );\n'
    || E'        get diagnostics v_row_count = row_count;\n'
    || E'        v_changed := v_row_count > 0;\n'
    || E'        v_result := case when v_changed then ''The preference was forgotten.'' else ''That preference was already absent.'' end;\n'
    || E'      end if;\n'
    || E'    end if;\n'
    || anchor;
begin
  definition := pg_get_functiondef(
    'private.execute_ask_action_capability(uuid,uuid,uuid,text,uuid)'::regprocedure
  );
  if position(anchor in definition) = 0 then
    raise exception 'OWNER_PREFERENCE_EXECUTOR_ANCHOR_NOT_FOUND';
  end if;
  revised := replace(definition, anchor, branch);
  if revised = definition then
    raise exception 'OWNER_PREFERENCE_EXECUTOR_UNCHANGED';
  end if;
  execute revised;
end
$$;

revoke all on function private.execute_ask_action_capability(uuid,uuid,uuid,text,uuid)
  from public,anon,authenticated,service_role;
