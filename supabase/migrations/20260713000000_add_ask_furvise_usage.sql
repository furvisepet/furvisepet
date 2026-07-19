create table if not exists public.ask_furvise_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  month_key text not null,
  count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, month_key)
);

alter table public.ask_furvise_usage enable row level security;

drop policy if exists "Users can select their Ask Furvise usage" on public.ask_furvise_usage;
create policy "Users can select their Ask Furvise usage"
  on public.ask_furvise_usage
  for select
  using (user_id = auth.uid());

drop policy if exists "Users can insert their Ask Furvise usage" on public.ask_furvise_usage;
create policy "Users can insert their Ask Furvise usage"
  on public.ask_furvise_usage
  for insert
  with check (user_id = auth.uid());

drop policy if exists "Users can update their Ask Furvise usage" on public.ask_furvise_usage;
create policy "Users can update their Ask Furvise usage"
  on public.ask_furvise_usage
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists ask_furvise_usage_user_month_idx
  on public.ask_furvise_usage(user_id, month_key);

create or replace function public.ask_furvise_usage_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists ask_furvise_usage_touch_updated_at on public.ask_furvise_usage;
create trigger ask_furvise_usage_touch_updated_at
before update on public.ask_furvise_usage
for each row
execute function public.ask_furvise_usage_touch_updated_at();
