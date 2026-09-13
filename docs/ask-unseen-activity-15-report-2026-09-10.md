# Furvise unseen everyday 15 — September 10, 2026

**15/15 passed (100% on this set).** Zero partial answers, failures, application errors, silent failures or invalid cases. All questions were submitted once through the authenticated production web app using Furvise's existing API.

This is a designed, small everyday-history sample, not proof of 100% general reliability or of a population accuracy above 95%. It is not a retest of the previous three failures. Previous benchmark grades remain unchanged.

## Frozen conditions

- Questions, expected answers and source records committed and pushed before submission: `7b9e516`, branch `codex/ask-unseen-activity-15`.
- Production: `389395ec96c68744a9b42b681d55c6aeda6a5231` (PR #271), deployment `dpl_761FPmZNXYe7i3jenz9H1KUd3Bbv`.
- Fifteen new standalone conversations, all ten pets, selected records from November 2021 through June 2026.
- Questions cover activity/rest durations, arithmetic, a cross-pet comparison, food observations, household care and limits on what a record establishes.
- No exact duplicate among 111 retained user turns, or in checked benchmark documentation on origin/main, codex/ask-everyday-15, codex/ask-fresh-15-sep10, codex/ask-fresh-10-sep10 and codex/ask-novel-care-15. Deleted earlier conversations cannot be exhaustively verified.
- No retries, code edits, history edits, Save actions or Prepare actions during the run. Provider-internal calls are included in cost.
- First user message: 2026-09-10 03:36:01.579164+00. Last saved answer: 2026-09-10 03:42:48.08948+00.
- Grading used the frozen criteria and saved source records. Each visible first answer was reviewed, then reconciled to its persisted response. The results JSON stores persisted response payloads and retrieval context, not a raw HTTP capture.

## Per-question results

| # | Pet | Question | Result | Provider cost |
|---|---|---|---|---|
| 1 | Juniper | How long was Juniper's walk in November 2021, without the rest break? | PASS | $0.019656 |
| 2 | Pixel | What activity did Pixel do in February 2022, and for how long? | PASS | $0.016672 |
| 3 | Atlas | How much time did Atlas's July 2023 park walk and the rest afterwards take altogether? | PASS | $0.019513 |
| 4 | Mochi | Did Mochi spend longer playing or resting in March 2024? | PASS | $0.026883 |
| 5 | Clover | What sort of exercise did Clover get in August 2025? | PASS | $0.037253 |
| 6 | Ziggy | Does Ziggy's June 2026 activity timer include the rest break? | PASS | $0.021924 |
| 7 | Nori | Was Nori eating normally at the December 2021 food check? | PASS | $0.017454 |
| 8 | Pebble | Who noted how Pebble was eating in June 2022, and what did they see? | PASS | $0.017441 |
| 9 | Maple | What was Maple offered at the October 2023 food check? | PASS | $0.017073 |
| 10 | Cosmo | Where did we put Cosmo's resting mat in August 2024? | PASS | $0.016748 |
| 11 | Juniper | Who had more active time in January 2025, Juniper or Pixel, and by how much? | PASS | $0.032170 |
| 12 | Pixel | How long did Pixel rest after the January 2025 play session? | PASS | $0.019186 |
| 13 | Nori | Can you give me Nori's play time and rest time separately for May 2026? | PASS | $0.021149 |
| 14 | Pebble | Does Pebble's November 2024 activity note tell us how much exercise he got every day? | PASS | $0.019443 |
| 15 | Maple | Was the tangle in Maple's September 2022 brushing note a diagnosed skin problem? | PASS | $0.017133 |

## Answer checks

- November 2021 Juniper walk: 33 active minutes, separate rest excluded.
- Atlas walk plus rest: 36 + 2 = 38 minutes.
- Mochi play versus rest: 5 versus 2 minutes; play longer by 3.
- Juniper versus Pixel: 42 versus 15 active minutes; difference 27 minutes, qualified as recorded sessions rather than full-month totals.
- Ziggy's answer correctly excluded the 3-minute rest from the activity timer. Repeating the unasked 31-minute active duration was not needed to answer whether rest was included.
- Nori and Pebble food observations retained the correct observer and limited the claims to the documented checks.
- Pebble's single activity note was not treated as evidence of exercise every day.
- Maple's grooming tangle was not turned into a veterinary skin diagnosis.
- All other requested facts matched their source records. Full answers and sources are in the companion JSON.

## Cost and integrity

- **$0.319698 provider spend; 47 completed provider calls; 15 guarded operations.**
- Fifteen app credits completed, none released. Additional-spend cap was $0.75.
- Per-operation provider-ledger reconciliation agrees exactly with the daily delta: 146 → 193 calls; $1.177440 → $1.497138.
- All **3,729 history records unchanged**. Before and after fingerprint: `a818b7e428832495367e3fafb08e57f7`.
- Fingerprint method: `md5(string_agg(row_to_json(e)::text,'' order by id))` over all account care entries.
- Thirty new conversation messages: fifteen user questions and fifteen Furvise answers.
- Earlier 12/15 (80%) results remain separate. The different question mix prevents treating this as a controlled 20-point improvement.

