# Data deletion and export

## Data map and deletion order

Application deletion transactionally removes suggestions, conversation messages/conversations, Vet Briefs, current and legacy memories, product feedback, Pet State, care entries, episodes, concerns, pets, legacy/product/AI usage, and account preferences. Pet-dependent rows are removed before pet profiles. Global catalog/ingestion data is not user-owned. Storage has no current user-upload bucket; future objects must be added to this map before uploads launch.

The service-only `prepare_account_deletion` function derives the owner from the authenticated route, records aggregate counts, and never accepts a client-selected target. The route then deletes the canonical Supabase Auth user. Idempotency records cascade with Auth deletion. A pseudonymous deletion ledger containing user UUID, request UUID, status, counts, and error code is retained for 30 days. No medical narrative or email is retained there.

If Auth deletion fails, the ledger becomes `auth_delete_failed`, the user is banned, and database triggers reject inserts/updates for that UUID even if an already-issued JWT remains briefly valid. The route reports reconciliation rather than success, and an operator must finish deletion. Completed deletion records expire through operational cleanup. Technical behavior is not a claim of legal compliance; Privacy/Legal owners must approve retention and notice text.

## Export

`POST /api/account/export` requires authentication, same origin, a sign-in within 15 minutes, a canonical idempotency key, and distributed limits (3/user/hour, 6/IP/hour). It returns private UTF-8 JSON with account metadata, pets, care chronology, episodes, state, concerns, memories, conversations/messages, suggestions, product feedback, Vet Briefs, preferences, and an AI usage summary. It excludes prompts, provider output internals, security logs, idempotency records, Redis data, secrets, and global totals.

Immediate exports are capped at 5,000 rows per category and 96 KiB so the canonical replay result stays within the idempotency store limit. Larger accounts receive a support-assisted export; a future asynchronous design must use an encrypted private object, short-lived signed download, recent authentication, expiry cleanup, and no public URL.

Automated deletion tests must use disposable test users only. Never run them against production identities.
