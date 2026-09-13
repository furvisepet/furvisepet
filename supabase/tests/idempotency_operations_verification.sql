begin;

do $$
declare
  v_user_one constant uuid := '10000000-0000-4000-8000-000000000101';
  v_user_two constant uuid := '20000000-0000-4000-8000-000000000202';
  v_key constant uuid := '70000000-0000-4000-8000-000000000001';
  v_claim record;
  v_owner uuid;
  v_denied boolean := false;
begin
  insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
  values
    (v_user_one, 'authenticated', 'authenticated', 'idempotency-one@example.test', '', now(), now()),
    (v_user_two, 'authenticated', 'authenticated', 'idempotency-two@example.test', '', now(), now())
  on conflict (id) do nothing;

  perform set_config('request.jwt.claim.role', 'service_role', true);
  select * into v_claim from public.claim_idempotency_operation(v_user_one, 'test.write', v_key, repeat('a', 64), 3600, 30);
  if v_claim.claim_outcome <> 'new' or v_claim.owner_token is null then raise exception 'new claim failed: %', row_to_json(v_claim); end if;
  v_owner := v_claim.owner_token;

  select * into v_claim from public.claim_idempotency_operation(v_user_one, 'test.write', v_key, repeat('a', 64), 3600, 30);
  if v_claim.claim_outcome <> 'in_progress' then raise exception 'concurrent claim was not blocked: %', row_to_json(v_claim); end if;

  select * into v_claim from public.claim_idempotency_operation(v_user_one, 'test.write', v_key, repeat('b', 64), 3600, 30);
  if v_claim.claim_outcome <> 'conflict' then raise exception 'payload conflict was not detected: %', row_to_json(v_claim); end if;

  if not public.complete_idempotency_operation(v_user_one, 'test.write', v_key, v_owner, 201, '{"ok":true}'::jsonb, 'test', null) then raise exception 'completion failed'; end if;
  select * into v_claim from public.claim_idempotency_operation(v_user_one, 'test.write', v_key, repeat('a', 64), 3600, 30);
  if v_claim.claim_outcome <> 'completed' or v_claim.response_status <> 201 or v_claim.response_body <> '{"ok":true}'::jsonb then raise exception 'completed replay failed: %', row_to_json(v_claim); end if;

  select * into v_claim from public.claim_idempotency_operation(v_user_two, 'test.write', v_key, repeat('a', 64), 3600, 30);
  if v_claim.claim_outcome <> 'new' then raise exception 'second user did not receive isolated scope: %', row_to_json(v_claim); end if;

  perform set_config('request.jwt.claim.role', 'authenticated', true);
  begin
    perform public.claim_idempotency_operation(v_user_one, 'test.forbidden', gen_random_uuid(), repeat('c', 64), 3600, 30);
  exception when insufficient_privilege then v_denied := true;
  end;
  if not v_denied then raise exception 'authenticated role executed service-only idempotency claim'; end if;
end;
$$;

rollback;
