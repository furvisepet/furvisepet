# Shared pipeline validation results — 2026-09-09

## What this measures

Real OpenAI calls through the production interpretation, retrieval, generation,
review and presentation orchestration, backed by a **synthetic database**. This
is not an authenticated UI, Supabase, persistence or deployed production benchmark.
The prior production benchmark remains **46/100**.

The original fixtures contain 37 records across approximately three months and
187 across five years, with three renamed pets and evenly distributed distractors.
The final unseen fixtures contain 36 and 186 records respectively. A fixed
2026-09-15 clock controls relative dates. History span is not history density or
proof of subscription entitlement enforcement. The original travel fixture also
contains a profile/source pronoun inconsistency; original results are preserved.

## First attempts versus repeated diagnostics

All original output files remain intact. The diagnostic/recheck, holdout/regression,
fresh/confirmation, reasoning, canonical, repair, unseen-recheck, final-check and
JSON/schema-check phases must not be pooled into an accuracy percentage.
They span changing implementations, deliberate failure injection and repeated cases.

The last six **unseen first attempts** used new recurrence, feeder-quantity and
medication-history fixtures at both history lengths:

| Case | Three months | Five years |
| --- | --- | --- |
| Reconcile improvement with later limping | Meets requested answer | Meets requested answer |
| JSON with recorded grams, difference and unknown reason | Failed: malformed body / exhausted ordinary-call path | Meets requested answer |
| Completed medication versus unknown current medication | Incomplete fallback | Meets requested answer |

This is a manual assessment of **4/6** answer successes, not an independent overall
benchmark. It motivated shared boundary changes; it is not evidence of 67% product
accuracy. No successful synthetic read generated accepted care, memory or event
write proposals. Failed execution does not measure production persistence safety.

The medication case subsequently returned the completed medicine and explicitly
unknown current status after the relative-time/legacy-filter correction. JSON
remains a blocker: later repeated attempts produced an empty body, prose inside a
JSON-labelled response, or an incomplete JSON string. The server rejected these;
the latest schema-check still returned an incomplete sourced fallback. Do not
report this repeated case as fixed or count a safe fallback as task success.

## Repair and reviewer controls

- A supported table was accepted and a fabricated diagnosis rejected in a fixed
  mini-model control. Replays also demonstrated inconsistent format decisions.
- A separate three-draft GPT-5.4 calibration rejected unsupported duration wording,
  wrong-format prose and a fabricated diagnosis. This was calibration only;
  production model routing remains on the configured mini model.
- A real mini-model repair removed an injected cancer diagnosis and returned a
  supported table that passed independent re-review. Other repairs failed and
  correctly retained the fallback. One success does not establish repair accuracy.
- New offline tests verify that malformed rejection metadata cannot approve prose,
  repaired foreign citations/mutation fields are rejected, failed re-review cannot
  open another repair, and every admitted call is reserved and charged.

## Spend and verification

`ask-shared-live-budget.json` records 169 provider calls and a conservative
usage-derived cost estimate of **$1.03944025** for this work. Cached input discounts
are not deducted; this is not an invoice. Outstanding conservative reservations
bring the local reservation total to $1.4003455, below the $1.50 local stop. The
previous tracked application spend was $4.421515 under the shared $10 authorization.
No more live calls are needed to package this checkpoint.

The final full offline suite passes 2,441 tests (including 56 shared-path cases),
TypeScript and the no-upload production build pass, and targeted ESLint has zero
errors and one existing unused-variable warning. These are engineering checks,
not model-quality results.

## Remaining launch work

1. Make structured JSON composition reliable, preferably through a typed output
   representation rendered by the server, as already done for tables. Current
   free-text JSON generation remains unreliable despite format enforcement.
2. Independently test evidence completeness under dense histories, synonyms,
   cross-record conflicts, correction chains and multi-part retrieval needs.
3. Verify three-month/free and five-year/paid entitlement boundaries end to end.
4. Run a fresh graded UI benchmark against the deployed candidate, preserving
   first attempts, errors, latency, cost, source correctness and persistence effects.

PR #242 remains a draft. This checkpoint is neither a production deployment nor a
claim that the V1 quality gate has passed.
