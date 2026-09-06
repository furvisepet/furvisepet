-- Run as postgres in the disposable DB after the latest-reader migration.
-- No fixtures or privilege changes survive this test.
begin;
create temporary table latest_readiness_baseline as
select failed_checks from public.furvise_security_compatibility_snapshot_v2('{}');
do $$ begin
 if exists(select 1 from latest_readiness_baseline where failed_checks && array['browser_security_definer_authority','ask_history_reader_authority','ask_history_latest_reader_authority']) then
  raise exception 'Reader readiness failed before mutation';
 end if;
end $$;
savepoint before_grant;
grant execute on function public.read_ask_history_candidates_latest(uuid,text[],timestamptz,timestamptz,timestamptz,uuid,integer) to anon;
do $$ declare failures text[]; begin
 select failed_checks into failures from public.furvise_security_compatibility_snapshot_v2('{}');
 if not ('ask_history_latest_reader_authority'=any(failures)) then raise exception 'Anonymous grant drift was not detected'; end if;
 if not ((select failed_checks from latest_readiness_baseline) <@ failures) then raise exception 'Existing failures were lost'; end if;
end $$;
rollback to before_grant;
savepoint before_definition;
alter function public.read_ask_history_candidates_latest(uuid,text[],timestamptz,timestamptz,timestamptz,uuid,integer) cost 123;
do $$ declare failures text[]; begin
 select failed_checks into failures from public.furvise_security_compatibility_snapshot_v2('{}');
 if not ('ask_history_latest_reader_authority'=any(failures)) then raise exception 'Definition drift was not detected'; end if;
end $$;
rollback to before_definition;
do $$ declare failures text[]; begin
 select failed_checks into failures from public.furvise_security_compatibility_snapshot_v2('{}');
 if failures is distinct from (select failed_checks from latest_readiness_baseline) then raise exception 'Readiness did not restore after rollback'; end if;
end $$;
rollback;
