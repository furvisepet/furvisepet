# Ask session recovery and bounded ten-pet reads
Date: 2026-09-10. Offline validation; no new live accuracy score.

Session recovery:
- Refresh a token approaching expiry before sending Ask.
- Retry once only for HTTP 401 with AUTH_REQUIRED. The server returns this before request admission or paid provider work.
- Reuse the exact request body, logical-turn/idempotency key and 55-second deadline.
- Refuse recovery if the account changed or the session disappeared. Never automatically replay provider errors, rate limits or timeouts.
- Preserve the failed question and draft when sign-in is necessary.
- Reviewed Supabase getSession/refreshSession documentation and changelog; no SDK upgrade or server authorization relaxation.

Larger groups:
- Ordinary read-only history requests support up to ten owned pets. Mutation and episode scope limits stay separate.
- Split a maximum of twenty history pages across the cohort; preserve existing 64 candidate, 32 record, character and five-second retrieval bounds.
- Seed corrections in groups of at most three, within the existing six-call graph budget. A failed or incomplete graph still prevents verification.
- Reserve evidence across pets and local fact windows. Under pressure, ordinary historical cohort reads prefer each pet's last history source over sex/lifecycle profile details; species and separate safety context remain. Every omission is tracked as evidence loss.
- Support ten table/CSV rows and up to 41 review obligations (whole question plus four facts across ten pets).
- Require per-pet completion even if the planner omitted decomposition for a larger group.

Verification: seven session transport tests, one ten-pet retrieval/review/reload case, and one undecomposed-cohort case were added. The combined focused suite has 38 cases. Full offline tests, typecheck and lint pass (39 existing warnings, zero errors); whitespace checks pass.

Limits: ten-pet support is bounded retrieval, not an exhaustive lifetime guarantee. Large groups receive less evidence per pet and may need explicit limitations. Authentication and model behavior have not been exercised in a new paid production benchmark. Paid API spend: $0. Production history and frozen grades are unchanged.
