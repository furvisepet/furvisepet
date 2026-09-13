begin;
set local request.jwt.claim.role='service_role';
-- Disposable database uses direct SQL; this test-only receipt rolls back.
insert into supabase_migrations.schema_migrations(version,name) values('00000000000000','ask_readiness_test_fixture');
create function pg_temp.assert_readiness(expected text[]) returns void language plpgsql as $$
declare failures text[];
begin
 select failed_checks into failures from public.furvise_security_compatibility_snapshot_v2(array['ask_readiness_test_fixture']);
 if failures is distinct from expected then raise exception 'Readiness mismatch: expected %, actual %',expected,failures; end if;
end $$;
select pg_temp.assert_readiness(array['browser_security_definer_authority','canonical_care_state_authority']);
\i /tmp/ask-readiness-fix.sql
select pg_temp.assert_readiness('{}');
savepoint drift;
grant execute on function public.read_ask_episode_sources(uuid,text[],uuid[],timestamptz,timestamptz) to anon;
select pg_temp.assert_readiness(array['ask_history_reader_authority']);
rollback to drift;
grant execute on function public.read_ask_episode_sources(uuid,text[],uuid[],timestamptz,timestamptz) to service_role;
select pg_temp.assert_readiness(array['ask_history_reader_authority']);
rollback to drift;
alter function public.read_ask_episode_sources(uuid,text[],uuid[],timestamptz,timestamptz) set search_path=public;
select pg_temp.assert_readiness(array['ask_history_reader_authority']);
rollback to drift;
create function public.unexpected_readiness_probe() returns integer language sql security definer as 'select 1';
select pg_temp.assert_readiness(array['browser_security_definer_authority']);
rollback to drift;
alter function public.persist_furvise_server_semantic_event(uuid,uuid,uuid,jsonb) set search_path=public,pg_temp;
select pg_temp.assert_readiness(array['canonical_care_state_authority']);
rollback to drift;
select pg_temp.assert_readiness('{}');
rollback;
