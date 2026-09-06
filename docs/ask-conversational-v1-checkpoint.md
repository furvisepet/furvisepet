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
