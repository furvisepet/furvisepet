# Ask launch flow audit — 2026-09-11

## Live baseline

- Production compound navigation/explanation/calculation request correctly returned 2,100 g and a working Clover profile link. Persisted conversation `d7bc1888-8720-4e45-9a91-c3f7ccea014a` nevertheless had outcome limited: evidence, subject/date and calculation checks were not evaluated.
- Clover episode request reproduced the unresolved legacy correction limitation. No exact count was claimed.

## Repairs

- Non-history completion review now separately returns evidence, subject/date and calculation verdicts with reasons. A failed verdict invokes the existing single repair and independent re-review. Missing/malformed verdicts cannot certify completion. Inapplicable checks require explicit justification. Evidence and final answer/action snapshots are bound together across review. Existing deterministic failures remain failures; mutation readiness never becomes execution success.
- Deletion receipts now retain affected pet IDs. Known deleted sources affect their pet. Missing identities conservatively affect all pets present at capture. Existing owner-only debt is backfilled to every existing pet, never cleared. New pets do not inherit historical deletion identities. Correction edges inspect their endpoint subjects. The existing authenticated read boundary, revision bracketing and writer provenance remain mandatory.
- Migration rollback restores conservative account-wide readers without deleting the new receipt information.

## Verification before deployment

- 1,453 focused tests passed, zero failed/skipped/cancelled.
- Full project TypeScript check passed; changed TypeScript ESLint passed.
- Disposable PostgreSQL/WASM writer-to-reader scenarios passed, including 70 sources/two episodes, import deduplication, correction/deletion invalidation, saved ordinal references, and unaffected Luna counts after deleting Milo data. Provider mocked in these SQL pipeline scenarios.
- SQL time/role/receipt assertions passed and rolled back. Private scope helpers and receipt tables remain inaccessible to application roles. Native multi-connection concurrency was not tested by the embedded database.

## Remaining limits

- Old unlinked correction notes, unclassified historical sources and unknown deletion identities still cannot establish exact counts. No correction relation is inferred or cleared by this migration. This does not complete legacy reconciliation or narrow unknown correction effects within the same pet to individual topics.
- This is an Ask audit, not certification of billing, Vet Brief or all launch surfaces.

## Additional live save finding

The first app save for new synthetic pet Rowan failed with `ASK_TASK_INCOMPLETE_OBLIGATIONS_3` (request `a47d97af-ecfd-47de-aff3-fc56039e9fd4`). Completion review could inspect application cards but could not see already-governed semantic health events waiting for persistence. The reviewer now receives those events as pending actions for explicit saves, with exact subject/date/source data. It cannot invent events, change their authority or turn readiness into execution success. Ordinary observations retain their confirmation policy.

## Production acceptance

Database migration applied as `20260911062524`; retained legacy debt remains bound to the ten existing pets. Rowan was created using app onboarding afterward. Final application deployment and live recheck pending.

## Live persistence boundary finding

The retried answer reached persistence, where SQL rejected `RECORDED_SOURCE_PROVENANCE_INVALID`. `persistCanonicalSemanticEvent` had passed a presentation-rewritten source excerpt into the RPC while retaining the original source hash. The repair passes the original governed event; presentation preparation remains available for display and duplicate matching.

The disposable SQL scenario now runs every save through `persistIntelligenceLearnings`, the same coordinator used by the route, with only its connection factory replaced by the SQL test transport. It reproduced the exact production error before the one-line repair and passed all scenarios afterward. This supersedes the narrower direct-RPC writer coverage. No SQL validation was weakened.

## Production recheck after PR 299

- Rowan's empty recorded register returned exactly zero in conversation `cfb04a7d-4860-4736-8cc5-943d14f0998b`.
- On production `4cf0d5f75e0bb149b11b7b3a5b7f0ac88e08c88b`, a real Ask save created entry `1fbcd91b-9f64-4ea6-8ecd-b903bd51bd36`, original text and `2024-02-01` date intact, and episode `cdee674e-a232-4fcc-830d-4ac3eeb46c1c`. Conversation `a1bafbab-13db-4f4d-8aad-e6cec627becc` has the successful persistence receipt.
- Resolution request `d19836f0-4f30-45df-a2de-2a8d561e7e7a` failed before persistence with `provider_call_budget_exhausted` after interpretation and generation. The generator's repair/fallback calls lacked an explicit phase and were denied as third ordinary calls. They now use one generation-repair phase followed by independent review, at most four calls. Interpretation repair, generation repair and downstream review repair cannot stack into additional cycles. Deadline/cost accounting stays enforced.
- The successful save also exposed a redundant proposed application save card beside its receipt. Exact matching health proposals are now removed before review when the same owned pet's governed event already represents the explicit save. Distinct details, other destinations and unapproved writes are preserved. The actual receipt still depends on persistence.
- Full TypeScript and the save/completion plus real-admission request-contract regressions passed for these follow-up changes. Deployment and resolution retry pending.

## Further live acceptance and repairs

- Compound calculation/navigation retest on PR 300 production returned 2,100 grams, opened Rowan's actual profile, wrote no care entry, and persisted all five checks as passed. Conversation `7b5849ad-135f-4055-86ee-f6eabf55b671`, answer `1dfc66e7-1aa6-424d-b51d-de9e208c273c`.
- The resolution retry reached admitted generation repair but initially repeated invalid recovery metadata. Safe diagnostics then confirmed `return_to_baseline` was being used for a symptom ending. PR 301 supplied exact rejected evidence and narrower repair instructions; the next attempt passed that gate but requested another task repair after its review and exhausted the remaining deadline. PR 302 puts the distinction into the initial instructions and adds bounded task-review diagnostics. Resolution acceptance remains pending; a successful generation repair alone is not end-to-end success.
- History's actual UI rendered the original date-only February 1 observation as January 31, 4 PM in its browser time zone. PR 302 preserves the stated ISO calendar date when metadata matches UTC midnight, across desktop/mobile/detail views. Timed records retain local-clock formatting. Both negative and positive time-zone regressions passed.
- Other activity has added separate recent entries to Rowan while this test runs. Those entries were not created, modified or deleted by this verification. Whole-history certainty must account for unclassified sources; a year-bounded count is tested separately, not substituted for an all-time guarantee.

Positive native-count acceptance: conversation `35955bf4-c372-4b2c-952c-ddc9d665e9b5` returned exactly one recorded vomiting episode in 2024, February 1. Reload preserved the count and its saved reference. The subsequent real app question “What happened during episode 1?” returned the exact dated source note. This is actual production provider/browser/database evidence, not the mocked SQL harness. It does not certify broad-window counts when unrelated sources remain unclassified.

## Native symptom compatibility root cause

Production episode `cdee674e-a232-4fcc-830d-4ac3eeb46c1c` has `episode_type=symptom`, unprefixed key `vomiting`, and a rebuilt summary containing counts/source IDs but no semanticDomain. The governance matcher inferred domain only from summary or a prefixed key, making this legitimate health episode invisible to resolution. A regression using that exact shape failed before the fix and passed after recognizing the persisted symptom type as health. Explicit conflicting domain metadata, unknown episode types, uncertain recovery and unsafe resolution remain rejected. The SQL regression now also exercises resolution of this native shape through the real governance/persistence coordinator.

The same native-key mismatch existed in the private exact SQL writer. Migration `20260911072639` expands its three exact-key predicates to the typed health/symptom alias, preserving user/pet scope, ambiguity checks, chronology, advisory locks and grants. The extended SQL regression first reproduced `SEMANTIC_EVENT_ACTIVE_EPISODE_REQUIRED`, then passed all 13 scenarios after the migration. It was applied to production; the application compatibility deployment and final live retry follow.

## Resolution acceptance on production 86459b6

The original failed logical turn `d19836f0-4f30-45df-a2de-2a8d561e7e7a` now completed in three provider calls. It created exactly one resolution entry `39b31b27-3efc-41f1-b95c-d8f6af9cfdb1` from the original source message, dated `2024-02-03`; the original episode is resolved at that same date. Answer `6942466f-c5c0-4b3f-8e84-4edf15e7caa9` has a persisted receipt. The UI date fix is also verified: the initial History row now says February 1 without an invented clock time.

That successful resolution exposed two final presentation details: the duplicate-card filter omitted the canonical `symptom` category alias, and a generated recovery heading implied current improvement for a historical event. The filter now includes the alias with the same exact-source matching; a shared neutral recovery heading replaces that unsupported present-tense claim. Prior saved answers are not rewritten.
