# Canonical database compatibility — local validation, 2026-09-24

Application code tested: `addfa7cb2bab3196cd4fb27b1c1be960a0744a1f` (Phase 0 report commit: `8015b76`). Production was not migrated or deployed.

The 128 repository migrations through `20260920000100_retire_ask_owner_note_rpc.sql` were applied to an empty local Supabase PostgreSQL 17 database. Its initial auth.users and dog_profiles counts were zero. The production migration timestamp supplied for the equivalent retirement migration is different; this local replay does not prove production schema equality.

Exactly these pending migrations then applied successfully, in order, using `migration up --local`:

1. `20260923035225_canonical_append_items.sql`
2. `20260923072555_preserve_canonical_replace_body_fidelity.sql`
3. `20260923210524_isolate_canonical_ask_sql_inference.sql`
4. `20260923213727_bind_ask_suggestions_to_canonical_jobs.sql`
5. `20260923221741_generalize_canonical_replace_targets.sql`
6. `20260923224448_canonical_care_history_remove.sql`
7. `20260923231742_canonical_pet_remove_receipt_survival.sql`

A second, network-disabled disposable PostgreSQL 17 container independently replayed all 135 migrations. Existing real SQL behavior suites passed:

| Suite | Passed / total |
| --- | ---: |
| SQL inference isolation, APPEND and REPLACE | 29 / 29 |
| Canonical suggestions | 37 / 37 |
| Generalized replacement | 16 / 16 |
| Care-history removal | 31 / 31 |
| Permanent pet removal / receipt survival | 28 / 28 |

The local Supabase HTTP stack uses localhost-only published ports. Two synthetic users exercised real Supabase authentication and RLS: foreign profile/history reads returned no rows; an authenticated client could not call the service-only target RPC; the service client could. Application authority clients then created a canonical conversation exchange, minted an APPEND capability, persisted its suggestion, rejected foreign execution, confirmed the suggestion, verified the durable receipt and exact stored body, and replayed without adding a second row. No provider call was used.

An initial setup attempt to insert a conversation directly with the service key received 42501. This was a fixture error and the expected conversation write firewall, not an application regression. Setup was corrected to use createAskConversationExchange; no grants, application code, or test expectations changed. Real Ask/browser acceptance remains a separate Phase 2 gate.
