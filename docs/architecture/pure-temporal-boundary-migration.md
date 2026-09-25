# Pure temporal-boundary migration and diagnostic review

Base: 82cb4259c2216726400745e6f3d562fe42ec14c4.
Offline only. No deployment or live Ask.

## Exact stopped fixture

tests/legacy-read-selection.test.mjs: multi-subject endpoints retain legacy global reservation and interior fill.

Proposal before binding:

```json
{
  "operation": "compare",
  "subjectScope": "named",
  "needs": [],
  "episode": null,
  "temporal": {"from": null, "to": null, "anchor": null, "calendar": null},
  "predicates": [{"kind": "text_any", "terms": ["weight"]}],
  "outputs": {
    "strategy": "temporal_endpoints",
    "ordering": "desc",
    "limit": 4,
    "completeness": "sufficient"
  }
}
```

bindReadTicket receives subjects [a,b], then [b,a]. translateLegacyReadSelection receives only that bound ticket; its default evidenceNeedCount is zero and readIntent is absent. There is no envelope semantic operation, quantity or selection intent, no independent evidence need, calendar or anchor. Store fixtures have five records for A and none for B.

Before this draft, all multi-subject endpoint tickets were excluded by global_limit_not_per_subject. After this draft, pure multi-subject boundaries are expressible, but this fixture does not establish that the compare ticket is a pure record lookup. It remains unchanged and excluded by boundary_facts_not_established.

Does the old reason still describe a semantic incompatibility here? NO. Two subjects need at most four distinct boundaries; cap four is sufficient. The actual store happens to require only two, but normalization does not inspect or rely on that fact.

The existing test still executes legacy retention and compares it against native union. Its record assertions, source fixture and exclusion assertion remain unchanged. Only the explanatory reason expectation changed.

## Diagnostic consumers and precedence

Application references to translateLegacyReadSelection:
- ask-request-contract.ts::bindTicketedRead consumes translated and ticket, not reason.
- history-retrieval.ts::retrieveTicketHistory consumes translated and ticket; reason is logged under [Ask read compatibility].
- legacy-read-selection.ts defines all reason literals.
- Tests assert explanatory classifications. No application branch or user-facing response consumes an exact exclusion reason. There is no diagnostic-driven secondary adapter decision.

Thus exclusion reasons are telemetry and test/debug classification, not a runtime/public protocol. The translated boolean and unchanged ticket do control execution.

The existing deterministic guard order is preserved:
1. Native selection and strategy family checks.
2. Existing family-specific constraints (event search unchanged).
3. Independent envelope/bound obligations and calendar exclusions.
4. For multi-subject endpoint candidates, establish pure lookup intent using existing typed envelope fields.
5. Require explicit predicates and no anchor.
6. Establish one or both requested directions.
7. Require sufficient transport capacity for the maximum required boundary count.

It is legitimate to reject independent obligations/calendar before attempting pure endpoint normalization: this adapter does not own those responsibilities. Once in the supported pure-boundary subset, lack of semantic intent precedes data/cardinality assumptions.

No application check was reordered to address the stopped test. The prior blanket global_limit_not_per_subject guard is now unreachable for valid multi-subject tickets because the preceding multi-subject block always returns; it remains in place as legacy cleanup debt, not an authoritative decision in the new path.

## Migration implemented in the existing boundary

app/lib/intelligence/legacy-read-selection.ts::translateLegacyReadSelection:
- Multiple already-authorized subjects.
- Existing envelope operation recall, quantity records.
- No requirements, reference turns, profile fields, projection or recordSelection.
- Historical or unspecified temporal scope, explicit predicates.
- No calendar, anchor, episode, bound needs or independent envelope needs.
- Existing selection earliest -> ascending take-1/group.
- Existing selection latest -> descending take-1/group.
- Existing selection summary, together with temporal_endpoints -> union of ascending/descending take-1/group.
- Finite cap at least subject count times clause count, or null cap.
- Removes strategy and changes compatibility compare to factual read.
- Preserves predicates, subjects, temporal bounds, completeness, ordering and independent transport cap.

app/lib/intelligence/ask-request-contract.ts::bindTicketedRead invokes the same adapter before the typed envelope intent is discarded. Existing event-search provenance remains event-search-only; no additional ticket field or planner representation is introduced.

A plain compare label, comparison envelope, measurement/derived quantity, extra obligation, insufficient cap or ambiguous direction does not qualify. The adapter does not parse requirements, question text, hint text or IDs for factual semantics. It conservatively leaves those cases legacy.

## Authority and intentional differences

Existing common selection/effective-history machinery supplies per-subject/direction proof and union deduplication. No changes to organs, effective history, certificates, publication policy, Labs renderer, Heart, provider schema or Brain instructions.

Migrated tickets have no legacy strategy and satisfy commonHistoryPathEntered after common execution. Existing publication authority derives certificate-authorized historical sources; profile alternatives cannot satisfy those obligations. Production-dispatch offline fixtures use deterministic Labs, zero generation/review calls, and preserve factual membership across quote lures, prose and table.

Intentional differences:
- Spare capacity does not make interior records requested facts.
- Hints can affect optional supporting context through the existing eligible common-path allocator, never boundary identity/certificates.
- Optional interior parity is not promised; common acquisition need not fetch all interior history.
- Legacy global partial coverage due solely to omitted interiors is not equivalent to a missing boundary certificate. Native proof and publication parity are tested.
- Insufficient capacity stays legacy; this cut does not repair or endorse arbitrary priority inside that excluded legacy branch.
- Singleton records represent both clauses without duplicated events.
- Derived comparisons remain excluded. No arithmetic is certified by boundary identity.

Remaining legacy: multi-subject inputs without sufficient typed intent; derived comparisons; calendar combinations; independent obligations; references/projections/profile combinations; insufficient caps; ambiguous cardinality. Existing single-subject compatibility behavior remains unchanged. Pure boundary facts satisfying the explicit eligibility contract no longer need the legacy endpoint executor.

## Tests and gate

New temporal-boundary suite: 29/29. Covers native proof/source/publication parity, two/three subjects, singleton, empty subject, independent lineage failure, correction, deletion, rotation, hints, exact/spare/null caps, alternate predicate/window, prose/table, profile-source rejection, derived exclusions, missing intent, representation pressure, production-dispatch paraphrase/quote-lure firewall.

Separate diagnostic test:
- Missing intent: unchanged ticket, boundary_facts_not_established.
- Established both-boundary intent, three subjects, cap four: unchanged ticket, boundary_transport_capacity_conflict.
- Same intent, cap six: translates.
- Independent envelope obligation: unchanged ticket, independent_legacy_evidence_obligations.

Existing compatibility expectation changed ONLY from global_limit_not_per_subject to boundary_facts_not_established. The old diagnostic encoded a capability limitation no longer true for this shape after generic multi-subject boundary support. No baseline audit expectation changed.

Gate totals (suites overlap; do not sum as unique tests):

- migration: # tests 29; # pass 29; # fail 0
- compatibility: # tests 61; # pass 61; # fail 0
- firewall: # tests 12; # pass 12; # fail 0
- body: # tests 185; # pass 185; # fail 0
- resultSets: # tests 67; # pass 67; # fail 0
- publication: # tests 74; # pass 74; # fail 0
- context: # tests 26; # pass 26; # fail 0
- eventSearch: # tests 37; # pass 37; # fail 0
- characterization: # tests 16; # pass 16; # fail 0
- brain: # tests 77; # pass 77; # fail 0
- probes: # tests 22; # pass 22; # fail 0
- hints: # tests 18; # pass 18; # fail 0
- safety: # tests 48; # pass 46; # fail 2
- audit: # tests 222; # pass 208; # fail 14

Known audit failures unchanged:
- not ok 55 - premise repair is bounded and revalidates exact user evidence
- not ok 56 - a premise repair cannot authorize invented pets or mutation scope
- not ok 63 - read planner can omit extraction while writes still require a valid frame
- not ok 96 - five-pet earliest/latest weight retrieval certifies both endpoint pairs even when lexical weight matching misses weighed prose
- not ok 113 - real admission lets a repaired planner reach composition without opening extra repair cycles
- not ok 153 - supplied premises narrow stale owned-history plans without granting writes
- not ok 155 - general knowledge never widens owned authority and saved history still validates ownership
- not ok 156 - supplied-context classification requires actual verbatim user premises
- not ok 166 - missing premises use bounded repair without inventing evidence
- not ok 176 - event evidence survives both budgets among verbose routine observations
- not ok 177 - rejected event answers retain relevant source excerpts instead of the latest profile
- not ok 196 - new observation plus calculation can repair an invalid correction plan without weakening validation
- not ok 212 - profile contract mistakes get one bounded repair with full ownership revalidation
- not ok 215 - a failed mixed answer cannot commit proposed observation side effects

Typecheck passed (tsc --noEmit). Clean-source production build passed (next build --webpack), with no prior .next output or untracked public assets, using the existing dependency-complete node_modules. No fresh npm ci was claimed. Whitespace check passed.
