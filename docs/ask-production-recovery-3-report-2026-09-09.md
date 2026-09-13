# Furvise production defect gate — 2026-09-09

## Outcome

**3/3 passed**, one production submission each for the original cases 13, 16 and 17. No manual retries, new questions or code changes during the gate.

| Original case | Original grade | Post-fix grade | Delivered answer |
| --- | --- | --- | --- |
| 13 | Error | Pass | 50 g bag decrease; shared treats and unmeasured individual intake prevent attribution to Milo alone. |
| 16 | Error | Pass | CAD and USD cannot be totaled as CAD without an exchange rate. |
| 17 | Partial | Pass | Jo had the headache; whether Vale had a headache is not established. |

This is a defect regression gate, not a reliability estimate. **The original 24-question result remains 21/24 (87.5%), one partial and two errors. The overnight 200-question result remains 163/200 (81.5%), 15 partial, 17 failures and five errors.** Neither score was overwritten or combined with these retests. No claim of 95% reliability is supported.

## What changed

PR #261: https://github.com/furvisepet/furvisepet/pull/261

- A deterministic real-pipeline reproduction failed with response_subject_disagreement when an authorized pet's reviewed note mentioned another owned pet. The final name guard confused a source-grounded incidental mention with a change of subject. It now exempts only immutable reviewed prose backed by cited sources inside the original authorized subject scope. Unsupported names, changed evidence, forged receipts and out-of-scope sources remain rejected. No retrieval or mutation scope is widened.
- A planner contract failing exact USER-premise provenance gets one admitted repair attempt from the original input. Every contract check still applies. Repeated provenance rejection, invented pets and mutation escalation remain failures. Production case 16 passed without triggering this repair; the repair path was exercised in deterministic tests. Original production logs establish a premise-source rejection, but do not retain the raw rejected quote, so its exact wording cannot be reconstructed.
- Planner and conversation instructions now require missing-information answers to address the requested subject and attribute explicitly. This fixed the observed case 17 response in this gate. It is a prompt improvement, not deterministic semantic enforcement or proof that every omission is eliminated.
- Failed final validation emits a specific safe operational code instead of only the coarse generation-stage code. No answer/source text is logged.

## Timeout and failure behavior

The application already had a 25-second planner timeout, a 50-second overall generation deadline, provider admission/time limits, an explicit user-visible failure state and AI-credit release. Those protections remain. Both original errors displayed a failure message; neither was a blank silent response. Original case 13 was not established as a timeout. The shared-source validator reproduction and successful post-fix retest support the identified failure mechanism, while the old production log itself recorded only ANSWER_GENERATION.

The repair is internal to one user attempt and counts against provider call, time and cost budgets. Rejected output is not converted into a successful answer or counted as correct.

## Verification and deployment

- 2,467 tests passed. The shared real-pipeline wrapper includes 111 passing cases.
- Typecheck passed. Changed-file lint: no errors, one pre-existing unused-variable warning.
- Security CI 34398352372 passed, including full tests, dependency audit and production build.
- Application head: 847508d92f0228dff816ac1d456c63cbecd7d522.
- Tested local and remote application tree: 469b59a49784c652b29486b19d0763391b171773.
- Production merge: a022d4c7d12f668795f66f37d99f6858e9ee3a62.
- Deployment: dpl_CxrF73neuN7QJGiefttPLXZQ55fC; READY with www.furvise.com alias before testing.
- Gate committed before submission: 10fee86e5247ba8972ce0b2c46ae2b7708d45853.
- Original question/criteria commit: d6dc6ca192fb1dd51cb96edac604bdfa032b4805.
- Execution: 20:04:49–20:06:45 UTC, 2026-09-09. Fresh Milo conversation for every question after reloading production.
- Before/after: 1,169 History records; full-row fingerprint e4f01af840175bbadff48bdaab0ad521 unchanged.
- No Save or Prepare vet brief actions.

## Additional $5 allowance

This gate: **$0.028203**, seven reconciled provider calls across three operations. No premise repair was invoked in these live attempts.

Prior 24-question run: $0.357420. Combined recorded spend from the new $5 allowance: **$0.385623**; remaining **$4.614377**. Figures are application token-cost telemetry, not invoices or ChatGPT subscription billing. Original overnight spend remains separate.

## Remaining evidence gap

The three known defects now pass this gate. The full frozen 200-question benchmark has not been rerun on this revision. Its 81.5% remains the broader measured baseline; this gate cannot establish launch-wide reliability.
