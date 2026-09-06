-- Revert the application RPC call before applying this rollback.
drop function if exists public.save_ask_memory_suggestion(uuid, uuid, uuid, text, text);
-- Preserve saved canonical memories and suggestion states.
