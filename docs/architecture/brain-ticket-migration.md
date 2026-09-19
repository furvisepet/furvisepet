# Brain / ledger migration

Base: `98ccba4898dae5d6297d223723ae0be0cf4a6124`.

## Target and current status

The target is one semantic plan per turn, deterministic authorized execution,
one authority for pet history, and evidence-bound responses. This branch begins
that migration. It is **not** the completed architecture and is **not** a launch
readiness claim. No production deployment or database change is included.

## Implemented: remove alternate interpretation entry points

- Delete `app/lib/ai/ask-command-router.ts` and disconnect it from the Ask route.
  Navigation, language preferences, and latest-note correction no longer use
  this pre-provider command interpreter.
- Delete the completed-note/two-weights, latest-weight, dental-anchor, and
  saved-note-readback fast planners from `interpret-ask.ts`.
- Delete the casual-follow-up working-memory router. Bounded prior dialogue
  remains available to the semantic planner as reference context.
- Remove phrase gates controlling whether the interpreter receives older user
  reference candidates. Give it the previous user question without assigning a
  reformulation task on the basis of word matches.
- Supply completed-write identifiers to planning as references, explicitly
  requiring record retrieval for factual answers. Do not let a planning failure
  fabricate a successful read plan.
- Derive Brain memory depth from the validated historical window rather than
  checking the question for lifetime words. Pass the typed operation and window
  explicitly from `buildAskBrainTurn`; do not cast the request into an envelope
  whose fields were discarded by validation. Memory depth is not a coverage
  certificate.

## Test cleanup

Removed tests whose requirement was execution of a deleted shortcut. Retained
navigation destination validation as a test of typed application actions. The
semantic-entry suite checks full-message delivery, no shortcut success when the
planner fails, successful contract validation, and rejection of malformed plans.
It uses injected clients and forbids real network calls.

The multi-turn runner checks that its suite files exist and that tests execute
successfully, instead of requiring the stale total of 42 tests. It now includes
the semantic-entry suite. Other assertions in the mixed-save and first-20
regression suites remain. Removed an unused test import.

Removed the one-off `ask-human-architecture-diagnostic.yml` workflow, which ran
only on the old `codex/ask-human-architecture-v1` branch and referenced retired
tests. The normal CI and database-backup workflows remain unchanged.

These tests do not measure real-model language understanding. Existing security,
mutation authorization, receipt, retry, and correction tests are not obsolete
merely because they were written for the previous implementation.

## Repository-backed remaining migration

| Boundary | Current code | Required replacement |
| --- | --- | --- |
| Pre-planning execution | `app/api/ask/route.ts` calls `resolveOwnerNoteRequest` and can persist a note before `interpretAskQuestion`; other deterministic branches also precede planning. | Distinguish explicit UI transport commands from natural language. Execute natural-language actions only after a validated plan, retaining independent write receipts and retries. |
| Semantic contract | `ask-request-contract.ts` validates a request but also rewrites its meaning using raw-text rules. Its public request type does not represent a general action graph. | Immutable multi-action ticket with exact source spans, independent read/write subjects, action dependencies, temporal bounds/anchors, requested output and completeness. |
| Write authorization/content | `ask-task-continuation.ts`, `owner-note-request.ts`, and application-action capabilities use separate source/intent rules. Database RPCs also verify source content. | One source-bound execution contract and compatible database validation. Update both together; deleting the parser alone would break or weaken source integrity. |
| Retrieval | `history-retrieval.ts` reparses `currentMessage` for anchors, dates, latest records, and weight comparisons. | Typed queries over effective events; explicit ambiguous/missing anchors; traversal and semantic matching coverage reported separately. |
| Durable history and projections | `persist-learnings.ts` dispatches among note batches, canonical care actions, semantic events, and memory persistence. | Trace every writer and reader, choose canonical historical authority, backfill with provenance, and make derived state rebuildable. Do not create a second ledger beside the first. |
| Answer generation | `generate-ask-history.ts` retrieves context and invokes `runFurviseIntelligence`, with downstream review/finalization. | Evidence/result envelope containing exact records, calculations, coverage and action receipts; response wording cannot certify state. |
| Product surfaces | Ask, History, Today, profile-derived values, and Vet Brief still need a shared-authority audit. | Move every surface to the same effective-event projection and verify correction/deletion consistency. |

## Execution contract decisions required for the next stage

1. A turn contains multiple actions. Each action has a stable ID, dependencies,
   exact source references, and a distinct result. A failed read must not erase a
   completed write. Conditional actions require explicit dependency outcomes.
2. Account identity comes from the authenticated server session. Resolve and
   validate proposed subjects inside that account. Models cannot grant ownership.
3. Preserve event time, save time, correction lineage, and uncertainty separately.
   Defaulting an undated note to save time does not prove occurrence time.
4. A completed traversal certifies only its declared scope and predicates. It
   does not prove every relevant free-text event was recognized or that an event
   never occurred outside the accessible records.
5. Exact source text is allowed as content/evidence. Organs must not reinterpret
   it as executable instructions. Assistant dialogue is reference context only.
6. Preserve server-owned authorization, billing, idempotency, confirmation and
   receipt policies while replacing their semantic inputs.

## Verification and release limits

Validation completed: TypeScript passes, changed-file ESLint passes, and the
combined affected offline run reports 89 passing outer tests (some launch nested
audits; this is not a count of unique model questions). Real-model semantic
evaluation, a full cross-surface integration run,
database migration/backfill validation, and production acceptance remain open.
Use no paid model calls or GitHub Actions during this work. The review branch
must not match existing push workflow triggers. Do not open a PR that starts CI
under the current no-CI constraint.

Removing shortcuts increases runtime reliance on the semantic provider for those
requests. This does not make the live feature usable without provider funding,
and local mocks cannot establish its latency, cost, or language accuracy.
