# Furvise production acceptance run — 2026-09-09

## Result

21/24 fully correct (87.5%), 1 partial, 2 errors. New questions: 17/20 fully correct (85%), 1 partial, 2 errors. Four known regression questions: 4/4 correct.

This small, targeted set is not a representative reliability estimate and does not establish 95% accuracy. All first attempts count. No manual retry replaced a result.

## Original overnight benchmark — preserved separately

The five-year benchmark remains **163/200 correct (81.5%), 15 partial, 17 failure, 5 error**. It used 1,169 synthetic records across Milo, Luna and Oscar. It exercised real models through the core pipeline with a synthetic adapter, not the production browser. A free-plan adapter bug was corrected and its 20 affected questions rerun without changing application code; invalid originals were retained. See archive PR #258 and docs/ask-five-year-benchmark-2026-09-09.md on codex/ask-five-year-results.

Neither this 24-question run nor any selected retests replace that 200-question score.

## Frozen production setup

- Application merge: 8637ce9fc8b5814dd11774f0cf921175cecd287f (PR #259).
- Production deployment: dpl_BvYzsY6K8iUJmnbZb5V4H7g62C7b, READY; www.furvise.com.
- Questions and expected criteria committed before first submission: d6dc6ca192fb1dd51cb96edac604bdfa032b4805 on codex/ask-production-24-results.
- Frozen question file: ask-production-24-frozen-2026-09-09.json.
- First-attempt archive: ask-production-24-attempts-2026-09-09.json.
- Browser execution: 2026-09-09 19:28–19:47 UTC. Production code unchanged during all 24 submissions.
- Cases 1–20 used fresh conversations; 21–24 used one continuing conversation.
- Fixture overlaps the overnight dataset. Four questions directly exercise known failures; the 20 new wordings are targeted acceptance checks, not a withheld random sample.
- Read-only questions; no Save or Prepare vet brief action clicked.
- Before/after History: 1,169 records; complete-row fingerprint e4f01af840175bbadff48bdaab0ad521 unchanged.
- Case 24 rendered exactly two list items (DOM count); plain-text capture omits bullet glyphs.

## Non-passing results

| Case | Grade | Observation |
| --- | --- | --- |
| 13 | Error | Shared treat-bag arithmetic request produced no answer. Runtime: ANSWER_GENERATION after three successful provider calls. Root cause not yet established by production logs. |
| 16 | Error | Mixed-currency fictional question produced no answer. Planner contract rejected with ASK_REQUEST_CONTRACT_PREMISE_SOURCE; no retry. |
| 17 | Partial | Correctly assigns headache to owner Jo. Names the reason Vale stayed home as unknown, but omits the explicitly required uncertainty about Vale's headache/health status. |

## Additional $5 budget

64 provider calls across exactly 24 guarded operations, all reconciled in runtime telemetry: **$0.357420**. Remaining from the new $5 allowance: **$4.642580**. This is application token-cost telemetry, not an invoice or a claim about ChatGPT account billing. No new API credential was created.

The original overnight expenditure is separate and is not subtracted again from the new $5 allowance.

## Deployed improvements

PR #259 added exact report-day retrieval recovery, currency-specific arithmetic dimensions, and preservation of attributed fictional dialogue through read-only answer validation. Before deployment: 2,466 tests passed, typecheck and changed-file lint passed; Security CI passed. This run observed all four frozen known-regression cases pass.

Further fixes and any post-fix retests must be reported separately without changing these first-attempt grades.
