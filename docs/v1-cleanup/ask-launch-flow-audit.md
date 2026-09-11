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
