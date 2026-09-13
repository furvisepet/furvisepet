begin;

-- Follow the original reader migration's temporary DDL privilege pattern.
-- This NOLOGIN role loses CREATE before the atomic transaction commits.
grant create on schema public to ask_history_candidate_reader;

-- Literal lexical search supports the same multilingual words as the planner.
-- Keep every ownership, subscription, limit, timeout and grant check intact.
do $migration$
declare
  signature text;
  expected_hash text;
  definition text;
  updated_hash text;
  readiness text := pg_get_functiondef('public.furvise_security_compatibility_snapshot_v2_pre_billing(text[])'::regprocedure);
  old_pattern text := '^[A-Za-z][A-Za-z -]*[A-Za-z]$';
begin
  for signature, expected_hash in select * from (values
    ('public.read_ask_history_candidates(uuid,text[],timestamptz,timestamptz,timestamptz,uuid,integer)', '20a5ff1db88c905d8cb3d0d36353bcfe'),
    ('public.read_ask_history_candidates_latest(uuid,text[],timestamptz,timestamptz,timestamptz,uuid,integer)', '3a7a7f2ee18d6ec9eaf0e91d052268fb')
  ) as readers(signature, expected_hash) loop
    definition := pg_get_functiondef(signature::regprocedure);
    if md5(replace(definition,chr(13),'')) <> expected_hash
      or (length(definition)-length(replace(definition,old_pattern,'')))/length(old_pattern) <> 1
      or (length(readiness)-length(replace(readiness,expected_hash,'')))/length(expected_hash) <> 1 then
      raise exception 'Unexpected reader or readiness definition';
    end if;
    -- postgres already has SET membership in this existing NOLOGIN owner role.
    set local role ask_history_candidate_reader;
    execute replace(definition,old_pattern,'^[[:alnum:]][[:alnum:] -]*[[:alnum:]]$');
    reset role;
    updated_hash := md5(replace(pg_get_functiondef(signature::regprocedure),chr(13),''));
    -- Update only the exact definition pin for this intentional validator change.
    -- No authority check is removed or made conditional.
    readiness := replace(readiness,expected_hash,updated_hash);
  end loop;
  execute readiness;
end
$migration$;

revoke create on schema public from ask_history_candidate_reader;
notify pgrst, 'reload schema';
commit;
