-- Read auth counts through this narrowly scoped, service-only function rather than granting table-wide access.
alter function public.owner_dashboard_snapshot(integer,boolean,uuid,text) security definer;
alter function public.owner_dashboard_snapshot(integer,boolean,uuid,text) owner to postgres;
revoke all on function public.owner_dashboard_snapshot(integer,boolean,uuid,text) from public,anon,authenticated;
grant execute on function public.owner_dashboard_snapshot(integer,boolean,uuid,text) to service_role;
