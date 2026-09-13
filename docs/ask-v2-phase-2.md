# Ask v2 Phase 2

Phase 2 adds canonical concepts, explicit legacy lineage, and pure shadow rebuilds. Production Ask remains legacy-authoritative. The migration performs no import automatically.

## Canonical concepts

`semantic_concepts` is a server-owned, versioned registry. Canonical keys are stable identifiers. A concept revision is immutable; deprecating an active revision and inserting a new version preserves reproducibility. `semantic_concept_aliases` contains exact registered aliases. Resolution normalizes the complete candidate and performs exact equality only. Zero matches remain provisional or unresolved; multiple matches are ambiguous. No substring, suffix, title, or fuzzy matching grants authority.

Normal clients have no table access. The Phase 1 persistence path cannot supply a canonical database ID: a database trigger resolves canonical key plus version against the active registry and fills `semantic_concept_id`, or rejects the claim.

## Legacy import

`import_legacy_semantic_claims_v2` is service-role-only and accepts the Furvise-server-verified tenant separately from source selection. It supports bounded imports from `pet_care_entries` and `furvise_memories`, revalidates every source and pet owner, and rejects mixed-tenant source ID lists.

`semantic_claim_legacy_lineage` maps one source row to one deterministic imported claim. Its unique tenant/table/row/role key prevents duplicates. A stored source hash makes a changed legacy row fail closed pending an explicit future re-import policy.

Legacy imports use `evidence_basis = legacy_record` and an empty evidence array. They never fabricate source excerpts or offsets. Normal Ask v2 persistence retains `grounded_source_text` and the Phase 1 evidence checks.

Episode, concern, and current-state rows are comparison/provenance inputs, not independent imported facts. Existing membership roles may be preserved on History claims, but only a canonical, lifecycle-capable registry concept can mutate a v2 lifecycle stream.

## Shadow rebuild

The TypeScript rebuild is pure and versioned. It sorts by `occurred_at` when present, then `recorded_at`, then claim ID. Imported claim IDs are deterministic UUIDv5 values, and every output row plus the bundle receives a stable SHA-256 hash.

Relations and knowledge status determine effective claims. Tombstoned, dismissed, forgotten, rejected, unconfirmed, superseded, corrected, or retracted knowledge remains in audit inputs but is omitted from effective projections. Lifecycle reconstruction keys streams by owner, subject, and canonical concept. It never reads History display titles.

Shadow outputs cover History, unified memories, episodes, concerns, and current state. They are not written into production projection tables and are not used by Ask responses.

## Operational sequence

1. Apply schema/functions in a reviewed migration window.
2. Run bounded tenant audit imports explicitly with the service boundary.
3. Compare deterministic shadow output with legacy projections.
4. Investigate disagreements; do not repair automatically.

The migration adds tables, indexes, claim columns, constraints, and triggers. It does not scan legacy source tables for backfill. The only potentially table-scanning operations are new `semantic_claims` constraints and the registry foreign key; Phase 1 has no production Ask writer, so this ledger is expected to be small. Confirm ledger row count before migration scheduling.
