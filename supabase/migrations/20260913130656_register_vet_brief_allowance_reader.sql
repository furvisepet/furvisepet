-- Register the exact reviewed, zero-argument self-reader. Preserve rejection of
-- unknown SECURITY DEFINER functions and all protected RPC overload checks.
do $migration$
declare
 definition text;
 signature_marker constant text := '    ''public.get_my_ask_allowance_status()'',';
 name_marker constant text := '    ''get_my_ask_allowance_status'',';
 check_marker constant text := '  foreach v_name in array v_protected_rpc_names loop';
 reviewed_hash constant text := '6832d09c17bfc1762d82fe6b050c078e';
begin
 if md5(replace(pg_get_functiondef('public.get_my_vet_brief_allowance_status()'::regprocedure),chr(13),'')) <> reviewed_hash then
   raise exception 'Vet Brief allowance reader does not match reviewed implementation';
 end if;
 definition:=pg_get_functiondef('public.furvise_security_compatibility_snapshot_v2_pre_billing(text[])'::regprocedure);
 if (length(definition)-length(replace(definition,signature_marker,'')))/length(signature_marker)<>1
   or (length(definition)-length(replace(definition,name_marker,'')))/length(name_marker)<>1
   or (length(definition)-length(replace(definition,check_marker,'')))/length(check_marker)<>1 then
   raise exception 'Unexpected browser authority compatibility definition';
 end if;
 definition:=replace(definition,signature_marker,signature_marker||E'\n    ''public.get_my_vet_brief_allowance_status()'',');
 definition:=replace(definition,name_marker,name_marker||E'\n    ''get_my_vet_brief_allowance_status'',');
 definition:=replace(definition,check_marker,$check$
  if pg_catalog.to_regprocedure('public.get_my_vet_brief_allowance_status()') is null then
    v_failures:=pg_catalog.array_append(v_failures,'vet_brief_allowance_reader_definition');
  elsif pg_catalog.md5(pg_catalog.replace(pg_catalog.pg_get_functiondef('public.get_my_vet_brief_allowance_status()'::regprocedure),pg_catalog.chr(13),'')) <> '6832d09c17bfc1762d82fe6b050c078e'
    or pg_catalog.has_function_privilege('anon','public.get_my_vet_brief_allowance_status()','EXECUTE')
    or not pg_catalog.has_function_privilege('authenticated','public.get_my_vet_brief_allowance_status()','EXECUTE') then
    v_failures:=pg_catalog.array_append(v_failures,'vet_brief_allowance_reader_definition');
  end if;
$check$||check_marker);
 execute definition;
end;
$migration$;
