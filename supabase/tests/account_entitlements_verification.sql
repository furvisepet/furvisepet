begin;

do $$
declare
  v_free_user constant uuid := '31000000-0000-4000-8000-000000000001';
  v_plus_user constant uuid := '32000000-0000-4000-8000-000000000002';
  v_qa_user constant uuid := '33000000-0000-4000-8000-000000000003';
  v_other_user constant uuid := '34000000-0000-4000-8000-000000000004';
  v_request constant uuid := '35000000-0000-4000-8000-000000000005';
  v_entitlements record;
  v_credit record;
  v_audit_count integer;
  v_rejected boolean := false;
begin
  insert into auth.users (id, aud, role, email, encrypted_password, raw_app_meta_data, created_at, updated_at, email_confirmed_at)
  values
    (v_free_user, 'authenticated', 'authenticated', 'entitlement-free@example.test', '', '{}'::jsonb, now(), now(), now()),
    (v_plus_user, 'authenticated', 'authenticated', 'entitlement-plus@example.test', '', '{}'::jsonb, now(), now(), now()),
    (v_qa_user, 'authenticated', 'authenticated', 'entitlement-qa@example.test', '', '{}'::jsonb, now(), now(), now()),
    (v_other_user, 'authenticated', 'authenticated', 'entitlement-other@example.test', '', '{}'::jsonb, now(), now(), now())
  on conflict (id) do update set raw_app_meta_data = excluded.raw_app_meta_data, email_confirmed_at = excluded.email_confirmed_at;

  insert into public.billing_accounts (
    user_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, stripe_currency, checkout_price_id,
    plan, subscription_status, current_period_start, current_period_end
  ) values (
    v_plus_user, 'cus_entitlement_plus', 'sub_entitlement_plus', 'price_entitlement_plus', 'usd', 'price_entitlement_plus',
    'plus', 'active', now() - interval '1 day', now() + interval '29 days'
  ) on conflict (user_id) do update set
    plan = excluded.plan, subscription_status = excluded.subscription_status,
    current_period_start = excluded.current_period_start, current_period_end = excluded.current_period_end;

  if has_table_privilege('authenticated', 'public.account_access_grants', 'select')
    or has_table_privilege('authenticated', 'public.account_access_grants', 'insert')
    or has_table_privilege('authenticated', 'public.account_access_grants', 'update')
    or has_table_privilege('authenticated', 'public.account_access_audit', 'select') then
    raise exception 'authenticated role has direct account-access table privileges';
  end if;

  select * into strict v_entitlements from private.resolve_account_entitlements(v_free_user);
  if v_entitlements.access_role <> 'consumer' or v_entitlements.billing_plan <> 'free'
    or v_entitlements.effective_plan <> 'free' or v_entitlements.max_pets <> 1
    or v_entitlements.monthly_ai_credits <> 50 or v_entitlements.products_paid_functionality then
    raise exception 'free entitlements incorrect: %', row_to_json(v_entitlements);
  end if;

  select * into strict v_entitlements from private.resolve_account_entitlements(v_plus_user);
  if v_entitlements.access_role <> 'consumer' or v_entitlements.billing_plan <> 'plus'
    or v_entitlements.effective_plan <> 'plus' or v_entitlements.max_pets <> 10
    or v_entitlements.monthly_ai_credits <> 500 or not v_entitlements.products_paid_functionality then
    raise exception 'plus entitlements incorrect: %', row_to_json(v_entitlements);
  end if;

  insert into public.account_access_grants (user_id, access_role, enabled, reason, granted_by)
  values (v_qa_user, 'internal_qa', true, 'rollback-only entitlement verification', v_other_user);
  select * into strict v_entitlements from private.resolve_account_entitlements(v_qa_user);
  if v_entitlements.access_role <> 'internal_qa' or v_entitlements.billing_plan <> 'free'
    or v_entitlements.effective_plan <> 'plus' or v_entitlements.max_pets <> 1000
    or v_entitlements.monthly_ai_credits <> 100000
    or not v_entitlements.live_product_research or not v_entitlements.long_history_pattern_detection
    or not v_entitlements.vet_prep_exports or not v_entitlements.products_paid_functionality then
    raise exception 'internal QA entitlements incorrect: %', row_to_json(v_entitlements);
  end if;

  perform set_config('request.jwt.claim.sub', v_qa_user::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  insert into public.dog_profiles (user_id, name) values
    (v_qa_user, 'QA pet one'),
    (v_qa_user, 'QA pet two');

  update public.account_access_grants
  set enabled = false, revoked_at = now(), revoked_by = v_other_user, updated_at = now()
  where user_id = v_qa_user;
  select * into strict v_entitlements from private.resolve_account_entitlements(v_qa_user);
  if v_entitlements.access_role <> 'consumer' or v_entitlements.max_pets <> 1 then
    raise exception 'revocation did not immediately fall back: %', row_to_json(v_entitlements);
  end if;

  update public.account_access_grants
  set enabled = true, revoked_at = null, revoked_by = null,
    granted_at = now() - interval '2 minutes', expires_at = now() - interval '1 minute', updated_at = now()
  where user_id = v_qa_user;
  select * into strict v_entitlements from private.resolve_account_entitlements(v_qa_user);
  if v_entitlements.access_role <> 'consumer' or v_entitlements.max_pets <> 1 then
    raise exception 'expired grant did not fall back: %', row_to_json(v_entitlements);
  end if;

  select count(*)::integer into v_audit_count from public.account_access_audit where user_id = v_qa_user;
  if v_audit_count <> 3 then raise exception 'expected 3 append-only audit rows, found %', v_audit_count; end if;

  perform set_config('request.jwt.claim.sub', v_free_user::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  select * into strict v_entitlements from public.get_my_entitlements();
  if v_entitlements.billing_plan <> 'free' or v_entitlements.max_pets <> 1 then
    raise exception 'get_my_entitlements did not use auth.uid(): %', row_to_json(v_entitlements);
  end if;

  insert into public.dog_profiles (user_id, name) values (v_free_user, 'First pet');
  begin
    insert into public.dog_profiles (user_id, name) values (v_free_user, 'Second pet');
  exception when sqlstate 'P0001' then
    v_rejected := sqlerrm = 'PET_LIMIT_REACHED';
  end;
  if not v_rejected then raise exception 'free pet limit was not enforced'; end if;

  insert into public.ai_usage_events (user_id, request_id, feature, credits_used, status, period_start, allowance_period_key, completed_at)
  select v_free_user, gen_random_uuid(), 'ask', 1, 'completed', date_trunc('month', timezone('utc', now()))::date,
    'free:' || to_char(timezone('utc', now()), 'YYYY-MM'), now()
  from generate_series(1, 8);
  select * into strict v_credit from public.reserve_ai_credit(v_free_user, v_request, 'ask', repeat('a', 64));
  if v_credit.reservation_status <> 'limit_reached' or v_credit.remaining <> 0 then
    raise exception 'authenticated caller inflated its allowance: %', row_to_json(v_credit);
  end if;
end;
$$;

rollback;
