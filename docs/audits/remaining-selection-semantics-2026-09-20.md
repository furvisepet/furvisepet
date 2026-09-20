# Remaining legacy selection semantics

Base: 39e7aeb7588496a0e444688f4f5b20f161c6ffbc. Offline analysis and regression witnesses only.

## Decision

No additional application shape is migrated in this cut. No primitive, adapter change, execution change, or authority change is introduced. Both legacy branches remain necessary and are NOT deletion-ready.

A global result-level take is a genuinely reusable selection concept. However, record expressiveness alone is insufficient: current certificates and publication obligations are per subject and per clause. Exact global selection needs a joint certificate over competing subject frontiers. Implementing that would change certification and publication authority, explicitly excluded here.

Required/optional priority is also broadly reusable, but reproducing the full legacy behavior additionally needs global cardinality, priority-preserving distinct union, and obligation semantics for omitted optional rows. Plain union plus global chronological take is not equivalent.

## Application entry points

| Entry | Typed input and scope | Execution |
|---|---|---|
| app/api/ask/route.ts -> interpretAskQuestion -> validateAskRequest -> bindTicketedRead / bindProviderReadTicket | Provider can propose both legacy strategies; subjects are resolved through existing named, selected, conversation-reference or household authorization | retrieveAskHistory -> retrieveTicketHistory |
| validateAskRequest compatibility/mixed envelopes | Same read ticket may coexist with independent evidenceNeeds; those obligations are not equivalent to a subject group | Same retrieval boundary; adapter excludes these envelopes |
| app/api/ask/actions/[messageId]/route.ts -> continueConfirmedAppend | Rebinds stored request for a confirmed append continuation; does not introduce a second planner | Same retrieval boundary |
| bindEvidenceReadTicket | Rejects non-null strategy/limit | Not a producer of these strategy shapes |

There is one application compatibility boundary: intelligence/history-retrieval.ts::retrieveTicketHistory calls translateLegacyReadSelection and propagates its normalized ticket. Native tickets pass through unchanged. Vet Brief uses its separate existing path and is not migrated. Static callers establish reachability, not production request frequency.

## Algorithm, not strategy labels

Common legacy path in furvise-brain/lungs.ts:
1. Restrict to authorized subjects and access window. Acquire candidates using existing bounded, subject-fair acquisition (default four pages of 64 total candidates).
2. Apply existing effective truth and temporal resolution, then predicates.
3. Combine subject records and order by requested direction using event time, creation time and ID tie-breaks.
4. If hints exist, rank by matched hint terms, retaining chronological order for ties. Hints do not become exclusion predicates.
5. Apply strategy selection, then the global outputs.limit when non-null.
6. Apply record/character transport bounds (32 records / 18,000 characters by default). Strategy tickets skip oversized rows; ordinary no-selection reads stop at one.
7. Sort retained output in requested temporal order and calculate existing coverage receipts.

Chronological selection: globally ordered/ranked candidates, truncated once across all subjects. There is no per-pet reservation. A finite legacy limit acts as both the requested subset cap and an output allocation cap; it is not N per pet. A null limit adds no semantic truncation but does not remove transport limits.

Temporal endpoints: find each subject's effective earliest/latest matching candidate; form the union of their IDs; stable-partition ranked candidates so those IDs precede interior records; apply the global limit; then transport limits. This reserves priority, not guaranteed capacity. A limit of one can discard a required boundary and block the pair. Spare capacity is filled with interior records. Final presentation order is temporal, not priority order.

Coverage: continuation, unresolved effective truth, transport loss and required boundary omission remain material. Chronological receipts describe each subject's retained directional boundary and can be blocked. Endpoint pairs are blocked when acquisition/effective truth cannot establish them or their required IDs are not retained. Endpoint subsets carry bidirectional_endpoint_subset; hint use carries bounded_period_context_not_semantic_completeness. Exhaustive obligations remain exhaustive even when a bounded subset is returned.

## Complete partition of remaining inputs

Rows below are crossed with arbitrary legal predicates, authorized subject scopes and temporal windows; no topic or pet creates another algorithm. Apply adapter exclusions first, so overlapping rows do not imply separate executors.

| Remaining class | Subjects / bounds / limit | Actual distinguishing semantics | Classification and disposition |
|---|---|---|---|
| Chronological finite global subset | Multiple subjects; explicit/resolved window; finite N | One global ordered/ranked prefix; no per-subject reservation | B at record algebra level: result-level take. Not implementable with unchanged certificate contract |
| Chronological unbounded, no hints/independent needs/calendar | One or many subjects; limit null | All matching effective records, bounded by acquisition/transport; chronology receipts | A for record algebra: no selection necessary. Full parity unavailable because removing strategy changes skip/stop behavior and removes live receipts |
| Endpoints single subject, limit other than two | Any legal window; null, one, or greater than two | Priority boundaries, optional interiors, global truncation; pair may be blocked | C for full contract; requires priority allocation plus result cardinality and matching obligations |
| Endpoints multiple subjects, any limit | Authorized multiple subjects | Per-subject boundaries, globally shared budget, optional fill; missing subjects do not erase others | C for full contract; plain per-group union cannot model interior fill/global reservation pressure |
| Either strategy with searchHints | Any scope/window/limit | Lexical ranking influences who survives the budget; hints are advisory, not filters | C; later relevance/context allocation migration, not a raw-English selection primitive |
| Either strategy with independent evidenceNeeds or bound needs | Any scope/window/limit permitted by binder | Independent source-grounded obligations/retrieval; cannot flatten into homogeneous groups | C; preserve existing paths until structural grounding and full obligation parity are proven |
| Either strategy with calendar constraints | Any binder-legal scope and limit | Calendar resolution composes with legacy processing; current selection binder excludes calendar | C under this scope; C053/oldest-year remains untouched |
| Episode-bearing tickets | Only if otherwise binder-legal | Adapter explicitly excludes; independent episode semantics | Outside this cut; no change |
| Native selection or other strategies | Existing native shape / calendar_samples / event_candidates | Not remaining chronological/endpoint translation candidates | Unchanged |

Existing migrated partition remains exactly: one subject, finite chronological limit (or endpoint limit exactly two), no hints/calendar/episode/needs/independent evidenceNeeds. Existing adapter retains output limits separately and removes the legacy strategy only for its proven cases.

Ordering asc/desc changes the directional prefix and final presentation. Predicates and temporal bounds restrict the candidate domain before selection. Legal semantic anchors use the existing resolver; no dates are invented. Binder compatibility still determines which operation/anchor/calendar combinations can reach execution.

## Expressiveness and generic primitives

### Global result-level cardinality

Conceptually order all matching records, then take N per result. It naturally describes latest five across several pets, earliest ten across a household, or a bounded prefix of any predicate within a window. It is not equivalent to N per subject followed by a transport cap.

Current language only accepts take.per=group. Each native clause is certified separately for every subject. A subject with no global winning row must not be mislabeled missing; proving a global winner requires the relevant acquisition/lineage frontier for every competing subject. selection-publication.ts currently loops over every subject and every clause, consuming per-subject stream/group receipts. A result-level take cannot be added honestly by trimming those receipts after certification.

Semantic N and transport capacity must remain separate. A transport drop of a required selected row must block its publication, not silently change the query.

### Required and optional records

Reusable intent: preserve referenced events then fill context; preserve one result per pet then fill a total budget; preserve requested boundary facts then show supporting records. Existing union expresses independent selected sets, not priority tiers or optional obligations.

Legacy reservation is weaker than hard required membership: insufficient budget drops prioritized rows and blocks endpoint pairs. Any future priority primitive must state overflow behavior explicitly. A global temporal take over a union discards priority; plain asc/desc take-one union cannot create optional interiors. Do not name a primitive after endpoints.

### Unbounded history

No selection is needed to mean all matching effective records in a domain. Exhaustive coverage and transport remain separate. However, stripping strategy is NOT parity: the new witness shows different output after an oversized record, and legacy chronology receipts disappear.

Live receipt consumers include ask-evidence.ts, read-projection.ts and review-history-narrative.ts. They are factual consumers, not cosmetic metadata. Migrating them or synthesizing new certificate authority is outside this cut.

### Hints and independent probes

No raw-language rank operator is proposed. Hints currently reorder budget allocation without excluding unmatched records. Converting them to predicates would change facts.

Independent evidenceNeeds may eventually be represented through existing ID-free probe proposals, validated user quotes/turns/subjects, then server-owned grounded needs. Existing IDs or hint strings cannot reconstruct missing grounding. This is not proven as a purely structural translation for every old envelope, and the previous adapter deliberately excludes those envelopes. Homogeneous subject grouping must not erase independent obligations.

## Protected paths and deferred strategies

No application code changed. Brain, provider schema, grounding, Heart, effective truth, certification, authority, Labs, Mouth, Brief, Immune, profiles, episodes, calculations and review/finalizers remain byte-identical.

calendar_samples remains outside: time-bucket representative selection is not the current subject-group directional prefix. A reusable time-bucketing/representative concept would need its own semantics and proof, not a renamed strategy.

event_candidates remains outside: candidate evidence retention and obligations are not automatically a chronological prefix or boundary union. Typed candidate/evidence semantics must be established before migration. No new primitive is introduced for either.

## Offline proof

New tests: tests/legacy-selection-expressiveness.test.mjs, ten passing regression witnesses:
- all-matching rows can coincide while chronology receipts differ;
- oversized-row skip versus stop changes records;
- global top-one differs from per-group selection plus round-robin transport, including rotated subjects;
- priority boundaries differ from global latest-N;
- legacy reservation can truncate a required boundary;
- missing-subject endpoint fill differs from plain union, including rotated subjects;
- hints rank without filtering;
- result-level take is currently rejected;
- calendar plus selection remains rejected;
- independent obligations remain excluded by the adapter.

These are non-equivalence tests, not claims that the excluded shapes have been migrated. Existing 40 compatibility/parity tests remain green, including the already-supported correction/deletion and transport scenarios.

| Gate | Result |
|---|---|
| New expressiveness witnesses | 10/10 |
| Existing compatibility/parity | 40/40 |
| Body / architecture, including Lungs/effective selection | 185/185 |
| Publication / Labs / authority | 74/74 |
| Brain / interpreter / timeout | 77/77 |
| Broader safety | 46/48; same two baseline failures |
| Audit | 208/222; exact same 14 baseline failures |

Baseline failure names were compared programmatically against the preceding adapter ledger, not only counts. All test processes use the offline network guard. Dependency-complete gate checkout: typecheck passed; clean production build passed after removing .next and tsconfig.tsbuildinfo. Diff whitespace check passed. No dependency or package changes.

## Migration coverage and dependency order

New migration coverage: none. Existing single-subject adapter coverage is unchanged. Both legacy branches remain live for the classes above; neither is deletion-ready.

Future order, requiring separately authorized scope:
1. Define result-level cardinality and its joint certification/obligation contract.
2. Define reusable priority/optional allocation and overflow semantics.
3. Migrate receipt consumers to the common certified obligations; preserve unbounded transport behavior explicitly.
4. Handle advisory relevance and independent grounded probes separately.
5. Prove native/legacy equality through source authority and publication before retiring execution branches.

No deployment, live Ask, paid API, branch deletion, or legacy executor deletion occurred.

### Unchanged safety failures

- episode membership production callback regressions
- reviewed Ask effects execute inside the single Brain handoff

### Unchanged audit failures

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
