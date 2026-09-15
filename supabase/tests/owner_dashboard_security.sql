-- Read-only permission assertions. Run against the migrated database.
begin;
do $$
declare item record; role_name text;
begin
  assert (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and c.relname in
      ('owner_monitoring_config','owner_dashboard_exclusions','owner_activity_daily','owner_operational_events','owner_provider_costs'))=5,
    'All monitoring tables must exist';
  for item in select c.oid,c.relname,c.relrowsecurity,c.relforcerowsecurity
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and c.relname in
      ('owner_monitoring_config','owner_dashboard_exclusions','owner_activity_daily','owner_operational_events','owner_provider_costs')
  loop
    assert item.relrowsecurity and item.relforcerowsecurity, 'Monitoring must force RLS';
    foreach role_name in array array['anon','authenticated'] loop
      assert not has_table_privilege(role_name,item.oid,'SELECT,INSERT,UPDATE,DELETE'),
        'Client role must not access monitoring tables';
    end loop;
  end loop;
  for item in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in
      ('owner_dashboard_snapshot','owner_record_activity','owner_record_provider_cost')
  loop
    assert has_function_privilege('service_role',item.oid,'EXECUTE'), 'Server must have access';
    foreach role_name in array array['anon','authenticated'] loop
      assert not has_function_privilege(role_name,item.oid,'EXECUTE'), 'Client role must not execute monitoring functions';
    end loop;
  end loop;
  assert to_regprocedure('public.owner_dashboard_snapshot(integer,boolean,uuid,text)') is not null,
    'Snapshot migration must exist';
end $$;
rollback;
