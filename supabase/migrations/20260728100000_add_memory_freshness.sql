alter table public.furvise_memories
  add column if not exists observed_at timestamptz,
  add column if not exists expires_at timestamptz,
  add column if not exists freshness_class text,
  add column if not exists base_confidence numeric,
  add column if not exists current_confidence numeric,
  add column if not exists decay_policy text,
  add column if not exists confirmation_required_after timestamptz,
  add column if not exists stale_at timestamptz;

update public.furvise_memories set
  observed_at = coalesce(observed_at, first_observed_at, created_at),
  freshness_class = coalesce(freshness_class, case
    when category in ('allergy', 'identity') then 'permanent'
    when durability = 'durable' then 'long_lived'
    when durability = 'temporary' then 'short_lived'
    else 'medium_lived' end),
  base_confidence = coalesce(base_confidence, confidence),
  current_confidence = coalesce(current_confidence, confidence),
  decay_policy = coalesce(decay_policy, case when category in ('allergy', 'identity') then 'none' else 'linear' end),
  stale_at = coalesce(stale_at, case
    when category in ('allergy', 'identity') then null
    when durability = 'temporary' then coalesce(last_confirmed_at, created_at) + interval '7 days'
    when durability = 'durable' then coalesce(last_confirmed_at, created_at) + interval '365 days'
    else coalesce(last_confirmed_at, created_at) + interval '90 days' end),
  expires_at = coalesce(expires_at, case
    when category in ('allergy', 'identity') then null
    when durability = 'temporary' then coalesce(last_confirmed_at, created_at) + interval '14 days'
    when durability = 'durable' then coalesce(last_confirmed_at, created_at) + interval '730 days'
    else coalesce(last_confirmed_at, created_at) + interval '180 days' end),
  confirmation_required_after = coalesce(confirmation_required_after, stale_at);

alter table public.furvise_memories
  alter column observed_at set default now(),
  alter column freshness_class set default 'medium_lived',
  alter column decay_policy set default 'linear';

alter table public.furvise_memories add constraint furvise_memories_freshness_class_check
  check (freshness_class in ('permanent', 'long_lived', 'medium_lived', 'short_lived', 'episode_bound')) not valid;
alter table public.furvise_memories validate constraint furvise_memories_freshness_class_check;
alter table public.furvise_memories add constraint furvise_memories_confidence_range_check
  check (base_confidence between 0 and 1 and current_confidence between 0 and 1) not valid;
alter table public.furvise_memories validate constraint furvise_memories_confidence_range_check;

create index if not exists furvise_memories_freshness_idx on public.furvise_memories(user_id, pet_id, status, stale_at, expires_at);
create index if not exists furvise_memories_subject_fact_idx on public.furvise_memories(user_id, pet_id, subject_type, fact_key, last_confirmed_at desc);

create or replace function public.set_furvise_memory_freshness()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_confirmed timestamptz := coalesce(new.last_confirmed_at, now());
begin
  new.observed_at := coalesce(new.observed_at, new.first_observed_at, now());
  new.freshness_class := coalesce(new.freshness_class, case
    when new.category in ('allergy', 'identity') then 'permanent'
    when new.durability = 'durable' then 'long_lived'
    when new.durability = 'temporary' then 'short_lived'
    else 'medium_lived' end);
  new.base_confidence := coalesce(new.base_confidence, new.confidence);
  new.current_confidence := case when tg_op = 'UPDATE' and new.last_confirmed_at is distinct from old.last_confirmed_at then new.base_confidence else coalesce(new.current_confidence, new.base_confidence) end;
  new.decay_policy := case when new.freshness_class = 'permanent' then 'none' else coalesce(new.decay_policy, 'linear') end;
  if new.freshness_class = 'permanent' then new.stale_at := null; new.expires_at := null; new.confirmation_required_after := null;
  elsif new.freshness_class = 'long_lived' then new.stale_at := coalesce(new.stale_at, v_confirmed + interval '365 days'); new.expires_at := coalesce(new.expires_at, v_confirmed + interval '730 days');
  elsif new.freshness_class = 'medium_lived' then new.stale_at := coalesce(new.stale_at, v_confirmed + interval '90 days'); new.expires_at := coalesce(new.expires_at, v_confirmed + interval '180 days');
  elsif new.freshness_class = 'short_lived' then new.stale_at := coalesce(new.stale_at, v_confirmed + interval '7 days'); new.expires_at := coalesce(new.expires_at, v_confirmed + interval '14 days');
  else new.stale_at := coalesce(new.stale_at, v_confirmed + interval '1 day'); new.expires_at := coalesce(new.expires_at, v_confirmed + interval '7 days'); end if;
  new.confirmation_required_after := coalesce(new.confirmation_required_after, new.stale_at);
  return new;
end;
$$;
drop trigger if exists furvise_memories_set_freshness on public.furvise_memories;
create trigger furvise_memories_set_freshness before insert or update of last_confirmed_at, freshness_class, base_confidence
on public.furvise_memories for each row execute function public.set_furvise_memory_freshness();
revoke all on function public.set_furvise_memory_freshness() from public, anon, authenticated;
