# Calendar semantics and generic expressiveness ? analysis only

Inspected base: c25ed75abb6932e5cb81403a6e83c09286c56ea7.
Application code, existing test expectations, deployments, and live data unchanged. No model/API calls. Static reachability is not evidence of current production traffic.

## Findings

Two reusable concepts are missing from the present compositional language: calendar partitioning of an effective stream, and ordering/taking its occupied buckets. Existing record selection can be nested within selected buckets conceptually, but the present executor supports subject/result groups only. No primitive implemented here.

The proposed partition -> bucket selection -> within-bucket selection is a good starting point, but is insufficient unless it also defines:
1. The input relation at each stage: which predicates apply before bucket discovery versus inside selected buckets.
2. The grouping scope: per subject versus one combined authorized result, and then per bucket.
3. Occupied buckets versus all elapsed calendar periods. Current data-relative operations concern occupied buckets; the old interval sampler concerns elapsed duration and must not be confused with them.
4. Existing date precision/timezone policy, not a new implicit UTC/local conversion.
5. Separate bucket identity, within-bucket factual proof, and representation completeness.

## Reachability and downstream flow

Interpretation readTicket -> ask-request-contract binding -> history-retrieval.retrieveAskHistory -> retrieveTicketHistory -> translateLegacyReadSelection -> lungs.retrieveReadTicket.

The adapter deliberately excludes temporal.calendar and calendar_samples. read-selection.bindCompositionalReadTicket rejects calendar + selection with selection/unresolved_window. read-temporal.resolveReadWindows resolves oldest_year, and lungs contains the calendar_samples branch. Existing plain explicit windows already use common selection/resultSet.

retrieveAskHistory returns immediately to the ticket path when readTicket exists (except the separately authorized Vet Brief caller). Non-ticket calendar helpers below remain reachable only through the older input branch; they cannot override a typed ticket. deterministicReadProjection also returns before its raw-language projection branches when request.readTicket exists.

Ticket coverage is translated by retrieveTicketHistory: windows into plan for a single subject, periods with care/claim source IDs, perPet, candidate/retained/omitted IDs, and any chronology receipt. ask-evidence transports the evidence; evidence-need-coverage.historyCompletionLimits checks period exhaustion and represented candidates, returning requested_period_sampled_not_complete for loss. history-source-transport and ask-reasoning carry/filter period source metadata through budgets. Review/completion/billing consume these limitations. There is no dedicated calendar bucket certificate or calendar-specific certified Labs path to assume already exists.

## Active semantic inventory

A = already expressible; B = generic partitioning required; C = bucket selection required; D = accidental/legacy implementation policy, not a new semantic primitive.

| Shape and caller | Actual requirement/input, scope, predicates | Unit/value origin; grouping; ordering/cardinality | Current acquisition/proof/consumers | Class |
|---|---|---|---|---|
| Ticket explicit date/year/month/day window, read or read_since_event with concrete bounds | Authorized subjects; text predicates; temporal.from/to; selection optional | User-explicit or resolved relative dates supplied as ISO instants; no ledger-derived bucket. Existing subject/global order/take/union or all-matching set | Common effective stream and existing selection/resultSet proof; access/asOf intersection and transport apply. Labs/evidence use existing proofs | A |
| temporal.calendar=oldest_year, no topic predicate (C053) | Each authorized pet's oldest accessible year of effective notes; returns records in that year | Ledger-derived occupied UTC year per pet; all records unless outputs.limit truncates; asc/desc presentation; sufficient or exhaustive accepted | Fair bounded raw acquisition, store.effective, resolveReadWindows; requires no continuation anywhere; no separate identity certificate; legacy records/coverage/chronology consumers | C, with B to expose the bucket |
| oldest_year + predicates | Choose oldest year of ALL scoped effective notes first; apply topic predicates afterward | Same per-pet bucket; topic does NOT define which year is oldest | Same scan/resolver followed by predicate matching. An older unrelated note can produce an empty result despite newer topic notes | C; operator ordering is essential |
| oldest_year + explicit from/to | Oldest occupied year within the access/request intersection, not lifetime outside it | Ledger-derived year clipped by explicit bounds and access; partial first/last year allowed | Same full accessible acquisition then effective/window resolution; no access widening | C; clipping already expressible |
| oldest_year + chronological + ordering/limit | Ordered matching records within each independently resolved year, followed by a GLOBAL output limit | Calendar resolution per pet; requested rows sorted globally; limit may mix semantic and transport cardinality in the legacy shape | Adapter refuses calendar_semantics. Chronology receipt picks first ordered matching row per pet and blocks missing/unretained boundaries. Calendar has no own joint proof | C + existing record selection after resolution |
| oldest_year + ordinary null strategy | Same bucket membership; ordering/limit still global | No subject group operator implied for final cap | No resultSet because isOrderedResultSet excludes calendar; complete/partial follows scan/loss/uncertain lineage/hints | C |
| calendar_samples without calendar | One earliest (asc) or latest (desc) matching record in each occupied pet/year bucket | UTC year from effective occurred_at AFTER predicates/window; group key pet + year. Global output ordering and limit follow per-bucket choice | Acquires bounded raw history ascending, resolves effective rows, groups selected rows, takes group[0]. periods receipt contains all matched IDs for each discovered bucket; omission means partial. Requires sufficient; exhaustive is rejected | B + existing order/take within bucket; complete bucket enumeration proof also required |
| calendar_samples + oldest_year | Resolve one history year per pet, apply predicates, then take one ordered match in that year | Composition of pre-predicate bucket selection and post-predicate per-bucket record choice | Same legacy resolver/sample branch; at most one sample per pet before global cap. Can omit subjects under cap | B+C |
| calendar_samples + explicit/anchor window | One matching representative per occupied UTC year inside resolved interval | Predicates/window then pet/year grouping; anchor+samples is legal, anchor+oldest_year is not | Existing anchor discovery happens first; missing/ambiguous anchor blocks. Sampling does not establish exhaustive history | B; anchor/window already exists |
| Non-ticket oldestCalendarUnit + retrieveAskHistory | Raw-language oldest/earliest/first year or month of history/notes; single owned pet only | Earliest raw row supplies a year/month in request timezone; topic not used in initial oldest probe | One ascending DB row query, intersect period with access, then bounded strategies/effective reconciliation. If exact original probe ID/time does not survive, oldest_period_boundary_unverified; no effective re-selection of a new oldest bucket. No-row probe leaves prior plan | C semantics; raw-probe implementation is D |
| Non-ticket explicit days/months: compileHistoryReadStrategies | Named date targets with scoped topics/independent needs; per-pet reads | Explicit date/month parsed from question; local midnight boundaries; target labels YYYY-MM or YYYY-MM-DD | Exact-day/need/month reservations under page budget; lexical month queries if topics; omitted targets and clipping tracked. targets consumed by completedExplicitHistoryTargets | A for each window; distinct obligations remain grounded needs, not bucket enumeration |
| Non-ticket distributePeriod=true | Broad overview or old-period context across bounded time | Equal-duration slices based on remaining query slots, NOT calendar years/months | compileHistoryReadStrategies divides milliseconds; ascending nonlexical per slice. period receipts prevent sampled summaries becoming exhaustive/billable | D allocation policy; not a calendar primitive |
| historicalAgeCutoff | Older than N years/months; scalar calendar-relative upper bound | Current local date with month-end clamping -> concrete boundary | ask-request-contract legacy p.from/to adjustment and local conversion. readTicket's temporal fields retain typed authority | A once concrete; raw-English helper remains legacy |
| relativeYearsAgoWindow | A past calendar year relative to current local year; older comparison helpers | Resolves year then constructs UTC Jan-1 boundaries | Used by non-ticket retrieval/projection; special comparison semantics outside this cut. No latest-available-bucket selection | A for window; special topic/comparison routing is D |
| Bound needs with target/from/to | Independent date/month sub-obligations, already grounded | Explicit windows; target is receipt label, not bucket-discovery operator | lungs-needs queries scoped windows/term groups; per-need exhaustion and targets retained. No temporal.calendar permitted with needs | A for temporal bounds; independent obligation semantics unchanged |
| Non-ticket previous-month food projection | Latest available food note plus previous calendar month context | Local current month chooses previousKey; row membership uses UTC occurredAt.slice(0,7) | deterministicReadProjection only after readTicket early-return; operates on represented eligible sources, not proof of newest occupied month or exhaustive absence | A date-window concept; topic/phrase and mixed-zone implementation D |

No application typed enum exists for newest_year, oldest_month, latest_month, oldest_day, first N available periods, arbitrary calendar grouping, or a newest available bucket. Month support exists only in older non-ticket oldestCalendarUnit and explicit date targets. Newest record is NOT newest calendar-period membership. Year/month/day UI formatting is not a semantic bucket query. Multiple independent target windows are not current selection.union, whose clauses share one temporal scope; preserve grounded independent needs for that case.

## C053 exact semantics and limits

C053 is the named audit case: oldest calendar-period retrieval reads its full eligible year rather than a guessed year or oldest page. Fixture access starts 2021-09-16; notes September/December 2021 plus January 2025. Expected window is [2021-09-16, 2022-01-01), with BOTH 2021 records.

Algorithm: acquire owned accessible rows -> effective processing -> for EACH pet find minimum occurred_at within explicit/access window -> UTC calendar year -> intersect that year with the existing window -> predicates -> sort -> output/transport.

This selects a bucket. It is not take-one earliest record. It does not first search for the oldest year containing the requested topic. With an unrelated 2021 note and food only in 2022, oldest_year+food returns no matching records in 2021. To ask for the oldest year containing food, predicates must instead precede partition/bucket selection in a future generic expression. These are different valid propositions, not synonym normalization.

Current negative proof is conservative scan exhaustion: any continuation, including another pet's, causes calendar_search_not_exhausted and no results. The total raw envelope is 4*64 rows, fairly allocated; exactly filling a page is not proof of exhaustion. It does not use the more efficient directional effectiveWindow frontier path because selection+calendar is illegal and calendar is not a resultSet. Actual effectiveCandidates still applies correction/lineage rules, but current calendar code has no explicit bucket identity/lineage certificate. Unresolved source lineage can affect chosen year while final overall coverage stays partial; do not mistake the returned window for a certified bucket. Outer production coverage still records no_cross_query_snapshot.

All matching rows in the chosen year remain subject to outputs.limit, 32 rows and 18,000 title/note characters. A 100-row year can be identified after a 100-row exhausted scan but only 32 rows are returned; omitted IDs and partial coverage prohibit claiming the represented list is all 100. With a 300-row unexhausted scan, current calendar resolution stops before claiming bucket identity. Chronological strategy skips oversized rows, null strategy can stop at the first oversized row; both expose loss/partial. These representation policies must not become bucket semantics.

No matches for a pet leave its original window and produce an empty result; there is no explicit empty-bucket certificate. Multi-pet windows may differ, and coverage.plan is narrowed only for one window. This is not household-global oldest year.

## Minimal conceptual algebra ? recommendation, not schema

Reuse/evolve the existing temporal expression instead of creating a parallel calendar strategy representation. A normalized pipeline can compose:

- scoped effective relation, optionally filtered;
- partition by calendar unit (year/month/day) within subject or combined-result scope, using existing deterministic date policy;
- optional existing-style order/take over occupied bucket keys;
- optional predicates within retained buckets;
- existing order/take/union over records within those buckets, or all matching records;
- separate final ordering/transport and obligation proofs.

C053: subject-scoped effective notes -> partition year -> oldest bucket per subject -> topic filter -> all matching records (or existing requested record selector).

Oldest year CONTAINING a topic: topic-filtered effective notes -> partition year -> oldest bucket per subject -> all/selected records.

One latest matching note per year: topic-filtered notes -> partition subject/year -> all occupied buckets -> desc take-one records in each bucket.

First N occupied months across selected pets: combined scoped relation -> month partition -> ascending take-N buckets -> selected/all membership.

Partition and bucket order/take generalize to hundreds of unrelated history requests across topics, subjects, units, and windows. Neither is named for a strategy, pet, measurement, or audit case. A separate "sample" primitive is unnecessary. Do not automatically add dense empty-bucket enumeration, aggregation, or sampling priority; no current requirement justifies them here.

The simple candidate shape in the request lacks predicate placement and grouping scope. Those must be resolved as ordinary operator composition over a relation before implementation; an oldest_year-specific exception would repeat the original problem.

## Required proof boundaries

| Claim | Required deterministic evidence |
|---|---|
| Oldest/newest occupied bucket | All subjects in requested bucket scope participate; boundary witness is effective; no unseen effective eligible event can occupy an earlier/later bucket; correction authors/tombstones/date shifts closed; temporal access intersection explicit |
| First N occupied periods | Ordered occupied-bucket keys and cutoff certified; no skipped occupied bucket can outrank cutoff; ties/canonical bucket keys deterministic |
| All matching records in selected bucket | Bucket identity proof PLUS exhausted effective membership for the exact bucket/query plus complete representation; empty membership cannot derive from a sample |
| Latest/earliest per bucket | Valid bucket membership, closed lineage and directional cutoff within each bucket; proof that required bucket enumeration is complete if claiming EACH year |
| Combined subjects | Joint bucket-discovery frontier if selection is global; independent subject proofs if per-subject; one unresolved pet must not erase unrelated certified per-subject buckets |
| Exhaustive count/absence/all | Complete relevant query domain and represented/derived exact facts; bucket or endpoint witness alone is insufficient |

A future bounded algorithm could acquire directional effective frontiers to identify occupied boundary buckets, then acquire membership only inside certified buckets. Corrections that can move a fact across the frontier must be closed before certification. Do not require unconditional lifetime scans, but leave partial when existing bounds prevent proof. Whole-history coverage, bucket-selection proof, within-bucket proof, and representation must remain distinct derived views, not duplicate truth stores.

## Timezone/date precision inventory

- ask-time-zone.resolveAskTimeZone validates IANA zone, defaults invalid/missing to UTC. calendarDateInZone uses that zone. calendarBoundaryToInstant resolves local midnight including DST 23/25-hour days; calendarWindowToInstants applies it. Existing tests protect display-day consistency and DST.
- Native ticket from/to are ISO instants. ReadScope has no timezone. oldest_year and calendar_samples use getUTCFullYear/Date.UTC on occurred_at, hence UTC buckets. Do not silently relabel these as local buckets during migration.
- care-occurrence.careOccurrence recognizes explicitTime YYYY-MM-DD only when stored timestamp equals that day's UTC midnight; it reinterprets that legacy date-only precision at local midnight. Genuine timestamps remain instants. calendarCandidateWindow widens only candidate envelopes so local membership filtering can find both representations. Used by older non-ticket retrieval, not ticket calendar resolution.
- source-calendar-date.sourceDisplayDate prefers a saved leading explicit date, otherwise formats occurredAt in user zone. Narrative date verification/projection also uses local zone. A displayed date can therefore disagree with a UTC ticket bucket near New Year; metadata and date attribution must not be reconstructed from display text for membership.
- Non-ticket calendarPeriodContaining chooses local year/month then caller converts nominal dates into local boundaries. relativeYearsAgoWindow chooses local current year but returns UTC year boundaries without that conversion. Previous-month food projection derives local previous month but filters UTC string prefixes. These are existing inconsistencies, reported only.
- Need windows are already grounded concrete bounds and target labels; do not invent new timezone semantics from need IDs or labels.
- Vet Brief uses its own active evidence/date-precision handling and shared older retrieval caller. Inventory notes this dependency only; no Brief code or behavior touched.

Recommendation: use the existing IANA/local-day and explicit-date policy for a future generic calendar expression, but preserve/document UTC compatibility inputs explicitly until an intentional timezone semantic migration is authorized. There is not one consistent behavior today that can honestly be called universally preserved by choosing either UTC or local.

## Corrections and deletion implications

Current effective-store fixtures show date correction moving the earliest raw 2021 row into 2023 makes 2022 the oldest bucket; removing the sole 2021 effective row does the same. Conversely a late correction can move a recent row into an earlier unseen bucket. Predicate-changing corrections can change the oldest MATCHING bucket without changing the oldest history bucket. Supersession/deletion must precede partitioning and filtering; proof must cover cross-window edges, linked-source freshness, and effective date precision, not just rows currently visible in a year.

The non-ticket oldest raw probe only detects that its original row/time stopped surviving; it fails closed instead of recomputing the correct effective bucket. Preserve the safety refusal, not the raw-probe authority. A future generic resolver should select from the closed effective stream.

## Migration and retirement order

1. Specify predicate placement, grouping scope, date policy and separate proofs; keep C053's pre-topic oldest-history meaning explicit.
2. Prove generic partition and occupied-bucket selection on the common effective stream.
3. Translate oldest_year plain/chronological and calendar_samples inputs structurally. Existing record selection/resultSet can handle within-bucket semantics after generic temporal resolution, once the common contract supports it.
4. Migrate period receipt consumers to equivalent generic bucket/membership/representation proof; do not authorize exhaustive claims from one representative per bucket.
5. Reassess non-ticket oldest month/year through upstream typed semantics; do not preserve raw-English parsers or oldest raw-row authority as new primitives.

Intentionally retire as semantics: query-budget-dependent equal-duration sampling, implicit sample sufficiency for requested all-history summaries, global caps disguised as one-per-bucket guarantees, raw-probe identity as effective truth, hint ranking inside calendar factual selection, and topic-specific previous-month behavior. Keep their real safety invariants (scope, omission reporting, partial on uncertainty), not the accidental implementation.

Chronological with data-relative calendar and calendar_samples remain legacy today. Explicit concrete windows are already expressible. Independent obligations, non-ticket relevance, event_candidates, temporal_endpoints reservation/fill, episodes, calculations and Brief remain separate dependencies. No branch is deleted or declared deletion-ready by this analysis.

## Tests and status

Added 13 analysis/counterexample tests only: earliest-record versus bucket, predicate placement, per-pet years, transport loss, scan exhaustion, effective date correction, effective deletion, sample order, global sample cap, UTC/local New Year, date-only precision, unsupported latest/month enums, and already-expressible explicit window.

Calendar analysis plus existing timezone/general calendar gates: 21/21.
Body/architecture: 185/185, including existing C053 guard/read fixtures.
222 audit: 208/222, exactly the same 14 failure names programmatically compared with the base ledger; C053 passes. Existing expectations unchanged. Offline network guard enabled.

No application changes, provider calls, database activity, live Ask, deployment, typecheck/build changes or dependency changes. Build/typecheck were not rerun for docs/tests-only changes; the base's passing build/typecheck remains the last recorded result. Whitespace checked before commit.
