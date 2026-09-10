# Per-fact evidence and completion tracking
Date: 2026-09-10. Extends the shared architecture repair in PR #272.

Problem: advisory evidence needs had subjects and ordering, but no local calendar window. A matching record from another year could appear to cover a dated fact. Review validated completion items and then discarded them. One group obligation could also hide an unanswered pet.

Changes:
- Derive a local calendar window only from an unambiguous explicit date/month in the validated USER clause. Model-supplied windows are not accepted. Ambiguous, relative, open-ended and past/present comparisons keep the existing wider interpretation.
- Intersect each fact query with the authorized history interval. Inaccessible work is recorded as unavailable, separately from exhausted or budget-limited searches.
- Recompute per-fact coverage using only represented sources for the assigned pet and interval after evidence-budget changes.
- Build one original-question obligation plus separate obligations for each requested fact/pet. The original question remains authoritative when planner decomposition is incomplete.
- Preserve parsed answered/limited/missing records. An answered per-pet obligation must cite a usable source for that pet and interval; otherwise existing bounded repair and independent re-review apply.
- Retain completion details in the server-owned review receipt and carry them to validation diagnostics only while the validated answer body matches the reviewed text. Do not expose them as product prose or grant them write authority.
- Keep existing subject limits, source provenance checks, query budgets and provider-call caps.

Validation:
- Seven new unit regressions and two new network-blocked pipeline cases pass.
- The pipeline covers two pets with different historical months amid 160 distracting records, and deliberately false reviewer approval that credits one pet's record to another.
- Combined with the prior patch: 29 focused cases pass. Full npm test, TypeScript and ESLint pass; lint has 39 existing warnings and no errors. git diff --check passes.
- Paid API spend for this work: $0. Frozen production benchmark and account history were not modified.

Limits: semantic entailment, decomposition completeness and whether a limitation is justified still require model-assisted review. These checks enforce subject/time evidence boundaries, not a mathematical proof of the answer. Requests covering more than three pets and expired-session recovery remain separate work. No improved live score or production deployment is claimed.
