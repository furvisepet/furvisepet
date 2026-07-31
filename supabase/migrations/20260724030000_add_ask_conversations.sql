create table if not exists public.ask_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pet_profile_id uuid not null references public.dog_profiles(id) on delete cascade,
  title text not null,
  preview text not null default '',
  status text not null default 'active' check (status in ('active', 'archived')),
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ask_conversations_title_length_check check (char_length(btrim(title)) between 1 and 80),
  constraint ask_conversations_preview_length_check check (char_length(preview) <= 220)
);

create table if not exists public.ask_conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ask_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'furvise')),
  sequence_number integer not null check (sequence_number > 0),
  user_text text,
  response_data jsonb,
  save_metadata jsonb,
  context_used jsonb,
  created_at timestamptz not null default now(),
  constraint ask_conversation_messages_role_content_check check (
    (role = 'user' and user_text is not null and response_data is null)
    or (role = 'furvise' and user_text is null and response_data is not null)
  ),
  constraint ask_conversation_messages_text_length_check check (user_text is null or char_length(user_text) between 1 and 1200),
  constraint ask_conversation_messages_payload_size_check check (
    octet_length(coalesce(response_data::text, '')) <= 65536
    and octet_length(coalesce(save_metadata::text, '')) <= 16384
    and octet_length(coalesce(context_used::text, '')) <= 8192
  ),
  unique (conversation_id, sequence_number)
);

create index if not exists ask_conversations_owner_activity_idx on public.ask_conversations (user_id, last_activity_at desc);
create index if not exists ask_conversations_pet_activity_idx on public.ask_conversations (pet_profile_id, last_activity_at desc);
create index if not exists ask_conversation_messages_conversation_sequence_idx on public.ask_conversation_messages (conversation_id, sequence_number);

create or replace function public.ask_conversations_validate_ownership()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.dog_profiles
    where dog_profiles.id = new.pet_profile_id
      and dog_profiles.user_id = new.user_id
  ) then
    raise exception 'Ask conversation owner and pet do not match' using errcode = '23514';
  end if;
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.ask_conversation_messages_validate_ownership()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.ask_conversations
    where ask_conversations.id = new.conversation_id
      and ask_conversations.user_id = new.user_id
  ) then
    raise exception 'Ask message owner and conversation do not match' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.ask_conversations_validate_ownership() from public, anon, authenticated;
revoke all on function public.ask_conversation_messages_validate_ownership() from public, anon, authenticated;

drop trigger if exists ask_conversations_validate_ownership on public.ask_conversations;
create trigger ask_conversations_validate_ownership before insert or update on public.ask_conversations
for each row execute function public.ask_conversations_validate_ownership();

drop trigger if exists ask_conversation_messages_validate_ownership on public.ask_conversation_messages;
create trigger ask_conversation_messages_validate_ownership before insert or update on public.ask_conversation_messages
for each row execute function public.ask_conversation_messages_validate_ownership();

alter table public.ask_conversations enable row level security;
alter table public.ask_conversations force row level security;
alter table public.ask_conversation_messages enable row level security;
alter table public.ask_conversation_messages force row level security;

drop policy if exists "ask_conversations_select_own" on public.ask_conversations;
drop policy if exists "ask_conversations_insert_own" on public.ask_conversations;
drop policy if exists "ask_conversations_update_own" on public.ask_conversations;
drop policy if exists "ask_conversations_delete_own" on public.ask_conversations;
create policy "ask_conversations_select_own" on public.ask_conversations for select using (user_id = auth.uid());
create policy "ask_conversations_insert_own" on public.ask_conversations for insert with check (user_id = auth.uid());
create policy "ask_conversations_update_own" on public.ask_conversations for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "ask_conversations_delete_own" on public.ask_conversations for delete using (user_id = auth.uid());

drop policy if exists "ask_conversation_messages_select_own" on public.ask_conversation_messages;
drop policy if exists "ask_conversation_messages_insert_own" on public.ask_conversation_messages;
drop policy if exists "ask_conversation_messages_delete_own" on public.ask_conversation_messages;
create policy "ask_conversation_messages_select_own" on public.ask_conversation_messages for select using (user_id = auth.uid());
create policy "ask_conversation_messages_insert_own" on public.ask_conversation_messages for insert with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.ask_conversations
    where ask_conversations.id = ask_conversation_messages.conversation_id
      and ask_conversations.user_id = auth.uid()
  )
);
create policy "ask_conversation_messages_delete_own" on public.ask_conversation_messages for delete using (user_id = auth.uid());

revoke all on table public.ask_conversations from anon;
revoke all on table public.ask_conversation_messages from anon;
grant select, insert, update, delete on table public.ask_conversations to authenticated;
grant select, insert, delete on table public.ask_conversation_messages to authenticated;
