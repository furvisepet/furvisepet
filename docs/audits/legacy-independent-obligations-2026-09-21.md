# Legacy independent-obligation migration: blocked by execution parity

Base: 8d5d5ab4c065b42a582ab89c5bdeca1a5be4f997.
Offline inspection and counterexample proof only. No application changes, provider
calls, live Ask, deployment, or legacy deletion. No adapter is shipped in this cut.

## Finding

No remaining chronological shape inspected has BOTH an independent legacy
obligation execution contract and exact equivalence to the existing common
ID-free probe path. Valid source grounding alone is insufficient. Translating
advisory evidenceNeeds to retrieval-driving needs changes factual acquisition,
coverage, failures and downstream support. The requested parity gate therefore
blocks implementation under the current scope.

This corrects the previous inventory's shorthand: an envelope evidenceNeeds count
is a normalization exclusion, not proof that the chronological executor already
executes independent obligations.

## Reachable boundaries and origins

- intelligence/ask-request-contract.ts::bindTicketedRead: legacy proposals without
  probes validate envelope evidenceNeeds with scopeSource:ticket. Quotes must be
  substrings of current USER text or referenced USER turns; exact scoped names
  resolve to authorized pets. It creates server IDs and optional per-need pet IDs.
  Quoted dates do not become windows in this path. Envelope terms remain advisory.
- The same function, when probes is present, uses read-probes.ts::groundReadProbes
  and requires the parallel envelope evidenceNeeds to be empty. That is already
  the common path; it is not a chronological migration candidate.
- intelligence/interpret-ask.ts::interpretAskQuestion rejects model-owned need
  identity. Current provider schema exposes probes. Legacy compatibility accepted
  by validateAskRequest does not imply that the current provider emits that shape.
  No new provider behavior is changed here.
- intelligence/ask-request-contract.ts::validateAskRequest non-ticket branch:
  validateEvidenceNeeds derives legacy quoted-date windows, term normalization and
  optional cohort recovery. Mixed read/write subject handling also lives here and
  is excluded from this cut.
- intelligence/history-retrieval.ts::retrieveAskHistory has three static application
  invocation sites: furvise-brain/memory-organ.ts::retrieveFurviseMemory, intelligence/append-turn.ts::
  continueConfirmedAppend, and vet-brief/prepare.ts. The Vet Brief invocation is
  explicitly outside scope. These are static invocation counts, not traffic data.
- retrieveAskHistory immediately sends any readTicket, except active Vet Brief,
  through retrieveTicketHistory. The latter has the sole application invocation
  of translateLegacyReadSelection and retrieveReadTicket.
- append-turn.ts::continueConfirmedAppend restores the stored server ticket and
  readRequest after owned USER-source checks. Already-bound needs are rebound;
  they cannot carry chronological strategy under the binder. This continuation
  involves Heart confirmation and remains untouched.

## Shape inventory

| Shape | Provenance / subjects | Retrieval and coverage today | Disposition |
|---|---|---|---|
| Ticket chronological + envelope evidenceNeeds, no internal needs; null limit | Exact current/referenced USER quote; authorized named subset or ticket scope; terms/order retained; ticket window only | Lungs ordinary pages across ticket subjects, effective resolution, ticket predicates/window, global ordering, transport cap and chronology receipt. Envelope needs never enter Lungs queries. Need coverage may find represented topic candidates but has no actual per-need query receipts. | Leave legacy: probes change acquisition and support even with trustworthy quotes. |
| Same with finite limit | Same source binding; global finite ticket cardinality | Ordinary chronology selects/truncates globally, not independently per need | Leave legacy: common need binder prohibits finite outputs.limit; removing it changes cardinality. |
| Envelope obligations + predicates | Same grounding; ticket predicates constrain every returned row | AND ticket predicates with chronological selection; envelope topic terms remain advisory | Leave legacy: needs and predicates are incompatible. Copying predicates into lexical termGroups is not equivalent literal filtering or certification. |
| Envelope obligations + semantic anchor | Same grounding; owned effective anchor defines one ticket window | Existing anchor resolution then chronology | Leave legacy: read_since_event + needs rejects; no new per-need anchor primitive allowed. |
| Envelope obligations + hints / calendar / episode / other strategies | Same grounding where present | Additional ranking/calendar/episode strategy behavior | Outside scope; do not smuggle hints into probes or change another operator. |
| Already bound readTicket.needs, or new probes | Exact source binding, server IDs, per-need dimensions | Existing common Lungs needPage path with independent receipts | Already migrated architecture. Binder rejects any outputs.strategy here; zero legal chronological-plus-bound-needs cases. |
| Non-ticket legacy evidenceNeeds, lexical or ordered | Exact quote, sourceTurnId, scoped pet IDs, terms, earliest/latest/context, optional derived window | compileHistoryReadStrategies adds need facets AND broad context/date targets; per-pet query allocation, optional lexical fallback, effective resolution, reservations and ranking | Leave legacy: not excluded solely by chronological strategy. Common needs cannot reproduce broad-context reservations/fallback without an execution change. |
| Non-ticket bounded context needs | Quote-derived window, context order, often per-pet | Special bounded full-window scan; exhaustiveBoundedContext may be established with sentinel exhaustion; different correction/row allocation | Leave legacy: common needs explicitly certify bounded query receipts, never semantic completeness. |
| Non-ticket cohort recovery, mixed requests, retained tasks | Legacy server-generated clones or wider grounding context; possibly more than four needs | Other legacy compilation/authority paths | Outside scope; cannot invent distinct USER obligations or modify write/task behavior. |
| Requirements / source-bound subquestions without a validated evidenceNeed | Requirements may be paraphrases, not exact USER spans or typed retrieval dimensions | Publication/evidence requirements; no independently grounded retrieval binding | Insufficient provenance/semantics. Never synthesize a quote, temporal window, topic groups or subject intent. |

Earliest/latest/context, one/multiple subjects, shared/different windows and topics
are dimensions of these classes, not sentence-specific cases. A search hint is
never treated as an obligation. No semantic meaning is extracted from legacy IDs.

## Exact non-equivalence witnesses

The test-only structural proposal strips legacy identity and passes exact quotes,
pet names and retrieval dimensions to the REAL groundReadProbes and bindReadTicket.
It does not introduce production grounding or bypass validation.

1. Two valid quoted probes (medication and food), plus routine context: chronology
   returns the routine record; need queries do not. Candidate/event sets differ.
2. Only matching records: both return identical records, but chronology reports
   complete and no need receipts; common needs reports partial with
   bounded_need_candidates_not_semantic_completeness and independent query receipts.
3. One pet's query fails: current chronological path returns unavailable with no
   records; common needs preserves the other pet's valid evidence. This is safer
   isolation, but is still a behavioral change rather than exact parity.
4. Finite limit: strategy+needs or limit+needs rejects. Removing either semantic
   requirement to force binding is not a compatibility translation.
5. Non-ticket strategy compiler produces two independent need facets PLUS a broad
   query. Two common probes alone are not that algorithm. Adding broad retrieval
   as a fake USER obligation would invent grounding.

These counterexamples apply to arbitrary predicates and pets. A tiny matching
fixture yielding identical records cannot prove equivalence under failure,
exhaustion, representation pressure or different stored history.

## Grounding / authority remains unchanged

Common groundReadProbes validates the whole batch with validateEvidenceNeeds,
requires valid USER turns and exact quotes, resolves names within authorized scope,
then creates need:0, need:1 and sourceSpanId. bindReadNeeds validates dimensions and
owned bindings. Lungs sees only typed grounded needs.

No compatibility code or new application code creates identity. No second truth
store, planner, grounding boundary, or downstream English executor was introduced.
No new provider/schema fields or primitives were proposed.

buildEvidenceNeedCoverage is still semanticSupport:unverified: actual candidate
receipts, representation, lineage and losses constrain support. completedEmpty-
EvidenceNeeds may authorize a bounded empty-lookup receipt, never semantic absence.
Turning unqueried envelope needs into completed probes changes these downstream
facts. Existing review and obligation authority remain untouched.

## Adversarial proof coverage

New tests: actual candidate-set divergence; equal facts with unequal coverage;
finite limit rejection; broad-context reservation; partial query failure; separate
typed windows; same pet/different topics; rotated IDs vs semantic bindings; forged
quote/assistant turn/unauthorized pet rejecting a batch; duplicate source grounding;
no-hit/correction accounting; native grouped selection exclusion.

Existing ID-free probe tests retain exact USER-turn provenance and whole-batch
validation. Existing multi-need tests retain rare-alias representation under verbose
routine pressure, clipping, actual query hits without lexical rematching, foreign
rows, revision changes and bounded fair allocation. No failed parity assertion was
weakened. This is evidence to BLOCK migration, not a claimed successful parity run.

## Remaining classes / safe next boundary

Migrated in this cut: none. All exact-equivalent plain finite/unbounded chronology
migrations from earlier commits remain intact. Remaining chronological dependencies:
envelope independent obligations, advisory hint allocation, calendar combinations,
and non-ticket legacy factual compilation. Already-bound needs have no chronological
execution dependency. The chronological branch is NOT deletion-ready.

A later cut would need explicit authorization to change acquisition/coverage
behavior of legacy advisory envelopes into explicit grounded retrieval obligations,
and/or separate legacy broad-context allocation from factual obligations. It must
specify that semantic change and test its safety; it cannot claim exact legacy
parity or manufacture broad-context probes. No new primitive is proposed here.

## Verification

- New migration eligibility/counterexample tests: 12/12.
- ID-free probe/schema/grounding: 17/17.
- Dedicated multi-need: 5/5.
- Compatibility + expressiveness: 49/49.
- Unbounded resultSet + global selection: 67/67.
- Body/architecture, including Lungs/effective history: 185/185.
- Publication/Labs/authority: 74/74.
- Brain/interpreter/timeout: 77/77.
- Broader safety: 46/48, same two failure identities as the prior-cut ledger.
- Audit: 208/222, same fourteen failure identities as the prior-cut ledger.
- Typecheck: passed in the dependency-complete gate checkout.
- Clean production build: passed after removing .next and tsconfig.tsbuildinfo.
- Diff whitespace: passed.

Suites overlap; totals are not additive. Offline tests enforce the existing
network guard. No tests call a real provider or production database.
