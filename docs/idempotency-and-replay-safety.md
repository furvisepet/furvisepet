# Idempotency and replay safety

## Verified design

Furvise uses `Idempotency-Key` with a client-generated UUID v4 or v7. The key is scoped by the authenticated `auth.users.id` and a versioned operation type. The server hashes a canonical, key-sorted representation of every meaningful mutation input with SHA-256; transport-only `requestId`/idempotency fields are excluded. The operation name, version, pet/resource identifier, and meaningful fields remain in the hash.

The database table `idempotency_operations` is the cross-instance authority. A unique `(user_id, operation_type, idempotency_key)` constraint and one `INSERT ... ON CONFLICT DO NOTHING`/row-lock function provide atomic claims. The table has forced RLS and no direct grants. Claim, completion, failure, abandonment, and cleanup functions are `SECURITY DEFINER`, fixed-search-path, and service-role-only. Routes authenticate and verify ownership before passing the canonical authenticated user ID to the server-held Supabase administrative client.

Outcomes are `new`, `retry`, `in_progress`, `completed`, `failed_retryable`, `failed_final`, and `conflict`. Completed replay returns the stored status/body with `Idempotency-Replayed: true`. A new completion has `Idempotency-Replayed: false`. In-progress and changed-payload reuse return HTTP 409 (`REQUEST_IN_PROGRESS` and `IDEMPOTENCY_CONFLICT`). Responses are private/no-store and never include hashes or ownership tokens.

The order is bounded parse, authentication, origin validation, ownership, key/hash validation, completed replay, rate limit, atomic claim, AI concurrency/admission/credit, mutation/provider work, canonical completion, and lock/accounting release. Origin or ownership denial creates no operation. A completed replay avoids a second rate-limit charge. New keys remain rate-limited.

## Operation inventory

All actors below are authenticated owners unless marked service-only. `DB operation` means the dedicated operation table is the distributed authority. “Natural key” is an additional side-effect constraint.

| Operation | Route/caller | Method | Resource / transaction boundary | Previous uniqueness and retry | S2F policy |
|---|---|---:|---|---|---|
| Ask submission and user message | `/api/ask` | POST | conversation/messages, AI admission, intelligence, credit | `ask_conversation_messages(user_id,request_id,role)` and `ai_usage_events(user_id,request_id)`; incomplete outer replay | financial 90d DB operation; body `requestId` compatibility; one user/assistant message and credit |
| Ask assistant persistence | `/api/ask` internal | — | assistant row linked to originating request | request/role unique | same Ask operation; retry loads stored assistant before provider |
| Conversation creation/legacy save | `/api/ask/conversations` | POST | conversation plus bounded message list | no request key | ordinary 7d DB operation; conversation and both message rows carry key |
| Conversation title | `/api/ask/conversations/[id]` | PATCH | one owned conversation | none | ordinary 7d DB operation |
| Conversation deletion | same | DELETE | owned conversation cascade | repeated delete became 404 | destructive 90d DB operation; replay returns canonical 204 |
| Conversation exchange | `/api/ask/conversations/[id]/messages` | POST | user and assistant message pair | sequence uniqueness only | ordinary 7d DB operation; both rows share request key by role |
| Care create | `/api/care-entries` | POST | immutable chronology row | optional source dedupe only | ordinary 7d DB operation plus `(user_id,idempotency_key)` unique |
| Care update/delete (legacy mutable surface) | `/api/care-entries/[id]` | PATCH/DELETE | owned row | owner filter only | ordinary/destructive DB operation; delete replay is canonical |
| Recovery/resolution and care suggestions | `/api/ask/suggestions/[id]` and intelligence RPCs | PATCH/internal | suggestion, event, episode/state reduction | RPC source/effect uniqueness existed | outer DB operation plus retained RPC natural keys |
| Medication start/finish | care/intelligence/suggestion paths | POST/PATCH/internal | care event and reducer | source request uniqueness in canonical RPC | inherited care/suggestion/Ask operation; no text dedupe |
| Memory confirm/edit/forget | `/api/memories/[id]` | PATCH | memory lifecycle RPC | lifecycle RPC was state-safe | ordinary/destructive DB operation wrapping RPC |
| Legacy memory create batch | `/api/legacy-memories` | POST | bounded memory rows | none | ordinary 7d DB operation plus key/item-index unique |
| Legacy memory delete batch | same | DELETE | owned rows | repeat could differ | destructive 90d DB operation |
| AI memory extraction | Ask/Product/Safety intelligence | internal | canonical memory persistence RPC | source request/effect uniqueness | inherits originating financial operation; never starts separately on replay |
| Profile creation | `/api/pets` | POST | `dog_profiles` | none | ordinary DB operation plus `(user_id,idempotency_key)` unique |
| Profile update | `/api/pets/[id]` | PATCH | owned profile | owner filter only | ordinary DB operation |
| Pet deletion | same | DELETE | profile cascade | repeat became 404 | destructive DB operation; completed replay returns canonical success |
| Account product country | `/api/account/product-country` | POST | account preferences | owner upsert | ordinary DB operation |
| Account inferred country | `/api/account/detect-country` | POST | account preferences | owner upsert | ordinary DB operation |
| Auth identity workspace bootstrap | `ensureUserProfileForIdentity` (server auth lifecycle) | internal | one `user_profiles` row | `user_id` unique plus `UPSERT ... ignoreDuplicates` | natural database idempotency retained; not a client mutation |
| Onboarding completion | first profile save | POST | profile creation | profile save only | profile.create operation; no separate completion mutation exists |
| Legacy profile analysis | `/api/analyze` | POST | AI/credit response | body request ID and credit ledger | financial DB operation |
| Product interpretation/session start | `/api/shop/interpret-query` | POST | cached interpretation; no session table exists | cache and credit request ID | financial DB operation; deterministic/cache reads return before claim |
| Product fit explanation | `/api/shop/explain-product-fit` | POST | AI response | credit request ID | financial DB operation |
| Product-specific question | `/api/shop/product-question` | POST | AI response | credit request ID | financial DB operation |
| Product follow-up answer | current product-specific question route | POST | AI response | request ID only | financial DB operation; no separate follow-up row exists |
| Product feedback create/delete | `/api/product-feedback` | POST/DELETE | `dog_product_feedback` | browser previously mutated Supabase directly; natural feedback uniqueness | ordinary/destructive DB operation; first-party client moved behind API |
| Safety follow-up | `/api/safety-followup` | POST | AI, memory/care learning, credit | credit request ID | financial DB operation |
| Vet Brief generation/refresh draft | `/api/vet-briefs/draft` | POST | generated draft/AI/credit | body request ID | financial DB operation; existing document is included in hash |
| Vet Brief save/edit | `/api/vet-briefs` | POST | one immutable saved version | version unique only | ordinary DB operation plus `(user_id,idempotency_key)` unique |
| Suggestion apply/edit/dismiss/monitor | `/api/ask/suggestions/[id]` | PATCH | owned suggestion and optional state effect | effect key in RPC for apply | ordinary/destructive DB operation around natural RPC protection |
| AI credit reserve/complete/release | usage-ledger RPCs | internal | `ai_usage_events` transaction | `(user_id,request_id)` unique | retained; financial operation surrounds the entire experience |
| Catalog ingestion/batch writes | operator CLI | service-only | catalog tables/RPC | provider IDs and batch keys | not browser idempotency; service credentials and ingestion invariants remain authority |
| Cleanup | `scripts/cleanup-idempotency-operations.mjs` | operator CLI | expired operation rows | N/A | service-only, dry-run default, bounded batch |

`/api/shop/catalog` is a deterministic bounded read despite using POST and is deliberately excluded. Reading conversations, briefs, memories, care, catalog, and saved AI results does not claim an operation. No account-deletion route or separately persisted Product recommendation-session model exists in the current repository; policies for those future mutations must use destructive/financial retention before launch.

## Failure and recovery

- Validation failures happen before claim where possible. Origin and ownership denial always happen before claim.
- Rate-limit/backend denial abandons the newly claimed record, allowing a later controlled retry; it does not perform the mutation.
- A callback exception or HTTP 5xx marks the operation retryable. A 4xx response after a claim is stored as the canonical final result.
- If the provider produced a stored assistant response, Ask loads and persists/replays that result without another provider call.
- Provider usage is authoritative in the S2C ledger even when later persistence fails; user credit may be released under its existing policy while provider cost remains counted.
- If canonical completion fails after an application side effect, the framework attempts a `failed_final` reconciliation marker. It returns a safe 503 and will not blindly repeat a possibly committed side effect. A crashed expired AI operation with completed provider usage is likewise marked for reconciliation.
- Leases last 120 seconds by default and 180 seconds for model-backed work. Expired non-financial/retryable work may be reclaimed atomically.

## Retention and constraints

Ordinary writes retain operation results for 7 days. AI operations retain 45 days; destructive and financially relevant operations retain 90 days. Canonical business rows remain the long-term truth. The cleanup RPC excludes processing operations and any record with an active reserved AI usage event. It is service-only and supports dry-run plus a bounded batch.

First-party clients retain only the unresolved UUID and creation time in per-tab `sessionStorage`; no payload is stored. React rerenders and transport retries reuse the key. Canonical completion clears it. 5xx, 429, and `REQUEST_IN_PROGRESS` retain it. A deliberate new action receives a new UUID, so identical messages remain legitimate. Cross-tab coordination is not attempted; two tabs are separate logical actions unless they explicitly carry the same key, while server authority remains distributed and rate limits still constrain new keys.

## Legacy compatibility

Ask, Product AI, Safety, Analyze, and Vet Brief draft temporarily accept the existing JSON `requestId` as the canonical key. If both header and body are present, they must match. First-party clients now send `Idempotency-Key`; ordinary writes have no optional production fallback. Remove body-key compatibility after deployed-client telemetry shows no legacy calls for at least one release cycle. Safe logs record operation, outcome, request ID, and timing—not payloads or hashes.
