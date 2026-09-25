# Authoritative selection vs supporting context allocation

Base: 78adf71435e5141e5de1bf89ad442a9707741ebd.
Offline only. No paid APIs, live Ask, deployment, or chronological migration.

## Implemented boundary and adoption status

Added one pure internal allocator in intelligence/supporting-context.ts and its
source-grounding factories. It operates on already-authorized effective records.
It does not acquire records, interpret a question, resolve corrections, select the
factual result, create certificates, publish facts, or call a model.

No existing production caller is switched in this cut. The helper is an offline-
proven capability, not a claim that existing mixed legacy allocation is retired.
This is deliberate: those callers still mix context reservations with factual
selection, and publication currently treats ordinary represented care sources as
potential evidence for non-certified obligations. Silently adding optional context
to that collection would widen authority. No such integration is made here.

## Advisory mechanism inventory

All references below are under app/lib. 'Grounded' distinguishes validated USER
source provenance from merely model-proposed hints or downstream text parsing.

| Mechanism / entry | Input, grounding and scope | Membership vs representation | Existing coverage / budget / failure effects | Classification |
|---|---|---|---|---|
| furvise-brain/lungs.ts hint scoring | Bound ticket searchHints; scope from ticket; shape-validated Brain hints, not verbatim USER claims | Reorders matching candidates before finite transport; can change legacy returned boundary/subset | bounded_period_context_not_semantic_completeness; selection omissions and partial coverage; shares read failure | Advisory signal tangled with factual selection. Only isolated optional candidates qualify for new allocator. |
| intelligence/history-query-relevance.ts::historyQueryTerms/historyQueryRelevance | Legacy terms with stemming, aliases, stopwords and pet-name stripping; not a new source binding | Ranks candidates, feeds retrieval queries | Can change discoveries, candidates and prompt survivors | Keep legacy; do not import aliases or English interpretation. |
| historyEventTerms/historySearchGroups/historyEventRelevance | Raw-question regex event facets; rarity measured within scoped candidates | Separate rare lexical probes and score tiers; later affects carried rows | Query reservations, eventCandidateIds, failure and budget behavior | Not trustworthy typed context provenance; keep legacy. |
| history-retrieval.ts::compileHistoryReadStrategies use | USER-grounded evidenceNeeds plus downstream exact-date parsing, broad strategies and scope | Need-specific queries plus period context, lexical fallback and optional sampling | Per-need hits/exhaustion/failures; target receipts; omitted needs; boundedContext special exhaustion | Mixed acquisition and semantic obligations. No translation in this cut. |
| history-retrieval.ts::orderHistoryEvidence and food-summary branch | Authorized effective rows, relevance scores, selection and raw text | Ranks/subselects rows; boundary receipts can depend on ranking | Candidate/chronology/endpoint metadata and loss accounting | Legacy factual authority as well as context. Keep untouched. |
| history-retrieval.ts required/priority groups | Boundaries, pet groups, target groups, need groups, current groups, periods, Vet Brief groups | Required prefix, then group round-robin, then optional rows | requiredSourceIds; hard row/JSON-character budgets; whole-row skips; excluded IDs and partial | Mixed factual and presentation reservations. New allocator represents only separated optional portion. |
| furvise-brain/lungs-needs.ts hit-group reservation | Typed grounded needs, actual database hit IDs after effective processing | One representative per query before interiors | reservedIds; independent receipts; query/row/char limits; partial failures | True probe obligations. Do not demote to context. |
| history-retrieval.ts ticket bridge | Organ reservedIds, otherwise every returned record | Carries them into requiredSourceIds | Later prompt removals can trigger required_evidence_missing | Transport bridge currently conflates reservation purpose; unchanged. |
| intelligence/evidence-need-coverage.ts::evidenceRemovalCost | Grounded needs, actual query receipts, represented spans, dates and literal quantities from quotes | Weighted removal cost: last candidate, literal and requiredSource preservation | Prompt budget prioritization, omissions/representation accounting | Mixed: true obligation protection plus advisory allocation. An order:context label alone cannot classify it. |
| ai/ask-reasoning.ts::buildAskContext / scoreRecord / chooseUpdates | Owned context records, raw-question terms, recency, source kind, concern/episode priority | Source caps and ranked subsets; interpreted history preserves input retrieval order | model_selection and qualified_span_over_budget losses; old five-update cap elsewhere | Advisory ranking plus safety and factual dependencies; do not transplant raw-English scoring. |
| ai/ask-reasoning.ts::latestNeedScopedCareIds | One scoped latest evidence need, actual candidate IDs, raw quote date-kind inference | Filters care records before prompt budgeting | Can discard facts, not merely optional context | Factual selector, not a supporting allocator. Remains legacy. |
| ai/ask-reasoning.ts::enforceAskPromptContextBudget | Represented records, needCoverage, requiredSourceIds, cohort counts, requested profile fields | Removes whole rows under request-character/token budgets; preserves costly candidates | Rebuilds representation after each removal; prompt_budget losses; failure when required scope cannot fit | Potential future consumer after mandatory/supporting classification. Not migrated. |
| Same function: source-specific priorities | Requested profile fields, historical sources, receipt references, identity/safety fields, recently resolved concerns | Optional profile/unrelated receipt removal before care sources; cohort minimums; whole optional concern omissions | Required profile overflow throws; final admission ceiling throws | True requested profile/receipt facts remain mandatory; optional metadata can eventually use allocation policy. Heart/Immune untouched. |
| ai/history-source-transport.ts coverage compaction | Server coverage and represented IDs | Compresses metadata, not facts; preserves counts and reasons | No change to server eligibility; explicitly forbidden as input back into completion checks | Presentation only; no migration needed. |
| Vet Brief groups / active implementation | Brief topic/date and safety contracts | Active separate feature allocation | Feature-specific limits and review | Out of scope; unchanged. |

True factual requirements (selection boundaries, exhaustive sets, requested profile
fields, action receipts, episode results, independent probes) must retain their own
organ/authority contracts. A record's importance to the prompt is not a certificate.

## evidenceNeeds classification

- read-probes.ts and read-needs.ts: true independently grounded retrieval probes;
  their IDs, dimensions, per-need receipts and authority remain unchanged.
- ask-request-contract.ts and evidence-needs.ts: exact USER grounding plus legacy
  advisory terms. The type does not mark an entry as optional explanation only.
- history-retrieval.ts: each envelope entry can influence acquisition, reservations,
  empty-query receipts and later completion. Do not label the entire entry optional.
- evidence-need-coverage.ts: candidates_available remains semanticSupport:unverified;
  empty lookup receipts are bounded query facts, never semantic absence.
- history-obligations.ts, review-history-narrative.ts, publication-authority.ts,
  historical-read-response.ts: entries participate in requested-fact satisfaction,
  review and completion. Those uses are authoritative requirements, not hints.
- ask-evidence.ts: need receipts affect eligible bounded-lookup sources; unchanged.
- read-projection.ts / selected-pet-read.ts / latestNeedScopedCareIds: factual
  selectors or narrowing policies; not optional allocation adapters.
- labs-list.ts / publication-authority-diagnostics.ts: eligibility/diagnostics;
  not classifiers that can safely demote an obligation to context.
- ai/history-source-transport.ts: lossless metadata projection only.

Accordingly, no existing whole evidenceNeeds entry is automatically reclassified.
A caller may map an explicitly separated advisory USER span through the new
factory, but it must first establish that it is not itself a requested factual
obligation. No new model classification, identity or keyword rule is introduced.

## Generic internal contract

Input:
- ContextScope: server owner plus concrete authorized per-subject windows.
- authoritativeRecords: existing selected/required effective snapshots, in semantic
  order. This is caller-supplied authority; the allocator cannot establish it.
- effective supporting pool: existing resolved records, reliability and unresolved
  lineage IDs from upstream. No raw-history fallback or correction inference.
- grounded ContextSignals: subject scope, literal terms, provenance, server priority
  and maximum reservation per subject. No needId, sourceSpanId or certificate.
- existing representation budget: record count and serialized-row characters.
- deterministic asc/desc order and optional scoped context acquisition receipts.

Output (separate collections, no combined records field):

    authoritative: { records, omittedIds, representationComplete }
    supporting: {
      role: supporting_context,
      maySatisfyObligations: false,
      records, representation, receipts, reservedIds, omissions, acquisition
    }
    usage: { records, chars }

'representation' is complete/partial/unavailable CONTEXT bookkeeping only. It is
not global coverage, a selection certificate, a need receipt or a factual absence
proof. Complete means representation of the supplied context pool, not exhaustion
of all possibly useful history. Records omitted by upstream acquisition are known
only through the separate supplied acquisition state.

This is a derived, ephemeral projection over existing record snapshots. Nothing is
persisted as a second truth store. Supporting IDs never enter authorizedSourceIds.

## Grounding and scope

contextSignalsFromTicket maps only already-bound searchHints and authorized scope.
It preserves literal normalized matching; no aliases, stemming or inferred topics.
An explicit ticket date boundary cannot be widened by the supplied context scope.
For semantic anchors, the caller must supply the already-resolved owned window;
this module cannot resolve or guess an anchor.

groundContextSignals reuses validateEvidenceNeeds for exact USER quotation,
referenced USER-turn and uniquely scoped name validation. It discards all generated
need IDs. Only quote offsets and source-turn provenance survive. Extra identity
fields, forged quotes, assistant references and unauthorized names reject.
Server policy supplies priority/reservation. No semantic information comes from IDs.

Signals are runtime-branded and immutable. Serialized/unvalidated objects cannot
be replayed as grounded signals. Signals cannot be reused under another owner or
wider temporal/subject scope. Scope is established by the server, never the model.

## Allocation algorithm

1. Validate scope/budgets and required snapshots. Preserve required order.
2. Reserve whole authoritative records FIRST. Record any representation loss.
   If one cannot fit, allocate no supporting context. Never substitute context.
3. Admit only supporting candidates inside the authorized effective scope. Exclude
   deleted, unresolved, unreliable or conflicting snapshots with explicit reasons.
   An optional conflicting version cannot replace a required snapshot.
4. Build advisory signal/subject groups. Canonical subject/provenance ordering
   removes dependence on input subject order. Reuse eventOrder for deterministic
   record ties; asc/desc is presentation allocation order, not a factual selector.
5. Reserve one fitting row per group per round, up to each server reservation.
   Priority orders groups within each round. Oversized records are skipped whole.
6. Fill remaining capacity by literal advisory score, then canonical event order.
   Unmatched scoped context may fill remaining capacity; hint misses never filter
   the factual result or certify absence.
7. Return supporting omissions and receipts separately. Certificates, coverage,
   semantic plans and obligation authority are neither inputs nor outputs.

The existing record/character budgets are passed in, not increased. Character use
is exact JSON serialization length of the allocated row snapshots; this helper does
not claim to calculate total provider prompt/token overhead. It performs no I/O.

## Publication boundary and limitations

The new supporting collection must NOT be merged into AskEvidenceContract.represented,
publication sources, careEntries, Labs, or obligation-authorized sources merely
because it was allocated. There is no active publisher integration in this cut.
A future explanatory renderer must preserve this distinction; a new factual claim
about supporting material still needs an independently authorized obligation.

Tests additionally exercise the existing certified-selection authority: even when a
support source is represented separately, it cannot satisfy the selected historical
obligation and is excluded from the certified generation payload. Existing policy
for uncertified obligations is NOT changed. No claim is made that existing legacy
publishers already consume the new split.

## Parity and revised chronological analysis

Exact representation parity is proven for isolated one-hint context and two-topic
reservation fixtures: same required IDs, supporting IDs, reservation order, whole
row budget use and omissions. Subject rotation, rare support pressure, failures,
corrections, deletes and no-match cases test the generic boundary independently.
The test legacy oracle reproduces only the prior required-prefix/group-allocation
loop; it is not a second production executor or a full chronological parity claim.

Now expressible: already-selected authoritative result + bounded, separately
scoped optional topic reservations and supporting fill. No new factual primitive.

Still not exact-equivalent or safe to switch automatically:
- Hint-ranked finite chronology where hints choose the winning factual row.
- Envelope evidenceNeeds whose acquisition/completion semantics are mixed.
- Raw-question relevance aliases and rare-event extraction without grounded signals.
- Broad fallback acquisition/sampling, lexical failure recovery and exhaustive
  context windows. This allocator consumes candidates; it does not retrieve them.
- Prompt trimming with mixed profile/safety/receipt authority or unknown total
  provider overhead. Requires explicit classification before adopting the helper.
- Temporal-endpoint reservation/fill, calendar, events, episodes and Vet Brief:
  out of scope and untouched.

Existing unsupported chronological inputs remain unsupported by compatibility.
No direct chronological normalization was attempted. The old branch is NOT
reported deletion-ready.

## Verification

- Context allocation/grounding/authority tests: 26/26.
- ID-free probes + multi-need: 22/22 (17 + 5).
- Compatibility/expressiveness/previous blockers: 61/61.
- ResultSet + global selection: 67/67.
- Body/architecture including compositional selection and Lungs/effective history: 185/185.
- Publication/Labs/authority: 74/74.
- Brain/interpreter/timeout: 77/77.
- Broader safety: 46/48, exact same two baseline failure identities.
- 222 audit: 208/222, exact same fourteen failure identities.
- Typecheck: passed in the dependency-complete gate checkout.
- Clean production build: passed after removing .next and tsconfig.tsbuildinfo.
- Diff whitespace: passed.

Suites overlap and totals are not additive. All tests use the offline network guard.
Only this report, supporting-context.ts and supporting-context.test.mjs are added.
No existing application file, test expectation, provider schema or authority policy
is changed. No live Ask or deployment.
