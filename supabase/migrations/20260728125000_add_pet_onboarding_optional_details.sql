alter table public.dog_profiles
  add column if not exists sex text,
  add column if not exists routine_note text;

alter table public.dog_profiles drop constraint if exists dog_profiles_sex_check;
alter table public.dog_profiles add constraint dog_profiles_sex_check
  check (sex is null or sex in ('female', 'male', 'not_sure')) not valid;
alter table public.dog_profiles validate constraint dog_profiles_sex_check;

comment on column public.dog_profiles.sex is 'Optional owner-provided pet sex; not inferred.';
comment on column public.dog_profiles.routine_note is 'Optional owner-provided care goal or routine note.';
