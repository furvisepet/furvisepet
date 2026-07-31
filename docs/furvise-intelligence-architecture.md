# Furvise Intelligence Architecture

## Source-of-truth hierarchy

Furvise uses one intelligence engine and several deliberately different persistence layers. The model proposes structured output; deterministic server policy authorizes changes. The model is never a database authority.

1. `dog_profiles` owns stable identity and explicitly managed profile fields.
2. `pet_current_state` owns the best supported present condition and references its source events.
3. `pet_care_episodes` owns occurrence grouping and lifecycle, not event prose.
4. `pet_care_entries` owns immutable chronological events.
5. `furvise_memories` owns learned preferences and contextual facts with freshness metadata.
6. `pet_concerns` owns current actionable concern state and may point at an active episode.
7. Ask conversation rows provide bounded recent continuity only.

The same fact is not independently authoritative in multiple stores. A recovery is an immutable care event; its episode becomes resolved; Pet State reduces the newest event to the current breathing value; a concern reflects whether action is currently required. These are linked projections with different responsibilities.

## Request and credit lifecycle

Ask authenticates, verifies pet ownership, persists/reuses the user message, and loads profile, Pet State, active concerns, bounded episodes/events, fresh memories, and recent conversation in parallel. Deterministic safety runs before one structured model request. Governance and answer validation run after generation. Approved canonical changes commit before the assistant response claims persistence. The assistant answer is then persisted and exactly one reserved credit is finalized. Validation or provider failure releases the reservation and keeps the user message retryable.

Product AI, Safety Follow-up, Vet Brief, and future intelligence features reuse the same feature modes, retrieval policies, governance primitives, memory freshness rules, and unified credit ledger. They must not create parallel memory or state systems.

## Care episode lifecycle

An episode groups one coherent occurrence. Deterministic assignment uses pet, normalized key, event action, linked concern, timestamps, and explicit recurrence/resolution language. A continuation joins an active episode. Recovery resolves it. Recurrence after resolution creates a new sequence and points `recurrence_of` at the prior episode. Previous episodes and all care events remain unchanged. General observations can remain episode-free.

Episode summaries contain deterministic fields such as event count, latest status, and source record IDs. Unsupported narrative is never canonical. `backfill_pet_care_episodes` is service-only, dry-run by default, idempotent, and groups only concern-linked events with explicit episode metadata. Ambiguous history is reported and left untouched.

## Pet State reducer

`pet_current_state` is a versioned projection, not history. Registered domains define valid values, confidence floors, safety relevance, and freshness. Unknown domains are absent rather than filled with defaults. The incremental database trigger applies a newly inserted canonical event in the event/episode transaction. `recompute_pet_current_state` rebuilds from immutable chronology under an advisory lock for repair and schema evolution. Incremental and full reduction share newest-event-wins semantics: urgent, recovery, recurrence, and second recovery produce abnormal, normal, abnormal, normal.

## Memory freshness

Freshness policy is centralized in `app/lib/intelligence/memory-freshness/policy.ts`:

- permanent: no automatic decay or expiry;
- long-lived: aging after 180 days, stale after 365, expiry after 730;
- medium-lived: aging after 45 days, stale after 90, expiry after 180;
- short-lived: aging after 3 days, stale after 7, expiry after 14;
- episode-bound: aging/stale after 1 day and expiry after 7 unless the episode resolves sooner.

Confirmed allergies and other permanent explicit constraints do not casually decay. Expired memories are excluded. Stale relevant facts may be used only with uncertainty and a natural confirmation prompt; irrelevant stale facts do not interrupt the answer. Confirmation resets freshness and effective confidence.

## Persistence governance

The unified governance layer receives proposed care actions, state effects, memories, and profile changes. It verifies source-message evidence, selected pet, confidence, allowed action, duplicates, protected fields, diagnosis/medication safety, and current state. Decisions are accepted, rejected with a stable reason, or deferred for confirmation. Protected identity, species, sex, birthdate, allergy, weight, medication, and diagnosis changes are never silently authorized by model confidence alone.

Canonical care persistence remains source-message-idempotent and transactional. Episode assignment, concern transition, Pet State reduction, suggestion linking, and care-entry insertion occur in the database transaction and use row/advisory locking plus unique indexes. Assistant-message persistence is separately recoverable and conversation loading reconstructs persistence from actual care-entry IDs.

## Post-generation validation

The deterministic validator checks persistence language, current-state and safety consistency, unsupported diagnoses, pronouns, stale facts, resolved-history relevance, internal diagnostics, and banned em dashes. Safe repairs remove false save claims, neutralize unsupported pronouns, remove irrelevant resolved warnings, remove diagnostics/unsupported diagnoses, and align safety with canonical state. If repair empties or cannot make the answer safe, generation fails, the credit is released, and the saved user message can be retried.

The answer body never authoritatively says data was saved. Canonical labels such as “Added to care history” are rendered only after a concrete persisted record ID is returned.

## Security, observability, and repair

All new tables use owner RLS. Trigger functions have fixed `search_path` and no client execute grant. Repair, recomputation, backfill, and integrity diagnostics are service-role only. Production logs include request ID, feature, pet ID, context state version, episode counts, selected state domains, proposal/decision counts, deterministic repairs, and persistence outcome without raw conversation content.

Repair tools:

- `repair_furvise_recovery_events`: explicit-user-message chronology compatibility repair;
- `backfill_pet_care_episodes`: dry-run episode grouping;
- `recompute_pet_current_state`: dry-run/full state rebuild;
- `diagnose_furvise_integrity`: service-only integrity report;
- `scripts/diagnose-furvise-integrity.mjs`: development operator wrapper.

Failures never delete history. Reconciliation trusts structured metadata and explicit user evidence, not assistant prose.
