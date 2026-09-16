# Ask reliability candidate — September 16, 2026

Status: initial fixes deployed in PR #494, main de0bb0c705d0140892e4201eb29a724c467e9e7b. Not launch-certified. Frozen production rerun: 19 passed / 2 failed / 5 weak; original baseline 10 / 9 / 7 (earliest-record grading correction below).

## Changes

- Read-only contracts discard contradictory save tasks and extraction frames. Provider schemas constrain references to supplied turn identities and prohibit resuming a nonexistent task.
- Standalone unnamed reads default to the selected pet instead of accepting an unsupported account-wide planner hint.
- A follow-up save can retain its subject through an immediately preceding database-confirmed save and resolved USER discourse. Selection or assistant wording alone cannot authorize it. Ambiguous animal groups and human references remain blocked.
- Chronology searches filter generic record vocabulary, and earliest/latest evidence needs execute even without lexical terms.
- Retrieval records required source identities before either budget. Prompt trimming protects them; missing required evidence prevents a complete/billable assessment, including after completion review. Duplicate budget metadata is omitted from provider transport.

## Verification

- Local full test runner: 2,484 passed, zero failed. Nested pipeline regression suites also passed.
- TypeScript and lint of changed application files passed.
- Real-provider parser diagnostic returned validated results without contract-repair loops on five diagnostic inputs. The isolated save-status question correctly lacked conversation context; this is not verification of the live readback case.
- Authenticated HTTP smoke was blocked on its first turn by `SERVICE_DAILY_LIMIT`, before any provider call or credit reservation. The newly created synthetic account was deleted successfully.
- Diagnostic server log: `daily_call_limit`; shared daily counter 181; cost 1,722,375 microdollars ($1.722375). The local test configuration permits 100 calls and $5 per day. No guard or counter was changed. This does not establish the production deployment's configured limits.

## Required release gates

The frozen suite is `scripts/audits/fixtures/ask-launch-frozen-26.json`. Rerun all 26 prompts verbatim in the application with the same subject/conversation sequence, after authenticated candidate verification is available. No manual retries or prompt rewrites. Keep the original scorecard and record latency, credits, and evidence for the new run.

Continuity (16–18), earliest record (6), and fresh evidence (22 and 24) must pass. A sharply reduced hard-failure count is necessary but does not alone establish launch readiness. The selected-pet-only criterion for question 5 remains a product-policy gate; this candidate still permits explicitly requested multi-pet reads.

The opt-in synthetic route smoke is `scripts/audits/ask-reliability-smoke.live.mjs`. It checks two pets, ordinary reads, chronology, save continuity, stored text, and current evidence among long older notes. It uses normal admission controls and cleans up its temporary account. It is additional diagnostic coverage, not a substitute for the frozen live suite.

## Verification continuation

The owner approved a temporary 400-call test limit while retaining the $5 daily cost cap. This is a process-only override on the isolated test server; stored configuration and production limits were not changed.

The first admitted seven-turn run returned HTTP 200 on every turn, saved both USER texts exactly once to Sable, and retained the fresh fatigue observation in the travel answer. It failed the readback check because deterministic receipt projection chose only the last referenced operation. The travel answer also included an unrelated earlier question and took 81.5 seconds, so that run was not a release pass.

The follow-up change projects every referenced receipt and removes unreferenced earlier questions from writer context. Local full tests (2,484), TypeScript, and changed-file lint pass. The repeat live readback returned both exact saved texts, with zero credits for the saves and readback. Full release verification remains pending.

Audit correction: the baseline question 6 expected Atlas's September 9, 2021 record, but `resolveAskHistoryAccess` restricts Plus retrieval to five years. On September 16, 2026 that record is outside the accessible window. The frozen question is unchanged; grade earliest retrieval against eligible records and disclose the access window. Do not count an excluded record as a retrieval failure or broaden subscription access to satisfy the test.


## Frozen production rerun

All 26 prompts were submitted verbatim through the authenticated production UI in seven conversations, without answer retries. All produced terminal persisted responses and no Retry error. Questions 5 and 24 fail; 1, 2, 3, 7 and 9 remain weak. Saves 16 and 17 stored the exact USER texts once each for Sable, and 18 returned both. Question 22 retained fatigue, reduced breakfast and normal drinking. Question 24 returned a non-answer fallback with zero credits.

Seven credits were charged (2, 4, 7, 9, 11, 12, 22). Partial-answer billing still needs work: questions 2, 7 and 9 were charged despite weak relevance or breadth. Median persisted-user-to-answer processing interval was 24.08 seconds, p95 59.73 seconds, maximum 70.93 seconds. This interval excludes browser polling overhead and is not exact end-to-end UI latency. Shared test budget after the run was 348 calls and $3.807899, within the approved 400/$5 ceiling.

The date-range parser follow-up addresses the question 24 trace: dates explicitly present in a shared-month range were rejected as unsupported. It binds only literal endpoints, preserves adjacent dose quantities, and does not infer intermediate dates, years or clinical meaning. Independent semantic review remains mandatory. Its live verification is separate from the frozen score above.

The smoke harness also now uses the application client timeout. Its earlier 90-second abort deleted the synthetic account while the server could still be processing; this changes test cleanup timing, not application timeouts.


## Remaining-mechanism follow-up, September 16

Interactive Ask now stops saved-history/profile requests outside the selected pet before executing a task or retrieving history, and releases the reserved credit. Pure writes retain their existing authorization rules. Empty lexical searches no longer override differently worded represented observations.

Broad temporal summaries distribute the existing query slots across the authorized interval and protect two candidate records per slice through trimming. Literal age cutoffs use the user's calendar; oldest-year/month queries resolve a provisional accessible boundary and reject it if source-version/correction validation cannot confirm it. Page, row, character and subscription limits are unchanged. These are bounded samples, not exhaustive histories. Unexhausted or omitted period candidates and missing requested transition candidates prevent a complete, billable outcome even if the model approves its answer.

Saved-note readback renders event dates in the same user timezone as evidence validation, avoiding a UTC-date mismatch that could trigger repairs. Independent review and the single repair limit remain unchanged.

Local validation: 2,491 tests pass, including route-level credit release, temporal sampling, literal cutoffs, lexical-receipt authority and completion gates; TypeScript passes. No provider calls were made for implementation or these tests. Production verification is pending; this is not a new frozen-26 score or a claim that every latency issue is resolved.


### Targeted live follow-up and cost boundary

PR 496 passed full CI and deployed. Live pet-boundary refusal took 5.31 seconds, one provider call and zero credits; mobility evidence no longer contradicted the platform observations (21.90 seconds, three calls, one credit). Multi-year coverage reached 2021–2024 with zero credits but still took 63.56 seconds after a rejected draft. Oldest-year coverage reached November and December, explicitly partial, at 28.33 seconds and zero credits.

The food-change probe still published an unsupported event interpretation despite releasing the credit. PR 497 closes that final-publication gap. A late-thread readback also exposed UTC today and inventory/count precedence issues: planning now uses the user calendar and count projection cannot displace requested text or receipts. Full CI passed. Subsequent live food-change checks returned scoped uncertainty for Sable and Rowan; an explicitly disambiguated readback returned both exact saved texts. The latter is a diagnostic, not a rerun of the immediate frozen save/readback sequence.

The missing-event limitation is now projected before answer generation and declines semantic review because no care fact or model prose will be published. Interpretation, retrieval, ownership, access limits, emergency priority, final validation and credit release remain enforced. No factual answer inherits this exception. Local full tests (2,491), including zero generation/review calls for this path, pass. This removes calls previously spent composing and repairing an answer the server must withhold. CI and a live latency check are pending for this final optimization.

The frozen 26 score is unchanged by these separate targeted checks. Broad-summary repair latency and exhaustive-history coverage remain limitations; do not declare launch-ready or 26/26 from this follow-up.

## September 16: bounded receipt continuity and smaller repair requests

Recovered up to four saved-note source references beyond the 12-message dialogue window with one bounded owner/pet/conversation join. Discovery is reference-only: current receipt lineage is re-read, deleted sources are suppressed, historical access is checked, and recovered references cannot authorize new note mutations or become current factual premises. No migration or model call is added by recovery. The production read-only join returned both original saved sources in the long-running test conversation.

Prose repairs now send only additional citations; server-held accessible original citations are inherited before strict parsing. Unknown proposed citations remain visible to independent review. Removed duplicated request/task metadata from reviewer input. All factual review and model settings remain intact; latency improvement requires live measurement.

Validation: 2,497 offline tests passed, plus the new context-lineage wrapper covering window recovery, deletion, and access. Typecheck passes; changed-file ESLint has no errors (one pre-existing unused-parameter warning). No paid model calls during implementation. Targeted production verification follows CI/deployment; this is not a new full 26-prompt certification.

### Targeted production findings after PR499

The recovered-readback check returned both exact original notes beyond the dialogue window, but also projected empty receipts for earlier readback questions. The follow-up fix leaves mixed linked/unlinked operations to attributed generation and independent review, preserving every receipt rather than silently dropping a possibly unconfirmed save. Single-entry receipt grammar is corrected.

The frozen Q7 prompt on Atlas still required repair: 74.836 seconds, a disclosed partial answer, and zero credits. The reviewer rejected an unsupported interpretation initially and an unsupported attribution after repair. Payload compaction is not a demonstrated latency fix. No further broad API sampling is justified under the remaining daily budget. Continued work must improve first-pass evidence attribution and retrieval coverage without removing factual review or pretending sampled history is complete.
