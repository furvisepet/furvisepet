alter table public.user_profiles
  add column if not exists password_auth_enabled_at timestamptz;

comment on column public.user_profiles.password_auth_enabled_at is
  'Trusted Furvise confirmation that Supabase password authentication was successfully established.';

-- Supabase Auth owns credential storage. This migration reads only whether a
-- non-empty password credential exists and never exposes or copies its value.
insert into public.user_profiles (user_id, password_auth_enabled_at)
select
  users.id,
  coalesce(users.updated_at, users.created_at, clock_timestamp())
from auth.users as users
where nullif(users.encrypted_password, '') is not null
on conflict (user_id) do update
set password_auth_enabled_at = coalesce(
  public.user_profiles.password_auth_enabled_at,
  excluded.password_auth_enabled_at
);

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.protect_user_profile_password_capability()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if current_user not in ('postgres', 'service_role') then
    if tg_op = 'INSERT' and new.password_auth_enabled_at is not null then
      raise exception using
        errcode = '42501',
        message = 'PASSWORD_AUTH_CAPABILITY_SERVER_MANAGED';
    end if;

    if tg_op = 'UPDATE'
      and new.password_auth_enabled_at is distinct from old.password_auth_enabled_at then
      raise exception using
        errcode = '42501',
        message = 'PASSWORD_AUTH_CAPABILITY_SERVER_MANAGED';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.protect_user_profile_password_capability()
  from public, anon, authenticated;

drop trigger if exists protect_user_profile_password_capability_insert
  on public.user_profiles;
create trigger protect_user_profile_password_capability_insert
before insert on public.user_profiles
for each row execute function private.protect_user_profile_password_capability();

drop trigger if exists protect_user_profile_password_capability_update
  on public.user_profiles;
create trigger protect_user_profile_password_capability_update
before update of password_auth_enabled_at on public.user_profiles
for each row execute function private.protect_user_profile_password_capability();
