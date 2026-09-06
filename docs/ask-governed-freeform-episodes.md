# Governed freeform recorded episodes

Local code and SQL/test preparation against `6400a772f5860458445d80f66d6e1342174bacdd`. No database execution, migrations, providers, credentials, installations, commits or deployment. Work stayed in the supplied isolated worktree. The authorized node_modules junction was created; its target was not edited. AGENTS.md and the installed Next.js route-handler guide were read. Supabase documentation and actual SQL validation remain supervisor responsibilities.

## Production-path benefit and authority

The current Ask path is `governCanonicalEvents` -> `persist-learnings.ts` -> `persistSemanticEventRpc` -> `persist_furvise_server_semantic_event`. It now carries source-bound `ask-governed-source.v1` evidence. Once the supervisor applies the paired drafts, a new note such as "Milo started vomiting after breakfast and threw up on the kitchen rug." and a later "Milo continued vomiting this afternoon after drinking water." can certify one persisted episode identity. The callback test uses the actual governor, RPC serializer, inventory reader, final answer validator and saved-reference callback; only the database transport is doubled. It verifies two source entries, one counted identity, sequence number 7 distinct from display ordinal 1, and both notes on follow-up. No model-supplied count becomes authority.

Current lifecycle membership is not enough: `lifecycle_event_role` infers opening from the first entry, and also maps observed/changed transitions into roles. Legacy import copies these roles. V2 lifecycle compatibility can infer an opening from active state; production phase-3 cutover excludes lifecycle claims. None of those paths is upgraded by trusting event_role or retroactively adding provenance.

The new provenance is produced after current semantic-event governance, then strengthened by existing owner assertion, certainty, pet-observation and shared symptom-topic evidence checks. The full source cannot contain recognized negation, uncertainty, attribution, questions, conditions or correction. Exactly one recognized symptom-topic family must agree with the governed topic. An explicit started/continued verb must introduce the recognized symptom; "started eating after vomiting" does not prove onset. No whole-note prose template or expanded phrase list is introduced. This remains a conservative recognizer, not a claim that regex understands arbitrary language.

The trusted server RPC verifies owner/pet/conversation/message scope, full source hash, note hash and event/provenance agreement, then delegates to the existing persistence implementation. Only new successful writes acquire provenance. Database-returned care/episode/membership identities bind it to actual recorded objects. Opening requires explicit started, no prior governed episode and an opening membership; continuation requires continued and the same prior episode identity. Observed/confirmed events may have classification but their boundary remains unknown. Idempotent retries cannot certify old rows or overwrite an earlier proof.

Private RLS-enabled storage retains hashes of the complete care row and membership, full-message hash, note hash and classification metadata; it does not duplicate source prose. Direct client/service-role table access is revoked. The server RPC keeps its existing service-only authority; its internal reader is not client-callable. Reads recheck current owner, pet, message, conversation, care and membership. A retained proof with changed or missing source evidence returns explicit null, preventing fallback to legacy prose. Absence of a proof row preserves the older contract. Correction closure, forgotten-source filtering, all read-revision brackets and display-page reference hashes remain in place.

The current writer's health_ episode namespace is queried alongside existing keys and projected consistently for list and pinned-page reads. Unchanged, reliably classified other-topic care notes (tested with a natural limping note) are excluded from a vomiting census. Classification uses a separate inventory topic family so a related alias is never treated as unrelated merely because its spelling differs. Missing, changed, ambiguous or unknown classification stays in the census and blocks certification.

## Precise unsupported scope

This is an expansion for newly governed health care entries, not complete arbitrary pet history. Unrecognized discourse or symptom families, implicit onset ("Milo vomited after breakfast"), other transition expressions, mixed topics, ambiguous subject/episode identity and unsupported persisted topic keys remain unknown. The explicit started/continued check permits freeform surrounding prose but does not certify all synonymous onset/continuation wording. General care notes, non-health semantic writers, manual writes, existing imported notes and V2 claims do not gain this new authority. Imported source-row hashing and the `care_root.care_id` alias fix are retained.

Legacy readers and the existing narrow legacy text contract remain compatible; unknown_legacy roles remain unknown. The original audit, fixtures and harness were not rewritten. The count unit remains distinct persisted recorded episode identity, not clinical diagnosis, symptom occurrences, sequence numbers, unrecorded life events or conversation-only history. Existing 32-episode/64-source limits, eight-source group limit, eight-item display, timeouts and owner-wide removal debt remain. Large inventories are not performance-certified here.

## Revisions

Ordinary writes now update an owner-specific transactional revision row. Ownership transfers invalidate both old and new owners in deterministic order. Semantic registry/alias writes update a separate singleton registry version. Reader revision strings combine owner and registry versions; legacy numeric revisions are still accepted. No registry/global row is updated on every user write. Existing graph rereads and the final inventory bracket still compare the complete payload. SQL assertions cover own mutation, unrelated-owner stability, ownership change, registry mutation and transactional rollback. They are preparation, not concurrency or scale evidence.

## Verification

Before edits: original recorded callback suite 34/34; original lifetime audit 14 pass / 3 fail. After edits: full `node --test` 2285/2285; new focused in-process suite 18/18; original recorded callback suite 34/34. Typecheck (`node node_modules/typescript/bin/tsc --noEmit --incremental false`) passes. Lint (`node node_modules/eslint/bin/eslint.js`) exits 0 with the same two unused-supabase warnings at persist-learnings.ts:141 and :374. The PowerShell npm script shim was unavailable under the existing execution policy; checks used the installed Node entry points without changing policy.

The focused tests cover onset vs continuation, saved references, source changes, missing/null proof, foreign owner/pet/topic, inferred role, correction, forget, revision mutation, negation, hypothetical/attributed/uncertain reports and wrong-topic/wrong-predicate proposals. SQL preparation additionally covers real RPC persistence, message hashes, unchanged unrelated-note classification, unknown notes, membership change, source removal, ownership, idempotency and reversal.

The untouched original lifetime audit still has exactly these three failures:

- `RED old canonical episodes survive the 20-row loader window`
- `RED retrieved episodes retain sequence and recurrence identity`
- `RED later stage: compute exact separate-episode aggregate, not a note count`

Full assertion details are in ask-governed-freeform-baseline-audit.txt and ask-governed-freeform-remaining-audit.txt. These unsupported legacy requirements were not weakened. All 19 pre-existing scripts/audits files were compared byte-for-byte with the base commit. Working, staged and newly added files receive whitespace/diff checks; no staging or commit is needed for those checks.

## Supervisor database validation

SQL has NOT been executed here. These are replacement preparation drafts, not an in-place upgrade migration for an installed singleton revision table. Start with a disposable schema containing the separately validated episode-membership contract, without the prior recorded-inventory draft installed. The supervisor owns migration packaging, upgrade sequencing and documentation verification. Apply writer provenance before the revised reader draft, then execute the original assertions and new rollback assertions:

```sh
psql -X -v ON_ERROR_STOP=1 -f supabase/drafts/ask_governed_freeform.sql
psql -X -v ON_ERROR_STOP=1 -f supabase/drafts/ask_recorded_completeness.sql
psql -X -v ON_ERROR_STOP=1 -f supabase/tests/ask_recorded_completeness.sql
psql -X -v ON_ERROR_STOP=1 -f supabase/tests/ask_governed_freeform.sql
psql -X -v ON_ERROR_STOP=1 -f supabase/tests/ask_governed_freeform_reversal.sql
```

All assertion fixtures roll back. The new combined reversal test restores the prior reader/writer inside a savepoint, checks table removal and grants, rolls the reversal back and verifies the draft functions are restored. The untouched old standalone recorded reversal fixture targets the old standalone draft; the combined reversal includes the new trigger/table dependencies. For a committed disposable reversal, apply ask_recorded_completeness.rollback.sql followed by ask_governed_freeform.rollback.sql. Application/SQL rollout and reversal must be coordinated: sending new proof to the old SQL writer is not supported. Real source/ownership constraints, migration security compatibility checks, transactional behavior and multi-session contention remain unvalidated here.

## Changed files

Application: app/lib/intelligence/{recorded-provenance.ts,recorded-inventory.ts,episode-history.ts,episode-membership.ts,semantic-events.ts,semantic-event-persistence.ts,types.ts}.

Drafts: supabase/drafts/{ask_governed_freeform.sql,ask_governed_freeform.rollback.sql,ask_recorded_completeness.sql,ask_recorded_completeness.rollback.sql}.

Tests: scripts/audits/ask-governed-freeform.cases.mjs; tests/ask-governed-freeform.test.mjs; supabase/tests/{ask_governed_freeform.sql,ask_governed_freeform_reversal.sql}.

Reports: this document and docs/ask-governed-freeform-{baseline-audit,remaining-audit,focused,legacy-contract,suite,typecheck,lint}.txt. The node_modules junction is local setup only.
