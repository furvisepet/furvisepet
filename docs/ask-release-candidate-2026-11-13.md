# Furvise Ask release-candidate follow-through — 2026-11-13 (Vancouver)
Status: **NO-GO for production promotion; paid/model qualification remains stopped.**
This iteration starts at PR #530 head aff7595cb55c907b63bb5f538af0d195f5df01ba, not #529. The candidate commit is pinned in PR #530 and its Vercel deployment; this file and the local-check manifest are part of that commit.

## Concrete repair
The original terminal failure was a 60,017 ms second provider-call timeout after an estimated 19,422 input tokens. It did not return an answer, usage, response ID or provider request ID. No claim is made that the timeout's upstream cause is proven or that it has passed a live retest.

The active read-only wire now uses the repository's existing exact schema factoring and local-reference compaction. It shares only identical schema nodes; expanded schemas retain every constraint, annotation, enum literal, source/measurement handle, property order and required field. Source bodies, pet/owner binding, quotes, dates, tool scope, clinical rules and native dialogue stay intact. Both selection and answer phases are covered. External/nested/recursive unsupported reference scopes retain the existing fail-safe behavior of that utility. No source cap, output cap, provider timeout, model, retry policy or two-call allowance was raised.

The deterministic 32-admitted/36-examined fixture measured:
|Wire|Schema characters before → after|Whole request characters before → after|
|---|---:|---:|
|Selection|7,301 → 6,758|7,988 → 7,445|
|Answer|11,108 → 8,446|20,661 → 17,999|

These are exact fixture sizes, not measured provider tokens or a live latency result. The fixture uses a short instruction string; its percentage reduction must not be applied to the old live request. Every original admitted body is compared intact.

Each admitted physical request also receives a new random X-Client-Request-Id, logged with non-content request-size diagnostics on start/success/failure. This enables future support lookup when no provider response header arrives; it does not recover the old call or constitute a billing receipt. Official reference: https://developers.openai.com/api/reference/overview#debugging-requests
A real adapter regression verifies one local timeout, SDK signal cancellation, one failure, preserved lookup ID and rejection of late success with no retry. Cancellation remains advisory; abort is not proof that upstream work or billing stopped.

## Contract and fixture repairs
Previously failing route fixtures returned retired function calls or plain narration where the current first-pass JSON contract is required. Shared fixtures now validate their exact response against the actual wire schema before the real decoder, binder, core, publication and settlement run. Negative tests deliberately keep malformed/foreign inputs so they continue to fail closed.

The complete 85-test legacy read-only file is now green. Its prior 12 failures were already verified on both exact #529 and aff7595c; none was newly attributed to this wire patch. Corrections use explicit body-weight/length meaning, bounded-page arithmetic, current strict selection, disjoint lexical-complement lanes, labeled server-calculation output, owned display handles without private identities, and current public citation numbering. Reserved opaque source handles remain rejected; ordinary symbolic-label tests use non-reserved labels. No production source/metric/ID guard was weakened.

Public route cancellation and input-budget fixtures now assert current capability refusal, two physical mocked calls, durable publication before credit settlement, no history for unrelated requests, no saved mutation and honest bounded dialogue in native roles. A standalone question does not acquire an irrelevant earlier-context warning. The retired mutation-closure audit is replaced by the actual public POST fixture; foreign handles, disabled writes and unmatched conversation references stay blocked.

Additional inherited publication and security-fixture failures were reproduced separately on immutable aff before repair. Safe provider errors now test the actual first-pass text.format.schema, not absent tools, and call-2 failure tests first supply a valid call-1 selection. Mixed unavailable-write plus history tests retain independent task completion and exact original quotations.

## Complete local verification
Primary Linux execution remained unavailable. Work used a clean new Windows git worktree rc-1114q under the owned isolated Ask workspace, with existing matching dependencies and no package install/upgrade. The dirty shared checkout and PR #531 branch/workspace were untouched. PR #531 was observed draft at ef665e1a81e8bfebf148a91bf7722b26970255c1; no runner activation, autostart, required-check migration or merge was performed.

|Check|Complete result|
|---|---|
|28-file active Ask suite, serial|415 PASS / 0 FAIL / 0 skipped / 0 cancelled|
|Entire package.json test:security command, serial|517 PASS / 0 FAIL / 0 skipped / 0 cancelled|
|Initial wire/schema/deadline focused suite|40/40 PASS|
|TypeScript --noEmit|PASS|
|Scoped ESLint (all changed source/tests)|PASS|
|git diff --check|PASS|
|Next.js 16.4.5 optimized production build|PASS; TypeScript complete, all 44 static pages generated|

Counts overlap and must not be added as unique tests. Tests use injected offline provider/DB fixtures; simulated accounting is not live spend. Exact commands, source hashes and log hashes are in ask-rc-local-verification-2026-11-13.json.

All failed attempts remain in the Windows evidence directory:
- Initial ten-file aff baseline: 115/137 PASS, 22 FAIL. This includes the inherited legacy interpretation-input-budget and lifecycle-role file failures, not a green full repository run.
- First expanded 28-file run: 411/415 PASS, four inherited fixture/audit failures; repaired and reproduced on aff.
- Next concurrent run: one clinical-policy test process exited without assertion output (367/368 PASS). Its isolated serial rerun and full final serial suite pass; this does not prove the underlying Windows runtime failure resolved universally.
- First complete security run: 513/517 PASS, four stale SDK-fixture failures; repaired. The two affected files had five failures on aff, including another fixture fixed by the shared-helper repair.

The full roughly 510-file repository suite is **NOT certified green**. Legacy interpretation-budget/lifecycle baseline failures remain outside this read-only-path repair; no green result is borrowed from PR #531 or GitHub. GitHub-hosted required CI remains blocked by account billing/quota. Local success does not migrate or bypass required checks.

## Billing hard stop and live evidence
Original request: cef62193-955d-4278-9d9d-2a180268f87f.
Original physical operation: 0c425bc762024c82caa290d6ec0420e41c7d02b79b7c3fca237070aa2e6165c4.
Call1 actual = 8,946 microUSD. Call2 actual remains **NULL**, reservation 25,800 microUSD. Terminal FAILED_FINAL and owner-credit release do not reconcile actual provider cost.
The exact original Vercel logs and backend receipt were re-read. No provider request ID or usage appeared. An existing OpenAI Platform session displayed older Furvise logs; a focused original-prompt search remained loading during bounded inspection. No matching authoritative billing receipt was recovered; account-wide absence or zero billing is not inferred. The Platform connector offers no supported per-request usage recovery tool.

No new paid Ask or clinical prompt was submitted. Prior session remains **48 submissions: 30 PASS / 9 PARTIAL / 9 FAIL; 45 answers plus three explicit errors; 96 physical attempts; 95 known actual receipts, $0.862480 known plus one unknown**. The new candidate has zero paid turns; older passes do not qualify it.

Original turn48 prompt, UI failures, source acquisition, persisted events, per-SHA outcomes, 96-call ledger and prior spend remain in the attached checkpoint:
https://github.com/user-attachments/files/34829247/Furvise-Ask-Qualification-48-Turn-Addendum-2026-11-13.md
The two observed error presentations are retained in the preceding PR checkpoint. No failed prompt was relabeled as a fresh holdout or replayed.

## Read-only database integrity and safety
Supabase sxavgqzwfahljdvmisyq was rechecked ACTIVE_HEALTHY. One read-only snapshot showed 12 connections and zero lock waiters. No memory setting, capacity, migration, grant or owner row was changed.
Whole-owner fingerprints still match:
- 6 profiles: c29fe2746122f9b7a16c25f48c22c146
- 628 care rows: 886c2b444c0457242f7f60360514dc33
- live update_my_care_entry definition: 2e149028b12fb3d2668685459914dc8a

The existing #530 PT409 migrations remain included. The live two-raise SQLSTATE 40001 → PT409 repair is unchanged; no live SQL write or function replacement was executed.

The frozen AVMA/FDA occurrence/medication rubric remains unchanged. Current emergency, future IF, recovered historical and negated scenarios, medication no-authority boundaries, source-grounded summaries, continuation, pet/year correction, multi-pet math and dialogue persistence have deterministic regression coverage. That proves the bounded code contracts on fixtures, not new model recognition or veterinary accuracy. All final-candidate live clinical cases remain unverified.

## Release gates still open
The original call2 actual-cost receipt must be recovered accurately, OR G must separately and explicitly authorize proceeding despite unknown billing, before any new paid/model cohort. No such override was given in this directive.
Then qualify a genuinely fresh final-SHA signed-in cohort: useful whole collection 32/36, actual omitted four and integrated one-time evidence; exact quotes/dates; pet/year correction; two-pet labeled math; concise attributed brief; Today/History photo-note guidance; routine constraints, interruption and reload; current/past/future emergency and unknown medicine/mixed questions under the frozen rubric.
READY preview and complete local checks do not replace that cohort. The full repository/required-CI limits also remain visible. No production merge or promotion is authorized.
