# event_candidates: factual-authority decomposition

Reviewed base: 8c17d2a0b2a5bd940966de7dd453a29199aa668b. Analysis only, 2026-09-21.
No application behavior, existing test expectation, deployment, live Ask, or provider call changed.

## Finding

Do not promote event_candidates into a new semantic operator. Its ticketed runtime is a predicate-filtered, globally ordered, optionally hint-ranked and truncated record read plus a retained-ID marker. It does not resolve event identity, certify uniqueness, or express ambiguity. Event search, event reference, temporal anchor and optional context are different jobs.

The marker is not a certificate: it contains retained records, not all discovered matches. Its non-emptiness neither proves the referenced event nor constrains all subsequent model citations to those IDs. See lungs.ts::retrieveFactualReadTicket; publication-authority.ts::derivePublicationAuthority/publicationSources; review-history-narrative.ts::reviewHistoricalAnswer. All paths below are static reachability; production traffic/counts were not inspected.

## Implementation evidence and callers

Paths below are relative to app/lib unless prefixed otherwise. Runtime-enforced, binder/schema-enforced, test-only and recommended properties are distinguished explicitly.

1. Provider-visible producer: furvise-brain/read-ticket-provider-schema.ts::readTicketProviderSchema inherits read-ticket.ts::readTicketSchema in its legacy-only alternative. intelligence/ask-request-contract.ts::askRequestSchema/validateAskRequest and bindProviderReadTicket expose/bind this proposal. The literal enum is available to the one interpreter; no application constructor assigning the literal strategy was found beyond schema/binder and the Lungs consumer. The schema calls it a mandatory event-candidate lookup; that description does not create a discovery/uniqueness proof.
2. Ordinary Ask caller chain: intelligence/generate-ask-history.ts::generateAskHistoryAnswer -> furvise-brain/memory-organ.ts::retrieveFurviseMemory -> intelligence/history-retrieval.ts::retrieveAskHistory -> retrieveTicketHistory -> furvise-brain/lungs.ts::retrieveReadTicket. legacy-read-selection.ts::translateLegacyReadSelection returns strategy_outside_compatibility_cut for this strategy. ordinary-history-boundary.ts::commonHistoryPathEntered returns false while any strategy remains.
3. Equivalent non-ticket discovery: history-retrieval.ts::retrieveAskHistory below its ticket early return derives historyEventTerms(currentMessage), makes lexical/period search groups, ranks effective rows and emits eventCandidateIds for latest/earliest/earliest_occurrence. Its application entry sites are memory-organ.ts, append-turn.ts::continueConfirmedAppend and vet-brief/prepare.ts::prepareVetBrief. Those entry sites do not prove the event-term subbranch runs for each family: pure saved-history Ask without a ticket is rejected by memory-organ; confirmed continuation normally carries a ticket; Vet Brief supplies a separate plan and uses summary selection. Retained mixed/non-ticket compatibility is the relevant possible fallback, not a second normal ticketed traversal.
4. Vet Brief: prepareVetBrief calls retrieveAskHistory with vetBriefRead. It uses appointment/topic lexical queries plus bounded period context and vetGroups, NOT outputs.strategy event_candidates. Its selected mode is summary, so the legacy eventCandidateIds assignment conditioned on latest/earliest does not run. Shared retrieval utilities are analogous candidate allocation, not an event strategy caller. Active Brief generation/review is unchanged.
5. Publication consumers: ai/ask-reasoning.ts::generateContextAwareAskResponse tries buildLabsList, then deterministicReadProjection, otherwise generation. buildAskContext and enforceAskPromptContextBudget carry/trim records; model transport filters eventCandidateIds to represented sources. intelligence/review-history-narrative.ts::reviewHistoricalAnswer, evidence-need-coverage.ts::historyCompletionLimits, validation/validate-answer.ts, and read-projection.ts::deterministicReadProjection consume the empty-candidate condition. No dynamic event_candidates registry or specialized event interpreter is present in the inspected application references.

## Legal shapes and exact algorithm

Binder-enforced constraints (read-ticket.ts::bindReadTicket): operation read, at least one text_any predicate, anchor null (anchor iff read_since_event), no compositional selection together with the strategy, no nonempty bound needs or episode. Authorized single/multiple subjects are legal. Date bounds are explicit ISO instants or null. oldest_year calendar can coexist subject to its existing guards. Probes cannot ground into needs alongside this strategy. Ticketed evidenceNeeds are instructed empty; legacy envelope-only obligations must not be confused with a bound need or treated as migrated.

| Reachable shape | Semantics available in typed input | Execution / publication consequence | Classification |
| --- | --- | --- | --- |
| Plain finite event search, one subject | Predicates, window, asc/desc, finite global limit, sufficient/exhaustive | Predicate matches ordered, limited, represented; no identity proof | A for explicit earliest/latest-N meaning; cardinality must first be confirmed semantic |
| Plain finite search, multiple subjects | Same plus authorized cohort | One GLOBAL limit, no per-pet reservation; a pet may have no retained row | A using per-result take, not per-group unless original meaning requests it |
| Unlimited matching-record search | Limit null; existing completeness intent | Ordered set limited by transport | A using no selection + resultSet proof when meaning is all matches |
| Hint-ranked variant | Up to 12 optional hints | Hint score changes surviving rows before limit; hint presence makes coverage partial | D factual hint authority; migrate intent to existing typed fields upstream, never parse hints downstream |
| Oldest-year combination | Calendar bucket first, then predicates | Existing UTC-year temporal resolver; not earliest matching record | Separate calendar dependency; do not collapse to top-N |
| Event reference without explicit selection/uniqueness meaning | Strategy provides no referent rule | Plausible records become publication candidates | B for existing anchor use; C only for reusable standalone reference resolution if required |
| Separate envelope obligations / mixed request | Additional requested work not represented by this selector | May require model whole-task review; Labs non-selection dispatch is broad | Not safe to normalize away; preserve/ground distinct obligations separately |
| Non-ticket transition retrieval | Legacy selection + original question event terms + plan terms | Lexical acquisition, rare-facet ranking, reservations, fallback sample | D for prompt ranking as truth; predicates/probes/context are separate replacements |

For all ticketed shapes above, Lungs uses acquireReadCandidates (read-selection.ts) with sorted subjects, fair bounded shares, 4*64 raw row budget, oldest-first acquisition when selection is absent. outputs.ordering desc does NOT make this acquisition descending. Predicates and explicit windows are applied after acquisition/effective resolution; the accessible range is scanned first. This can miss a late matching event and must remain partial when traversal continues.

retrieveFactualReadTicket calls store.effective, checks ownership/deletion/access, resolveReadWindows, ANDs predicate groups with OR within each literal term group, then sorts by event_at/created_at/stable ID. If hints exist, score by matching hint count, with chronological tie-break. Apply global outputs.limit, then at most 32 rows / 18000 note+title characters. Oversized rows are skipped. Final retained rows are re-sorted chronologically. eventCandidateIds is assigned from THESE retained rows. selected/matched/omitted IDs remain in coverage.selection.

Coverage is not event uniqueness. Continuation, failed acquisition, lineage uncertainty and representation losses cause partial/unavailable. However a sufficient finite event_candidates read can report complete after omitting other matching rows solely by semantic/legacy limit; there is no groups/resultSelection/resultSet proof for that strategy. Two matches reduced to one therefore do not prove an unambiguous referent. This is a runtime characterization, not proposed policy.

## Decomposed responsibilities and authority owner

| Responsibility | Owner today | Existing generic replacement / boundary |
| --- | --- | --- |
| Discovery | Typed path: fair raw acquisition then effective predicate filtering. Non-ticket: compiler + event-term RPC searches | Existing scoped predicates/windows/effective stream; probes for genuinely independent grounded requests |
| Factual survivor selection | Typed path: order, hint score, global limit, transport; legacy path: event/query relevance and reservations | Generic group/result order/take/union or complete resultSet; hints only supporting context |
| Event identity | No event_candidates identity resolver; nonempty array is merely candidate availability | Reuse deterministic reference resolution principles; ambiguity must not become implicit latest |
| Anchor resolution | Separate read_since_event -> resolveReadWindows | Already exists; no event_candidates operator needed |
| Supporting context | Legacy facet ranking/need/period reservations and fallback context | Existing supporting-context allocator, with authority separate |
| Prompt retention | requiredSourceIds from retained rows; prompt budget and losses | Existing mandatory factual rows then optional context, retaining omission accounting |
| Factual prose / semantic support | Generator and review for non-Labs answers; attributedHistoryAnswer can choose a bounded quoted fallback | Common certified obligations/source binding; candidate presentation must be labeled as candidates |
| No usable candidate limitation | Completion limit, projection, reviewer early decline, final validator | Preserve source-free deterministic limitation; do not mint absence authority |

Runtime details: readWithSupportingContext/separatesReadHints explicitly excludes event_candidates, so its hints still reach legacy factual sorting. commonHistoryPathEntered excludes the strategy, leaving buildAskContext scoreRecord, incidental profile context, and latestNeedScopedCareIds reachable under their existing guards. Ticketed deterministicReadProjection blocks factual projection for ANY readTicket after its no-fact limitation check; projection is not the event strategy's winner selector.

Two publication paths actually exist. labs-list.ts::buildLabsList accepts non-selection read tickets when quantity=records OR completeness=exhaustive (other safety/scope gates still apply). It publishes the exact supplied rows and verifies its server snapshot; it does NOT thereby certify event-reference identity. Other quantities/tasks can reach generation/review. derivePublicationAuthority returns null without ticket.selection; publicationSources then uses eligibleAnswerSources and generation context is not rebuilt with selection-authorized sources. Thus a model-assisted event answer can be approved under the older source/semantic-review policy without a deterministic event-selection certificate. Profile sources can be available under that old policy; there is no event-certificate source-set lock. This is a reachable authority gap, not a newly observed production substitution.

reviewHistoricalAnswer verifies sources, subjects, dates/numbers and whole-task completion, and may run one repair/re-review. It does not prove unique event identity or enforce all supporting citations belong to eventCandidateIds. history-obligations.ts::buildHistoryObligations uses the original question; semantic support remains model-reviewed when no certificate binding exists. attributedHistoryAnswer in ask-evidence.ts uses original-question event facets to rank/truncate up to three reports per subject in shared fallback. Those raw-English dependencies remain legacy debt.

## Event search, reference and anchor are not interchangeable

- Latest matching dental record: predicates + desc + take; per-result or per-subject is explicit. Existing generic selection certifies matching records, not whether a lexical mention proves the visit occurred.
- After the dental: read_since_event anchor plus predicates/window/selection. resolveReadWindows requires one effective matching anchor per subject; multiple matches -> anchor_missing with anchor_ambiguous; zero -> anchor_not_found; unresolved lineage or unexhausted search -> partial. It never picks newest to break ambiguity. from includes, after excludes anchor timestamp, before has exclusive upper bound. continuation.length currently blocks resolution globally, even for another subject: do not claim independent per-subject success for this failure mode.
- Which event did I mean: an epistemic reference/disambiguation task. Neither lexical ranking nor top-1 proves intention. Candidate presentation or clarification is appropriate if no existing user-grounded reference certifies identity.

Recommendation: no new primitive for ordinary event searches, bounded candidate lists, anchors, or support. If standalone resolved-event references become a required generic capability, the smallest missing contract is reference-resolution proof with resolved/missing/ambiguous/partial outcome, authorized scope, matching-rule provenance, effective candidate identities, search/lineage closure and source version. Extend/reuse existing temporal resolver concepts; do not add an event_candidates mode. A typed take(1) is not a uniqueness certificate. This could serve visits, medication changes, observations, repairs and any referenced ledger occurrence. It still cannot certify arbitrary clinical entailment from a token match; e.g. 'dental visit canceled' is a lexical match, not proof the visit happened. Clarification/attributed candidate presentation can use existing product behavior before any new reference primitive is justified.

## Limitations (runtime, not factual selection)

- historyCompletionLimits: eventCandidateIds=[] AND no completed explicit target -> requested_transition_not_retrieved. Undefined IDs do not trigger this condition (e.g. early retrieval error); unavailable/partial policy handles those separately.
- deterministicReadProjection: for readOnlyRecall + read mode, that completion reason produces UNVERIFIED_EVENT_LIMITATION with no sources/calculations, before ticket guard. It asserts inability to verify, explicitly not historical absence. generateContextAwareAskResponse can terminate without generation; ordinary review early-declines empty IDs without a provider call.
- reviewHistoricalAnswer checks Labs snapshot first, then empty event IDs. Its empty-ID early decline does not share the completed-explicit-target exception of historyCompletionLimits. Record this inconsistency; do not silently unify it here.
- validateAnswer replaces an unsupported event answer, clears citations/records/actions, under its existing emergency guard. No event/absence/completeness fact is minted.
- Labs can run before projection for record-list shapes; its generic empty/partial notices are distinct from the final event limitation. Existing audit verifies the no-generation/no-review source-free final result for the covered missing-event case. Do not claim every safety/task shape has the same dispatch.
- Empty IDs after transport pressure mean no usable represented candidate, not no discovered candidate; candidate discovery and representation must remain separately visible.

## Effective history and proof requirements

history-retrieval.ts::effectiveCandidates resolves graph relations through resolveEffectiveClaimGraph, verifies current linked source versions, withholds tombstones/superseded rows, imports effective replacement authors, and records uncertain unlinked corrections. retrieveTicketHistory maps claim-backed care IDs to provenance source IDs. Lungs then reapplies subject/window/predicates and ordering to effective rows. A date correction can change order/window membership; topic correction can remove a match; deletion of the only match makes the available set empty; two roots resolving to one effective replacement must not count as two events.

The event strategy uses store.effective rather than directional effectiveWindow with per-selection closure receipts. Graph/source checks are real, but no resulting event identity/selection certificate is emitted. A bounded candidate scan plus reachable lineage closure does not prove no unseen matching event or replacement can outrank/change a referent. Future migration must consume the existing common effective stream and retain honest partial status when proof is not closed.

Required proof layers:
1. Discovery scope/exhaustion: authorized subjects, typed predicate/window, as-of and accessible interval, unvisited frontiers. Exhausted lexical matching is not semantic existence/absence.
2. Selected result: requested order/cardinality, deterministic ties, effective closure, joint cutoff for global selection or per-group proof; existing certificates cover these record-selection claims.
3. Reference resolution: matching rule plus no unresolved alternative, not merely one retained candidate; a tie-broken latest search and an unambiguous referent are different assertions.
4. Representation: all required selected IDs and exact source versions survive transport; omitted alternatives cannot manufacture uniqueness.
5. Publication: obligation-specific authorizedSourceIds; profiles/context cannot substitute for a certified historical event. Exhaustive lists/counts/absence need appropriate exhaustive proof, not candidate non-emptiness.

## Counterexamples A-M

| Case | Current characterization / required distinction |
| --- | --- |
| A one exact candidate | ID list returned; no referent certificate. Semantic evidence must still establish requested proposition |
| B zero | Source-free verification limitation, not never/none |
| C two equally plausible | Current finite limit can hide one; ambiguity must survive |
| D hint prefers wrong event | Current strategy can change survivor; retire this factual hint authority |
| E latest unrelated record | Explicit predicate excludes it; latest raw timestamp alone is not requested topic |
| F correction | Effective date/topic may change membership and order; certify after resolution |
| G deletion | No deleted candidate may survive; no-match still not whole-history absence |
| H profile but no history | Empty event limitation cannot cite profile; nonempty/model branch still lacks selection source lock |
| I outside window | Effective timestamp/window excludes it; do not widen for candidate recovery |
| J same event names across pets | Owned subject scope stays strict; global limit is not one result per pet |
| K existing anchor | Unique anchor resolves deterministically; multiple anchors refused |
| L candidate omitted | Full matching set differs from retained event IDs; omissions cannot prove unique intention |
| M paraphrase | Lungs takes typed data only; protected prompt/fallback/review still see raw text and can diverge |

## Safe future migration order (no implementation here)

1. Separate typed record search from referent identity; enumerate intended semantic cardinality explicitly instead of inferring it from strategy name or transport limit.
2. Translate ordinary ordered searches to existing group/result selection, complete matching lists to resultSet; remove factual hint ranking intentionally and allocate optional context separately.
3. Route temporal references through existing anchor resolution. Retain missing/ambiguous/partial outcomes and source-free limitations. Preserve candidate availability versus representation loss without a legacy strategy as truth.
4. Bind migrated selected obligations to existing certificate-authorized sources across every publisher. Whole-question model review must not choose a different winning record.
5. Keep calendar, genuine independent obligations, unsupported semantic reference/entailment work and separate non-ticket callers explicit. Do not claim branch deletion readiness until these and limitation consumers are accounted for.

Intentionally retire: rarity/hint relevance as factual priority, candidate non-emptiness as event proof, limit/transport loss as implicit disambiguation, model review choosing a referent without a deterministic reference rule, and profile context substituting for a historical selection. Preserve bounded discovery, ownership, effective truth, genuine representation loss, and no-fact refusal behavior.

## Verification

Added tests/event-candidates-analysis.test.mjs: 16/16. These characterize current runtime, including unsafe legacy counterexamples; they are NOT new safety policy or endorsement of current behavior. Effective-store correction/deletion cases use mocked outputs to prove ordering of execution phases; they do not independently verify real SQL/graph closure. Existing correction/effective suites provide separate regression coverage.
Focused existing firewall/obligations/temporal/correction/effective tests: 61/61.
Full audit rerun: 208/222, exact same fourteen baseline failure identities. No existing expectations changed. No application files changed. Typecheck/build not rerun for this docs/test-only analysis; prior base gate passed, which is not a fresh build claim.
