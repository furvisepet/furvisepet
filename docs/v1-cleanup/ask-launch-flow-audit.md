# Ask launch flow audit — 2026-09-11

## Live baseline

- Production compound navigation/explanation/calculation request correctly returned 2,100 g and a working Clover profile link. Persisted conversation `d7bc1888-8720-4e45-9a91-c3f7ccea014a` nevertheless had outcome limited: evidence, subject/date and calculation checks were not evaluated.
- Clover episode request reproduced the unresolved legacy correction limitation. No exact count was claimed.

## Repairs

- Non-history completion review now separately returns evidence, subject/date and calculation verdicts with reasons. A failed verdict invokes the existing single repair and independent re-review. Missing/malformed verdicts cannot certify completion. Inapplicable checks require explicit justification. Evidence and final answer/action snapshots are bound together across review. Existing deterministic failures remain failures; mutation readiness never becomes execution success.
- Deletion receipts now retain affected pet IDs. Known deleted sources affect their pet. Missing identities conservatively affect all pets present at capture. Existing owner-only debt is backfilled to every existing pet, never cleared. New pets do not inherit historical deletion identities. Correction edges inspect their endpoint subjects. The existing authenticated read boundary, revision bracketing and writer provenance remain mandatory.
- Migration rollback restores conservative account-wide readers without deleting the new receipt information.

## Verification before deployment

- 1,452 focused tests passed, zero failed/skipped/cancelled.
- Full project TypeScript check passed; changed TypeScript ESLint passed.
- Disposable PostgreSQL/WASM writer-to-reader scenarios passed, including 70 sources/two episodes, import deduplication, correction/deletion invalidation, saved ordinal references, and unaffected Luna counts after deleting Milo data. Provider mocked in these SQL pipeline scenarios.
- SQL time/role/receipt assertions passed and rolled back. Private scope helpers and receipt tables remain inaccessible to application roles. Native multi-connection concurrency was not tested by the embedded database.

## Remaining limits

- Old unlinked correction notes, unclassified historical sources and unknown deletion identities still cannot establish exact counts. No correction relation is inferred or cleared by this migration. This does not complete legacy reconciliation or narrow unknown correction effects within the same pet to individual topics.
- This is an Ask audit, not certification of billing, Vet Brief or all launch surfaces.

## Production acceptance

Pending deployment and live verification.
