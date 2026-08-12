# Information removal semantics

Furvise exposes three separate information-removal concepts. They must remain separate in product copy, APIs, and persistence.

## Delete a History event

Delete means Furvise stops remembering, tracking, and using the selected History event. One governed operation tombstones the `pet_care_entries` chronology item and, when linked, dismisses its active or monitoring episode and canonical concern and removes their current-state projections.

Lifecycle dismissal is non-clinical. It sets the episode and canonical concern to `dismissed` with `dismissal_reason = user_removed`, preserves relational episode membership as internal integrity/audit provenance, and does not create a resolution History row or claim the condition ended. Tombstoned entries and dismissed lifecycle projections are excluded from Ask context.

## Forget remembered detail

This changes only the lifecycle of the selected pet or owner memory. Forgotten memory records are excluded from active memory retrieval. It does not remove or alter History, episodes, concerns, current state, or conversations.

## Fully erase information

Full privacy erasure is not implemented by History deletion or memory forgetting. A future explicit destructive/privacy API must accept a precisely scoped fact or record set and atomically remove or redact every matching representation:

- visible and tombstoned History content;
- episode membership and materialized episode projections;
- current-state values and source references;
- active, resolved, and dismissed concerns;
- pet and owner memories;
- user and assistant conversation content plus provenance;
- persisted `context_used` and other context metadata.

The future contract must be owner-scoped, cross-pet isolated, idempotent, auditable without retaining the erased content, and explicit about records that cannot legally be removed immediately. It must not reuse either the History tombstone RPC or the memory-forgetting action.
