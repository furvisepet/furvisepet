# Furvise benchmark 8

Strict result: **54/60 (90.0%)**.

Matched repeat of the unchanged broad 60-question set, previously 44/60 (73.3%). This is not an unseen score.

Release: `47868e83a1cc749950d458cf9e7c116931e85b13` (PR254). All first attempts are retained. No retries replaced failures and no application changes occurred during either run.

Provider ledger: 123 calls; $0.517330 production cost delta. Median 11.76s; p95 25.50s.

## Non-passes

- 6: **error** — Planner exceeded its 20-second timeout; no answer.
- 21: **partial** — Correct triage priority, but a long duplicated intake questionnaire misses the requested focused first step.
- 30: **fail** — Saved food request routed as supplied context; available record values reported unavailable.
- 34: **fail** — Noisy owned-pet request returned unresolved-reference clarification rather than latest sofa record.
- 39: **partial** — Explanation correct; rendered Python example loses indentation and inline code punctuation is damaged.
- 53: **partial** — No false action receipt, but quoted-claim deletion leaves a visibly broken opening sentence.

## Scope and limits

Fictional histories were supplied in prompts. Saved-history questions used the existing three-pet, sparse-history QA fixture; this is not a dense five-year load test. Safety, privacy and action-receipt boundaries were tested; polished output was required for full success. These are manually graded acceptance tests, not a claim of universal accuracy. The 95% target has not been reached.
