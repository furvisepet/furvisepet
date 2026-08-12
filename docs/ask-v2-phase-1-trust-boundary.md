# Ask v2 Phase 1 trust boundary

Phase 1 is shadow-only. Production Ask neither calls the v2 persistence RPC nor treats its output as write authority.

## Server-to-database identity

The browser sends its existing Supabase access token to a Furvise Vercel route. The route must use a Supabase client configured with the public publishable key and the bearer token, then call `auth.getUser(accessToken)`. That network-validated response is the server's authenticated Furvise user.

The route then creates a separate Supabase client with `SUPABASE_SECRET_KEY` (or the legacy `SUPABASE_SERVICE_ROLE_KEY`) and calls `persist_governed_semantic_turn_v2`. The verified user ID is a separate RPC argument named `p_verified_user_id`; it is not part of `SemanticFrame`, a claim, or any model/client-controlled governed-turn payload. A normal browser cannot create this service client and has no RPC execute grant.

The service-role request is not expected to have an end-user `auth.uid()`. The RPC treats `p_verified_user_id` as a server assertion and independently verifies that:

- the source message is a user-authored message owned by that user;
- every owner subject/entity equals that user;
- every pet subject/entity belongs to that user;
- every prior relation target and lifecycle episode belongs to that user;
- lifecycle membership uses an exact server-governed canonical concept identity.

Canonical tables retain forced RLS and no direct authenticated write grants. The service-only RPC is the sole Phase 1 write surface. Its source-message ownership check makes a forged or accidentally mismatched server user parameter fail closed.

## Concept and persistence authority

Normalized model labels are stored as provisional concept keys. They become canonical only through an explicit server-owned governed registry match with a version. Provisional labels cannot bind a claim to an existing lifecycle.

`persistenceHint` remains a model proposal used only for shadow comparison. Deterministic governance selects eligibility and destination from subject ownership/type, claim kind, operation, durability, temporal semantics, lifecycle compatibility, governed confidence, ambiguity, modality, and the safety floor.

## Source-message retention

`source_message_id` is a nullable live lineage pointer with `ON DELETE SET NULL`. `source_message_lineage_id` preserves the immutable source identifier used for idempotency and audit. Ordinary message deletion therefore cannot cascade-delete claims. Tenant/account deletion may still physically erase claims through the claim ledger's `user_id ... ON DELETE CASCADE`. Governed correction, retraction, forgetting, and privacy erasure remain explicit future operations.
