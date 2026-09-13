# Ask production correction and interpretation repair

## Workspace and verified base

- Worktree: `C:/Users/gwara/furvise-ask-production-repair`.
- Branch: `codex/ask-production-correction-recovery`.
- Fresh `git fetch origin main` resolved `origin/main` to `2cad7bf1fd87a4bf234ca8a205929abebaeede98`. `git merge-base --is-ancestor 2cad7bf1fd87a4bf234ca8a205929abebaeede98 origin/main` returned zero. This is PR #196's merge, with parents `e90c7722198bf7f9fa6a3b32664b9ec287f42aa6` and `8331444cf73081dbc3f7aa4d002f599e048ec298`.
- The repair commit containing this checkpoint has the verified merge as its direct parent. Its exact new hash and exported patch are reported at completion.
- Read root AGENTS.md, the installed Next route-handler guide, the conversational checkpoint including later PostgreSQL validation, and production interpretation/retrieval/correction/evidence/validation/provider/settlement code. No nested AGENTS.md was found in the application/test paths.
- Inspected active processes and worktrees before editing. Acquired the shared `C:/Users/gwara/furvise-remaining.lock` using an exclusive FileShare.None handle held by PID 41248, watching Codex PID 33268 and its start time. The prior holder had exited. No other Codex session was interrupted. Original worktree deletions and untracked work were preserved.
- Reused the existing installed dependencies through a junction in this isolated worktree. No installation or shared dependency modification. No Docker, live provider, credential access, production SQL, migration execution, push, merge, deployment or remote-service change.

## What was reproduced, and what remains unknown

The reported production conversation is `50002610-8269-4d5d-9d71-9104fc0fb6a3`; request `96afc481-a3d1-46fd-9c6d-7ff01d6ff505` reportedly failed around September 6, 2026, 11:39-11:41 UTC. These identifiers/time and the production observations came from the user. No live conversation, provider response or production logs were fetched for this task.

Before production edits, new regressions exercised the real context loader, interpreter, generation callback, answer validator and final presentation, with mocked external provider/database boundaries (`tmp-production-before.log`):

1. A saved 2011 soft-stool report plus an unlinked later correction reproduced the global warning-only summary. The usable note reached the answer prompt, yet final output was: `A later correction may change how these reports fit together. I can't reliably attribute the affected reports until that correction is connected to the original record. Other dated notes can still be reviewed separately.` The missing-summary assertion failed.
2. A completed interpretation response with usage and a deliberately invalid date reproduced the opaque post-call failure: stage `primary_provider_failed`, code `ASK_INTERPRETATION_UNAVAILABLE`, and zero provider events. The expected provider-attempt assertion failed. The real route only increments its counter from those events, establishing the telemetry defect.

**The deliberately invalid date is a diagnostic reproduction, not a diagnosis of the live 503.** Existing diagnostics and supplied logs cannot distinguish transport/refusal/incomplete output/JSON/schema/semantic failures, much less prove a specific live field was wrong. No ordinal, schema, provider or subject defect is claimed as that request's exact cause. Valid mocked interpretations for the reported follow-up now traverse the pipeline successfully, but this does not establish how the live model responded.

## Production path and changes

The path remains `POST /api/ask` -> authenticated conversation/ownership/readiness/idempotency preparation -> context loading -> provider admission and credit reservation -> `interpretAskQuestion` -> server subject resolution -> `orchestrateAskTurn` -> `generateAskHistoryAnswer` -> historical and episode retrieval/correction/freshness validation -> answer provider -> independent safety/write and answer validation -> episode revalidation -> validated final presentation -> durable response/disposition/credit settlement. No parallel interpreter or new persistence authority was added.

### Correction-aware useful answers

`ask-evidence.ts` no longer lets the global unlinked-correction reason bypass all composition. The existing authoritative provenance filter still excludes uncertain correction records, superseded/inactive sources, reassigned sources, changed/deleted sources and unrepresented evidence. Surviving complete source reports can contribute their independently verified text or controlled paraphrase.

When an unlinked correction's scope is unknown, every retained statement is explicitly attributed to its saved note, with a qualification that the correction's affected reports cannot be established. Different symptom wording does **not** prove that a note is unaffected. No current clinical assertion, first/last authority, grouping or exact total is derived from that uncertainty. Authoritatively reassigned vomiting evidence is removed from Milo and can appear under Bruno only through the existing owned-pet correction graph. The application neither relinks nor changes saved data.

The limited summary preserves usable report content instead of offering to review it later. If no other report can be verified, the answer explains the unresolved correction rather than pretending no matching data exists. Partial retrieval and correction uncertainty both remain visible. Unavailable correction closure still fails closed. Existing count authority, original source identities, exact facts/units/negation, safety and write gates remain intact.

### Interpretation robustness and diagnostics

`interpret-ask.ts` now separates response parsing from server plan validation. It emits stage `interpretation` provider events and an `interpretation_failed` pipeline stage with stable, server-defined reasons:

- `ASK_INTERPRETATION_TRANSPORT` / `TIMEOUT`;
- `ASK_INTERPRETATION_REFUSED`, `INCOMPLETE`, `FAILED`, `EMPTY_OUTPUT`;
- `ASK_INTERPRETATION_JSON` / `SCHEMA`;
- validated-field reasons including `TERMS`, `DATES`, `FRAME`, `UPDATE_INTENT`, `READ_OPERATION`, `EPISODE_REFERENCE`, `OWNERSHIP`, `SUBJECT`, `SELECTION` and a defensive `VALIDATION` reason.

Diagnostics carry fixed categories, elapsed time, configured limit and numeric usage/status. They never include raw parser errors, provider messages/refusal strings, prompts, pet history, full responses or credentials. Admission errors retain their own budget/reconciliation classification instead of becoming generic interpreter failures.

A legitimate model label disagreement need not cause a 503: server-detected current named pets override selected/conversation labels, while conflicting proposed names still fail validation. A name repeated from prior USER context can be accepted as the conversational pet only when it agrees with the existing server-resolved active focus. The prompt now distinguishes current explicit names from contextual names and supplies that focus as reference context. No assistant statement becomes medical evidence or subject authority. Ambiguous pronouns and explicit unclear-subject outputs remain clarification plans, even if the model lists owned candidate names. Dates, operations, terms, bounds, ownership and episode references still require validation. No two-question special case or retry loop was added.

The in-process validator retains its existing compatibility defaults for older callers that omit readOperation/selection; the production structured-output request continues to require both. This bounded repair does not relax malformed dates, unsafe terms, conflicting subjects or unsupported episode positions to obtain an answer.

### Provider accounting, stages and settlement

The route now forwards `onProviderEvent` to interpretation. `AskTurnLifecycle.providerEvent` is the shared counter/failure recorder used by the route and regression checks. Both interpretation and answer providers emit `started` at the actual invoke boundary, after provider admission succeeds. A denied repair attempt no longer masquerades as a third provider call. The hard ceiling remains two actual calls.

The generation callback reports bounded internal stages (history retrieval, episode retrieval, answer generation, episode revalidation, final presentation); the route tracks those and subject/context/orchestration stages instead of classifying every non-provider exception as a primary-provider failure. Provider-specific failures preserve their own safe stage/reason.

Existing credit disposition, release, completion and idempotency APIs/SQL are unchanged. Tests combine the actual admitted callback, lifecycle recorder and ledger APIs with an external in-memory ledger RPC double. A failed interpretation records one provider call; a failed answer or exhausted repair budget records two. Provider usage reconciliation remains independent of releasing the user credit. A failed attempt releases credit, and the tested successful retry yields one saved answer and one completed credit. Existing settlement conflict/reconciliation/replay tests also remain passing. The small test retry adapter is not a test of authenticated HTTP middleware or live database uniqueness/transaction behavior.

## Verified final examples

Synthetic saved evidence, real callback and final presentation; interpretation and synthesis outputs supplied by mock providers:

User: `Summarize Milo's stomach history.`

> Milo has these saved reports, with correction uncertainty noted below. The 2011-01-01 note saved for Milo reports: Milo had soft stool for two days.
>
> A later correction could not be linked to its original report. I can summarize what the saved notes say, but cannot confirm which reports the correction changes or whether they still apply to this pet.

After that correction-limited summary, user: `When was the earliest vomiting report?`

> Milo has these saved reports, with correction uncertainty noted below. Milo's 2014-01-01 report: "Milo vomited after a walk."
>
> These saved reports are not proof of when it first happened in their life.
>
> A later correction could not be linked to its original report. I can summarize what the saved notes say, but cannot confirm which reports the correction changes or whether they still apply to this pet.

In this second fixture the 2010 vomiting report was authoritatively reassigned to Bruno. It is absent from Milo's answer; the independent 2014 saved report remains visible without an unsupported earliest-occurrence assertion. This transcript is not claimed to be the actual production conversation's historical content.

## Verification commands and results

- `node --experimental-transform-types --test scripts/audits/ask-production-repair.cases.mjs scripts/audits/ask-conversational-v1.cases.mjs`: **74 passed** (10 new production-repair cases plus 64 retained cases), `tmp-production-focused.log`. Covers usable notes plus unresolved correction, Milo/Bruno reassignment, earliest matching versus occurrence, negative/preventive/uncertain reports, correction-limited follow-up, pet switching/explicit names/ambiguity, valid/invalid/refused/incomplete interpretations, private diagnostic sentinels, provider events and stage wiring, failures before/after interpretation, two-call admission, credit release/retry, and supported final facts with no unsupported writes. Retained cases cover mixed owner turns, genuine updates, safety, quantities, unsupported claims, deletion/forgetting and reloaded episode references.
- `npm test`: **2,291 passed**, `tmp-production-full.log`. Includes the callback wrapper and unchanged credit settlement/idempotency tests. Nested callback counts are separate from the default runner count.
- `npx tsc --noEmit`: passed, `tmp-production-typecheck.log`.
- `npm run lint`: passed with the same two existing unused `supabase` warnings in `persist-learnings.ts` at lines 141 and 374, `tmp-production-lint.log`.
- `npm run build`: production webpack build passed, `tmp-production-build.log`.
- `git diff --check`: passed. Original lifetime audit/fixtures and migration files unchanged.
- `node --experimental-transform-types --test scripts/audits/ask-lifetime-history.audit.mjs`: **14 passed / the same 3 failed**, `tmp-production-lifetime.log`: canonical episode window, sequence/recurrence identity, exact separate-episode aggregate. No expectations or fixtures were weakened to obtain passing results. Two conversational assertions were updated for the intended explicit-name precedence and newly specific interpretation stage; their safety expectations remain.

No browser check is presented as authenticated end-to-end validation. No authenticated HTTP-to-database/provider test or live production request was executed. External DB/provider calls were mocked; core interpretation, callback, correction processing, validation and final rendering were real. Provider admission/lifecycle/ledger functions were real with in-memory external stores; production settlement SQL was not executed.

## Limits and next step

The reported latest-history migration `20260906103706` and readiness were not reapplied or modified. This repair has no migration prerequisite beyond the already-required readers. Rollout and observing safe diagnostics remain separate authorized operations.

Normal turns still use one interpretation call and one answer call, with unchanged 2,600/4,096 output limits and provider timeouts. The repair adds small bounded context/telemetry fields, not a provider call. No live latency, dollar cost, model understanding or production recovery claim can be made from mocked results. Unlinked correction targets remain unknown; controlled synthesis remains limited; lexical retrieval and read-committed coverage cannot certify lifetime completeness. The exact live interpretation failure remains unverified.

Next step: make the separate local commit, export its review patch and release the process-aware lock. Do not push, merge or deploy. The final response supplies the exact repair commit and patch path. A later authorized production check must confirm the real conversation behavior and, if 503 recurs, inspect the new safe stage/reason rather than infer its cause from token usage alone.
