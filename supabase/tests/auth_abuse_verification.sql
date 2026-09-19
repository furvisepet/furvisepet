begin;

do $$
declare
  v_unconfirmed constant uuid := '30000000-0000-4000-8000-000000000303';
  v_confirmed constant uuid := '40000000-0000-4000-8000-000000000404';
  v_request constant uuid := '70000000-0000-4000-8000-000000000707';
  v_denied boolean := false;
  v_count integer;
begin
  insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at, email_confirmed_at)
  values
    (v_unconfirmed, 'authenticated', 'authenticated', 'unconfirmed@example.test', '', now(), now(), null),
    (v_confirmed, 'authenticated', 'authenticated', 'confirmed@example.test', '', now(), now(), now())
  on conflict (id) do update set email_confirmed_at = excluded.email_confirmed_at;

  delete from public.ai_usage_events where user_id in (v_unconfirmed, v_confirmed);
  delete from public.user_profiles where user_id in (v_unconfirmed, v_confirmed);

  perform set_config('request.jwt.claim.sub', v_unconfirmed::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  begin
    perform public.reserve_ai_credit(v_unconfirmed, v_request, 'ask', repeat('a', 64));
  exception when insufficient_privilege then v_denied := true;
  end;
  if not v_denied then raise exception 'unconfirmed user reserved AI credit'; end if;
  select count(*)::integer into v_count from public.ai_usage_events where user_id = v_unconfirmed;
  if v_count <> 0 then raise exception 'unconfirmed denial wrote % usage rows', v_count; end if;

  insert into public.user_profiles(user_id) values (v_unconfirmed) on conflict (user_id) do nothing;
  insert into public.user_profiles(user_id) values (v_unconfirmed) on conflict (user_id) do nothing;
  select count(*)::integer into v_count from public.user_profiles where user_id = v_unconfirmed;
  if v_count <> 1 then raise exception 'workspace bootstrap created % rows', v_count; end if;

  perform set_config('request.jwt.claim.sub', v_confirmed::text, true);
  perform public.reserve_ai_credit(v_confirmed, v_request, 'ask', repeat('a', 64));
  select count(*)::integer into v_count from public.ai_usage_events where user_id = v_confirmed and request_id = v_request;
  if v_count <> 1 then raise exception 'confirmed user did not receive one canonical reservation'; end if;
end;
$$;

rollback;
