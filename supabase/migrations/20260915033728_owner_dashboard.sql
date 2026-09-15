create table public.owner_monitoring_config (id boolean primary key default true check(id), started_at timestamptz not null default now());
insert into public.owner_monitoring_config(id) values(true);
create table public.owner_dashboard_exclusions(user_id uuid primary key references auth.users(id) on delete cascade);
create table public.owner_activity_daily(user_id uuid not null references auth.users(id) on delete cascade, day date not null default (now() at time zone 'UTC')::date, last_seen_at timestamptz not null default now(), primary key(user_id,day));
create index owner_activity_day_idx on public.owner_activity_daily(day);
create table public.owner_operational_events(event_key text primary key,created_at timestamptz not null default now(),event_type text not null,feature text not null,severity text not null,error_code text,route text,request_id text,actor_hash text,duration_ms integer,metadata jsonb not null default '{}');
create index owner_events_created_idx on public.owner_operational_events(created_at desc);
create table public.owner_provider_costs(operation_id text not null,call_number integer not null,feature text not null,model text not null,reserved_microdollars bigint not null default 0,actual_microdollars bigint,created_at timestamptz not null default now(),primary key(operation_id,call_number));
create index owner_cost_created_idx on public.owner_provider_costs(created_at desc);
do $$ declare t text; begin
 foreach t in array array['owner_monitoring_config','owner_dashboard_exclusions','owner_activity_daily','owner_operational_events','owner_provider_costs'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('alter table public.%I force row level security',t);
 execute format('revoke all on public.%I from public, anon, authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
create function public.owner_record_activity(p_user uuid,p_feature text,p_error boolean default false) returns void language plpgsql security invoker set search_path='' as $$
begin
 if p_feature not in ('today','pets','history','ask','vet-brief','account','membership','products','settings','other') then raise exception 'Invalid feature'; end if;
 insert into public.owner_activity_daily(user_id) values(p_user) on conflict(user_id,day) do update set last_seen_at=now() where owner_activity_daily.last_seen_at < now()-interval '1 minute';
 if p_error then
 -- Coalesce untrusted browser reports to one per user/feature/minute. No error text is accepted.
 insert into public.owner_operational_events(event_key,event_type,feature,severity,error_code,route)
 values('browser:'||md5(p_user::text)||':'||p_feature||':'||date_trunc('minute',now())::text,'browser_report',p_feature,'warning','BROWSER_REPORTED_ERROR','/'||p_feature) on conflict do nothing;
 end if;
end $$;
create function public.owner_record_provider_cost(p_operation text,p_call integer,p_feature text,p_model text,p_reserved bigint,p_actual bigint default null) returns void language sql security invoker set search_path='' as $$
 insert into public.owner_provider_costs(operation_id,call_number,feature,model,reserved_microdollars,actual_microdollars) values(p_operation,p_call,p_feature,p_model,greatest(0,p_reserved),p_actual)
 on conflict(operation_id,call_number) do update set reserved_microdollars=greatest(owner_provider_costs.reserved_microdollars,excluded.reserved_microdollars),actual_microdollars=coalesce(excluded.actual_microdollars,owner_provider_costs.actual_microdollars);
$$;
create function public.owner_dashboard_snapshot(p_days integer,p_include_tests boolean,p_owner uuid,p_owner_hash text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 if p_days not in (1,7,30,90) then raise exception 'Invalid range'; end if;
 with users_all as (
 select u.id,u.email,u.created_at,u.email_confirmed_at,coalesce(b.plan,'free') plan,coalesce(b.subscription_status,'none') subscription_status,b.current_period_end,coalesce(b.cancel_at_period_end,false) cancel_at_period_end,
 (u.id=p_owner or x.user_id is not null) excluded,
 (coalesce(b.plan,'free')='plus' and b.subscription_status='active' and b.current_period_end>now()) subscribed
 from auth.users u left join public.billing_accounts b on b.user_id=u.id left join public.owner_dashboard_exclusions x on x.user_id=u.id
 where u.deleted_at is null and not coalesce(u.is_anonymous,false)
 ), users as (select * from users_all where p_include_tests or not excluded), activity as (
 select a.* from public.owner_activity_daily a join users u on u.id=a.user_id where a.day >= ((now() at time zone 'UTC')::date - (p_days-1))
 ), usage as (
 select a.* from public.ai_usage_events a join users u on u.id=a.user_id where a.created_at>=now()-make_interval(days=>p_days)
 ), events as (
 select * from public.owner_operational_events where created_at>=now()-make_interval(days=>p_days)
 ), feature_counts as (select feature,count(*) total,count(*) filter(where status='completed') completed,count(*) filter(where status='released') released,count(*) filter(where status='reserved') pending from usage group by feature),
 user_rows as (select u.*,greatest(0,extract(day from now()-u.created_at)::integer) account_days,(select max(last_seen_at) from public.owner_activity_daily a where a.user_id=u.id) last_seen from users u order by u.created_at desc limit 200),
 daily as (select d::date as day,(select count(*) from users u where (u.created_at at time zone 'UTC')::date=d::date) signups,(select count(*) from activity a where a.day=d::date) active from generate_series((now() at time zone 'UTC')::date-(p_days-1),(now() at time zone 'UTC')::date,interval '1 day') d)
 select jsonb_build_object(
 'updatedAt',now(),'trackingStartedAt',(select started_at from public.owner_monitoring_config where id),
 'overview',jsonb_build_object('users',(select count(*) from users),'signups',(select count(*) from users where created_at>=now()-make_interval(days=>p_days)), 'free',(select count(*) from users where plan='free'),'subscribers',(select count(*) from users where subscribed),'active',(select count(distinct user_id) from activity),'returning',(select count(*) from (select user_id from activity group by user_id having count(*)>1) r),'canceling',(select count(*) from users where subscribed and cancel_at_period_end),'paymentTrouble',(select count(*) from users where subscription_status in ('past_due','unpaid')),'unconfirmed',(select count(*) from users where email_confirmed_at is null)),
 'users',coalesce((select jsonb_agg(to_jsonb(r)) from user_rows r),'[]'),
 'features',coalesce((select jsonb_agg(to_jsonb(f)) from feature_counts f),'[]'),
 'daily',coalesce((select jsonb_agg(to_jsonb(d) order by day) from daily d),'[]'),
 'costs', (select jsonb_build_object('actual',coalesce(sum(actual_microdollars),0)/1000000.0,'pendingReserved',coalesce(sum(reserved_microdollars) filter(where actual_microdollars is null),0)/1000000.0,'calls',count(*),'unreconciled',count(*) filter(where actual_microdollars is null)) from public.owner_provider_costs where created_at>=now()-make_interval(days=>p_days)),
 'errorGroups',coalesce((select jsonb_agg(to_jsonb(g)) from (select feature,count(*) count from events where severity<>'info' group by feature order by count(*) desc) g),'[]'),
 'errors',coalesce((select jsonb_agg(to_jsonb(e)) from (select created_at,event_type,feature,severity,error_code,route,request_id,duration_ms from events where severity<>'info' order by created_at desc limit 100) e),'[]'),
 'askOutcomes',coalesce((select jsonb_agg(to_jsonb(a)) from (select coalesce(metadata->>'finalOutcome','unknown') outcome,count(*) count from events where event_type='ask_turn' group by 1) a),'[]')
 ) into result;
 return result;
end $$;
revoke all on function public.owner_record_activity(uuid,text,boolean),public.owner_record_provider_cost(text,integer,text,text,bigint,bigint),public.owner_dashboard_snapshot(integer,boolean,uuid,text) from public,anon,authenticated;
grant execute on function public.owner_record_activity(uuid,text,boolean),public.owner_record_provider_cost(text,integer,text,text,bigint,bigint),public.owner_dashboard_snapshot(integer,boolean,uuid,text) to service_role;
