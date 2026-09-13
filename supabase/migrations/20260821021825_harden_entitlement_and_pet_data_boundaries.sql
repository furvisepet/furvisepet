-- Direct Data API access must evaluate the same current billing/grant authority
-- as the application route. This zero-argument projection exposes no tenant
-- selector and therefore cannot be used to probe another account.
create or replace function public.has_vet_brief_entitlement()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select resolved.effective_plan = 'plus' and resolved.vet_prep_exports
    from private.resolve_account_entitlements(auth.uid()) as resolved
  ), false);
$$;

revoke all on function public.has_vet_brief_entitlement()
  from public, anon, authenticated, service_role;
grant execute on function public.has_vet_brief_entitlement()
  to authenticated;

drop policy if exists "vet_visit_briefs_select_own" on public.vet_visit_briefs;
create policy "vet_visit_briefs_select_own"
  on public.vet_visit_briefs for select
  to authenticated
  using (
    (select auth.uid()) = user_id
    and (select public.has_vet_brief_entitlement())
  );

drop policy if exists "vet_visit_briefs_insert_own" on public.vet_visit_briefs;
create policy "vet_visit_briefs_insert_own"
  on public.vet_visit_briefs for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and (select public.has_vet_brief_entitlement())
    and exists (
      select 1 from public.dog_profiles
      where dog_profiles.id = vet_visit_briefs.pet_profile_id
        and dog_profiles.user_id = (select auth.uid())
    )
  );

drop policy if exists "vet_visit_briefs_update_own" on public.vet_visit_briefs;
create policy "vet_visit_briefs_update_own"
  on public.vet_visit_briefs for update
  to authenticated
  using (
    (select auth.uid()) = user_id
    and (select public.has_vet_brief_entitlement())
  )
  with check (
    (select auth.uid()) = user_id
    and (select public.has_vet_brief_entitlement())
    and exists (
      select 1 from public.dog_profiles
      where dog_profiles.id = vet_visit_briefs.pet_profile_id
        and dog_profiles.user_id = (select auth.uid())
    )
  );

drop policy if exists "vet_visit_briefs_delete_own" on public.vet_visit_briefs;
create policy "vet_visit_briefs_delete_own"
  on public.vet_visit_briefs for delete
  to authenticated
  using (
    (select auth.uid()) = user_id
    and (select public.has_vet_brief_entitlement())
  );

-- Tenant RLS proves ownership, but ownership alone must not authorize bypassing
-- lifecycle transitions or permanent-deletion workflows. Keep ordinary profile
-- fields directly writable while reserving lifecycle machine state and DELETE.
alter table public.dog_profiles force row level security;

drop policy if exists "Users can delete their dog profiles" on public.dog_profiles;

revoke insert, update, delete on table public.dog_profiles
  from public, anon, authenticated;

revoke insert (lifecycle_status, lifecycle_changed_at, deceased_at),
  update (user_id, idempotency_key, lifecycle_status, lifecycle_changed_at, deceased_at)
  on table public.dog_profiles from public, anon, authenticated;

grant insert (
  user_id, name, species, breed, age_value, age_unit, weight_value, weight_unit,
  current_food, main_concern, wellness_goal, avoid_ingredients, monthly_budget,
  sex, routine_note, idempotency_key, updated_at
) on table public.dog_profiles to authenticated;

grant update (
  name, species, breed, age_value, age_unit, weight_value, weight_unit,
  current_food, main_concern, wellness_goal, avoid_ingredients, monthly_budget,
  sex, routine_note, updated_at
) on table public.dog_profiles to authenticated;

-- This is the sole non-account service boundary for profile deletion. The API
-- must authenticate the tenant, require confirmation, claim an idempotency
-- operation, and then call this RPC with the authenticated owner id.
create or replace function public.delete_pet_profile_for_user(
  p_user_id uuid,
  p_pet_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted boolean := false;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_user_id is null or p_pet_id is null then
    raise exception using errcode = '22023', message = 'PET_DELETE_INPUT_INVALID';
  end if;

  delete from public.dog_profiles
  where id = p_pet_id and user_id = p_user_id;
  v_deleted := found;
  return v_deleted;
end;
$$;

revoke all on function public.delete_pet_profile_for_user(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.delete_pet_profile_for_user(uuid, uuid)
  to service_role;

comment on function public.delete_pet_profile_for_user(uuid, uuid) is
  'Service-only pet deletion boundary. Caller must supply the authenticated owner; dependent Furvise data follows declared cascades.';

comment on function public.has_vet_brief_entitlement() is
  'Caller-scoped authoritative Vet Brief entitlement used by Data API RLS. Evaluated from current billing and access-grant state.';
