-- Roll back the application to its previous ascending reader first.
begin;
set local lock_timeout='5s';
drop function public.read_ask_history_candidates_latest(uuid,text[],timestamptz,timestamptz,timestamptz,uuid,integer);
notify pgrst, 'reload schema';
commit;
