# Two production transition checks — September 10, 2026

**1 pass, 1 fail.** Two first-attempt submissions through the live Ask UI, fresh conversations, no retries. Questions and grading frozen at `5bbc7cb` before submission. Production commit: `e1591710fc8ecfa028a8814a15cf33ff3fafc3d2`.

| Pet | Result | Observed answer |
| --- | --- | --- |
| Juniper | Fail | Could not verify a complete answer; returned a September 2026 profile/food excerpt instead of the December 2023 transition dates. |
| Pixel | Pass | Correctly identified transition start July 9, 2024 and completion July 16, 2024. |

Juniper's saved coverage reaches the December 9, 2023 transition start in candidate traversal. It reports correction uncertainty and evidence-budget loss; the terminal answer uses source-excerpt fallback. The saved summary does not reveal the exact planner/reviewer rejection. This is a substantive-answer failure, not a blank output or transport error. The production defect is not fully resolved.

Cost: **$0.090671**, ten provider calls, all completed and reconciled. Juniper $0.048903; Pixel $0.041768. Operation totals match the daily counter increase exactly. Internal repair calls are included.

All 3,729 history records remained unchanged: fingerprint `4ef19ccd440b5664850fe760565d4729` before and after. No Save or Prepare actions. No code or fixture edits during measurement.

The previous 13/15 grade remains unchanged. Combining its thirteen passes with later repairs would not constitute a new 15/15 benchmark. This two-case run does not establish 95% reliability.
