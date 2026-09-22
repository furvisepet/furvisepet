# Derived comparison/calculation authority decomposition

Analysis base: 2563d4b3a18ed56e6bca7359721a2540be57b4e6. Application behavior unchanged. No deployment, live Ask, paid API, database query or new calculation primitive.

## Finding

Generic deterministic arithmetic already exists. What is missing is a runtime-bound relationship between the requested calculation, certified source obligations, unambiguous scalar values, and the published derived result.

Do not build another arithmetic language. Evolve the existing HistoryCalculation/evaluator boundary into a server-bound derived receipt after scalar provenance is established. A selected record is not automatically a certified numeric operand: a note can contain body mass, equipment mass, tentative values and multiple dates.

Evidence labels in this document:
- Runtime: observed implementation guards and callers.
- Test: offline characterization, not a live production proof.
- Recommendation: future design, not implemented.

## Active paths and authority owners

Scope is Ask and its connected factual publication/count paths, with Vet Brief separately. Billing arithmetic, UI layout arithmetic and freshness scoring are not user-requested historical calculation authority.

| Path / concrete boundary | Caller and operation selection | Operand choice / arithmetic | Completeness and publication | Classification |
| --- | --- | --- | --- | --- |
| history-calculation.ts::HistoryCalculation, parseHistoryCalculations, verifiedCalculationQuantities | history-narrative.ts::parseHistoryNarrative; reviewHistoricalAnswer; validateGeneratedAnswer. Generation emits operation/operands/value/unit; Brain envelope has comparison/quantity intent but no bound calculation job | Model supplies source IDs and text literals or occurredAt. Software checks source uniqueness, literal tokens, units and recomputes arithmetic | Kernel receives no ticket, certificate, obligation, subject or exhaustion proof. Review/policy must establish semantic support | Deterministic arithmetic; legacy operand authority |
| historical-read-response.ts and structured-history-json.ts | ask-reasoning generation; prose/table/CSV/JSON schemas carry calculations | Model chooses rows/cells, citations and calculations. Parsers retain bindings; layout serialization does not compute new facts | review-history-narrative.ts checks each item; model semantic approval plus deterministic guards | Model choice, deterministic arithmetic validation |
| repair-calculation-bindings.ts::attachDeterministicCalculationBindings | reviewHistoricalAnswer for shared requests, before semantic review | Raw question regex requests difference/change; cross-products measurements from exactly two already-cited care/claim sources; matches a result token and accepts exactly one calculation candidate | Valid arithmetic is reconstructed but source relevance/measurement identity remains semantic review | Legacy English-driven derivation to retire |
| retainRepairCalculationBindings in same file | reviewHistoricalAnswer after repair | Reuses original computations if valid over repaired citations and needed to support repaired numbers; otherwise leaves repaired calculations for checks | Same publicationSources input; certificate-bound source restrictions still apply | Useful preservation mechanism, not new authority |
| read-projection.ts::deterministicReadProjection: historical/current profile comparison | generateContextAwareAskResponse after Labs; only no-ticket branch | Explicit profile weight + one dated historical measurement, selected by raw question/date/quote; software computes delta/percent and rounding | Eligible sources and final projection validation; no selection certificate. Profile legitimate only for explicitly requested current-profile comparison | Deterministic arithmetic, legacy operand selection |
| Same function: exact-day cohort | Same caller, no-ticket; raw text picks thresholds, extrema, change and ranking | bodyMeasurement per subject/day; unit conversion; filters and sorts deltas; some results carry calculations: [] | Requires one represented measurement per requested day/subject; this is not proof of exhaustive eligible scalar discovery | Legacy factual projection and ranking |
| Same function: relative-year and multi-subject first/latest comparison | Same caller, no-ticket; question patterns plus legacy endpointPairs | Requires unblocked endpoint receipts and unique parsed measurements; subtraction, percent/gap expression, gain/loss ranking | Legacy receipts, representation and completion checks. Table/CSV branch returns before some extra prose comparison/ranking branches | Deterministic arithmetic; legacy semantic/format authority |
| Same function: two-date single subject and body_mass projection | Raw question or typed legacy ReadProjection (body_mass, unit, order); no ticket | Date/quote source narrowing, positive body-measurement parsing, subtraction or conversion and value/name sorting | Narrow window/full represented source/loss checks on typed projection; final trusted projection gate | Source-bound draft, not common derived proof |
| history-narrative-facts.ts::historyNarrativeAnchorsSupported | reviewHistoricalAnswer uses legacyDerivations=!sharedRequest; authority/repair callers explicitly false | Legacy raw question can authorize kg endpoint magnitude, UTC elapsed calendar days and a narrow within-note accident count; also requested-unit-conversion equivalence | Numeric-anchor support only; model reviews direction and intended relationship | Legacy raw-English numeric authority |
| review-history-narrative.ts::reviewHistoricalAnswer | finalize-ask-answer.ts; append-turn.ts separately uses Labs/no-provider review | Deterministic recomputation of declared jobs; supplies mismatch hints. Incidental note quantities 1..number of cited notes can be allowed as anchors; reviewer decides subset meaning | Model chooses approved sentence/obligation support; invalid arithmetic cannot be approved through deterministic gate | Model retains semantic operand/entailment authority |
| record-inventory.ts::readRecordInventory / recordInventoryEvidence | Non-ticket retrieveAskHistory branch (ticket dispatch returns earlier) | Raw-English literalInventoryWindow / request recordSelection, owned scopes; exact SQL count of nondeleted physical rows, max first three scoped pets | Count receipt includes interval/check time; projection or review publishes physical notes only | Deterministic bounded inventory, separate legacy scope authority |
| episode-history.ts::retrieveEpisodeHistory; recorded-inventory.ts::recordedCensus/recordedInventory/inventoryMembersMatch | Ticketed episode path or protected legacy episode routing; SQL read_ask_episode_sources and versioned references | Governed episode membership/register census, not number of notes; owner/scope/revision/snapshot/member checks | episode-contract.ts::episodeAnswer publishes exactTotal only recorded_complete with inventory; otherwise supported subset/limitation | Existing domain proof, not generic arithmetic |
| Vet Brief prepare.ts -> prepareReviewedVetBrief, review.ts/publication-review.ts | Separate draft route, explicit preparation/read context | Builder formats profile weight; generated narrative chooses comparison/trend content. No HistoryCalculation kernel use found in this path | Model factual/uncertainty/coverage review and bounded repair; not common derived Labs | Separate future migration |
| General/supplied-context calculations | ask-request-contract.ts conversation/general branch -> generation | Model can calculate from supplied premises/general information; no saved-history ticket | General answer validation; not certified ledger arithmetic | Model arithmetic outside owned-history proof |

The existing compare/rank ReadTicket operation does not itself implement delta or numerical ranking. ask-request-contract.ts maps it to comparison envelope intent; Lungs retrieves/selects records. No generic derived-value sorter/receipt follows automatically.

### Runtime publication gates

- read-projection.ts exits for ANY readTicket after a source-free limitation. Do not attribute its later weight-specific branches to ordinary ticketed reads.
- ask-reasoning.ts::generateContextAwareAskResponse tries Labs, then projection, then model generation.
- validate-answer.ts::validateGeneratedAnswer computes trustedServerProjection from server model label, exact answer text, eligible owned sources, verifiedCalculationQuantities, format validity and no historyCompletionLimits. It can return a trusted projection without semantic model review. An empty calculations array passes the arithmetic helper; therefore inline projection arithmetic is not independently covered by that helper.
- reviewHistoricalAnswer receives publicationSources, recomputes calculations, rejects invalid anchors/items, then checks obligation completion and checkPublicationAuthority. Model approval cannot override those checks.
- publication-authority.ts::derivePublicationAuthority activates for selection receipts. checkPublicationAuthority explicitly rejects calculations on certified selection components (publication_selection_does_not_certify_calculation).
- labs-list.ts::LabsList has calculations: []; buildLabsList excludes compare/rank. Current selection authority intentionally does not certify derived facts.

## Operation families: reuse versus missing authority

Existing reusable arithmetic: sum, mean, signed difference, absolute difference, ratio, percentage change, percentage of sum, conversion, elapsed days, record count, bounded reverse-Polish expression.

Existing expression tokens reference original operand positions (0..3), not invented scalar constants; add/subtract/multiply/divide enforce limited dimension algebra. Up to 31 tokens, 40 jobs; aggregate/count input up to 64 operands, other jobs up to four. This is already a generic computational vocabulary.

Min/max, threshold comparison and ranking currently exist in domain-specific projection code, not as certified generic derived obligations. Their semantic generality is real, but implementing them is not prerequisite to the first two-operand calculation cut. Trend/causal/clinical conclusions are not arithmetic operations.

## Current source/type gaps

Runtime facts from history-calculation.ts:

- Registry converts mass (kg/g/mg/lb), volume, time, length and explicit currency dimensions; no FX inference. Supports constrained compound rates.
- A source ID must identify exactly one supplied source; a text literal must match a complete numeric-unit token. Numeric-only leaves need an adjacent unambiguous supported unit.
- A longer exact span with one measurement can disambiguate syntax. It does not prove measured entity, quantity role, negation, certainty or relevance.
- Exact numeric tokens from arbitrary prose remain eligible to this helper, including equipment mass in a body-mass note. Whole-source subject/obligation certificates are not parameters.
- Null/missing numeric values, unknown sources, incompatible dimensions, invalid timestamps, nonfinite/oversized results and zero denominators fail.
- Multiple candidate values are not universally rejected: the proposal may choose one explicit token. Repeated same-unit values can remain semantically ambiguous.
- elapsed_days uses signed timestamp milliseconds / 86,400,000, or exact civil-date literals parsed as instants. It does not prove onset/resolution or local-calendar-day duration.
- Rounding follows decimal precision of the model's proposed result. A true 2.4 difference can validate as integer 2. Precision policy is not independently certified.
- count_records verifies distinct supplied care/claim IDs only. It has no exhaustive-domain proof. Sum/mean do not require unique source/value references or complete membership.
- Same dimension is insufficient: body mass and carrier mass are both mass. Timestamps can be two observations without being illness endpoints.

Consequences: profile sources, uncertified rows or prompt-retained candidates can satisfy arithmetic in legacy paths if the caller includes them. This is not permission in certified selection publication: its separate source binding and no-calculation guard still block widening. Hint/prompt influence remains possible in protected legacy retrieval; arithmetic validation alone cannot repair that authority gap.

## Minimal future model (recommendation, not fields implemented)

Reuse the operation/unit evaluator. Add a server-derived binding/receipt around it rather than a parallel calculator.

Brain proposes operation and semantic input roles attached to requested source obligations. It must not choose database IDs, invent operand IDs or supply authoritative output values.

Server:
1. Resolve roles to existing server-owned obligation/clause/subject bindings.
2. Require the corresponding selected/result-set proof.
3. Resolve each operand to an unambiguous typed scalar with source/version, field or exact span, value, dimension/unit and timestamp role.
4. Reject ambiguous or merely prose-number matches; preserve attribution/uncertainty.
5. Compute using the existing evaluator and an explicit deterministic output-unit/rounding policy.
6. Derive a receipt: calculation obligation, operation, exact input bindings and prerequisite proofs, normalized inputs, result/unit/type, failure/limitation and representation status.
7. Publication consumes this result and its transitive authorized sources. Repair may rephrase/remove; it may not rebind operands.

Existing obligation IDs, certified record IDs, subject IDs and source snapshots can supply identity. There is no need for model-owned operand IDs. Field=text plus literal is not yet the required scalar authority contract.

A new independent truth store or generic endpoint certificate is NOT required. A typed derived-result receipt/proof view is justified because existing selection/resultSet certificates prove membership, not arithmetic and scalar semantics. Derive it from prerequisite certificates and the deterministic execution receipt; do not promote HistoryCalculation's model-supplied value into that receipt unchecked. Current publication-authority certificateType only selection would eventually need to consume this distinct proof kind.

## Boundary and ranking decomposition

For certified 10 kg earlier and 12 kg later:
- Delta +2 kg: prove same subject, same measured quantity, compatible units, exact ordered scalar inputs and subtraction.
- 20% increase: additionally identify the earlier nonzero baseline and percent formula.
- Latest is higher: deterministic comparison of those compatible values.
- Gained weight: only a narrowly attributed statement about these recorded values can follow. Sustained trend, clinical improvement and causation do not follow from two endpoints.

First migrate signed subtraction between two certified scalar facts, with conversion and exact provenance. Do not begin with trend prose or ranking.

For ranking by change, derive each subject's delta first; require a complete authorized competitor set, all necessary operand/derived proofs, explicit signed-versus-absolute metric, tie handling and representation. One incomplete competitor prevents a global superlative. A qualified ranking of a declared verified subset is a different obligation. Current event_at top-N certificates do not certify derived-value ranking.

Counts and aggregates share prerequisite-proof composition but require different membership:
- Physical active rows, effective matching records, measurements and episodes are different count domains.
- Exact requested-domain count requires exhaustive membership proof (or valid server census of precisely that domain).
- Count of a certified top-N subset is only that subset count.
- Mean/sum/min/max require certified scalar membership plus exhaustive or explicitly selected bounded domain; transport sample is not the domain.
- Exact SQL active-row inventory does not automatically resolve effective correction lineage or count clinical occurrences.

## Failure policy and counterexamples

| Case | Required outcome |
| --- | --- |
| Profile 14 kg available alongside historical latest 12 kg | Historical delta must remain bound to 12 kg |
| One operand uncertified / missing | Derived limitation; other independent subject results may survive |
| Correction changes operand or tombstone deletes it | Re-resolve prerequisite proof; old receipt invalid |
| Compatible kg/lb | Normalize deterministically; preserve original provenance |
| Equipment 3 kg in same note | Cannot use it for body-mass delta merely because syntax/dimension match |
| Zero baseline / divide by zero | Undefined result limitation, not fabricated 0% |
| One competitor incomplete | No authoritative global winner |
| Average of incomplete domain | No whole-domain average claim |
| Exact certified exhaustive empty set | Count zero may be valid; mean undefined |
| Same bound inputs and paraphrase | Same numeric receipt; wording cannot select alternatives |
| Wrong model-selected literal | Reject binding even if arithmetic is correct |
| Table versus prose | Same receipt and authorized sources |
| Result arithmetic valid but trend unsupported | Publish bounded arithmetic only, limit interpretation |
| Required value/source lost during representation | Cannot certify complete derived publication |

## Legacy behavior to retire, without changes here

Question-driven operand reconstruction; word/format-driven projection arithmetic; model-chosen substitute operands; arithmetic support from numeric coincidence; implicit kg deltas/calendar durations in narrative anchors; means/counts over prompt survivors treated as whole-domain results; coarse model-selected precision; prose approval acting as proof of operand identity.

Do not remove current safety guards or allow selection certificates to authorize arithmetic early. Preserve legitimate explicit profile comparisons as independent profile obligations, and preserve episode census invariants.

## Verification and limits

Added tests/derived-authority-characterization.test.mjs: 10/10. Tests explicitly demonstrate the arithmetic kernel's limits; acceptance by this helper is NOT asserted to mean public answer acceptance.

Existing deterministic/repair binding tests: 6/6.
Publication/Labs/authority: 74/74.
Audit: 208/222, same fourteen baseline failures; comparison against saved baseline performed before commit.
No production expectations changed. No application changes. No build/typecheck rerun claimed for docs/tests-only analysis.
Static reachability establishes possible callers, not production usage frequencies or live proof. No new derived contract implemented.

Audit failure identities:
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
