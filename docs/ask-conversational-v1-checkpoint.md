# Ask conversational reliability V1 checkpoint

Branch: codex/ask-conversational-reliability-v1.
Worktree: C:/Users/gwara/furvise-ask-conversational-v1.
Base: e90c7722198bf7f9fa6a3b32664b9ec287f42aa6.
GitHub PR #195 verified merged at 2026-09-06T07:33:09Z; its head was df8ffcfd491955fe0990bd4d332149647ab09902. Remote main matches the merge commit.

Original checkout and unrelated work preserved. Process inspection found only this Codex session and MCP services; no application writer or Git index lock. The old furvise-remaining.lock is a leftover file with no active writer. New worktree reuses the existing remaining-reliability dependency directory via a junction; no dependency installation or target modifications.

Read AGENTS.md, installed Next 16.2.12 route-handler documentation, architecture, generation consolidation, subject continuity, episode wording, and remaining reliability checkpoints. Existing history audit remains authoritative and unchanged. Baseline log: tmp-baseline.log. New callback reproductions: scripts/audits/ask-conversational-v1.cases.mjs (run before production edits).

Production trace: POST /api/ask -> admission/credit -> resolveAskTurnSubject -> alternate-pet context -> orchestrateAskTurn -> generateAskHistoryAnswer -> retrieveAskHistory -> retrieveEpisodeHistory -> runFurviseIntelligence -> generation -> independent governance/answer validation -> route persistence. Three separate deterministic interpretations restrict history before generation; evidence policy replaces even supported partial summaries afterward.

Decision: one bounded structured interpretation for admitted conversational questions, validated by server ownership/explicit-name checks, dates, operation enum, term and pet budgets. Reuse admitted provider infrastructure. No model SQL, model write authority, or live verification. Existing deterministic update, safety, correction, reference, and persistence governance retained.

## Implementation completed

`interpret-ask.ts` uses the existing OpenAI structured response interpreter and admitted provider-call accounting. A single response supplies the question plan and the existing ProposedSemanticFrame needed for owner-update subject grounding. The server validates exact object keys, operation enum, allowed local frame, owned names, explicit-name precedence, selected versus owner-established conversational subject, at most three pets, six plain lexical terms of at most 40 characters, and valid ordered dates within 1900-2100. Model IDs, SQL, filter syntax, invalid dates, excess budgets and unknown pets cannot become queries. Existing question detection remains an independent write veto, not a retrieval gate. Failed interpretation is retryable service failure, not a claim that saved history is missing.

The route carries that interpretation through alternate-pet context rebuilding into `generateAskHistoryAnswer`. `retrieveAskHistory`, `retrieveEpisodeHistory`, and `createAskEvidenceContract` consume it instead of independently reparsing the production question. Compatibility parsers remain for older direct callers/audits. Historical retrieval keeps the existing lexical RPC, oldest-first cursor traversal, fair candidate budgets, correction graph closure, source-version checks and provenance. No newest-N lifetime cutoff or schema change was added. The answer model receives the bounded effective evidence, not prior assistant prose as medical evidence.

Partial summaries and comparisons may answer the supported portion. A server-generated limitation distinguishes missing matches, failed loading, omitted evidence and correction uncertainty. Episode counts and selected references remain deterministic, including a second revalidation after generation. The validator withholds common model-generated numeric episode totals/exhaustive claims even in summary mode. This is a bounded additional check, not universal factual entailment. Status questions return dated attributed reports and do not assert present recovery from historical notes.

All read-only interpretations suppress model care/memory/event proposals, semantic claims, mutation application actions, deterministic recovery/save fallbacks, and orchestrator suggestions. Owner updates retain independent evidence/subject/write governance. Tests compare a genuinely accepted owner observation with and without interpretation. Late correction tests inject saved correction graphs and verify their effects on retrieval; they do not exercise a real correction transaction.

Public rendering preserves paragraph boundaries and literal source punctuation. Server-composed episode/status text is restored after ordinary action/prose cleanup. The actual Ask page uses `AskAnswerText`, a plain React text renderer with no HTML interpretation or new fetches. There is no mandatory duplicate summary section. Episode count wording for interpreted requests now leads with the supported count and pet name.

## Reproduction and representative conversations

Before production edits, four new callback assertions failed (0/4, `tmp-conversation-before.log`). These used the merged PR #195 base and mocked answer/database boundaries:

- `Summarize his stomach history.` retrieved the 2011 source, but the final policy replaced the supplied useful answer with: `The available records are limited, and their completeness and corrections are not verified. I can't establish a complete summary of the requested history from this evidence. I can discuss the supplied notes, or you can identify a specific record to review.`
- `Walk me through his tummy troubles over the years.`, `What have we saved about his health?`, and `Review his stomach problems between 2010 and 2015.` did not retrieve the old relevant source through the historical callback.

After implementation, the same assertions pass with a mocked structured interpretation and mocked answer. The interpretation is validated by the actual production function, and the answer passes the actual retrieval/generation/governance/validator callbacks. These examples demonstrate integration and visible policy output, not live-model language-understanding quality:

1. Owner: `Summarize his stomach history.`
   Furvise: `Milo had soft stool for two days in February 2011.` Then a separate paragraph: `This covers the matching saved notes I could verify, not necessarily every event in their life.`
2. Owner: `How many separate episodes are recorded?` after the multi-symptom digestive summary.
   Furvise asks which symptom (vomiting or soft stool), without asking for an already selected pet or a nonexistent displayed episode. After the owner specifies vomiting for Milo, the same question produces: `I can verify 2 separate vomiting episodes for Milo in the saved notes. The saved notes don't establish a complete lifetime total.` The list retains its dated source-backed order. Two vomiting occurrences within one incident count as one episode.
3. Owner: `What happened in the second episode?`
   Furvise: `For episode 2 from the list you saw, here are the dated notes:` followed by the original July 9, 2014 note. After serialization/reload, `Can you remind me about that one?` selects the same episode ID, not a new ordinal. Deletion, reassignment and source changes prevent reuse.
4. Owner switches from Milo to `What do we know about Luna hiding?`, then asks `Is that resolved?`
   Only Luna's evidence is retrieved. The August 19 report retains `hiding less but still hides sometimes; it has not fully resolved.` The answer states that dated reports do not establish whether hiding has resolved now. Explicitly returning to Milo retrieves Milo's evidence again.
5. Owner: `How do Milo and Luna differ in their digestive histories?`
   Separate pet-attributed records support Milo's two-day soft-stool report in 2011 and Luna's one-day report in 2012, without mixing evidence. A late linked reassignment removes the original report from Milo and makes the effective replacement reachable for Luna.
6. When the second retrieval page fails, the supported 2011 answer remains, followed by `Some saved records couldn't be loaded. This covers only the notes I could check.` Empty matches instead say that no matching notes were found and do not establish that an event never happened.

Additional vocabulary reserved until after implementation includes ear flare-ups, trouble getting around, and sneezing. No production vocabulary edits were needed for their validated plans to retrieve older notes. Because the plans themselves are mocked, these checks establish generality of the execution mechanism, not measured model paraphrase accuracy.

## Verification

- Focused production interpreter/callback/validator/presentation conversations: **20 passed** (`tmp-conversation-after.log`). Includes hostile planner output, failed/refused/incomplete interpretation, foreign names/IDs, explicit-name overrides, budgets, owner updates, no-write checks, unsupported/ambiguous topics, missing/conflicting/partial history, forgotten/deleted sources, counts, reference reloads and pet switches.
- Full default suite: **2,288 passed, zero failures/skips/cancellations** (`tmp-full.log`), including the wrapper that executes those 20 cases. Existing test/audit expectations were retained.
- Typecheck: passed (`tmp-typecheck.log`).
- Lint: zero errors; the same two pre-existing unused `supabase` warnings in `persist-learnings.ts`, lines 141 and 374 (`tmp-lint-final.log`).
- `git diff --check`: passed.
- Final production `npm run build`: passed, Next 16.2.12 webpack; all 45 static pages generated (`tmp-build-final.log`). No environment secrets were copied into this worktree.
- Real local headless Chrome: passed six parser/renderer checks using the existing harness with `--ask-conversation` (`tmp-browser.log`). Real React DOM, production response serialization/parser, local-storage reload, three visible paragraphs, exact `2.7 kg`, `test_A #2`, `>1.5`, negation and literal HTML-as-text. Minimum available RAM was 6.65 GB on the final run. This was a component/browser fixture, not an authenticated Next app or HTTP/database end-to-end test. The unavailable browser CLI was not installed.
- Unchanged explicit lifetime audit: **14 passed / 3 failed**, matching the base (`tmp-lifetime-final.log`). Remaining failures concern old unlinked canonical episode projections/identity and an exact aggregate from unlinked notes. They were neither weakened nor silently included in the passing-default-suite claim.
- Database/model behavior was mocked; outbound fetch is forbidden by the callback harness. No live provider calls, real database transactions, Docker, migrations, push, merge or deployment.

## Call count, latency, cost and rollout limits

Normal admitted conversational requests now use **two sequential provider calls**: interpretation, then answer, instead of normally one. The interpretation includes the owner-update subject frame, avoiding a third extraction call. Both use the existing primary model configuration and admission accounting. The existing **two-call hard ceiling**, rate/cost limits and one-credit-per-logical-turn settlement remain unchanged. Deterministic emergency/command/acknowledgement paths can still avoid the model.

Interpretation has a 15-second abort timeout, no SDK retries, and at most 2,600 output tokens (the nested update frame uses the same schema as existing subject extraction). Recent discourse is limited to eight owner turns of 600 characters. The answer limit remains 4,096 tokens, so a normal pair requests at most 6,696 output tokens. Existing retrieval and prompt budgets remain. The route still has a 50-second outer timeout. Mock execution times do not estimate live latency. No real token usage or dollar cost was incurred/measured; incremental cost is the added interpretation input/output at the configured model's rates. The two-call cap means an answer requiring an additional repair call can now fail/retry rather than receiving a hidden third call.

No new migration, dependency, environment flag or credential is required. Existing historical candidate/correction/episode RPC deployments remain prerequisites. Before rollout, separately authorize a live-provider canary and authenticated application validation against an appropriate disposable/test environment. Measure interpretation accuracy, question-versus-update classification, output truncation, two-call repair failures, latency and provider spend. No rollout action was taken here.

V1 remains bounded: eight-turn subject/topic context, three pets per plan, six lexical search terms, existing evidence/page/time budgets, single supported episode topics (vomiting, soft stool, breathing), and existing membership/completeness certificates. Broad digestive counts may require a symptom clarification. Current-status answers attribute dated reports rather than certify medical recovery. Unlinked corrections may require clarification/review; old prose-only lists do not become authoritative episode references. Lexical retrieval and a model-assisted plan do not solve all lifetime-history gaps or guarantee model understanding.

This checkpoint accompanies the local implementation commit; `git log -1` in the named worktree gives its exact ID. Next step: retain the worktree for review. Any live canary or rollout is a separate authorized task.

## Review correction, September 6, 2026

Worktree: `C:/Users/gwara/furvise-ask-conversational-v1`. Branch: `codex/ask-conversational-reliability-v1`. The correction starts at the clean reviewed commit `2c8bede252383fed3bd9942b95721073fa97e25f` and preserves it as its direct parent. The original upgrade base remains `e90c7722198bf7f9fa6a3b32664b9ec287f42aa6`. No branch reset, remote operation or unrelated worktree edit was performed.

Read the applicable AGENTS.md, installed Next route-handler guide and existing architecture/checkpoint documentation. Inspected worktrees, processes and the shared lock. Acquired `C:/Users/gwara/furvise-remaining.lock` exclusively with FileShare.None, holder PID 35256 tied to this Codex process PID 33268 and its start time. The earlier lock metadata named exited processes. Kept the exclusive handle throughout editing and verification. Shared dependency junctions were reused without installation or modification.

### Reproduction before source edits

Ran the existing actual generation callback harness against the reviewed code. The original 20 conversational cases passed, demonstrating the coverage gap. Reproduction output is retained locally in ignored `tmp-review-before.log`.

- Sole evidence: February 1, 2011, `Milo had soft stool for two days.` Both `Milo has had 99 bouts of vomiting over his lifetime.` and `Milo has never vomited.` survived with `answerValidation.valid: true`, followed by the partial-history disclaimer.
- `Milo had exactly two days of soft stool.` triggered `withheld_model_history_total` despite being a duration.
- The mixed observation/question from the review produced `historyPlan: null` and `historyLoaded: false`.
- The explicit September 4 resolution report became a quoted-note list plus a fixed sentence saying the notes did not establish resolution now.

### Root causes and production correction

The production path remains `POST /api/ask -> admitted interpretation -> subject resolution -> generateAskHistoryAnswer -> historical/episode retrieval -> runFurviseIntelligence -> answer validation -> route governance/presentation -> persistence`. The callback and the final presentation helper are the same functions exercised in acceptance tests.

1. Interpretation conflated read intent with updates, and evidence creation independently forced every historical turn to be read-only. Added bounded `readOperation` to the strict provider schema. It controls history/count/reference planning independently of current owner assertions. Server assertion analysis determines the read-only guard; the existing current-source subject resolver, semantic evidence grounding and write governance still authorize every proposed mutation. The plan never grants a write. Legacy in-process proposals without the new field receive a conservative compatible read default; production requests require the field. Mixed comparison fixtures now run the route's real subject resolver, retrieve the old vomiting source, and retain the independently supported current care update.

2. Narrative answers bypassed the evidence policy, and a quantity regex attempted to compensate without factual entailment. Inspected the existing semantic-frame span alignment, source-note recall, weight comparison, evidence coverage and episode authority. Exact span alignment proves text identity, not arbitrary semantic entailment. The correction deliberately uses a bounded extractive claim mechanism shared by interpreted recall, comparison and status: complete server-represented source reports, with record/date attribution, plus the existing independent episode computations. Model prose, claim labels and context IDs cannot certify historical claims. No additional claim-type vocabulary or synonym regex was introduced. Whole spans retain quantities, negations and qualifications together. A reported unverified quantity remains an attributed report; it never becomes a pet lifetime total. Failed retrieval and no matching evidence remain distinct. Ownership, source loading, correction provenance, excluded spans and issue terms are checked before a report is rendered. Server-derived source references accompany the supported reports.

3. Status now reports the latest matching dated text directly, followed by older relevant reports when supplied. Improvement, explicit recorded resolution and recurrence retain their original meaning. The response describes dated evidence and makes present-day uncertainty explicit without denying that a resolution was recorded. Exact quotations are used on request. No keyword classifier converts a report into medical recovery. Per-pet presentation limits are separate from historical retrieval: older records remain searchable and presentation truncation is disclosed.

4. Final presentation no longer recomputes status from the evidence contract. The completed callback registers its validated answer in a server-only WeakMap after episode freshness revalidation. Restoration requires the same contract object, episode result and ordinary rendered answer. Downstream changes to answer text/sections are respected, and safety fields are not overwritten. The parser now removes Markdown delimiters in their formatting positions instead of deleting underscores, number signs and greater-than signs from facts. Source reports retain `2.7 kg`, `test_A #2` and `>1.5` through rendering and reload. React continues rendering literal text.

### Representative verified results

For `Summarize his stomach history.`, all three adversarial/supported duration model outputs above now produce the supported report:

> The 2011-02-01 note reports: Milo had soft stool for two days.
>
> This covers the matching saved notes I could verify, not necessarily every event in their life.

The unsupported assertion itself is removed, not left next to a disclaimer. The duration is not treated as an episode count. Additional held-out assertions about ninety-nine occasions, a grand total of attacks and lifelong freedom from vomiting are also removed even when the provider supplies the valid source ID.

For `Milo vomited once this morning. How does that compare with his vomiting in 2011?`, the validated read plan now loads the 2011 vomiting note into the actual generation prompt. The final answer attributes the current observation and the old report separately. Existing governance retains `Owner reported that Milo vomited once this morning.` as an accepted current care action. Both update and comparison top-level interpretations are exercised; neither historical retrieval nor write authorization depends on that label alone.

For a status question with the explicit September 4 record, the actual result is:

> The 2026-09-04 note reports: Milo has had no more vomiting since August 20. The vet recorded the vomiting episode as resolved.
>
> These reports describe the issue on those dates. I don't have a verified update about how things are now.

Adding a September 5 recurrence puts `Milo vomited again this morning.` before the dated resolution. Luna's reports and unrelated ear notes are excluded. Improvement-only records retain the continuing symptom. Complete summary/count/second-episode/reload conversations, late reassignment, forgotten/deleted records and uncertain corrections remain covered.

### Verification and practical limits

- Focused conversational callback/final-presentation acceptance: **31 passed** (`tmp-review-focused.log`). Provider and database responses are mocked; the harness forbids outbound fetch. Update cases also use the real subject resolver.
- Full default suite: **2,288 passed**, including the unchanged ledger settlement tests. Logs: `tmp-review-full.log`.
- Original explicit lifetime audit: **14 passed / 3 failed**, unchanged. The same failures concern the old canonical episode window, sequence/recurrence identity and an exact aggregate from unlinked notes. No lifetime-audit assertions or fixtures were edited (`tmp-review-lifetime.log`).
- Typecheck passed; lint has zero errors and the same two existing unused `supabase` warnings in `persist-learnings.ts` (`tmp-review-typecheck.log`, `tmp-review-lint.log`). Diff checks passed.
- Production webpack build passed, Next 16.2.12, 45 static pages (`tmp-review-build.log`).
- Real local headless Chrome passed six parser/React DOM/reload checks with the existing harness, now using an unquoted attributed report. Minimum available RAM was 6.91 GB. This is component acceptance, not authenticated HTTP/database end-to-end validation (`tmp-review-browser.log`).
- Real provider admission and MemoryAiGuardTestStore run around actual interpretation/generation callbacks. Mock responses include usage metadata and use the configured priced model. Both completed calls reconcile usage; pre-provider failure releases its queued reservation; interpretation transport/invalid-output failures, answer failure and repair exhaustion leave no unstarted reservation. Started calls retain conservative accounting where actual usage is unknown. New attempts succeed after each failure. Repair exhaustion has the existing retryable 503 admission error, and **no third call executes**. User-credit database transactions were not executed; existing settlement and route-boundary tests remain the evidence for that separate layer.

No extra model call, dependency, migration or environment flag was added. Normal model-backed turns still make two sequential calls with the unchanged 2,600-token interpretation limit, 4,096-token answer limit and two-call hard ceiling. Mock usage proves accounting behavior, not live token demand, latency, cost or interpretation accuracy. Actual live cost and latency were not measured.

This is bounded extractive grounding, not universal factual verification. Historical prose is less freely paraphrased because arbitrary entailment cannot be certified by a source ID or the existing span matcher. Reports preserve what a source says, not proof of medical truth. Ambiguous unlinked corrections remain withheld; exact lifetime totals still require the existing grouping/completeness authority. Newest-report presentation does not certify present health or global absence of newer records. Lexical interpretation/retrieval and existing context budgets retain their documented limits.

No live provider, database execution, Docker startup, credential exposure, remote migration, push, merge or deployment occurred. A separately authorized live canary remains required before rollout. Next step: create the separate local correction commit, export its review patch and release the exclusive lock. The correction commit is the commit containing this appended checkpoint; its parent is the reviewed commit above.

## Selection and bounded synthesis revision, September 6, 2026

Branch/worktree remain `codex/ask-conversational-reliability-v1` at `C:/Users/gwara/furvise-ask-conversational-v1`. This separate revision starts from reviewed HEAD `5d9c175b357239dec8bb321f660a26a6442f6254`; all previous commits are preserved. Read AGENTS.md, this checkpoint, architecture documentation and the installed Next route-handler guide. Verified a clean worktree, Git worktrees and processes before source edits. Acquired the existing exclusive FileShare.None lock at `C:/Users/gwara/furvise-remaining.lock`, holder PID 26468, tied to Codex PID 33268 and its start time. Inspected other Node processes as tooling rather than repository writers. No dependencies or shared dependency targets were changed.

### Reproduced on reviewed HEAD before edits

`tmp-selection-before.log` records actual callback/final-presentation output with mocked providers and database data:

1. For `When did Milo first have vomiting?`, the January 1, 2011 affirmative source reached the answer prompt alongside four August 2026 negative reports. Final composition selected only the four newer reports.
2. For `Compare Milo and Luna stool history.`, two same-date notes without names displayed `Soft stool for two days.` and `Normal stool all week.` without visible pet attribution.
3. A report explicitly describing today's vomiting status still received the fixed statement that no verified current update was available. Historical prose was always replaced by full source extracts.

### Production changes

The path remains route interpretation/subject resolution -> `generateAskHistoryAnswer` -> effective historical/episode retrieval -> `runFurviseIntelligence` / `buildAskContext` -> structured answer parsing -> `validateGeneratedAnswer` -> guarded final presentation. There is no extra model verification call or parallel question interpreter.

- `interpret-ask.ts` adds validated selection intent: oldest matching report, earliest reported occurrence, newest update, period, summary, comparison or reference. Period/source-reference selections require a bounded date range unless using the existing episode-reference mechanism. Unknown operations are rejected. Production structured output requires selection; legacy in-process fixtures keep explicit compatibility defaults. This is question-intent wiring, not evidence that a live model understands every paraphrase.
- `history-synthesis.ts` supplies shared evidence ordering. Retrieval budgets favor the requested temporal boundary and distribute retained evidence across pets; summary/comparison retention includes both temporal boundaries. The answer prompt preserves the effective retrieval order instead of scoring decisive history by recency again. Final composition no longer imposes a newest-four cutoff. Same-time conflicting reports remain together.
- First-occurrence selection distinguishes affirmative past-tense reports from negative, conditional, uncertain and preventive mentions using a deliberately narrow source recognizer and existing assertion analysis. Unrecognized forms are reported as uncertain matches rather than being promoted to a first occurrence. First/earliest always refers to matching evidence checked, never first-ever lifetime onset. A fixture with 40 older negative notes demonstrates that an affirmative report remains prioritized through both existing evidence budgets.
- Latest selection supplements ascending historical candidates with at most eight matching records from already-loaded current context, reserving space inside the existing 64-root budget. These records undergo the same correction, ownership and source-version checks. This adds no database query or provider call. It improves latest-update reachability without removing the historical reader or certifying global recency/completeness.
- `ask-reasoning.ts` requests bounded `historySynthesis` proposals in the existing answer call. Each proposal identifies one source and supplies a proposed rendering of its complete content. Parsing bounds IDs, text and array size. Model IDs, labels and prose remain untrusted.
- `supportedHistoryParaphrase` verifies controlled equivalence of complete ordered statements. Supported transformations include certain subject references, number spelling, symptom/duration forms, and recorded-status active/passive wording. Quantities and case-sensitive units are checked separately. Negation, uncertainty, other qualifiers, clause order, actors and temporal/causal wording cannot simply disappear. This is neither bag-of-words similarity nor arbitrary semantic entailment. Unverified causal conclusions, changed units, broader absence statements and totals fail even with a real source ID.
- The server supplies pet names, record dates, selected source references and coverage wording. Supported proposals compose connected paragraphs. Identical full reports for the same pet can share an explicit list of dates; this is presentation deduplication, not episode grouping or a count. Failed/absent proposals fall back individually to their complete source; they do not force neighboring validated prose into a quote dump. Explicit quotation requests retain exact source text.
- Status uses dated source meaning: recorded improvement, resolution and recurrence remain distinct, and today's report no longer triggers the claim that a current update is missing. Older/period-specific reports retain an appropriate temporal limitation. Nothing certifies an independently assessed current medical state.
- The prior validated-presentation snapshot and downstream safety checks remain. Server-validated rendered content is also tracked so a qualifying mention of another pet, such as `Luna vomited, not Milo`, is not mistaken for unsupported subject drift. This exemption cannot be supplied by model JSON. Pure recall cannot write; mixed observations retain independent existing authorization.

### Representative verified final answers

With the old affirmative report and four newer negative reports, the new explicit first-occurrence plan and supported proposal produce:

> The earliest matching report I could check for Milo is from 2011-01-01. Milo first vomited after a food change.
>
> That is the earliest matching report in the evidence I could check, not proof of when it first happened in their life.

The same-date nameless comparison produces supported, visibly attributed paraphrases:

> Milo's recorded history: Milo experienced soft stool for 2 days (2026-08-01).
>
> Luna's recorded history: Luna's stool was normal all week (2026-08-01).
>
> This covers the matching saved notes I could verify, not necessarily every event in their life.

A report dated today produces:

> The latest matching update I could check for Milo is dated 2026-09-06. Milo has had no vomiting today.

A supported soft-stool duration paraphrase remains conversational when an adjacent proposal invents causation: the duration sentence survives, and only the causal proposal falls back to `Milo vomited after a food change.` The invented `99 bouts`, lifelong absence and reversed `before` wording are not left in the answer. These examples come from `tmp-selection-after.log` and callback assertions, with explicit mocked interpretation and synthesis proposals.

### Verification

- Focused callback-through-final-presentation cases: **43 passed** (`tmp-selection-focused.log`). Covers first/latest/period/reference wiring, negative/preventive mentions, boundary retention, tied conflicts, named/nameless multi-pet evidence, supported paraphrases, unsupported totals/absence/causation, unit changes, uncertainty, qualified cross-pet mentions, source changes/deletion, linked corrections, forgotten sources, reloaded episode references, mixed turns, authorized updates, no-write recall, exact quotations and downstream safety.
- The existing real provider-admission tests run with mocked responses and usage metadata. Interpretation and answer failures, repair exhaustion, usage reconciliation, unstarted reservation release and new-attempt retryability still pass. The hard ceiling remains **two provider calls**.
- Full default suite: **2,288 passed** (`tmp-selection-full.log`), including the callback wrapper and unchanged ledger tests. The nested focused-case count is separate from the default runner count.
- Typecheck, lint and diff checks passed; lint retains the same two existing unused `supabase` warnings in `persist-learnings.ts` (`tmp-selection-typecheck.log`, `tmp-selection-lint.log`).
- Production webpack build passed, Next 16.2.12, 45 static pages (`tmp-selection-build.log`).
- Real local headless Chrome passed the existing six parser/React DOM/local-storage reload checks. Minimum available memory was 7.19 GB. This unchanged component fixture verifies rendering mechanics and literal source text, not live interpretation or an authenticated application session (`tmp-selection-browser.log`).
- The original lifetime audit and fixtures are unchanged: **14 passed / the same 3 failed** (`tmp-selection-lifetime.log`), covering the previously documented episode-window/identity/aggregate gaps.

Database and provider dependencies were mocked; no database execution, live providers, Docker, dependencies, migrations, push, merge or deployment occurred. The Supabase skill was consulted for retrieval review; its live-query guidance was overridden by the user's explicit prohibition. Remote documentation fetches were unavailable, so existing installed interfaces and repository query code remained the implementation basis; no new Supabase API was introduced.

### Limits and next step

Synthesis verification intentionally covers a restricted set of equivalent forms. More ambitious summaries, causal reasoning, omitted qualifications, source-title changes, opaque corrected payloads and unsupported cross-record conclusions still require a local source fallback. It is not universal factual verification or a general-purpose medical entailment model. First-occurrence recognition is also deliberately bounded; an unknown construction does not become event authority. Loaded/candidate/prompt budgets and read-committed source checks cannot establish first-ever onset, a globally latest update, snapshot consistency, lifetime absence or unlinked episode totals. Correction payloads whose complete meaning cannot be safely simplified remain conservative fallbacks.

Normal conversational turns still use two sequential provider calls. The 2,600-token interpretation and 4,096-token answer limits are unchanged, as are the provider timeouts and outer request timeout. Selection and synthesis add structured text within those limits; larger outputs may increase truncation/repair-budget failures. No live latency, token demand or dollar-cost claim can be established from mocked usage. A separately authorized live canary should measure synthesis acceptance/fallback rates, selection accuracy, output truncation, latency and cost before rollout.

Next step: commit this revision separately, export its review patch, and release the exclusive lock. The commit containing this checkpoint has reviewed HEAD `5d9c175b357239dec8bb321f660a26a6442f6254` as its parent.
