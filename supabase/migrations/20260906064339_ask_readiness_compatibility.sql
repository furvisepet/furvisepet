-- Keep existing readiness failures; admit only the reviewed Ask reader contracts.
do $migration$
declare definition text; needle text; replacement text;
begin
 definition:=pg_get_functiondef('public.furvise_security_compatibility_snapshot_v2_pre_billing(text[])'::regprocedure);
 needle:=$old$    'public.get_my_ask_allowance_status()',$old$;
 replacement:=$new$    'public.read_ask_history_candidates(uuid,text[],timestamptz,timestamptz,timestamptz,uuid,integer)',
    'public.read_ask_history_correction_page(uuid[],uuid[],uuid[],timestamptz,timestamptz,text[])',
    'public.read_ask_episode_sources(uuid,text[],uuid[],timestamptz,timestamptz)',
    'public.get_my_ask_allowance_status()',$new$;
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'Unexpected browser readiness definition'; end if;
 definition:=replace(definition,needle,replacement);
 needle:=$old$  foreach v_name in array v_protected_rpc_names loop$old$;
 replacement:=$new$  -- Exact definitions pin the reviewed bounded owner/pet checks, not just names.
  -- Future reader changes must update this contract with matching security tests.
  if exists (
    select 1 from (values
      ('public.read_ask_history_candidates(uuid,text[],timestamptz,timestamptz,timestamptz,uuid,integer)','20a5ff1db88c905d8cb3d0d36353bcfe','ask_history_candidate_reader'),
      ('public.read_ask_history_correction_page(uuid[],uuid[],uuid[],timestamptz,timestamptz,text[])','7c4b1db58d569f81caabc17d8b611111','postgres'),
      ('public.read_ask_episode_sources(uuid,text[],uuid[],timestamptz,timestamptz)','df7965345a0c326eaf89c3b923d7cf73','postgres')
    ) expected(signature,definition_hash,owner_name)
    left join pg_catalog.pg_proc p on p.oid=pg_catalog.to_regprocedure(expected.signature)
    left join pg_catalog.pg_roles r on r.oid=p.proowner
    where p.oid is null or not p.prosecdef or r.rolname<>expected.owner_name
      or pg_catalog.md5(pg_catalog.replace(pg_catalog.pg_get_functiondef(p.oid),pg_catalog.chr(13),''))<>expected.definition_hash
      or not pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
      or pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
      or pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE')
  ) then v_failures:=pg_catalog.array_append(v_failures,'ask_history_reader_authority'); end if;

  foreach v_name in array v_protected_rpc_names loop$new$;
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'Unexpected inventory loop'; end if;
 execute replace(definition,needle,replacement);
 definition:=pg_get_functiondef('public.furvise_security_compatibility_snapshot_v2_pre_protected_author(text[])'::regprocedure);
 needle:=$old$array['search_path=public, pg_temp']::text[]$old$;
 replacement:=$new$array[case when v_signature='public.persist_furvise_server_semantic_event(uuid,uuid,uuid,jsonb)' then 'search_path=pg_catalog' else 'search_path=public, pg_temp' end]::text[]$new$;
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'Unexpected care authority path check'; end if;
 execute replace(definition,needle,replacement);
end
$migration$;
notify pgrst,'reload schema';
