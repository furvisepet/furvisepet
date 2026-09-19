begin;

insert into auth.users(id, aud, role, email, encrypted_password, created_at, updated_at) values
  ('81000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'boundary-a@example.test', '', now(), now()),
  ('82000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'boundary-b@example.test', '', now(), now());

insert into public.dog_profiles(id, user_id, name, species) values
  ('81000000-0000-4000-8000-000000000011', '81000000-0000-4000-8000-000000000001', 'Boundary A', 'dog'),
  ('82000000-0000-4000-8000-000000000022', '82000000-0000-4000-8000-000000000002', 'Boundary B', 'cat');

insert into public.pet_care_entries(id, user_id, pet_profile_id, category, title, note, occurred_at) values
  ('81000000-0000-4000-8000-000000000101', '81000000-0000-4000-8000-000000000001',
   '81000000-0000-4000-8000-000000000011', 'general', 'Dependent history', 'Must cascade with controlled deletion.', now());

insert into public.billing_accounts(
  user_id, stripe_customer_id, stripe_subscription_id, stripe_price_id,
  checkout_price_id, plan, subscription_status, current_period_start, current_period_end
) values (
  '81000000-0000-4000-8000-000000000001', 'cus_boundary_a', 'sub_boundary_a', 'price_boundary_plus',
  'price_boundary_plus', 'plus', 'active', now() - interval '1 day', now() + interval '30 days'
);

insert into public.vet_visit_briefs(
  id, user_id, pet_profile_id, date_range_start, date_range_end, confirmed_title, confirmed_data
) values (
  '82000000-0000-4000-8000-000000000201', '82000000-0000-4000-8000-000000000002',
  '82000000-0000-4000-8000-000000000022', current_date - 1, current_date, 'Free stored brief', '{"documentVersion":1}'
);

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_class
    where oid = 'public.dog_profiles'::regclass and relrowsecurity and relforcerowsecurity
  ) then raise exception 'dog profile RLS is not enabled and forced'; end if;
  if has_table_privilege('authenticated', 'public.dog_profiles', 'DELETE') then
    raise exception 'authenticated retained table-level DELETE';
  end if;
  if has_column_privilege('authenticated', 'public.dog_profiles', 'lifecycle_status', 'UPDATE')
    or has_column_privilege('authenticated', 'public.dog_profiles', 'lifecycle_changed_at', 'UPDATE')
    or has_column_privilege('authenticated', 'public.dog_profiles', 'deceased_at', 'UPDATE')
  then raise exception 'authenticated retained lifecycle UPDATE privilege'; end if;
  if not has_column_privilege('authenticated', 'public.dog_profiles', 'name', 'UPDATE')
    or not has_column_privilege('authenticated', 'public.dog_profiles', 'routine_note', 'UPDATE')
  then raise exception 'ordinary authenticated profile UPDATE privilege was lost'; end if;
  if has_function_privilege('authenticated', 'public.delete_pet_profile_for_user(uuid,uuid)', 'EXECUTE')
    or has_function_privilege('anon', 'public.delete_pet_profile_for_user(uuid,uuid)', 'EXECUTE')
  then raise exception 'tenant role can execute controlled pet deletion'; end if;
  if has_function_privilege('anon', 'public.has_vet_brief_entitlement()', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.has_vet_brief_entitlement()', 'EXECUTE')
  then raise exception 'Vet Brief entitlement projection privileges are invalid'; end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
begin
  if not public.has_vet_brief_entitlement() then
    raise exception 'active Plus was denied authoritative Vet Brief entitlement';
  end if;
  insert into public.vet_visit_briefs(
    id, user_id, pet_profile_id, date_range_start, date_range_end, confirmed_title, confirmed_data
  ) values (
    '81000000-0000-4000-8000-000000000202', '81000000-0000-4000-8000-000000000001',
    '81000000-0000-4000-8000-000000000011', current_date - 1, current_date, 'Plus direct brief', '{"documentVersion":1}'
  );
  if not exists (
    select 1 from public.vet_visit_briefs where id = '81000000-0000-4000-8000-000000000202'
  ) then raise exception 'active Plus direct Vet Brief access failed'; end if;
  if exists (
    select 1 from public.vet_visit_briefs where id = '82000000-0000-4000-8000-000000000201'
  ) then raise exception 'Plus user read another tenant Vet Brief'; end if;
end;
$$;

select set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000002', true);

do $$
begin
  if public.has_vet_brief_entitlement() then
    raise exception 'free account received Vet Brief entitlement';
  end if;
  if exists (
    select 1 from public.vet_visit_briefs where id = '82000000-0000-4000-8000-000000000201'
  ) then raise exception 'free account fetched a stored Vet Brief directly'; end if;
  begin
    insert into public.vet_visit_briefs(
      user_id, pet_profile_id, date_range_start, date_range_end, confirmed_title, confirmed_data
    ) values (
      '82000000-0000-4000-8000-000000000002', '82000000-0000-4000-8000-000000000022',
      current_date - 1, current_date, 'Forged free brief', '{"documentVersion":1}'
    );
    raise exception 'free account inserted a Vet Brief directly';
  exception when insufficient_privilege then null; end;
end;
$$;

select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000001', true);

update public.dog_profiles set name = 'Boundary A edited', routine_note = 'Ordinary edit'
where id = '81000000-0000-4000-8000-000000000011';

do $$
declare
  v_status text;
begin
  if not exists (
    select 1 from public.dog_profiles where id = '81000000-0000-4000-8000-000000000011'
      and name = 'Boundary A edited' and routine_note = 'Ordinary edit'
  ) then raise exception 'ordinary profile edit failed'; end if;

  foreach v_status in array array['deceased', 'archived', 'active'] loop
    begin
      execute format(
        'update public.dog_profiles set lifecycle_status = %L where id = %L',
        v_status, '81000000-0000-4000-8000-000000000011'
      );
      raise exception 'direct lifecycle UPDATE to % succeeded', v_status;
    exception when insufficient_privilege then null; end;
  end loop;

  begin
    insert into public.dog_profiles(user_id, name, species, lifecycle_status)
    values ('81000000-0000-4000-8000-000000000001', 'Forged lifecycle insert', 'dog', 'archived');
    raise exception 'direct lifecycle INSERT succeeded';
  exception when insufficient_privilege then null; end;

  begin
    update public.dog_profiles set lifecycle_changed_at = clock_timestamp()
    where id = '81000000-0000-4000-8000-000000000011';
    raise exception 'direct lifecycle_changed_at tampering succeeded';
  exception when insufficient_privilege then null; end;

  begin
    delete from public.dog_profiles where id = '81000000-0000-4000-8000-000000000011';
    raise exception 'direct authenticated DELETE succeeded';
  exception when insufficient_privilege then null; end;

  update public.dog_profiles set name = 'Cross-tenant edit'
  where id = '82000000-0000-4000-8000-000000000022';
  if found then raise exception 'cross-tenant ordinary UPDATE succeeded'; end if;

  begin
    perform public.delete_pet_profile_for_user(
      '81000000-0000-4000-8000-000000000001',
      '81000000-0000-4000-8000-000000000011'
    );
    raise exception 'authenticated invoked controlled pet deletion';
  exception when insufficient_privilege then null; end;
end;
$$;

reset role;
set local role service_role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'service_role', true);

update public.dog_profiles set lifecycle_status = 'archived'
where id = '81000000-0000-4000-8000-000000000011'
  and user_id = '81000000-0000-4000-8000-000000000001';

do $$
begin
  if not exists (
    select 1 from public.dog_profiles
    where id = '81000000-0000-4000-8000-000000000011'
      and lifecycle_status = 'archived' and lifecycle_changed_at is not null
  ) then raise exception 'controlled service lifecycle transition failed'; end if;

  if public.delete_pet_profile_for_user(
    '81000000-0000-4000-8000-000000000001',
    '82000000-0000-4000-8000-000000000022'
  ) then raise exception 'wrong owner controlled delete succeeded'; end if;

  if not public.delete_pet_profile_for_user(
    '81000000-0000-4000-8000-000000000001',
    '81000000-0000-4000-8000-000000000011'
  ) then raise exception 'controlled owner delete failed'; end if;

  if public.delete_pet_profile_for_user(
    '81000000-0000-4000-8000-000000000001',
    '81000000-0000-4000-8000-000000000011'
  ) then raise exception 'repeated controlled delete was not idempotent'; end if;

  if exists (select 1 from public.pet_care_entries where id = '81000000-0000-4000-8000-000000000101') then
    raise exception 'controlled delete did not cascade dependent history';
  end if;
  if not exists (select 1 from public.dog_profiles where id = '82000000-0000-4000-8000-000000000022') then
    raise exception 'controlled delete removed another tenant pet';
  end if;
end;
$$;

rollback;
