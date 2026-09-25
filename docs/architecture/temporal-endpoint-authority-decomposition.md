# Temporal-endpoint authority decomposition

Analysis at a6c423fdb8983e3d176de0dac059b2f5262813d6. No application changes, new operators, production expectation changes, live requests, or deployment.

## Verdict

No new endpoint or required/optional selection primitive is justified by the remaining strategy. Per-subject first/last facts are already expressible as subject grouping plus union(ascending take-1, descending take-1). Optional middle records belong to existing supporting context. Arbitrary truncation of required boundaries is not a semantic priority policy to preserve.

This is a migration recommendation, not a claim that those legacy paths have migrated. Calendar composition, independent obligations and comparison/calculation publication remain distinct responsibilities.

## Evidence and callers

Runtime boundaries:

- app/lib/furvise-brain/read-ticket.ts::bindReadTicket requires compare for temporal_endpoints. It rejects strategy with bound needs; anchors require read_since_event; episodes require read without strategy. Those are not legal endpoint combinations.
- app/lib/intelligence/legacy-read-selection.ts::translateLegacyReadSelection is the single compatibility boundary. Only one subject, limit exactly 2, no calendar/hints/independent obligations is currently translated.
- app/lib/furvise-brain/memory-organ.ts::retrieveFurviseMemory requires a ticket for ordinary saved-history reads and calls retrieveAskHistory.
- app/lib/intelligence/history-retrieval.ts::retrieveAskHistory routes a supplied ticket, absent Vet Brief override, to retrieveTicketHistory. That function normalizes and invokes retrieveReadTicket, and carries the normalized ticket downstream.
- app/lib/furvise-brain/lungs.ts::retrieveFactualReadTicket owns remaining ticketed endpoint execution.
- The provider-visible legacy strategy enum is the input producer; static search found no separate application literal construction of temporal_endpoints. There is one application invocation of retrieveReadTicket, in retrieveTicketHistory. This establishes static reachability, not production request frequency.

Separate non-ticket callers of retrieveAskHistory are app/lib/intelligence/append-turn.ts and app/lib/vet-brief/prepare.ts. The latter uses its explicit Vet Brief override. The old retrieval compiler also has endpoint-equivalent behavior, but it is not a second producer of this typed strategy. No claim is made that a current Vet Brief request necessarily activates endpoint comparison.

## Remaining typed shape inventory

All rows below share: authorized ticket subjects; zero or more text_any predicate groups (AND across groups, OR within terms); explicit or access-bounded temporal window; asc/desc output ordering; sufficient/exhaustive completeness; and compare operation. These are intersecting dimensions, not distinct routes.

| Remaining shape | Actual distinction / adapter exclusion | Classification |
| --- | --- | --- |
| Two or more subjects, any limit | Global cap, not one quota per subject; global_limit_not_per_subject | Boundary facts already expressible; cap conflict or optional fill separate |
| One subject, finite limit 1 | Both boundaries computed, one may be discarded; endpoint_interior_or_truncation_semantics | Conflict if two distinct boundaries required; arbitrary priority to retire |
| One subject, finite limit greater than 2 | Boundaries then interior fill under global cap | Facts expressible; fill supporting context |
| Any subject count, null limit | All acquired matches represented until transport; boundaries prioritized before packing | Clarify all-record obligation versus optional context; generic resultSet for actual all-record intent |
| Any hints | Hints rank retention and force partial; legacy_hint_ranking | Factual retention influence to retire; optional ranking to allocator |
| temporal.calendar | Oldest-year window is selected before predicates | Separate calendar composition; not new endpoint semantics |
| Envelope-only evidenceNeeds | independent_legacy_evidence_obligations; may create downstream evidence obligations | Preserve until genuinely grounded obligation migration |
| Additional envelope requirements | Not an adapter guard; may require more than reporting selected records | Separate publication/comparison obligations |

Bound needs and episodes are adapter defensive exclusions but are not legal endpoint combinations under the binder. Anchor+endpoint strategy is also not legal. Do not inventory these as active valid shapes.

The strategy does not prove the user's intended meaning for limit: legacy limit both changes retained factual rows and controls output volume. Inferring exact user cardinality from that field alone is unsafe. Likewise a null limit does not prove the user requested every interior record.

## Exact legacy algorithm

Implementation: lungs.ts::retrieveFactualReadTicket, read-selection.ts::acquireReadCandidates/eventOrder, and history-retrieval.ts::retrieveTicketHistory.

1. Bind owned subjects and access/as-of boundaries. Acquire ascending pages. Subject IDs are sorted canonically; active subjects share a bounded total of 256 requested row slots (page size at most 64). This is not necessarily four physical calls. Short pages establish exhaustion; continuing subjects retain continuation state.
2. Legacy endpoints use store.effective over acquired candidates, rather than the common directional effectiveWindow path. Unreliable effective history fails closed. Acquisition failure can stop the whole legacy result.
3. Resolve requested windows, including any protected calendar behavior, then filter effective owned/nondeleted records by windows and typed predicates.
4. Sort by requested direction using event timestamp, created timestamp and stable ID tie breaking. If hints exist, rank requested rows by number of matching hints, then that temporal order.
5. Independently compute earliest/latest from each subject's predicate-matching records. A pair is blocked for continuation, no match, or uncertain lineage anywhere in that subject's matching rows.
6. Make a unique set of boundary IDs. Stable-partition the ranked list into boundaries first, interiors second. This is a priority class, NOT guaranteed per-subject reservation.
7. Slice this list by global finite K if present. Pack at most 32 records and 18,000 note/title characters. Oversized rows can be skipped; rows beyond the already applied K do not refill their slots.
8. Re-sort represented records by output direction. Mark pairs blocked if any boundary failed representation. Omitted matches produce bidirectional_endpoint_subset; transport loss produces effective_evidence_budget.
9. Continuation, representation loss, or endpoint limit truncation makes global coverage partial. Hints also force partial even when all rows fit. Global status does not itself consult every pair.blocked flag: a no-match subject may have a blocked pair while other records yield complete overall status.

For N subjects, let R be the distinct required boundary count (at most 2N).

- K < R: rank order decides which required boundaries survive; one subject can consume another's capacity.
- K = R: boundaries fit, no interior fill, but omitted interior history still makes legacy global coverage partial.
- K > R: first K-R ranked interior rows fill remaining capacity.
- K null: all matching acquired rows compete with transport, not just boundaries.
- Rotation of input subjects does not change canonical acquisition or row ordering; receipt-array order can differ.
- Hints do not redefine the computed pair IDs. They CAN determine which pair IDs survive a too-small cap. With spare capacity they rank interior fill. These are materially different effects.

## Concrete algorithm counterexamples

These are source-derived analysis examples, not additional executed fixtures. Existing expressiveness tests separately execute reservation, undersized cap, missing-subject fill and rotation cases.

Let subject A have days 1,2,3; B have 4,5,6; C have 7,8,9. Descending order, no ties, all effective/exhausted. Boundary set is A1,A3,B4,B6,C7,C9.

| Input | Legacy represented IDs | Meaning |
| --- | --- | --- |
| K=4 | C9,C7,B6,B4 | Both A boundaries lost; not fair per-subject completion |
| K=6 | C9,C7,B6,B4,A3,A1 | All boundaries; omitted interiors still affect global coverage |
| K=8 | C9,C8,C7,B6,B5,B4,A3,A1 | Interior C8/B5 filled spare capacity |
| K=8, hint only matches A2 | C9,C8,C7,B6,B4,A3,A2,A1 | Interior allocation changes |
| K=4, hint only matches A1 | C9,C7,B6,A1 | Different boundary survivors; pair identities themselves unchanged |

Other cases:

- One subject with days 1,2,3 and K=2 returns 3,1; generic global latest-2 returns 3,2. Global top-N is not boundary union.
- One record satisfies both directions: legacy Set and generic union deduplicate representation; both clauses may refer to that same event.
- No matches for B frees legacy capacity for A interiors; it does not certify B's requested boundary.
- Partial A acquisition blocks A's pair; seeing an apparent latest row in an ascending prefix proves no latest boundary.
- Oversized required endpoint cannot be silently treated as represented; its pair is blocked.
- More than 32 required boundaries cannot be completely published through the present transport even if identities are known.
- Uncertain interior lineage blocks a legacy pair even when both visible extremes fit. Common selection must instead prove the requested effective frontier, not assume visible extremes are safe.

## Existing expressiveness and conflicting cardinality

Existing read-selection.ts::selectReadGroups expresses both boundaries per subject, either single direction, and singleton deduplication. take per result expresses global first/last N over the matching result, not a second-stage cap over a per-subject union. Ordered resultSet semantics express actual all-matching-record requests.

Both-boundaries-for-three-subjects and at-most-four is satisfiable only if distinct required records happen to fit. If six distinct records are required, report partial/limitation or clarify the conflicting request. Do not invent a subject priority. Current transport certification already withholds complete selection when required records are omitted.

A genuine explicitly ordered selection over the output of another selection could eventually motivate generic composition. No such user requirement is established merely by this legacy strategy. Do not add it to preserve arbitrary old truncation. Existing take is at most N, not a guarantee that N matching facts exist.

## Optional fill and supporting context

app/lib/intelligence/supporting-context.ts::allocateSupportingContext already separates mandatory authoritativeRecords from optional effective candidates, validates subject/window scope, reserves bounded context, and accounts for omissions. It does not grant obligation authority to supporting rows. Mandatory loss prevents optional rows filling those slots.

app/lib/furvise-brain/read-supporting-context.ts currently excludes temporal_endpoints; the existence of the allocator is not completed integration. Its wrapper uses observed effective candidates without new queries and presently activates for eligible hints. Without hints, optional chronological fill would require deliberate integration, not a new semantic operator.

The allocator counts serialized row characters, whereas legacy Lungs packs note/title characters. Exact old prompt packing is not promised. Common directional acquisition may also acquire fewer interior candidates. Optional availability must not force a lifetime scan.

If interior facts are explicitly requested, they are not optional: use the existing appropriate resultSet/selection/grounded obligation semantics. Do not infer this from spare legacy capacity.

## Effective history and proof

app/lib/furvise-brain/effective-selection.ts::retrieveEffectiveSelection already provides subject/direction tasks, fair bounded acquisition, store-owned replacement seeds and lineage closure, and frontier/exhaustion proof. A selected cutoff must be beyond the unseen frontier; timestamp equality requires further proof to preserve canonical ties. Requested rows must survive representation.

The following are existing proof responsibilities, not new endpoint machinery:

| Change | Required effect |
| --- | --- |
| Latest raw row corrected to an earlier effective event | Recompute effective ordering before selection |
| Earliest row tombstoned | Select next effective row only if frontier/closure proves it |
| Only row removed | Empty effective match proof, not broad semantic absence |
| Date correction crosses window | Apply window to effective record; close relevant replacement lineage |
| Topic correction removes a match | Apply predicates after effective resolution |
| A lineage unresolved; B closed | Withhold A certification without discarding independently certified B |
| Same record both boundaries | One represented source, two certified clauses |

No new endpoint certificate is needed. Existing groups/clause certificates plus effectiveStream state distinguish endpoint identity, per-subject completion and representation. Global history coverage and optional-context representation remain separate. A global top-N certificate alone does not prove every requested subject's two boundaries; that requires all relevant clauses and union representation.

## Publication and remaining authority

history-retrieval.ts::retrieveTicketHistory maps endpointPairs into source receipts. Without reservedIds, all returned rows, including interior fill, become requiredSourceIds. Legacy allocation is therefore not merely visual.

ordinary-history-boundary.ts::commonHistoryPathEntered rejects tickets retaining a strategy. ai/ask-reasoning.ts::buildAskContext and questionQuotedSources consequently retain protected question-driven ranking/quote reselection for these legacy shapes. Normalizing the factual selection and genuinely entering the common path removes those downstream reselection permissions.

read-projection.ts::deterministicReadProjection returns null for a ticket after its source-free event limitation. Its later raw-question weight/relative-time/format-based endpoint projections are non-ticket paths, not a second typed endpoint executor. Preserve that distinction.

publication-authority.ts::derivePublicationAuthority requires ticket.selection. Legacy endpointPairs alone do not activate certificate-bound source authority. They remain under existing evidence/review policy; model-supported publication has not acquired the new selection binding.

After selection normalization, certificate-authorized sources can bind factual boundary claims. However labs-list.ts::buildLabsList accepts only read/read_since_event, and excludes independent comparisons/calculations. Legacy endpoint operation is compare. Therefore normalization does NOT by itself make a comparison deterministic Labs publication, nor certify a derived numerical change.

The non-ticket retrieveAskHistory path separately derives endpointComparison from envelope intent and raw question patterns, issues directional/lexical/context queries, and tracks surviving seed IDs. append-turn and Vet Brief callers remain separate migration work. Do not delete these helpers on the basis of ticket strategy normalization.

## Recommended migration order

1. Pure multi-subject boundary facts: normalize to existing grouped union, preserve per-clause certification and representation losses. Do not claim old undersized-cap winner parity.
2. Undersized limits: explicitly preserve partial/limitation semantics; retire arbitrary retention priority as factual policy.
3. Interior fill and hints: separate optional supporting context after common factual proof. Retire hint-dependent boundary retention and hint-induced factual partial coverage.
4. Keep true comparison/calculation obligations separate from boundary reporting. Do not downgrade compare merely to enter the list renderer.
5. Keep calendar and unmatched independent-envelope obligations protected until their own semantics are represented. No new endpoint primitive is justified.
6. Re-inventory before deleting the branch. It is NOT deletion-ready today.

## Verification

Existing offline tests rerun, unchanged expectations, network guard enabled:

- Compatibility/expressiveness/legacy obligations: 61/61.
- Supporting context: 26/26.
- Body/architecture including effective selection, temporal, Lungs and Heart: 185/185.
- Publication/Labs/authority: 74/74.
- Audit: 208/222; identical fourteen baseline failures, recorded below.

No new executable tests were necessary for this analysis; concrete additional counterexamples are documented above. No production code or tests changed. No build/typecheck rerun is claimed for a documentation-only change.

Audit failures:

- premise repair is bounded and revalidates exact user evidence
- a premise repair cannot authorize invented pets or mutation scope
- read planner can omit extraction while writes still require a valid frame
- five-pet earliest/latest weight retrieval certifies both endpoint pairs even when lexical weight matching misses weighed prose
- real admission lets a repaired planner reach composition without opening extra repair cycles
- supplied premises narrow stale owned-history plans without granting writes
- general knowledge never widens owned authority and saved history still validates ownership
- supplied-context classification requires actual verbatim user premises
- missing premises use bounded repair without inventing evidence
- event evidence survives both budgets among verbose routine observations
- rejected event answers retain relevant source excerpts instead of the latest profile
- new observation plus calculation can repair an invalid correction plan without weakening validation
- profile contract mistakes get one bounded repair with full ownership revalidation
- a failed mixed answer cannot commit proposed observation side effects
