# Legacy selection compatibility ? 2026-09-20

Base: 3a92be728fd11f8f80507bab65e36415186130b7. Offline only; no provider, Ask, deployment, or database mutation.

## Application caller inventory

Fresh tracked-source import/call/literal search found one application invocation of retrieveReadTicket, in intelligence/history-retrieval.ts::retrieveTicketHistory. Every ticketed application read enters through retrieveAskHistory before that call. No other application constructor assigns either strategy as a constant; both can enter via validated proposals or replayed server tickets.

| Producer / caller chain | Shape and scope | Selection and limits | Expected evidence / certification |
| --- | --- | --- | --- |
| api/ask/route.ts -> interpretAskQuestion -> validateAskRequest -> bindTicketedRead / bindProviderReadTicket | Provider readTicket, validated selected/named/conversation/account subjects, generic predicates, optional explicit window or semantic anchor; compare required for temporal_endpoints | chronological: globally ordered matches, then a global finite limit or unbounded output; hints can rank before truncation. temporal_endpoints: boundaries reserved per subject, followed by interior context, then a global output cap | Owned effective records inside the ticket window. Legacy chronology/endpoint coverage blocked by unfinished scans, unresolved lineage or omitted boundaries; no authority derives from a strategy name |
| validateAskRequest compatibility/mixed branch -> bindProviderReadTicket | Same validated ticket plus possibly independent legacy evidenceNeeds or a mixed append envelope | Same ticket semantics; evidenceNeeds are additional obligations, not permission to redefine the selection | Must retain every independent obligation; envelopes with evidenceNeeds remain legacy |
| api/ask/actions/[messageId]/route.ts -> continueConfirmedAppend -> bindReadTicket -> retrieveAskHistory | Revalidated persisted readTicket and readRequest, owned subjects; companion read after an existing confirmed append | Replays the stored ordering, limit, predicates and temporal scope; no new planner | Same compatibility boundary for eligible companion reads; confirmation and mutation code are unchanged |
| createAskEvidenceContract -> bindEvidenceReadTicket | Already-loaded direct evidence | Rejects non-null strategy and non-null limit; cannot produce either selector | Not migrated or modified |
| Vet Brief / legacy question-driven history retrieval | Separate legacy paths; vetBriefRead bypasses ticket branch | Not outputs.strategy producers in this boundary | Untouched |

Runtime frequencies cannot be inferred from static call sites. Provider schema remains capable of emitting eligible and ineligible legacy combinations. This is not a claim that the old branches are unreachable.

## Exact existing semantics

Both strategies use the existing owned effective rows, resolved temporal windows and AND/OR text predicates.
Tie-breaking is event time, creation time, then ID.

- chronological: global asc/desc order; hints, if present, rank ahead of chronological order. outputs.limit slices the combined result before the global 32-record / 18,000-character transport envelope. For one subject, no hints and finite N, this selected set is exactly ordered take N in the sole group. With multiple subjects it is a GLOBAL cardinality, not N per pet.
- temporal_endpoints: compute earliest/latest per subject; reserve these before interior records; then apply the global limit. The cap is transport/allocation, not a per-subject endpoint count. For one subject and cap 2, the semantic result is exactly the union of first and last (one record deduplicates). Larger or null caps admit interiors; cap 1 truncates a boundary.
- Completeness is retained exactly, including exhaustive. The adapter never changes exhaustive into sufficient or creates a certificate.
- Oldest-calendar-year remains ledger-resolved calendar semantics; C053 is untouched.

## One normalization boundary

New pure function: intelligence/legacy-read-selection.ts::translateLegacyReadSelection.

Input is a bound ReadTicket plus the count of separate legacy evidence obligations. It sees no question, names, dialogue, source bodies, database or model. The obligation count is an adapter precondition, not a new ticket primitive.

Call site: retrieveTicketHistory, before the common organ call. The normalized ticket is carried in the returned context into evidence, selection certificates, obligation authority and Labs. The original input is not retained as competing execution authority. A structural diagnostic records original strategy, translated flag and reason; no source bodies are logged.

Mapping:
- One subject, chronological, finite N, no hints/calendar/independent needs: groupBy subject; one clause event_at in original direction; take N/group.
- One subject, temporal_endpoints, limit exactly 2, no hints/calendar/independent needs: groupBy subject; union asc take 1/group and desc take 1/group.
- Remove outputs.strategy only on translated tickets.
- Retain outputs.ordering for presentation and outputs.limit as the original transport cap. Semantic cardinality is separately explicit in selection.take.
- Retain operation, subject scope/IDs, predicates, dates/anchor, completeness and all other dimensions.

Lungs, effective-selection, correction closure, certification, binder, Brain/schema, publication authority and Labs are unchanged. A compare ticket remains compare: translation does not invent calculations or broaden deterministic Labs eligibility.

## Deliberately untranslated

- Multi-subject chronological: the existing global take cannot be expressed by current subject-only grouping without changing per-subject obligations.
- Multi-subject endpoints: old reservation + interior fill + shared cap is not a pure endpoint union. Witness: two subjects, one missing, cap 4, five rows on the remaining subject returns four old rows but only two native boundary rows. Subject rotations are tested.
- Null chronological limits: unbounded selection is not finite take; transport budget is not semantic cardinality.
- Endpoint cap other than 2: boundary truncation or interior fill.
- Hints: old score-first ranking is not event_at ordering.
- Calendar selectors, including oldest_year: no calendar operator translation.
- Separate legacy evidenceNeeds: these obligations are not represented by the readTicket selection and cannot be silently discarded or assumed duplicates.
- calendar_samples: one record per subject/UTC-year bucket. Current groupBy supports subject only; a general calendar bucketing/grouping capability would be needed before considering equivalence.
- event_candidates: mandatory candidate-evidence bookkeeping/obligations, not simply ordered take. A generic candidate-set obligation and certification mapping must be established before migration. No primitive added.

## Parity and gate

40 adapter/parity tests pass. Migrated inputs and independently constructed native inputs have identical normalized tickets, authorized subjects, ordered records, semantic cardinality, full coverage/reasons/certificates, effective-stream diagnostics, derived obligation/source authority, Labs facts and deterministic presentation where that publisher applies.

Cases include latest/earliest N, single-subject boundary unions, absent evidence, deduplication, corrected/deleted endpoint, lineage failure, retrieval failure, byte/record budget pressure, alternate predicate, explicit window, from/after/before anchors, exhaustive obligation preservation, and production retrieval/context propagation. Multi-subject and rotated-subject tests prove non-equivalence and retention of the old behavior instead of claiming migration.

- Adapter/parity: 40/40.
- Body/architecture (including Lungs/effective-selection/Heart): 185/185.
- Publication/Labs/authority: 74/74.
- Brain/interpreter/timeout selection: 77/77.
- Broader safety: 46/48; same two baseline failures.
- Audit: 208/222; exact same 14 baseline failures.
- Typecheck: passed in dependency-complete checkout.
- Clean production build: passed after clearing build/typecheck caches in the dependency-complete checkout.
- Diff whitespace check: passed.

An intermediate broad translation exposed C218: separate evidenceNeeds plus quantity null excluded deterministic Labs; final publication failed publication_obligation_authority_required despite a certified first record. The equivalent native ticket reproduced it. The final adapter leaves this independent-obligation envelope unchanged. No audit expectation, publication gate or finalizer was modified.

## Remaining production dependencies

YES: the production read/replay callers still require old chronological execution for global multi-subject, unbounded, hint-ranked, calendar and separate-obligation shapes.

YES: the same callers still require old temporal_endpoints execution for multi-subject, interior-fill/truncated-cap and other excluded shapes.

Neither branch is deletion-ready. No branch was deleted and no new semantic primitive was introduced.
