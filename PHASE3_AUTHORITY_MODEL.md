# Phase 3 authority model

Baseline: 8df9937704751789fa96ef55b283dc0b1ec54850, v1/intelligence-consolidation.
Written before application edits. Offline only; no provider or production access.

## Existing vocabulary and gap

ReadTicket expresses owned subjects, temporal boundaries, literal predicates, and selection/completeness, but not the proposition's evidence authority. ReadSourceLineage already describes an unlinked/uncertain source as attributed_report. HistoryCoverage provenance binds care/claim IDs and records unlinked_correction_uncertain, source freshness, tombstones and supersession. These describe observed evidence, not the requested proposition.

LabsList carries exact bodies, source IDs, subject IDs and event time with a server-only WeakMap snapshot. It lacks recorded time and a requested report/fact distinction. Publication obligations derive from selection or result-set receipts. Both receipt validators currently require effective lineage closure. EffectiveWindowResult distinguishes graph closure, replacement-seed exhaustion and unresolved source lineage. OrderedResultSetProof separately records acquisition exhaustion, matching-set completeness and representation completeness. None can currently certify literal wording without also implying effective-fact authority.

## Chosen representation

Add one optional typed ReadTicket authority: effective_fact or stored_report. Provider proposals must choose explicitly. Omission in legacy/server callers retains effective_fact. Brain selects the requested proposition once; Binder validates shape and domain compatibility, never language. Calculations accept effective_fact only, in provider grammar and Calculate Binder. Stored reports initially support ordinary concrete-window read/selection, without episode, semantic anchors, probes, or legacy strategy operators whose semantics require effective events.

Reuse the same acquisition, bounded selection, result-set receipts, source IDs, ownership/freshness checks, and Labs snapshots. Qualify receipts with the requested authority, and add store-owned storedReportsCertified proof to the existing window/stream/frontier shapes. This certifies exact active source versions, not lineage. Keep lineageClosed and replacementSeedsExhausted truthful and unchanged; never set them merely because report content is readable. Publication must match ticket authority to receipt authority and cannot relabel a report receipt as effective fact.

The existing correction reader continues checking owned sources, freshness, deleted/withheld roots and graph safety. For stored-report windows it returns exact validated original care records, including superseded wording where the source remains active, and the exact stored payloads of active native correction/replacement authors in the existing closed graph. It does not substitute an effective replacement for an older report. Native report IDs retain claim provenance under attributed_report, qualified by stored_report ticket coverage. Inactive/tombstoned and changed sources remain excluded. The initial implementation conservatively retains graph availability/source-validation requirements: it is not an outage fallback. The native-claim case was refined during review after a failing source-form regression showed that retaining care rows alone would omit stored intermediate correction statements; no new source discovery path was added. Existing unresolved-source provenance stays visible.

Labs records add recorded_at only for stored-report transport. The deterministic stored-report renderer explicitly attributes subject, source ID, recorded time and exact quoted body, labels event time as recorded metadata, and states that these reports do not certify effective/current truth or supersession. Unlinked lineage and read_committed_no_snapshot limitations remain visible. Narrative publication cannot convert these source IDs into unrestricted factual claims; report claims must preserve the typed attribution.

## Invariants and scope

Default effective reads, current/corrected facts, calculation roles, slot execution, effective correction algorithms, snapshot limitations, and owned subject checks remain unchanged. Report authority is never inferred from raw wording below Brain. No regex routing, second planner, extra interpretation or provider retry. Effective requests may remain limited when lineage is unresolved; no automatic authority downgrade.

The existing frozen stress corpora remain byte-identical, with no invented edges. The two record-level stress requests may explicitly propose stored_report; true latest/effective requests stay effective_fact. All existing acceptance assertions are retained. Add arbitrary-subject conflict, timeline, effective/current, arithmetic, ownership/deletion and authority-tamper adversaries. Run the full offline gates before committing and report exact residual blockers.
