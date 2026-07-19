create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  country text,
  country_source text default null,
  country_detected_at timestamptz,
  country_updated_at timestamptz
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_profiles_country_check'
      and conrelid = 'public.user_profiles'::regclass
  ) then
    alter table public.user_profiles
      add constraint user_profiles_country_check
      check (country is null or country in ('US', 'CA'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_profiles_country_source_check'
      and conrelid = 'public.user_profiles'::regclass
  ) then
    alter table public.user_profiles
      add constraint user_profiles_country_source_check
      check (country_source is null or country_source in ('detected', 'manual', 'env_default'));
  end if;
end $$;

alter table public.user_profiles enable row level security;

drop policy if exists "Users can select their account profile" on public.user_profiles;
create policy "Users can select their account profile"
  on public.user_profiles
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their account profile" on public.user_profiles;
create policy "Users can insert their account profile"
  on public.user_profiles
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their account profile" on public.user_profiles;
create policy "Users can update their account profile"
  on public.user_profiles
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
