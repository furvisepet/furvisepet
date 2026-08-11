# Information removal semantics

Furvise exposes three separate information-removal concepts. They must remain separate in product copy, APIs, and persistence.

## Remove from History

This hides one `pet_care_entries` chronology item by tombstoning it. The event and its episode membership remain as internal provenance. If the event belongs to an active or monitoring lifecycle, the user must choose whether to keep tracking that lifecycle or dismiss it too.

Lifecycle dismissal is non-clinical. It sets the episode and canonical concern to `dismissed` with `dismissal_reason = user_removed`, removes that lifecycle from current-state projections, and does not create a resolution History row or claim the condition ended.

## Forget remembered detail

This changes only the lifecycle of the selected pet or owner memory. Forgotten memory records are excluded from active memory retrieval. It does not remove or alter History, episodes, concerns, current state, or conversations.

## Fully erase information

Full privacy erasure is not implemented by History removal or memory forgetting. A future explicit destructive/privacy API must accept a precisely scoped fact or record set and atomically remove or redact every matching representation:

- visible and tombstoned History content;
- episode membership and materialized episode projections;
- current-state values and source references;
- active, resolved, and dismissed concerns;
- pet and owner memories;
- user and assistant conversation content plus provenance;
- persisted `context_used` and other context metadata.

The future contract must be owner-scoped, cross-pet isolated, idempotent, auditable without retaining the erased content, and explicit about records that cannot legally be removed immediately. It must not reuse either the History tombstone RPC or the memory-forgetting action.
