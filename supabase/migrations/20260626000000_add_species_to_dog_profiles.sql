alter table public.dog_profiles
  add column if not exists species text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'dog_profiles_species_check'
      and conrelid = 'public.dog_profiles'::regclass
  ) then
    alter table public.dog_profiles
      add constraint dog_profiles_species_check
      check (species is null or species in ('dog', 'cat'));
  end if;
end $$;
