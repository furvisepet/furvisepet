-- Business-level stale edits are HTTP conflicts, not retryable transaction failures.
-- Preserve the currently installed function body, owner, ACL, and security settings.
do $migration$
declare
  v_target regprocedure := pg_catalog.to_regprocedure('public.update_my_care_entry(uuid,uuid,timestamptz,text,text,text,text,timestamptz)');
  v_before pg_catalog.pg_proc%rowtype;
  v_after pg_catalog.pg_proc%rowtype;
  v_definition text;
  v_replacement text;
  v_match_count integer;
  v_old_clause constant text := 'errcode[[:space:]]*=[[:space:]]*''40001''[[:space:]]*,[[:space:]]*message[[:space:]]*=[[:space:]]*''CARE_ENTRY_STALE''';
begin
  if v_target is null then
    raise exception 'CARE_ENTRY_STALE_MIGRATION_TARGET_MISSING';
  end if;
  select * into strict v_before from pg_catalog.pg_proc where oid = v_target;
  v_definition := pg_catalog.pg_get_functiondef(v_target);
  select count(*) into v_match_count from pg_catalog.regexp_matches(v_definition, v_old_clause, 'gi');
  if v_match_count <> 2 then
    raise exception 'CARE_ENTRY_STALE_MIGRATION_CONTRACT_MISMATCH';
  end if;
  v_replacement := pg_catalog.regexp_replace(v_definition, v_old_clause, 'errcode = ''PT409'', message = ''CARE_ENTRY_STALE''', 'gi');
  execute v_replacement;
  select * into strict v_after from pg_catalog.pg_proc where oid = v_target;
  if v_after.proowner is distinct from v_before.proowner
    or v_after.proacl is distinct from v_before.proacl
    or v_after.prosecdef is distinct from v_before.prosecdef
    or v_after.proconfig is distinct from v_before.proconfig
    or v_after.proargtypes is distinct from v_before.proargtypes
    or v_after.prorettype is distinct from v_before.prorettype
    or v_after.proretset is distinct from v_before.proretset then
    raise exception 'CARE_ENTRY_STALE_MIGRATION_AUTHORITY_CHANGED';
  end if;
end;
$migration$;
