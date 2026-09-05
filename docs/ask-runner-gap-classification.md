# Ask runner gap classification

## Evidence

This is a source-inspection report. The last observed lifetime audit result is **7 pass / 10 fail**, as recorded in [ask-subject-continuity-repair.md](ask-subject-continuity-repair.md). No audit, application test, provider call, or database operation was run for this classification. Existing test names containing `RED` are historical labels, not fresh results.

Sources inspected include the unchanged [lifetime audit](../scripts/audits/ask-lifetime-history.audit.mjs), its [synthetic fixtures](../scripts/audits/fixtures/ask-lifetime-history.mjs), and [lifetime harness](../scripts/audits/helpers/lifetime-harness.mjs). The audit has 17 tests: six named controls, the now-passing ordinal pet-switch assertion, and the ten requirements below. The subject repair report records the change from 6/11 to 7/10; it does not claim episode identity or lifetime completeness was solved.

The actual path matters:

- [Ask route](../app/api/ask/route.ts): `resolveAskTurnSubject` runs before alternate-pet context rebuilding; its generation callback calls `generateAskHistoryAnswer` with `subjectResolution.petIds`. Later response handling can apply a planned-capability gate, and persistence uses `attachEpisodeReferences`.
- [generateAskHistoryAnswer](../app/lib/intelligence/generate-ask-history.ts): calls `retrieveAskHistory`, then `retrieveEpisodeHistory`, creates the evidence contract, and invokes `runFurviseIntelligence`.
- [buildFurviseContext](../app/lib/intelligence/retrieve-context.ts): loads recent care and episode context for one pet. [retrieveAskHistory](../app/lib/intelligence/history-retrieval.ts) separately retrieves bounded historical candidates for supported queries and authorized pets, then calls `effectiveCandidates` to check source versions and linked corrections.
- [runFurviseIntelligence](../app/lib/intelligence/run-intelligence.ts): sends `context.askHistory.entries` instead of `selectedCareEntries` when historical retrieval exists; suppresses legacy conversation/memory/episode inputs on that path. [buildAskContext](../app/lib/ai/ask-reasoning.ts) serializes model records and the evidence contract under a character budget.
- [validateGeneratedAnswer](../app/lib/intelligence/validation/validate-answer.ts): applies `evidenceAnswerPolicy`, prose/safety repairs, and finally the deterministic `episodeAnswer` when `context.episodeResult` exists. Model prose is not the authority for supported episode counts or references.

The harness exercises the real loader, generation callback, prompt serializer, and validator with synthetic database responses and a fixed provider response. It does **not** execute the HTTP route. It supplies authorized pet IDs directly except in standalone resolver tests. Its provider normally returns “The supplied observations are owner reports, not a diagnosis.” Consequently, aggregate failures cannot establish whether a live model would calculate correctly; they do reveal the absence of a server-certified answer for those fixtures. The harness blocks network fetches and exposes no database insert operation.

## Remaining requirements

The numbering below accounts for all ten remaining assertions individually. “Legacy” identifies an obsolete representation or missing authority in the test fixture; it does not authorize deleting or weakening the assertion.

### 1. Requested old periods survive intermediate 20-row selection

**Audit reproduction:** combine Milo's decisive rows with 30 severe recent noise rows; call `selectRelevantCareEntries(rows, 'Summarize 2011 and 2014.')`; require 20 selected rows including `milo-stool-1`.

**Classification: legacy selector failure plus a real unsupported-query gap.** In [build-context.ts](../app/lib/intelligence/build-context.ts), `scoreCareEntry` favors severity and recency; `selectRelevantCareEntries` caps at 20. This unit test never calls historical retrieval. Supported historical queries bypass that selected set through `runFurviseIntelligence`, so it does not prove all historical answers lose old records. However, `planHistoricalQuery` explicitly rejects multiple distinct years. This exact disjoint-period question remains on recent context, with `historyFallback` and a limited-context answer from `evidenceAnswerPolicy`.

**Remaining requirement:** represent both requested periods with bounded, explicit coverage. A selector-only change would not supply a disjoint-period query plan. Existing `ask-history-stage-2.cases.mjs` tests supported old-record reachability and disclosed disjoint-period fallback; neither establishes this requirement as complete.

### 2. A late correction follows the original into date-range recall

**Audit reproduction:** ask `Did Milo vomit in July 2014?` with July 2014 `dateRange`; require `milo-vomit-wrong` plus `milo-correction` or supersession metadata.

**Classification: actual unlinked-correction discovery gap.** The fixtures store correction prose in August 2026 without claim lineage or a correction edge. `planHistoricalQuery` selects July 2014 vomiting candidates. `effectiveCandidates` follows stored lineage/relations and seeds stored correction authors by event scope; it does not search arbitrary later legacy notes outside the candidate period. It marks unlinked correction prose uncertain only when that prose is supplied as a candidate. Thus the old unlinked report can remain represented without the later qualification. For this ordinary question, unknown correction completeness alone does not force `evidenceAnswerPolicy` to replace the answer.

**Remaining requirement:** discover relevant late legacy correction evidence without treating text similarity as an authoritative correction edge; withhold or qualify contested recall until attribution is established. This is distinct from linked corrections, which already have source-version, deletion, graph-closure and cross-pet controls in `ask-history-stage-2.cases.mjs`. The passing projection control supplies an explicit `corrects` edge and therefore does not reproduce the missing discovery step.

### 3. A prior answer's episode list remains referencable

**Audit reproduction:** provide an assistant `response_data.sections` list containing February 2011 and July 2014, only unrelated care rows, and ask `What changed during the second episode?`; require July 2014 in the model input.

**Classification: legacy prose-only reference expectation; supported durable references use a different authority.** `buildFurviseContext.responseText` retains `directAnswer` or `summary`, not section items. More importantly, [retrieveEpisodeHistory](../app/lib/intelligence/episode-history.ts) requires a parsed, owned `ask-episodes.v1` reference envelope and revalidated episode/source versions. This fixture has neither that envelope nor supporting episode sources. Clarification is intentional; copying assistant section text would not establish source identity.

**Remaining requirement:** continuity for older prose-only lists remains unavailable without a safe source-binding recovery mechanism. Supported newly generated lists already use [attachEpisodeReferences](../app/lib/intelligence/episode-contract.ts), which attaches authority only if the final displayed answer exactly matches the server episode result. Existing episode cases cover reloads, intervening turns, new earlier records, stale/deleted sources and untrusted prose; subject-continuity cases compose the repaired pet switch with these boundaries. This assertion is not evidence that those validated references are lost.

### 4. Multi-pet answers load every authorized subject's history

**Audit reproduction:** `Compare Milo and Luna history.` with `authoritativePetIds: ['milo', 'luna']`; require Luna care evidence as well as her profile.

**Classification: actual broad-query capability gap, not a universal single-pet historical loader defect.** `buildFurviseContext` initially loads Milo's care rows. `planHistoricalQuery` finds neither a supported topic nor a period in this question and returns null, so the per-pet loop in `retrieveAskHistory` never runs. Authorized profiles alone do not supply Luna's history. The fallback discloses limited context instead of establishing a complete comparison.

**Remaining requirement:** support bounded broad history comparison with evidence and coverage for each subject. Supported topic/period plans already iterate owned authorized IDs, split candidate budgets, and track `perPet` coverage, with a three-pet budget. The stage-2 case `supported period loads each authorized pet without borrowing another pet facts` exercises that narrower path. The lifetime harness does not test HTTP subject authorization for this question.

### 5. Old canonical episodes survive the recent 20-row loader window

**Audit reproduction:** add 25 newer routine episodes to the two old soft-stool episode rows; ask `List all Milo soft-stool episodes.`; require the old `episode:stool-episode-1` in `prompt.contextRecords` while preserving the loader cap of 20.

**Classification: legacy prompt-record assertion with insufficient episode-source fixtures.** The recent loader really has a 20-row limit and an eight-row resolved subset. The production list path instead calls `read_ask_episode_sources` by topic/period inside `retrieveEpisodeHistory`, independently of that window. Its supported items are serialized in `prompt.evidenceContract.episodes`, not restored as legacy `contextRecords`. The lifetime fixture's care entries have no `episode_id` links, so canonical rows alone cannot certify groups.

**Remaining requirement:** old episode recall is supported only with validated source membership and explicit boundaries; arbitrary canonical projections are insufficient. `ask-episode-history.cases.mjs`, case `old decisive episode bypasses recent context window with bounded model input`, covers linked old episodes behind 25 newer rows while keeping the original cap. Discovery remains bounded (nine episode rows detect overflow; at most eight displayed groups), so this does not imply a complete lifetime list.

### 6. Retrieved episodes retain sequence and recurrence identity

**Audit reproduction:** ask `Describe the second soft-stool episode.` with canonical episode rows; require `metadata.sequence_number === 2` and `metadata.recurrence_of` on `episode:stool-episode-2`.

**Classification: real omission in legacy serialization, not loss from the validated episode contract.** `ask-reasoning.ts::buildContextRecords` emits episode type/topic/status but omits those two metadata fields. `retrieveEpisodeHistory` carries `sequenceNumber`, `recurrenceOf`, and displayed `ordinal` in `EpisodeResult.items`. The audit has no conversation reference envelope, so “second” cannot authorize that identity merely from a projection row.

**Remaining requirement:** preserve/recover identity wherever legacy episode records are used, without confusing stored recurrence sequence with the position in a displayed list. The supported-contract case `supported recurrence, count/list/provenance agree in actual prompt and final validator` asserts both fields in `prompt.evidenceContract.episodes`; follow-up cases pin the displayed ordinal despite inserted earlier history. Adding legacy metadata alone would not resolve the fixture's missing reference authority.

### 7. Reject an unsupported assertion that hiding is resolved

**Audit reproduction:** Luna's stored note says she hides less but still sometimes hides; ask `Is Luna hiding fully resolved?`; inject provider answer `The hiding is fully resolved.`; require the forbidden phrase to be absent from the final answer.

**Classification: actual production-path answer-grounding failure.** `askEvidenceScope` classifies this as ordinary, and `planHistoricalQuery` does not select a historical plan. `evidenceAnswerPolicy` permits ordinary resolved-scope answers through. `validateGeneratedAnswer` has targeted diagnosis/safety/prose checks, but no same-topic resolution-claim grounding rule. `ask-reasoning.ts::hasUnsupportedTerminalRecovery` checks structured `messageUnderstanding.recoveryStatus`; the fixture sets it to `none`, so unsupported prose need not trigger that check.

**Remaining requirement:** prevent affirmative resolution claims unsupported by compatible evidence, including claims in sections and safety notes. Preserve the difference between a dated owner report of partial improvement and verified present resolution. This is a demonstrated validation boundary weakness under an adversarial mocked answer, not evidence of a measured live-provider failure rate.

### 8. Addressing Furvise must not turn recall into an unavailable paid feature

**Audit reproduction:** `classifyFurviseCapabilityQuestion('Furvise, summarize all history for Milo.')` must return null.

**Classification: actual classifier defect with a downstream route consequence.** In [ask-internal-product-policy.ts](../app/lib/ai/ask-internal-product-policy.ts), “Furvise” satisfies `productQuestionContext` and “all history” selects `long_history_patterns`. The Ask route calls this classifier after generation and can replace the answer through `buildPlannedCapabilityResponse` when reasoning exists, safety is normal, shopping is not suppressed, and a planned response is returned. The standalone audit does not execute that route branch or prove an actual charge occurred.

**Remaining requirement:** distinguish addressing the assistant for stored-data recall from asking about product capabilities, while retaining genuine export, subscription/capability and research questions. Fixing this classification would restore the recall path, but broad history retrieval could still return its honest limitation from requirement 4.

### 9. Compute exact separate-episode aggregates, not note counts

**Audit reproduction:** ask `How many separate soft-stool episodes has Milo had over his lifetime?`; require the final summary to say `two separate soft-stool episodes`.

**Classification: actual unimplemented exact-aggregate capability; current refusal is intentional.** The fixture oracle knows two episodes, but its notes are unlinked and this call supplies no canonical episode rows. `retrieveEpisodeHistory` explicitly refuses to count unlinked notes as groups. `EpisodeResult.exactTotal` is typed as null; `episodeAnswer` reports a supported subset and explicitly disclaims an exact lifetime total. Several update notes or two symptom occurrences cannot establish two separate incidents.

**Remaining requirement:** certified episode membership, correction-aware extraction/grouping and completeness before an exact total can be rendered. Existing linked-episode tests establish supported subset counts and distinguish occurrences from groups, not this lifetime total. The fixed provider stub and phrase assertion cannot by themselves assess model counting ability; changing wording or counting fixture rows would not satisfy the semantic requirement.

### 10. Render a verified complete earliest/latest weight comparison

**Audit reproduction:** compare Milo's earliest and latest recorded weights (28.4 and 27.8 kg); require `0.6 kg` in the final summary. The signed delta is -0.6 kg, a decrease; 27.9 kg is the intermediate measurement.

**Classification: actual missing certified comparison computation, not demonstrated candidate loss.** Weight planning retrieves matching historical notes, and the audit's small-weight control checks that all values reach the model input. `createAskEvidenceContract` initializes `verifiedFacts` empty; retrieval leaves extraction/grouping and semantic completeness unknown. `evidenceAnswerPolicy` requires complete coverage plus a scope-matched verified fact to emit a certified comparison, so it returns a limitation rather than computing this delta from the fixed provider answer.

**Remaining requirement:** establish effective measurements, units, chronology and coverage, then compute and render a provenance-bound decrease of 0.6 kg. The current reachability control cannot certify earliest/latest status across all stored records. A unit-normalized arithmetic result alone would not meet the complete-comparison requirement.

## Next repair

**Recommend exactly one bounded repair: a deterministic evidence policy for explicit resolution-status recall, addressing requirement 7.** It has the highest immediate trust impact among these gaps: the required source qualification is already available in the Luna reproduction, yet unsupported resolution prose can survive the final validator. This repair does not depend on complete lifetime retrieval, arbitrary episode grouping, or recovering legacy reference identities.

Proposed scope is read-only, single-authorized-pet questions explicitly asking whether a named condition has resolved. Extend the evidence policy and final-validator boundary to return an evidence-limited status answer rather than accepting an affirmative model resolution claim. Use represented, same-pet, same-topic source evidence with its date and qualifications; when freshness, correction status, or topic binding is insufficient, state that resolution cannot be established. A historical report must remain attributed and must not become a verified current medical finding. Do not introduce a generic “fully resolved” string replacement, rely on provider recovery flags, infer new lifecycle transitions, or change persistence behavior.

For the exact Luna fixture, an acceptable bounded answer is: “The available note reports that Luna still hides sometimes. I can't establish that the hiding has ended.” The existing audit excludes the phrase `fully resolved` even inside a negation or quote; preserve that assertion and express the qualification without reproducing the forbidden phrase. This is proposed behavior, not implemented behavior.

Reproductions and acceptance tests for that future repair:

1. Keep the unchanged lifetime reproduction from requirement 7. Capture `care:luna-hiding` in actual model input and inject the affirmative answer with `recoveryStatus: 'none'`. Assert a nonempty, qualified final answer with no unsupported resolution claim and no accepted care actions. Repeat with the false assertion in a section and safety note, and with inconsistent provider recovery flags.
2. Add composed loader -> `generateAskHistoryAnswer` -> actual prompt -> final-validator cases for partial improvement, explicit dated owner-reported resolution, and absent/ambiguous evidence. Partial improvement must stay partial; a terminal owner report may be attributed as historical evidence without certifying current status; missing evidence must produce uncertainty, never inferred recovery or absence.
3. Add same-topic and subject controls: Milo's resolution or Luna's resolved litter issue cannot support resolution of Luna's hiding. Deleted, changed, superseded, truncated or unavailable evidence must not support an affirmative answer. Exercise existing source-version/correction checks where applicable and withhold certainty where the recent-context path cannot revalidate it.
4. Preserve urgent-safety behavior and new owner-update handling outside this narrow recall policy. Confirm no new learnings, care actions, semantic writes or reference envelopes are authorized by a status question. Retain valid episode-result rendering, exact source quotations, subject-switch behavior and stale-reference rejection.
5. Before claiming completion, run these mocked, network-blocked cases, the existing evidence/history/episode/subject suites, the unchanged lifetime audit, and repository-required checks in an authorized local environment. Report actual outcomes separately. This repair targets one of the ten assertions; it does not promise an otherwise unchanged 8/9 result without a successful run.

## Limitations

All conclusions above are derived from the checked-out source and existing test definitions. Prior reports' pass counts are historical evidence only; default suites and the lifetime audit were not rerun here. References to existing cases describe their assertions, not fresh successful executions.

The distinction between legacy assertions and current contracts does not remove the original acceptance requirements. No tests or expectations were changed. In particular, bounded supported episode lists do not establish exact lifetime totals, safe clarification does not recover prose-only references, and disclosed fallback does not fulfill broad multi-pet or disjoint-period recall.

No live-provider behavior, HTTP integration, production database state, migration installation, PostgREST schema/grants/timeouts, snapshot consistency or production performance was verified. The historical path itself records `read_committed_no_snapshot` and bounded coverage. No external services, credentials, dependencies, application changes, commits, pushes, merges or deployments were used for this task. Only this document was added.
