alter table public.ask_conversation_messages
  add column if not exists request_id uuid;

create unique index if not exists ask_conversation_messages_owner_request_role_idx
  on public.ask_conversation_messages (user_id, request_id, role)
  where request_id is not null;

create index if not exists ask_conversation_messages_request_lookup_idx
  on public.ask_conversation_messages (user_id, request_id)
  where request_id is not null;
