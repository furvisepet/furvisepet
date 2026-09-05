# Ask recovery integration and lifetime-history audit

## Stage 1: integration

Target: freshly fetched `origin/main`,
`c1d36b4993a5606e43f1f0fdb81201a3fd595e96`.
Local `main` was stale (`26beb1f`); it was not used or moved. The original working
directory remained on `codex/ask-copy-polish`, with its image deletions and
untracked QA/Supabase directories untouched.

Integration branch: `codex/ask-recovery-integration`, isolated worktree
`C:/Users/gwara/furvise-ask-recovery-integration`.
Integration commit: `ec5fede4145bcaeadfe9af8ca24ae5b73f8d3d71`.
Second parent: reviewed repair tip `e03ebc8b08db96df597e50865aa17e6c63a2255a`.
Used a non-squash, non-fast-forward integration merge on this new branch only.
Every repair commit remains an ancestor. No conflicts; no conflict resolutions.
The integrated tree is identical to the reviewed repair tree because main had
not advanced from the repair base. No push, target-branch merge or deployment.

Verification of the integrated result: all 2,179 default-suite tests passed;
`npm run typecheck` passed; `npm run lint` had zero errors and the two existing
unused `supabase` warnings at `persist-learnings.ts:149,378`.
`git diff --check` and `git diff c1d36b4 HEAD --check` passed.
Dependencies were reused via a local node_modules junction to the repair
worktree; no install, credential copying, environment changes or provider calls.

## Stage 2: method and scope

No application code was changed for this audit. Added an explicitly invoked
red acceptance audit and a clearly synthetic fixture:

- `scripts/audits/ask-lifetime-history.audit.mjs`
- `scripts/audits/fixtures/ask-lifetime-history.mjs`

Run: `node --experimental-transform-types --test scripts/audits/ask-lifetime-history.audit.mjs`.
Result: **28 checks, 6 pass, 22 fail**, exit code 1 as expected for reproduced
unimplemented requirements. These are not skipped/TODO assertions and are not
included in default test discovery. They must not be described as a green audit.
Node's transform flag is required by existing constructor parameter properties.

The harness executes the real `buildFurviseContext`, real query builder calls
against a filtering/sorting/limiting mock, real `runFurviseIntelligence`, real
`generateContextAwareAskResponse` and its provider-input builder/parser, and
real final answer validation. The only generation adapter supplies the existing
mock-client argument to the real generator. Network fetch throws immediately;
the data mock has no insert/update methods. Capability loading and its response
presentation wrapper are stubbed; fixtures contain no capabilities. The complete
Next HTTP handler, auth service, billing ledger and deployed database are not
executed. Their wiring is code-inspected, not claimed as runtime verification.
Adversarial answers are intentional mocked outputs: results show insufficient
validation, not the probability that any live model would produce those answers.

Existing fixtures inspected: `tests/fixtures/ask-conversation-evaluations.mjs`,
`tests/ask-context-reasoning.test.mjs`, `tests/effective-history-projection.test.mjs`,
and the prior reliability/source/persistence tests. Existing long-context tests
verify truncation determinism and caps, not complete period/aggregate coverage.
Existing effective-history tests primarily cover preference corrections and
preservation of medical chronology. They do not prove Ask consumes that projection.

## Actual execution and causes

### Authority and generation

`app/api/ask/route.ts:2535` validates the bearer token with `auth.getUser`, then
checks request origin. Entitlements come from the server (`:2561`); ownership
queries use authenticated `userId` (`:252`). The initial loader (`:348`) receives
the selected pet and conversation, **no dateRange**. The loader independently
checks profile owner and conversation owner/anchor (`retrieve-context.ts:49`).

Subject resolution (`route.ts:655`, `entities/resolve-turn-subject.ts:42`) tries
deterministic named-pet/discourse resolution before an optional model-proposed
frame, then validates frame evidence against owned candidate pets. An alternate
pet triggers a new scoped context load (`route.ts:711`), keeping the original
conversation anchor via `conversationPetId`. Ambiguity returns clarification.

The route builds `generationInput` from the larger `turnView.entries` (`:1136`)
and passes it to the orchestrator (`:750`). **The callback at `:760` has no input
argument and invokes `runFurviseIntelligence({context: liveContext, ...})`**.
`run-intelligence.ts:65` passes `context.selectedCareEntries`, merged memories,
selected profiles, episodes, and prior conversation to the actual generator.
Changes to the route's generationInput alone cannot repair effective retrieval.
The route's `turnSemanticFrame` is also not forwarded as that generator field;
`authoritativeSemanticFrame` instead participates in downstream governance.

For multi-pet turns, the generator gets profiles for every authoritative pet,
but the route loads care/episodes/current state for only `subjectResolution.petId`.
Thus profile authorization does not imply evidence coverage for the other pets.

### Verified caps and filters

| Boundary | Current behavior | Consequence |
| --- | --- | --- |
| `retrieve-context.ts:60`, `feature-modes.ts:118` | Care: newest 80 by occurred_at, then created_at; owner/pet/deleted filter; no cursor, count or pagination | Old decisive records never become candidates, irrespective of question |
| `retrieve-context.ts:61` | Optional UTC inclusive dateRange applies to occurred_at only | Ask supplies no question-derived range; direct range use excludes later-recorded corrections outside event period |
| `build-context.ts:6` | Scores current-message terms, recency, severity; takes 20 (requested limit clamped 10–20) | No period/topic coverage guarantee; no aggregate computation; follow-up topic is not part of selection |
| `ask-reasoning.ts:365,1217` | At most 5 care updates; active/important updates can precede relevance | Five relevant snippets cannot support arbitrary counts or all measurements |
| `ask-reasoning.ts:1223` | Base text max 1,200 chars; first two care values 520; other care values 180; other records 280; conversation 500 | Arbitrary prefix cuts can discard correction, negation, unit or uncertainty clauses; no semantic completeness marker |
| `ask-reasoning.ts:409` | “N older updates: categories” counts only omitted records from supplied selected entries | Not coverage of stored history, not necessarily older, and not a summary of missing facts |
| `retrieve-context.ts:66–73` | Legacy active memories 100; shared active/unexpired 200 then fresh relevance to 100; inactive markers 40 | Old current facts/correction markers may disappear; historical query cannot retrieve expired/superseded provenance through this path |
| `ask-reasoning.ts:393`, `run-intelligence.ts:333,378` | All memory sources compete for 8 slots; current state becomes a memory; freshness text capped at 600 then memory record at 280 | Canonical state is not reserved and its support/qualifier can be truncated |
| `context-builder.ts:31,46` | Active concerns: active/reopened, no app limit; resolved concerns: 7-day window, max 5 | Monitoring concerns excluded by this loader; no lifetime resolved-concern search |
| `retrieve-context.ts:83,160` | Episodes: newest 20 across active/monitoring/resolved; resolved subset max 8 | Many newer episodes can remove the decisive old or still-active one before relevance |
| `ask-reasoning.ts:382–390,1170` | Active concerns max 3, resolved 3; active episodes max 6 conditional on safety relevance; resolved episodes max 3 and term-matched | Episode serialization drops sequence_number, recurrence_of, resolved_at and detailed summary/source chronology |
| `retrieve-context.ts:77`, `ask-reasoning.ts:1210` | Conversation: latest 12 by sequence, reversed; model last 6, 500 chars each | Prior lists, topic anchors and antecedents disappear; answer sections not loaded, only directAnswer/summary |
| `entities/recent-subject-state.ts:41`, `candidate-retrieval.ts:31`, `semantic-frame/extract-turn-subject.ts:56` | Subject state last 8 user turns; candidate recency last 4; optional subject model last 6 user turns at 500 chars | No persistent episode/result-set referent; limited discourse window |
| `retrieve-context.ts:74`, `ask-reasoning.ts:398` | Feedback 80, then at most 3 for product-like questions | Not a lifetime food-transition representation |
| `ask-reasoning.ts:223,452,478` | Current question max 1,200 chars; JSON context budget 48,000 chars; pop records from tail | Character rather than token budget; no coverage repair after removal; mandatory evidence is not structurally protected |

No age predicate limits ordinary care rows, but a newest-N cap is an effective
age horizon that shrinks as usage grows. No SQL text search or query-intent
aggregate exists here. No loaded-row count is a complete-history count.
Queries without an application limit still depend on deployed PostgREST row
settings, which were not inspected. The 48k guard only removes contextRecords;
it is not a formal bound on all possible non-record metadata or total model
tokens. Instructions/schema are additional to the JSON input. Current configured
answer output maximum is 4,096 tokens (`ask-provider.ts:1`).

### Corrections, episodes and temporal authority

`effective-history.ts:13` projects preference replacements using memory source
links while deliberately retaining medical chronology. The Ask loader does not
call it. Inactive-memory filtering removes matching conversation turns, not
incorrect medical care claims (`memory-lifecycle/filter-conversation.ts:12`).
Current lexical scoring can return both an incorrect original and its correction
without a directed relation; date filtering can return only the original.
`semantic-events.ts:171` builds `priorEventIds: []`; a “corrected” event label is
not by itself a general claim-level supersession relation for retrieval.

There IS reusable relation governance: `v2/projections/rebuild.ts:94` evaluates
`corrects`, `supersedes`, `retracts`, invalid edges, cycles and competing heads.
The synthetic control supplies a correction recorded twelve years later and
correctly removes Milo's original claim in favor of Bruno's corrected claim.
But `v2/phase3/runtime.ts:26,167` is optional shadow/low-risk infrastructure:
its owner graph read caps are 1,001 claims, 2,001 relations and 501 concepts,
with overflow rejection above 1,000/2,000/500. It compares projections and
returns concept policies, **not complete effective history to liveContext**.
It must not be described as an active lifetime retrieval implementation or
silently promoted wholesale to production.

Reuse episode IDs, sequence_number and recurrence_of (`episodes/types.ts`) and
event assignment/reducers, but audit their semantic completeness first. The
legacy assignment is heuristic; it cannot prove two episode onsets from four
notes unless reliable episode membership exists. Current-state reduction is
primarily breathing and recognized medication transitions
(`pet-state/reduce-events.ts:5`), not a complete history index. Reuse the repaired
concern-specific recovery gate and its interval/subject evidence rules for
terminal interpretations; do not replace it with a model answer or a summary.

### Follow-ups and after-generation grounding

`resolve-turn-subject.ts:120` defaults to the selected pet when a message has no
referential pronouns/names. With conversation anchor Milo and a previous Luna
discussion, “What about the second episode?” resolves to Milo. Near explicit
names and pronouns are passing controls. `retrieve-context.ts:174` drops prior
answer sections; conversation records are tagged with the first current profile
(`ask-reasoning.ts:1208`), not stored per-turn pet/topic/episode bindings.
Reference resolution for semantic mentions (`entities/resolve-references.ts`)
does not retrieve a previous ordered episode result set.

The generator admits only supplied relevantContextIds (`ask-reasoning.ts:848`)
and reconstructs referencedRecords (`:719`), but this checks ID membership, not
claim entailment, counts, absence or arithmetic. Answer economy now preserves
decimals and distinct fact relationships. Final `validation/validate-answer.ts:16`
removes particular unsupported-diagnosis/persistence phrasings and checks named
pet disagreement. It does not validate arbitrary facts against complete history.
The mocked statements “Exactly seven soft-stool episodes”, “urine test was
normal”, “hiding is fully resolved”, “Oscar has arthritis”, and a 0.2 kg delta
all survive. These tests do not show a new terminal write; the repaired write
boundary is separate and remains unchanged.

Optional load failures become empty arrays plus `contextRecovery.unavailableSources`
(`context-recovery.ts`). The route logs them (`route.ts:2374`), but the actual
generator call omits that metadata. Missing data can therefore look like no data.

### Free/paid

The actual history loader/reasoner has no plan-specific grounding budget. Both
plans share the same limitations. Credits and entitlement checks remain required.
Separately, `ask-internal-product-policy.ts:14` treats “Furvise” as product
context and “all history” as a planned-capability query. The route can replace
the generated response AFTER generation (`route.ts:863`) with different free/
paid planned-feature wording (`:2635`). “Furvise, summarize all history for Milo”
reproduces that classification; “Summarize Milo entire history” does not.
Stored-record recall must be distinguished from paid pattern-inference features
without changing prices, credits or subscription permissions.

## Reproduction matrix and coverage gaps

All facts below are fixture inventions, not production findings.

| Fixture / check | Expected truth or behavior | Observed failure |
| --- | --- | --- |
| Milo, 120 recent irrelevant rows | Two separate soft-stool episodes in 2011/2014, not four onset/end notes | Old decisive IDs absent from actual input |
| Milo weights | 28.4 → 27.9 → 27.8 kg; net −0.6 kg | Old weights lost; six-measurement control loses one even with all six loaded; wrong mocked delta survives |
| Milo diet | Chicken/rice → salmon/rice | Both historical transitions missing with noise |
| Late correction | July 2014 vomiting belongs to Bruno, not Milo | Direct 2014 range returns incorrect Milo original without 2026 correction; long-note suffix correction also truncated |
| Luna | Litter change → accidents → restoration → improvement | Old decisive sequence missing with noise |
| Luna uncertainty/absence | No urine-test result recorded in this fixture; hiding improved, not resolved | Mocked normal test and full resolution survive answer validation |
| Oscar | Completed course, recurrent stiffness, latest qualified improvement; no diagnosis recorded | Decisive history missing with noise; mocked arthritis claim survives |
| Broad lifetime request | Coverage states period, exclusions and incomplete reads | Prompt has only a summary of omissions from selected subset |
| Unavailable care source | Cannot infer absence from failed lookup | Unavailable-source metadata disappears before provider input |
| Canonical episodes | Old IDs searchable; preserve sequence/recurrence | 20-row loader loses old episodes; serialization strips ordinal identity even when episode is present |
| Multi-turn / pet switches | Retain Luna topic and second episode, or clarify | Name-free ordinal defaults to Milo; prior structured list discarded |
| Multi-pet | Load each authorized pet's relevant history | Other pet's profile supplied without corresponding care records |
| Plans | Same truth for stored-history questions | App-addressed recall can be diverted to a planned paid-capability response |
| Scale control | Bound model input as stored history grows | Passing at 10,000 synthetic rows, currently achieved by losing completeness |

The six passing controls cover small weight-input coverage and scoped loading,
explicit/nearby-pronoun switching, bounded 10k-row model input, no write methods,
late-correction graph reduction, and ordinary recall avoiding the capability gate.
Not tested live: RLS, production query plans/row limits, latency, token billing,
provider behavior, access-tier HTTP flows, deployed phase3 mode, actual historical
data quality, migration/backfill completeness or concurrent-write snapshots.
No claim that all existing historical records already have usable correction,
episode or measurement links. That must be audited before exact answers.

## Smallest coherent design (not implemented)

### One authoritative read result feeding the real callback

Introduce one server-owned history query/evidence result and make the actual
`runFurviseIntelligence` call consume it. Remove duplicate selection authority
afterward; do not repair only buildTurnGenerationInput. Proposed contract:
authorized pet IDs; query type/topic; requested event-time interval/timezone;
knowledge-as-of cutoff; evidence and source IDs; normalized measurements and
episode/result-set IDs; exact aggregate results; current state with provenance;
and coverage (`complete | partial | unavailable | ambiguous`, covered interval,
continuation, exclusions, snapshot/projection version). These field names are a
design proposal, not existing schema. No model-written authority fields.

### Query intent changes selection, not truth standards

Support factual lookup, period overview, episode count/list, measurement comparison,
current state and follow-up reference as separate read shapes. Use deterministic
recognized forms and existing subject resolution first; if a model proposes a
query interpretation, validate all pet IDs, time bounds and operations server-side.
Ambiguous period, animal or “second” antecedent requires clarification.

Fetch candidates across all time using owner/pet/topic/time indexes and keyset
pagination with a unique tie-breaker. Do not treat top-k relevance as exhaustive.
Period selection uses event time; correction closure uses record/knowledge time
independently, including corrections made after the requested event period.
Read a consistent version/snapshot; incomplete pages or interrupted closure must
produce partial/ambiguous coverage, never exact absence or counts.

### Effective facts before summaries or aggregates

Reuse the directed effective-claim reducer's rules, not a “latest text wins”
heuristic. Load validated replacement/retraction closure by stable ID; verify
owner and subject changes at the authoritative boundary. Historical statements
and changed preferences remain as historical facts; mistaken claims are removed
from effective counts, retained as provenance and identified as corrected.
Deleting a correction must not resurrect an invalid original. Uncertain or
competing corrections must abstain from exact aggregation.

Use existing episode identities where trustworthy. Count episode onsets/groups,
not care-note rows or wording matches. Preserve sequence, recurrence links,
boundaries and unknown membership. For legacy unlinked notes, return “two recorded
reports, episode count uncertain” until validated grouping exists. Measurement
comparison uses complete effective measurement rows with source IDs, original
value/unit, normalized unit, event time and qualification. Deterministic arithmetic
produces 28.4 → 27.9 → 27.8 and −0.6 kg; the model explains that result.

### Decades of history without sending every note

Search stays over the full indexed source corpus. Exact counts/trends are computed
server-side from effective structured data, not from model snippets. For broad
overviews, query topic/period aggregates and retrieve bounded representative
evidence plus every decisive exception/correction/qualification needed for the
answer. Versioned period/topic summaries may accelerate narrative coverage, but
must retain source lineage and coverage and never be the sole authority for
exact counts, current safety or absence. An overview covering many decades can
send bounded per-period aggregates and an explicit incomplete-narrative notice,
not pretend five arbitrary notes are complete history.

Old raw records lacking indexed semantics remain reachable by time/text retrieval
and progressive pagination. Do not label a semantic search complete just because
it returned no lexical matches. Legacy extraction/grouping coverage is explicit;
avoid a mandatory one-shot wholesale V2 cutover. Any future projection/index or
backfill change requires a separately authorized implementation/migration stage.

### Bounded evidence and answer validation

Reserve budget for query scope, coverage, exact aggregate facts, current safety,
corrections and their qualified source spans before allocating optional narrative
snippets. Truncate at factual evidence-span boundaries, not fixed character
prefixes. If decisive facts do not fit, narrow the answer or ask for a smaller
scope. Use a measured total-input-token ceiling including instructions/schema;
48k characters is not a token guarantee. Keep model and output policy unchanged.

Require supported claim IDs for factual sentences, verify arithmetic and record
membership server-side, and use deterministic rendering/abstention for counts,
measurements, test-result absence and recovery status. Citation IDs alone are
insufficient. “No recorded result” is permissible only for complete, reliable
coverage of the requested record scope; partial data says “I couldn't verify a
result from the records available.” An empty result never proves the test did
not happen. Recovery answer presentation must agree with the repaired shared
decision, including uncertainty and contradictory source evidence.

### Durable follow-up binding

Keep an owner/conversation-scoped reference envelope: authorized focused pets,
topic, period, ordered result-set/episode IDs, source versions and the last
supported answer facts. Reuse existing subject/reference resolution, but resolve
ordinals against the referenced result set, not most-recent SQL order or selected
pet default. Revalidate IDs/ownership/current versions on every follow-up.
On pet switch, establish a new focus; don't relabel old conversation claims as
the new pet. Ambiguous or evicted references ask clarification or re-run the
original scoped query. Assistant text remains context, never a new owner fact.

## Query, token, latency and invalidation implications

Current context loading ordinarily issues 12 data reads without conversation,
14 with conversation, plus conditional deleted-source/capability reads; alternate
pet loading repeats much of this. Phase3 can add three graph reads. Several reads
run in parallel after ownership checks. This is code-derived, not measured
database round-trip latency. Current query count is bounded by caps, not coverage.

Proposed lookup cost is indexed candidate work plus correction closure and
bounded detail hydration; aggregate queries operate over matching effective
facts. For k relevant rows out of N, targeted indexes avoid rescanning N for each
question, but exact new aggregates may still require O(k) database work. Keyset
fallback is O(number of pages), not unlimited inline prompt growth. A page/query
budget must surface a partial response and continuation, never a false total.
Persisted/versioned aggregate projections are justified only after profiling.

Provisional acceptance budgets to measure (not claims about production): at most
4 history-specific round trips on an indexed common query, parallel where safe;
history retrieval p95 ≤300 ms at 100k synthetic records per pet in a local/staging
database benchmark; ≤1 second before returning qualified partial coverage for an
unindexed fallback. Set and measure a fixed total prompt budget before rollout
(initial evaluation target 12k input tokens including fixed prompt/schema, subject
to measuring that fixed overhead). If mandatory evidence cannot fit, qualify or
clarify. Retrieval should add no model call for supported deterministic queries;
existing optional subject extraction remains separate. No benchmark against real
Postgres or tokenizer was run here, so these are proposed gates only.

Caching is optional, not the correctness mechanism. Safe keys need owner,
authorized pet set, normalized query/period/timezone, resolved reference IDs,
knowledge cutoff and projection/evidence versions. Edits, deletes/restores,
corrections/retractions, newly backdated events, subject reassignment, episode
membership, profile/current-state changes and memory lifecycle changes invalidate
affected results. A late correction invalidates the original period and relevant
aggregates, not just the month it was recorded. Multi-pet answers depend on every
pet version. Authorization, deleted records and fresh write authority must never
be bypassed by cache hits. Avoid caching partial absence as a durable fact.
Historical answer replay should be distinguishable from a fresh current query;
cache implementation and pricing/credit changes are out of scope.

## Staged implementation and measurable acceptance

1. **Evidence contract and coverage wiring.** Feed one contract to the actual
   callback and validation; propagate optional-source failure and truncation.
   Acceptance: mocked provider receives precise scope/coverage for complete,
   capped, unavailable and ambiguous sources; no definitive absence/count on
   incomplete coverage; no history query is converted to a save/update.
2. **Queryable effective history.** Add full-time candidate lookup and stable
   pagination; integrate validated correction closure using existing relation
   rules. Acceptance: decisive 2011 records found among 100k newer irrelevant
   rows; identical effective results under row-order permutations; 2026 correction
   changes the effective 2014 claim without altering unrelated Milo stool facts;
   cross-owner rows never influence results; deleted/superseded claims never revive.
3. **Exact aggregates and period summaries.** Normalize validated measurements
   and episode membership, then compute deterministically. Acceptance: Milo two
   episodes, no effective Milo vomiting, −0.6 kg and both diet states; Luna litter
   sequence and qualified hiding; Oscar completed course and recurrent stiffness;
   no invented urine result/diagnosis; summaries cover requested bins or disclose
   which bins are incomplete. No averaging away decisive exceptions.
4. **Follow-up and factual answer guard.** Carry stable reference envelopes and
   validate factual claims before prose rendering. Acceptance: “second episode”
   remains the originally listed episode across reordering and pet switches or
   explicitly clarifies; all five adversarial mocked answer claims in this audit
   are rejected/repaired; every factual/count claim links to supporting effective
   records/aggregate, preserving uncertainty. Existing recovery regressions stay green.
5. **Scale and tier verification.** Run the same fixture matrix through free and
   paid HTTP entitlement mocks, preserving quotas but identical factual grounding;
   distinguish stored recall from product-capability questions. Benchmark 10,
   1k, 10k and 100k records with measured queries/tokens/p50/p95 latency. Add
   concurrent edit/delete/correction tests and invalidation tests before any cache.
   Move successful red requirements into normal regression discovery as implemented.

## Remaining uncertainties / safe fallback

Legacy provenance and episode links may be incomplete; a database deployment's
actual row settings and enabled shadow features may differ. Treat those as
coverage limitations, not permission for the model to fill gaps. Full parser
semantics and multilingual event dates require separate acceptance expansion.
Do not derive current recovery, diagnosis, zero episodes or absent tests from
retrieval silence. When source order, identity, period or correction closure is
ambiguous, preserve qualified observations and clarify rather than mutate state.
Skills used for the route/data audit reinforced request authority and avoiding
query-waterfall assumptions; no external services were modified.
