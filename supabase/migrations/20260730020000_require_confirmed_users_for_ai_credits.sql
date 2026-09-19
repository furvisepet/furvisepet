create or replace function public.reserve_ai_credit(
  p_request_id uuid,
  p_feature text,
  p_allowance integer default 50
)
returns table(reservation_status text, credits_used integer, remaining integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_period_start date := date_trunc('month', timezone('utc', now()))::date;
  v_existing public.ai_usage_events%rowtype;
  v_committed integer := 0;
  v_reserved integer := 0;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'AUTH_REQUIRED'; end if;
  if not exists (
    select 1 from auth.users as auth_user
    where auth_user.id = v_user_id
      and auth_user.email_confirmed_at is not null
      and coalesce(auth_user.is_anonymous, false) = false
  ) then raise exception using errcode = '42501', message = 'EMAIL_CONFIRMATION_REQUIRED'; end if;
  if p_request_id is null then raise exception using errcode = '22023', message = 'REQUEST_ID_REQUIRED'; end if;
  if p_feature not in ('ask', 'product_question', 'product_explanation', 'safety_followup', 'vet_brief', 'care_plan') then raise exception using errcode = '22023', message = 'INVALID_AI_FEATURE'; end if;
  if p_allowance < 1 then raise exception using errcode = '22023', message = 'INVALID_AI_ALLOWANCE'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':' || v_period_start::text, 0));
  select usage_event.* into v_existing from public.ai_usage_events as usage_event
  where usage_event.user_id = v_user_id and usage_event.request_id = p_request_id;
  select
    coalesce(sum(monthly_usage.credits_used) filter (where monthly_usage.status = 'completed'), 0),
    coalesce(sum(monthly_usage.credits_used) filter (where monthly_usage.status in ('reserved', 'completed')), 0)
  into v_committed, v_reserved from public.ai_usage_events as monthly_usage
  where monthly_usage.user_id = v_user_id and monthly_usage.period_start = v_period_start;

  if v_existing.id is not null and v_existing.status in ('reserved', 'completed') then
    return query select v_existing.status, v_existing.credits_used, greatest(0, p_allowance - v_committed); return;
  end if;
  if v_reserved >= p_allowance then return query select 'limit_reached'::text, 0, greatest(0, p_allowance - v_committed); return; end if;
  if v_existing.id is not null and v_existing.status = 'released' then
    update public.ai_usage_events as usage_event set feature = p_feature, credits_used = 1, status = 'reserved', period_start = v_period_start, created_at = now(), completed_at = null where usage_event.id = v_existing.id;
  else
    insert into public.ai_usage_events as usage_event (user_id, request_id, feature, credits_used, status, period_start)
    values (v_user_id, p_request_id, p_feature, 1, 'reserved', v_period_start);
  end if;
  return query select 'reserved'::text, 1, greatest(0, p_allowance - v_committed);
end;
$$;

revoke all on function public.reserve_ai_credit(uuid, text, integer) from public, anon;
grant execute on function public.reserve_ai_credit(uuid, text, integer) to authenticated;
