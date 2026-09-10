# Furvise fresh 10-question production benchmark — September 10, 2026

**8/10 passed (80%): 0 partial, 1 factual failure, 1 app error.** All ten first submissions were observed in the live app. No retries or replacement cases.

Production remained at `fe48734e0fbefac03407d76f9c3551ba433481c8`, deployment `dpl_9JteLcv5KikeCEuhZ4VesAnHV2HG`. Questions and required facts were committed at `7d9060d33f621d6b28bfc3cdfdcd3cb470370ec5` before submission. All expected records were inside the current Plus window beginning September 10, 2021. Dates not asked for were explicitly optional where appropriate.

| # | Question | Grade |
| --- | --- | --- |
| 1 | How does Clover's hay now compare with what we fed in 2022? | pass |
| 2 | What reason did we record for Maple's switch to the current food? | error |
| 3 | What was Nori's weight on September 9 in 2023? | pass |
| 4 | Was any medicine prescribed at Pixel's July 2022 vet visit? | pass |
| 5 | How much did Atlas weigh at the January 2022 weigh-in? | pass |
| 6 | Remind me which food Mochi is on these days. | pass |
| 7 | Is Juniper lighter now than on September 9, 2022, and by how much? | fail |
| 8 | What were the start and finish dates for Ziggy's food change in 2024? | pass |
| 9 | What kind of hay was Pebble offered in October 2021? | pass |
| 10 | Does Cosmo's 2026 checkup prove there have never been any health problems? | pass |

## Failure details

- **Maple (2): error.** The UI reported that Furvise could not finish. Vercel recorded `RESPONSE_SERIALIZATION`. Three provider calls completed, but no assistant answer persisted. The app credit was released. No retry was attempted.
- **Juniper (7): fail.** The answer used the current 18.6 kg but said the September 9, 2022 weight was unavailable. That accessible record contains 19.51 kg, so the required answer was 0.91 kg lighter. The response also displayed raw JSON although no structured format was requested.

The exact serialization condition and Juniper's complete internal failure path remain unconfirmed. The previous prose-format fixes have not eliminated unsolicited JSON across all live paths.

## Successful cases and presentation

Clover's past/current hay comparison included both endpoints. Nori's dated weight appeared as prose. Pixel's medication answer stayed scoped to the visit. Atlas's January measurement and extra February-correction claim were verified. Mochi's current food was correct, but the long list of dates was unnecessarily verbose; every extra date was verified. Ziggy's transition start and completion passed, as did Pebble's 2021 food recall. Cosmo correctly rejected a lifetime-health inference; its extra mobility observations were verified against the saved March 2026 records.

## Cost and integrity

**$0.311717**, 36 completed provider calls, 10 guarded operations: 9 completed app credits and 1 released credit. The failed Maple operation still incurred $0.025396 in provider spend. This distinction is preserved in telemetry.

Operation totals exactly matched daily counters: 64 to 100 calls and 556,502 to 868,219 microdollars. Database persistence contains 10 user turns and 9 assistant answers, consistent with the single terminal error.

All 3,729 history records remained unchanged, with fingerprint `4ef19ccd440b5664850fe760565d4729` before and after. No Save or Prepare action was invoked. No production changes occurred during the run.

## Interpretation

This is a small designed set covering ten pets and familiar categories with fresh wording. It is not representative reliability evidence or a controlled before/after comparison with the earlier 15-question set. There are no invalid expected-access cases in this run. Earlier grades remain unchanged. 95% reliability is not established; a terminal error on an ordinary question remains a production defect.
