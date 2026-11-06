-- DESIGN DRAFT ONLY: NOT A MIGRATION, NOT APPROVED, NEVER APPLY.
-- The present begin_ask_conversation_turn RPC cannot atomically bind this data.
-- Required before use: separately reviewed service-only atomic RPC, original
-- request/hash matching, owner/pet checks, explicit-confirmation design,
-- immutable readback, readiness contract, RLS/grant audit and database tests.
-- This transaction deliberately aborts before any DDL.
BEGIN;
DO $$ BEGIN RAISE EXCEPTION 'DRAFT_NOT_APPROVED: missing atomic RPC and confirmation contract'; END $$;
ALTER TABLE public.ask_conversation_messages
  ADD COLUMN temporal_scope_state text NOT NULL DEFAULT 'legacy_unscoped',
  ADD COLUMN confirmed_temporal_scope jsonb;
ALTER TABLE public.ask_conversation_messages
  ADD CONSTRAINT ask_user_temporal_scope_state_check CHECK (
    (temporal_scope_state = 'legacy_unscoped' AND confirmed_temporal_scope IS NULL)
    OR (role = 'user' AND temporal_scope_state = 'scoped'
        AND jsonb_typeof(confirmed_temporal_scope) = 'object')
  );
ROLLBACK;
