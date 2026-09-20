# Result-level selection and joint certification

Base: 9d0fb1e94ee3b6996fb1de213896a4c5dcc2d204.
Offline only. No deployment, live Ask or paid APIs.

## Generic plan

```json
{
  "selection": {
    "groupBy": [],
    "union": [{
      "orderBy": [{"field": "event_at", "direction": "desc"}],
      "take": {"count": 3, "per": "result"}
    }]
  }
}
```

Existing subject grouping keeps groupBy:["subject"] and take.per:"group".
Result selection explicitly has no grouping; mixed group/result clauses reject.
Each union clause is independently selected and certified; duplicate records collapse.
The existing count bounds (1..100), order fields and tie-break rules remain.
The provider schema is unchanged: this capability is currently server/native-plan
and compatibility-adapter functionality, not new Brain emission.

The new primitive describes ordered prefixes of any effective matching record
set across an authorized cohort. It is independent of topic, pet and legacy
strategy. Semantic take and outputs.limit remain distinct: the latter is transport
after semantic selection. A single result clause controls its result order even
when output presentation ordering differs.

## Common acquisition and effective truth

The existing effective-selection reader remains the executor. It acquires in the
clause direction in canonical subject order with a fair first opportunity. Initial
windows are bounded by N+1 and the existing page cap; later windows grow only for
subjects whose unseen frontier could still displace a selected row. The existing
total candidate envelope, transport caps and store-owned graph limits are unchanged.

Every acquired window passes through the existing effectiveWindow resolver.
Closed replacement seeds include corrections outside the candidate page; closed
lineage includes supersession/deletion and linked-source freshness. Predicates
and the requested temporal window apply to the effective records before ranking.

No grouping/executor-specific correction rules were introduced. A failed or
unclosed subject cannot be ignored because another subject already supplied N rows.
If the whole cohort cannot receive an opportunity within the budget, no prefix
receives privileged acquisition or certification.

The fallback without a directional effective store can certify only after
exhausting the accessible subject windows and resolving effective truth. It never
uses a raw directional frontier as effective proof. Existing semantic anchor
resolution still runs before selection; no global selection followed by anchor
filtering is introduced.

## Joint certificate

ReadCoverage.resultSelection contains one server-derived receipt per clause:

- clause ID, canonical subject IDs, direction and semantic count;
- selected IDs, retained IDs and the selected cutoff;
- each subject's acquisition opportunity, exhaustion, directional frontier,
  lineage closure, replacement-seed closure and cutoff coverage;
- certified/blocked status and blocking reasons.

For N selected rows, every competing subject must either be exhausted or have a
closed effective overlay and a raw frontier strictly beyond the cutoff in event
time. Strictness intentionally deepens timestamp ties because raw care IDs and
effective claim IDs occupy different spaces. Final rank uses existing event time,
creation time and stable ID ordering. If fewer than N rows exist, all competing
streams must be exhausted.

Certification additionally requires every selected row to survive organ transport.
Acquired IDs, effective IDs, semantic selected IDs and represented IDs remain
separate. Finding N rows alone is insufficient.

Whole-history coverage remains partial when acquisition is not exhaustive or the
semantic result omits other matching rows. The joint certificate authorizes only
this bounded selection; it does not authorize counts, exhaustive absence or an
all-history claim.

## Downstream integration, without a second authority store

Existing coverage.groups are ownership projections of the JOINT certificate.
They do not independently prove a global rank. selection-publication.ts requires
the matching joint receipt and every competing frontier before accepting any
subject projection. It checks that projected selected IDs equal the joint selected
set and that all required rows are represented. Dropping a publication row revokes
the complete joint claim.

A subject with zero global winners is omitted from publishable fact projections;
it is not described as having no matching history. If the entire certified result
is empty, exhaustion supports the existing bounded-empty presentation.

The obligation/source-authority policy and Labs renderer are unchanged. They
consume the same certified source projections as before, now gated by joint proof.
Profile sources cannot satisfy these historical selection obligations.
The new result certificate is a derived organ receipt, not a stored independent
truth table. No database migration or store query change is required.

## Compatibility coverage

The existing single normalization boundary now translates:
- multi-subject chronological;
- finite limit;
- no hint ranking;
- no independent evidenceNeeds/needs or episode;
- no calendar selector.

Legacy finite global count becomes take.count per result. The original output cap
is retained separately as transport. The legacy strategy is removed from the
normalized ticket, which is propagated into retrieval, evidence and Labs.

Existing single-subject translations are unchanged. Native single-subject
result-level take is also supported.

Still legacy: unbounded chronological, hint-ranked cases, independent obligations,
calendar/episode cases. Multi-subject temporal_endpoints reservation/fill remains
unchanged. calendar_samples and event_candidates remain unchanged.

The eligible finite global-order subset no longer needs the old chronological
executor. The complete chronological branch is NOT deletion-ready because the
excluded classes remain. No branch is deleted in this cut.

## Parity interpretation

Adapter output and equivalent native result plans have exact parity for records,
ordering, receipts, blocking reasons, source authority, obligation satisfaction and
publication facts. Small exhaustively acquired legacy executions additionally
match selected effective records/order, including corrections, deletion and
transport pressure.

The old executor did not produce a result-level certificate. Its per-subject
chronology receipt cannot be asserted identical to a new joint proof. The new
receipt replaces that missing proof for migrated input; tests do not manufacture
old joint certification. Directional acquisition can prove a bounded result
without old whole-history exhaustion, so scan bookkeeping is intentionally not
claimed identical to raw legacy execution.

## Tests

37 new result tests cover:
latest one across three subjects; latest three; earliest N; rotations; missing
subjects; empty result; timestamps and tie breaks; superseded winner; out-of-page
correction becoming winner; tombstones; partial lineage; linked-source uncertainty;
failed competitor; budget exhaustion and cohort fairness; bounded frontier cost;
transport count/character loss; alternate predicate; explicit window; single
subject; semantic versus output ordering; exhaustive limitation preservation;
missing publication rows; receipt integrity; multiple independent result clauses;
profile-source rejection; conservative fallback; anchor ordering; and the real
application retrieval boundary against an offline DB mock.

One existing chronological exclusion test now verifies the newly supported result
translation. The endpoint exclusion test remains. The prior grammar witness now
states the preserved rule precisely: result take cannot be combined with subject
grouping.

Final gates:
- result selection/certification: 37/37
- compatibility/parity: 40/40
- earlier expressiveness regression witnesses: 10/10
- body/architecture (Lungs/effective selection included): 185/185
- publication/Labs/authority: 74/74
- Brain/interpreter/timeout: 77/77
- broader safety: 46/48, exact same two baseline failures
- audit: 208/222, exact same fourteen baseline failures
- typecheck: passed in dependency-complete gate checkout
- clean production build: passed after removing .next and tsconfig.tsbuildinfo
- diff whitespace: passed

Audit and safety failure identities were compared programmatically against the base ledger; both are identical.

All test processes use the offline network guard. No provider calls.
