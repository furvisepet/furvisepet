# Phase 5 correction authority model

Status: design written before production edits; implementation clarifications appended below.

## Existing source vocabulary and authority

semantic_claims distinguishes owner/subject, occurred_at, recorded_at, valid_from/to, canonical/provisional concept identity, operation, modality/polarity, grounded source spans and source_message_lineage_id. governed metadata is persisted JSON, not independently an authority grant. Legacy lineage carries a source-row hash; imported structured note/title/severity and event time are freshly checked by effectiveCandidates.

semantic_claim_relations corrects/supersedes remove original facts and can establish replacement authors; retracts removes facts. confirms and derived_from do not mean attributed correction relevance. These relation meanings remain unchanged. No attributed relevance record may participate as an effective relation.

care_event_metadata semanticTopic/semanticTransition belong to existing writer-backed lifecycle vocabulary; sourceSpanId identifies canonical append source coordinates. Canonical Ask rows are explicitly isolated from legacy inference and legacy semantic persistence. Existing replacement safety rejects arbitrary semantic dependencies.

The old V2 governor rejects unresolved correction targets and is shadow-only. It cannot be used unchanged to persist attributed uncertainty: accepting an unresolved correction there as an effective writer operation would conflate authorities.

## Proposed reuse and source boundary

Reuse semantic_claims for explicitly tagged, non-effective source semantics: governance_metadata.sourceSemantics with a version, exact care-source snapshot and typed classification. Attributed rows have knowledge_status=unconfirmed, persistence_destination=none, modality=reported, operation_type=assert, no relation edges. They must be excluded from effective graph candidates. This reuses source/subject/concept vocabulary without overloading corrects/supersedes. Dedicated persistence and reader validation must enforce that non-effective shape; the general shadow writer is not authority for this tag.

Classification is observation or attributed_correction. Absence of migrated/verified semantics is unknown, not evidence that prose is non-corrective. A correction target is exact source/claim, scoped historical interval with optional canonical concept, or target_unknown. Reporting source subject and target subject must remain independently explicit and owned; no cross-pet authority expansion.

Bind snapshots to owner, subject, source ID, body, title, event time, created/updated version and source lineage. Changed/deleted/foreign source or changed metadata cannot retain relevance authority. No assistant text proves either attribution or persistence.

## Deterministic relevance

Compare owned subject first. Exact source/claim targets take priority when known; use verified target metadata to establish disjointness from the requested domain. Otherwise compare half-open target interval to the actual factual interval, not the broader correction-acquisition window. Known incompatible canonical concepts are disjoint; lexical request predicates do not by themselves prove canonical concept incompatibility. Missing dimensions remain uncertain. Unknown target remains bounded conservative uncertainty.

Attributed relevance may limit a matching effective fact. It never deletes an original, creates an effective replacement, certifies a calculation, or establishes current truth. Stored reports remain independently readable when fresh/owned, with attribution visible. Existing graph closure retains its authority.

## New writes and legacy import

New semantics must come from the SAME source-bound Brain mutation proposal. Append item semantics require exact source binding and persist atomically with the canonical write. Already-authorized replacement target identity can supply exact relevance; it does not create a new graph edge. Older capabilities without semantics cannot be promoted to observation by default. Their disposition must remain conservative.

Legacy import is separate from retrieval. It accepts reviewed typed interpretations against immutable source snapshots, never invokes a model during retrieval and never emits effective edges. Frozen raw fixtures stay byte-for-byte unchanged; reviewed typed sidecars are separately hashed. Any provider-assisted production import is preparation-only in this task.

Before enabling the tagged claim path, prove SQL exclusivity of the tag, canonical isolation compatibility, bounded owner-scoped discovery, fresh snapshot checking, replay and tamper rejection. No partial reader activation without its persisted producer.

## Canonical receipt equivalence

Retain planning-context -> storedReadReferences -> stored-read-organ. Operation receipt proves terminal operation status, not continued linked-record existence. Current row/stored-report proof is separate. Migrate old context tests only after canonical fixtures establish dialogue-independent receipts, future dates, deleted rows, owner/pet isolation, terminal states, action/receipt freshness and multiple records.

## Verification and scope

No provider calls, production access, deployment, push, reset or fixture rewriting. Read-side classification must contain no correction-word/year prose inference. Gate changes must preserve factual/security obligations. This design may be refined against repository evidence; any authority change must be recorded before implementation.


## Implemented representation and limits

The exact persisted tag is governance_metadata.sourceSemanticsPayload, containing serialized UTF-8 JSON. turn_payload_hash is its SHA256; the reader verifies the exact payload bytes before parsing. The payload contains version, exact care-source snapshot, classification and target. Classification explicitly includes unknown. The source snapshot includes sourceMessageId and sourceSpanId in addition to owner, pet, ID, exact body/title and timestamps.

The existing semantic-claim row vocabulary is reused with source_type=legacy_import and provenance_classification=system_derived because this record describes a persisted care-source version; it does not pretend to be an extracted effective USER claim. Its grounded evidence names that care source. For new canonical writes the successful capability/receipt transaction stamps the same Brain job's typed meaning, with exact body equality. The canonical action and receipt separately retain the actual current USER spans, including replacement provenance. No second interpreter runs.

A per-owner/source/version idempotency key prevents conflicting import replay. Tagged claims cannot be promoted, edited into effective facts, or acquire any graph relation. Nulling a deleted source-message foreign key remains possible; active source snapshot validation still fails closed after any relevant change. Cleanup deletes canonical care children before source messages, preserving the existing canonical-origin immutability rule.

The authenticated read RPC returns at most 76 classified sources/claims per page (64 requested candidates plus at most 12 additional non-observations), with explicit completeness. Foreign subjects, missing classifications, stale snapshots, over-budget discovery and malformed pages withhold effective authority. The common execution deadline remains in force. Missing semantics anywhere in the owned subject's active care corpus is conservative incompleteness: deployment requires explicit reviewed import before expecting historical availability.

Exact source/claim targets use freshly owned target metadata. Absent/deleted/unavailable target dimensions remain unknown. Known canonical concepts are compared only when both sides provide an existing canonical identity; lexical ticket terms are never promoted to canonical concept authority.

An already-authoritative, closed corrects/supersedes relation can resolve a report from its same linked source. An exact attributed target must match that relation's target; scoped targets must match the prior claim's typed interval/concept. Mere legacy linkage cannot resolve attribution. Effective graph semantics themselves are unchanged.

New Brain write proposals may supply observation, unknown, or attributed scope/unknown semantics. They cannot mint arbitrary database target IDs or canonical concept identities because this proposal boundary does not expose verified target/concept handles. Explicit reviewed imports can bind exact owned IDs. This is intentionally conservative, not a text fallback.

Existing capabilities and terminal receipts are not rewritten by the migration. Pre-upgrade pending canonical jobs still execute under existing policy; absent semantics become unknown atomically with the receipt. No source-version snapshot is fabricated during upgrade. Clean 135-migration and representative 134-to-135 upgrade rehearsals passed in network-disabled disposable PostgreSQL.
