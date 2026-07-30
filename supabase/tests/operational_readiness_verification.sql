begin;

do $$
declare
  v_user_a constant uuid := '81000000-0000-4000-8000-000000000081';
  v_user_b constant uuid := '82000000-0000-4000-8000-000000000082';
  v_key constant uuid := '83000000-0000-4000-8000-000000000083';
  v_hash constant text := repeat('a', 64);
  v_count integer;
  v_denied boolean := false;
begin
  insert into auth.users(id, aud, role, email, encrypted_password, created_at, updated_at, email_confirmed_at)
  values
    (v_user_a, 'authenticated', 'authenticated', 'operations-a@example.test', '', now(), now(), now()),
    (v_user_b, 'authenticated', 'authenticated', 'operations-b@example.test', '', now(), now(), now())
  on conflict (id) do nothing;
  insert into public.user_profiles(user_id) values (v_user_a), (v_user_b) on conflict do nothing;
  insert into public.dog_profiles(user_id, name) values (v_user_a, 'Disposable A'), (v_user_b, 'Disposable B');

  perform set_config('request.jwt.claim.sub', v_user_a::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  begin
    perform public.prepare_account_deletion(v_user_a, v_key, v_hash);
  exception when insufficient_privilege then v_denied := true;
  end;
  if not v_denied then raise exception 'authenticated role executed deletion RPC'; end if;

  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform public.prepare_account_deletion(v_user_a, v_key, v_hash);
  select count(*)::integer into v_count from public.dog_profiles where user_id = v_user_a;
  if v_count <> 0 then raise exception 'deleting user retained % pets', v_count; end if;
  select count(*)::integer into v_count from public.dog_profiles where user_id = v_user_b;
  if v_count <> 1 then raise exception 'other user pet was deleted'; end if;

  v_denied := false;
  begin
    insert into public.user_profiles(user_id) values (v_user_a);
  exception when insufficient_privilege then v_denied := true;
  end;
  if not v_denied then raise exception 'deleting account write barrier failed'; end if;

  perform public.prepare_account_deletion(v_user_a, v_key, v_hash);
  select count(*)::integer into v_count from public.account_deletion_requests where user_id = v_user_a and idempotency_key = v_key;
  if v_count <> 1 then raise exception 'deletion replay created % ledger rows', v_count; end if;

  perform public.cleanup_operational_records(false, 10);
  select count(*)::integer into v_count from public.account_deletion_requests where user_id = v_user_a;
  if v_count <> 1 then raise exception 'dry-run cleanup mutated deletion ledger'; end if;
end;
$$;

rollback;
