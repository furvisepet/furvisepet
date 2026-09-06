-- Roll back the application to its previous ascending reader first.
begin;
set local lock_timeout='5s';
do $readiness$
declare definition text; start_at integer; end_at integer; needle text;
begin
  definition := pg_get_functiondef('public.furvise_security_compatibility_snapshot_v2_pre_billing(text[])'::regprocedure);
  needle := '    ''public.read_ask_history_candidates_latest(uuid,text[],timestamptz,timestamptz,timestamptz,uuid,integer)'','||chr(10);
  if (length(definition)-length(replace(definition,needle,'')))/length(needle) <> 1 then raise exception 'Unexpected latest reader allowlist'; end if;
  definition := replace(definition,needle,'');
  start_at := strpos(definition,'  -- BEGIN ASK LATEST READER AUTHORITY');
  end_at := strpos(definition,'  -- END ASK LATEST READER AUTHORITY');
  if start_at=0 or end_at<=start_at then raise exception 'Missing latest authority block'; end if;
  definition := substring(definition from 1 for start_at-1)||substring(definition from end_at+length('  -- END ASK LATEST READER AUTHORITY'));
  execute definition;
end
$readiness$;
drop function public.read_ask_history_candidates_latest(uuid,text[],timestamptz,timestamptz,timestamptz,uuid,integer);
notify pgrst, 'reload schema';
commit;
