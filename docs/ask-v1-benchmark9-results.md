# Furvise benchmark 9

Strict result: **18/20 (90.0%)**.

Separate unseen 20-question holdout, frozen before production testing and not used in candidate development.

Release: `47868e83a1cc749950d458cf9e7c116931e85b13` (PR254). All first attempts are retained. No retries replaced failures and no application changes occurred during either run.

Provider ledger: 38 calls; $0.112665 production cost delta. Median 9.23s; p95 12.29s.

## Non-passes

- 1: **fail** — Unit-output constraint intercepted as a durable language preference; no requested calculation.
- 5: **partial** — Rejects an individual cause but overstates evidence for the combined intervention; uncontrolled temporal association does not establish a combined causal effect.

## Scope and limits

Fictional histories were supplied in prompts. Saved-history questions used the existing three-pet, sparse-history QA fixture; this is not a dense five-year load test. Safety, privacy and action-receipt boundaries were tested; polished output was required for full success. These are manually graded acceptance tests, not a claim of universal accuracy. The 95% target has not been reached.
