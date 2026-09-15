-- pg_net only wakes the worker; the logged outbox remains the source of truth
-- if a networking queue is lost or the deployment is temporarily unavailable.
create extension if not exists pg_cron;
create extension if not exists pg_net;
revoke all on table net.http_request_queue from public,anon,authenticated;

create or replace function private.wake_owner_note_worker()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if exists(select 1 from public.owner_note_jobs where
    (status='pending' and available_at<=now()) or (status='processing' and lease_until<now())) then
    perform net.http_post(
      url:='https://www.furvise.com/api/internal/owner-note-enrichment',
      headers:=jsonb_build_object('Content-Type','application/json','Authorization',
        'Bearer ' || (select token from private.owner_note_worker_config where id)),
      body:='{}'::jsonb,timeout_milliseconds:=120000);
  end if;
end;
$$;
revoke all on function private.wake_owner_note_worker() from public,anon,authenticated;
select cron.schedule('furvise-owner-note-enrichment','* * * * *','select private.wake_owner_note_worker()');
