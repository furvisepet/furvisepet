-- Profile writes use the existing immutable version slot. Extend the
-- capability generation rule so pet.update_profile must carry a profile
-- updated_at snapshot, while unrelated actions remain unable to carry one.
alter table public.ask_action_capabilities
  drop constraint if exists ask_action_capabilities_version_binding_check;

alter table public.ask_action_capabilities
  add constraint ask_action_capabilities_version_binding_check check (
    (action_kind in ('care_history.edit','care_history.remove','care_state.resolve','care_state.reopen','pet.update_profile')
      and target_updated_at is not null)
    or
    (action_kind not in ('care_history.edit','care_history.remove','care_state.resolve','care_state.reopen','pet.update_profile')
      and target_updated_at is null)
  );

-- Public V1: typed pet-profile mutations execute through the same immutable
-- Ask capability authority as care-history writes. No question text is parsed
-- here. The capability payload must already contain a server-rebound
-- FieldMutationJob.

do $$
declare
  definition text;
  revised text;
  anchor text := E'  if new.action_kind in (''pet.mark_deceased'', ''pet.mark_active'', ''pet.archive'') then\n';
  replacement text := E'  if new.action_kind = ''pet.update_profile'' then\n'
    || E'    new.target_updated_at := v_pet.updated_at;\n'
    || E'  end if;\n'
    || anchor;
begin
  definition := pg_get_functiondef('private.validate_ask_action_capability()'::regprocedure);
  if position(anchor in definition) = 0 then
    raise exception 'PROFILE_CAPABILITY_FRESHNESS_ANCHOR_NOT_FOUND';
  end if;
  revised := replace(definition, anchor, replacement);
  if revised = definition then
    raise exception 'PROFILE_CAPABILITY_FRESHNESS_UNCHANGED';
  end if;
  execute revised;
end
$$;

do $$
declare
  definition text;
  revised text;
  anchor text := E'  elsif v_error is null and v.action_kind in (''care_state.resolve'', ''care_state.reopen'') then\n';
  branch text := E'  elsif v_error is null and v.action_kind = ''pet.update_profile'' then\n'
    || E'    if v.target_updated_at is null or v_pet.updated_at is distinct from v.target_updated_at then\n'
    || E'      v_error := ''The pet profile changed after this action was prepared.'';\n'
    || E'    elsif v.action_payload#>>''{fieldMutationJob,domain}'' is distinct from ''pet_profile''\n'
    || E'      or v.action_payload#>>''{fieldMutationJob,operation}'' is distinct from ''set_field''\n'
    || E'      or v.action_payload#>>''{fieldMutationJob,petId}'' is distinct from v.pet_profile_id::text\n'
    || E'      or v.action_payload#>>''{fieldMutationJob,sourceMessageId}'' is distinct from v.source_message_id::text then\n'
    || E'      v_error := ''That profile change is no longer valid.'';\n'
    || E'    elsif v.action_payload#>>''{fieldMutationJob,field}'' = ''weight'' then\n'
    || E'      if v.action_payload#>>''{fieldMutationJob,value,kind}'' is distinct from ''weight''\n'
    || E'        or jsonb_typeof(v.action_payload#>''{fieldMutationJob,value,value}'') <> ''number''\n'
    || E'        or (v.action_payload#>>''{fieldMutationJob,value,value}'')::numeric <= 0\n'
    || E'        or v.action_payload#>>''{fieldMutationJob,value,unit}'' not in (''kg'',''lb'') then\n'
    || E'        v_error := ''That profile value is invalid.'';\n'
    || E'      else\n'
    || E'        update public.dog_profiles set\n'
    || E'          weight_value=(v.action_payload#>>''{fieldMutationJob,value,value}'')::numeric,\n'
    || E'          weight_unit=v.action_payload#>>''{fieldMutationJob,value,unit}'', updated_at=v_now\n'
    || E'        where id=v.pet_profile_id and user_id=v.user_id and updated_at=v.target_updated_at;\n'
    || E'        get diagnostics v_row_count = row_count;\n'
    || E'      end if;\n'
    || E'    elsif v.action_payload#>>''{fieldMutationJob,field}'' = ''sex'' then\n'
    || E'      if v.action_payload#>>''{fieldMutationJob,value,kind}'' is distinct from ''sex''\n'
    || E'        or v.action_payload#>>''{fieldMutationJob,value,value}'' not in (''female'',''male'',''not_sure'') then\n'
    || E'        v_error := ''That profile value is invalid.'';\n'
    || E'      else\n'
    || E'        update public.dog_profiles set sex=v.action_payload#>>''{fieldMutationJob,value,value}'', updated_at=v_now\n'
    || E'        where id=v.pet_profile_id and user_id=v.user_id and updated_at=v.target_updated_at;\n'
    || E'        get diagnostics v_row_count = row_count;\n'
    || E'      end if;\n'
    || E'    elsif v.action_payload#>>''{fieldMutationJob,field}'' in (''name'',''breed'',''current_food'',''routine_note'') then\n'
    || E'      if v.action_payload#>>''{fieldMutationJob,value,kind}'' is distinct from ''text''\n'
    || E'        or nullif(btrim(v.action_payload#>>''{fieldMutationJob,value,value}''), '''') is null\n'
    || E'        or btrim(v.action_payload#>>''{fieldMutationJob,value,value}'') is distinct from v.action_payload#>>''{fieldMutationJob,value,value}''\n'
    || E'        or (v.action_payload#>>''{fieldMutationJob,field}'' in (''name'',''breed'',''current_food'')\n'
    || E'          and length(v.action_payload#>>''{fieldMutationJob,value,value}'') > 300)\n'
    || E'        or length(v.action_payload#>>''{fieldMutationJob,value,value}'') > 500 then\n'
    || E'        v_error := ''That profile value is invalid.'';\n'
    || E'      else\n'
    || E'        update public.dog_profiles set\n'
    || E'          name=case when v.action_payload#>>''{fieldMutationJob,field}''=''name'' then v.action_payload#>>''{fieldMutationJob,value,value}'' else name end,\n'
    || E'          breed=case when v.action_payload#>>''{fieldMutationJob,field}''=''breed'' then v.action_payload#>>''{fieldMutationJob,value,value}'' else breed end,\n'
    || E'          current_food=case when v.action_payload#>>''{fieldMutationJob,field}''=''current_food'' then v.action_payload#>>''{fieldMutationJob,value,value}'' else current_food end,\n'
    || E'          routine_note=case when v.action_payload#>>''{fieldMutationJob,field}''=''routine_note'' then v.action_payload#>>''{fieldMutationJob,value,value}'' else routine_note end,\n'
    || E'          updated_at=v_now\n'
    || E'        where id=v.pet_profile_id and user_id=v.user_id and updated_at=v.target_updated_at;\n'
    || E'        get diagnostics v_row_count = row_count;\n'
    || E'      end if;\n'
    || E'    else\n'
    || E'      v_error := ''That profile field is not available.'';\n'
    || E'    end if;\n'
    || E'    if v_error is null then\n'
    || E'      v_changed := v_row_count > 0;\n'
    || E'      if v_changed then v_result := ''The pet profile was updated.'';\n'
    || E'      else v_error := ''The pet profile changed before this action could be applied.''; end if;\n'
    || E'    end if;\n'
    || anchor;
begin
  definition := pg_get_functiondef(
    'private.execute_ask_action_capability(uuid,uuid,uuid,text,uuid)'::regprocedure
  );
  if position(anchor in definition) = 0 then
    raise exception 'PROFILE_EXECUTOR_ANCHOR_NOT_FOUND';
  end if;
  revised := replace(definition, anchor, branch);
  if revised = definition then
    raise exception 'PROFILE_EXECUTOR_UNCHANGED';
  end if;
  execute revised;
end
$$;

revoke all on function private.validate_ask_action_capability()
  from public,anon,authenticated,service_role;
revoke all on function private.execute_ask_action_capability(uuid,uuid,uuid,text,uuid)
  from public,anon,authenticated,service_role;
