alter table public.dog_profiles
  add column if not exists wellness_goal text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'dog_profiles_wellness_goal_check'
      and conrelid = 'public.dog_profiles'::regclass
  ) then
    alter table public.dog_profiles
      add constraint dog_profiles_wellness_goal_check
      check (
        wellness_goal is null
        or wellness_goal in ('nutrition', 'dental_care', 'grooming', 'activity', 'preventive_care', 'reminders', 'something_else')
      );
  end if;
end $$;
