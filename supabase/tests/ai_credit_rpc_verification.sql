begin;

do $$
declare
  v_user_one constant uuid := '10000000-0000-4000-8000-000000000001';
  v_user_two constant uuid := '20000000-0000-4000-8000-000000000002';
  v_request_one constant uuid := '10000000-0000-4000-8000-000000000011';
  v_request_two constant uuid := '10000000-0000-4000-8000-000000000012';
  v_request_three constant uuid := '10000000-0000-4000-8000-000000000013';
  v_request_four constant uuid := '10000000-0000-4000-8000-000000000014';
  v_user_two_request constant uuid := '20000000-0000-4000-8000-000000000021';
  v_result record;
  v_count integer;
begin
  insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at, email_confirmed_at)
  values
    (v_user_one, 'authenticated', 'authenticated', 'ai-credit-one@example.test', '', now(), now(), now()),
    (v_user_two, 'authenticated', 'authenticated', 'ai-credit-two@example.test', '', now(), now(), now())
  on conflict (id) do nothing;

  delete from public.ai_usage_events as usage_event
  where usage_event.user_id in (v_user_one, v_user_two);

  perform set_config('request.jwt.claim.sub', v_user_one::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  select * into v_result from public.reserve_ai_credit(v_request_one, 'ask', 2);
  if v_result.reservation_status <> 'reserved' or v_result.credits_used <> 1 then
    raise exception 'first reservation failed: %', row_to_json(v_result);
  end if;

  select * into v_result from public.reserve_ai_credit(v_request_two, 'product_question', 2);
  if v_result.reservation_status <> 'reserved' or v_result.credits_used <> 1 then
    raise exception 'second reservation failed: %', row_to_json(v_result);
  end if;

  select * into v_result from public.reserve_ai_credit(v_request_one, 'ask', 2);
  if v_result.reservation_status <> 'reserved' then
    raise exception 'repeated request ID was not idempotent: %', row_to_json(v_result);
  end if;
  select count(*)::integer into v_count
  from public.ai_usage_events as usage_event
  where usage_event.user_id = v_user_one
    and usage_event.request_id = v_request_one;
  if v_count <> 1 then
    raise exception 'repeated request ID created % rows', v_count;
  end if;

  select * into v_result from public.complete_ai_credit(v_request_one, 2);
  if v_result.event_status <> 'completed' or v_result.credits_used <> 1 or v_result.remaining <> 49 then
    raise exception 'completion failed: %', row_to_json(v_result);
  end if;

  select * into v_result from public.release_ai_credit(v_request_two, 2);
  if v_result.event_status <> 'released' or v_result.credits_used <> 0 then
    raise exception 'release failed: %', row_to_json(v_result);
  end if;

  select * into v_result from public.reserve_ai_credit(v_request_three, 'vet_brief', 2);
  if v_result.reservation_status <> 'reserved' then
    raise exception 'reservation after release failed: %', row_to_json(v_result);
  end if;
  select * into v_result from public.complete_ai_credit(v_request_three, 2);
  if v_result.event_status <> 'completed' or v_result.remaining <> 48 then
    raise exception 'second completion failed: %', row_to_json(v_result);
  end if;

  select coalesce(sum(usage_event.credits_used), 0)::integer into v_count
  from public.ai_usage_events as usage_event
  where usage_event.user_id = v_user_one
    and usage_event.period_start = date_trunc('month', timezone('utc', now()))::date
    and usage_event.status = 'completed';
  if v_count <> 2 then
    raise exception 'monthly usage expected 2, received %', v_count;
  end if;

  select * into v_result from public.reserve_ai_credit(v_request_four, 'care_plan', 2);
  if v_result.reservation_status <> 'reserved' or v_result.credits_used <> 1 or v_result.remaining <> 48 then
    raise exception 'caller allowance was not ignored: %', row_to_json(v_result);
  end if;

  perform set_config('request.jwt.claim.sub', v_user_two::text, true);
  select * into v_result from public.reserve_ai_credit(v_user_two_request, 'ask', 2);
  if v_result.reservation_status <> 'reserved' or v_result.remaining <> 50 then
    raise exception 'second user was not isolated: %', row_to_json(v_result);
  end if;
  select * into v_result from public.complete_ai_credit(v_user_two_request, 2);
  if v_result.event_status <> 'completed' or v_result.remaining <> 49 then
    raise exception 'second user completion failed: %', row_to_json(v_result);
  end if;

  select coalesce(sum(usage_event.credits_used), 0)::integer into v_count
  from public.ai_usage_events as usage_event
  where usage_event.user_id = v_user_one
    and usage_event.status = 'completed';
  if v_count <> 2 then
    raise exception 'second user changed first user usage: %', v_count;
  end if;
end;
$$;

rollback;
