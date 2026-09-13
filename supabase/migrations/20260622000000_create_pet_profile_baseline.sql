-- Historical baseline for the pet profile table that predates the committed
-- 2026-06-23 care-entry migration. Species and wellness_goal are intentionally
-- added by their existing 2026-06-26 migrations.
create extension if not exists pgcrypto;

create table if not exists public.dog_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  breed text,
  age_value numeric,
  age_unit text,
  weight_value numeric,
  weight_unit text,
  current_food text,
  main_concern text,
  avoid_ingredients text[] default '{}',
  monthly_budget numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.dog_profiles enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'dog_profiles'
      and policyname = 'Users can select their dog profiles'
  ) then
    create policy "Users can select their dog profiles"
      on public.dog_profiles
      for select
      using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'dog_profiles'
      and policyname = 'Users can insert their dog profiles'
  ) then
    create policy "Users can insert their dog profiles"
      on public.dog_profiles
      for insert
      with check (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'dog_profiles'
      and policyname = 'Users can update their dog profiles'
  ) then
    create policy "Users can update their dog profiles"
      on public.dog_profiles
      for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'dog_profiles'
      and policyname = 'Users can delete their dog profiles'
  ) then
    create policy "Users can delete their dog profiles"
      on public.dog_profiles
      for delete
      using (auth.uid() = user_id);
  end if;
end $$;

create index if not exists dog_profiles_user_id_idx
  on public.dog_profiles(user_id);
