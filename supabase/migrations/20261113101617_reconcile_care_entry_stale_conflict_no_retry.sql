-- Idempotent source reconciliation of live incident migration 20261113094342.
-- Change only the two stale optimistic-lock errors, preserving the installed
-- definition, signature, owner, ACL, SECURITY DEFINER and empty search_path.
-- A stale edit is HTTP 409, not a transaction serialization failure to retry.
DO $migration$
DECLARE
  source_sql text;
  old_marker constant text := 'errcode = ''40001'', message = ''CARE_ENTRY_STALE''';
  new_marker constant text := 'errcode = ''PT409'', message = ''CARE_ENTRY_STALE''';
  old_count integer;
  new_count integer;
  function_id regprocedure := to_regprocedure('public.update_my_care_entry(uuid,uuid,timestamp with time zone,text,text,text,text,timestamp with time zone)');
BEGIN
  IF function_id IS NULL THEN
    RAISE EXCEPTION 'Expected care update function signature not found; no change made';
  END IF;
  source_sql := pg_get_functiondef(function_id);
  old_count := (length(source_sql) - length(replace(source_sql, old_marker, ''))) / length(old_marker);
  new_count := (length(source_sql) - length(replace(source_sql, new_marker, ''))) / length(new_marker);
  IF old_count = 0 AND new_count = 2 THEN
    RETURN; -- Already repaired: do not recreate or overwrite the live function.
  END IF;
  IF old_count <> 2 OR new_count <> 0 THEN
    RAISE EXCEPTION 'Unexpected stale-conflict definition (old %, new %); no change made', old_count, new_count;
  END IF;
  EXECUTE replace(source_sql, old_marker, new_marker);
END
$migration$;
