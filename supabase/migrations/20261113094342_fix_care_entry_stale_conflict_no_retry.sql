-- Exact historical migration applied during the authorized production incident.
-- Do not replay manually: Supabase records this version as already applied.
-- The following reconciliation migration is idempotent on the repaired function.
DO $migration$
DECLARE
  source_sql text;
  old_marker constant text := 'errcode = ''40001''';
  new_marker constant text := 'errcode = ''PT409''';
  occurrence_count integer;
BEGIN
  SELECT pg_get_functiondef(p.oid)
    INTO source_sql
  FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname='public'
    AND p.proname='update_my_care_entry'
    AND pg_get_function_identity_arguments(p.oid) =
      'p_entry_id uuid, p_pet_profile_id uuid, p_expected_updated_at timestamp with time zone, p_category text, p_title text, p_note text, p_severity text, p_occurred_at timestamp with time zone';
  IF source_sql IS NULL THEN
    RAISE EXCEPTION 'Expected care update function signature not found; no change made';
  END IF;
  occurrence_count := (length(source_sql) - length(replace(source_sql, old_marker, ''))) / length(old_marker);
  IF occurrence_count != 2 THEN
    RAISE EXCEPTION 'Expected two retryable stale conflict raises; found %. No change made', occurrence_count;
  END IF;
  EXECUTE replace(source_sql, old_marker, new_marker);
END
$migration$;
