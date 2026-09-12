# Furvise — 15 new live questions, 2026-09-12

**Result: 7 passed, 8 failed (46.7% complete success), all first attempts.** Three terminal errors (Q2, Q6, Q9); five incomplete-answer fallbacks (Q3, Q4, Q8, Q10, Q15). No retries or code changes were made during this audit. This broader run does not support launch readiness for Ask.

Account: gwaraich604@gmail.com. Production deployment: dpl_9awVu6kYatM6CveX3p1ofF6vBsHF, commit dae353fb36f147c08fd4b07493f44c96fb24221a (PR #325). Live run: 2026-09-12T02:13:48.431Z through 2026-09-12T02:25:09.186Z.

Conversation: https://www.furvise.com/ask?conversation=0c03bf76-beae-428b-a8c5-ed6b87317b11

Method: one continued conversation, initially Rowan selected; explicitly named subjects and follow-ups intentionally vary across pets. This tests realistic conversation carryover, not isolated fresh-prompt performance. Question 1's navigation card was clicked and opened Sable-filtered History; the audit then returned to the same conversation. Answer keys came from direct database inspection of this internal account. No pet-name-specific implementation changes were made.

| # | Scenario | First attempt |
|---|---|---|
| 1 | Navigation plus two-sentence explanation | pass |
| 2 | Episode count, dates and day gaps | fail |
| 3 | Cross-pet historical comparison | fail |
| 4 | Exact record count with explicit interval | fail |
| 5 | Exact-note JSON export | pass |
| 6 | Retrieved total and arithmetic mean | fail |
| 7 | Three-note save for named pet | pass |
| 8 | Receipt follow-up | fail |
| 9 | Single-record correction | fail |
| 10 | Retrieval after correction attempt | fail |
| 11 | Two-pet strict profile JSON | pass |
| 12 | Hypothetical signed/percentage arithmetic | pass |
| 13 | Unstored profile field | pass |
| 14 | Historical causation uncertainty | pass |
| 15 | Constrained vet-preparation summary | fail |

## Integrity and persistence checks

- All 15 user turns and 12 assistant turns are stored. Three terminal failures produced no assistant turn; five fallback answers are stored but count as failed tasks, not passes.
- All 27 browser conversation articles survived reload unchanged.
- Exactly three new care entries were created, all for Sable, matching Q7. No new furvise_memories or dog_memories rows were created during this run.
- Q7 shared source message: 9e82024c-b156-4597-b4fc-4d3940561b1f.
- Saved care IDs: March 2 / 11 minutes = 39f232e9-ab71-46c8-92b1-4aef57d6ddb4; March 5 / 14 minutes = de8e3cf6-12a2-4ab7-9d52-be7e1d51381b; March 8 / 17 minutes = f87d7771-c171-4664-8e74-1edaee755be6.
- After Q9, all three original notes remained active; the 14-minute observation was not changed. Q10 therefore has a failed prerequisite, which is retained explicitly in its audit result rather than treated as independent evidence of a corrected-record arithmetic failure.
- Q5 and Q11 response bodies parsed as JSON; the UI's Furvise/Copy labels were excluded from the parsed response text.

## Observed diagnostic evidence

These are production failure classifications and review observations, not a proven complete root-cause analysis.

- Q2: RESPONSE_SERIALIZATION (HTTP 503). Earlier history review had reviewerApproved=true and valid anchors, but formatValid=false and containerValid=false. Request 321b1429-6f22-43c2-b767-abff1b4fec6f.
- Q6: ASK_TASK_INCOMPLETE_OBLIGATIONS_UNKNOWN (HTTP 503).
- Q9: ASK_SEMANTIC_WRITE_REJECTED (HTTP 503); the same request also logged ASK_OPTIONAL_CONTEXT_UNAVAILABLE. No correction was applied.
- Q3: initial history review showed invalid sentence anchor(s), formatValid=false, anchorsValid=false; repair still rejected.
- Q4 and Q8: history-review rejection remained after repair despite format/container/anchor flags being valid in the later review. More detailed tracing is required to establish why completion was rejected.
- Q10: review included publication_changed_text, with formatValid=false and an invalid sentence. It returned an incomplete fallback.
- Q15: visible incomplete fallback with a Prepare vet brief link despite the request asking only for a short preparation summary. The link was not clicked; this run does not claim a Vet Brief was created.

## What this changes about the prior acceptance conclusion

The earlier ten-question run and four-case matrix passed their tested scenarios. These 15 new prompts expose broader failures in combined episode/count/calculation output, differently phrased exact counts, cross-pet comparison, receipt follow-ups, correction execution, and constrained summaries. Successful retrieval or a safe fallback is insufficient when the requested task remains unfinished. The remaining repair must address shared interpretation, evidence, review, publication and mutation contracts, and be verified against both suites without weakening factual safeguards.

## Full questions and observed responses

### Q1: Navigation plus two-sentence explanation — pass

Prompt:

Open Sable’s history and explain, in two sentences, why four symptom notes do not necessarily mean four illness episodes. Save nothing.

Expected / audit:

Correct Sable history link and exactly two explanatory sentences; link clicked and destination verified.

Observed at 2026-09-12T02:14:34.026Z:

Furvise

Her four symptom notes don’t have to mean four separate illness episodes because a single episode can generate more than one note, like when it starts and later resolves. In her history, the February vomiting episode and the June vomiting episode each have paired start and stop notes, so the note count is higher than the episode count.

Copy

Open Sable's history

Open this Furvise page.

Open

### Q2: Episode count, dates and day gaps — fail

Prompt:

For Sable in 2024, how many distinct vomiting episodes are supported by the saved history? List each start and stop date separately and calculate each calendar-day gap. Save nothing.

Expected / audit:

Two episodes: February 1–3 and June 9–11, 2024, each with a two-calendar-day gap.

Observed at 2026-09-12T02:15:48.930Z:

Furvise couldn't finish that answerFurvise couldn't finish that answer just now. Your question is still here, so you can try again safely. No AI credit was used.Try again

### Q3: Cross-pet historical comparison — fail

Prompt:

Compare Rowan and Sable during June 2024: whose saved history documents vomiting then? Do not interpret missing records as proof that the other pet was healthy. Save nothing.

Expected / audit:

Sable has June 9/11 vomiting notes; Rowan has no June vomiting records in the available care history. Missing records must not establish health.

Observed at 2026-09-12T02:16:29.524Z:

Furvise

I'm sorry, I couldn't finish answering that from your pets' history. You can check a few of the notes I found below, but they aren't a full answer.

View saved notes
Copy

### Q4: Exact record count with explicit interval — fail

Prompt:

As of this lookup, count Rowan’s active saved care-history records from April 1, 2026 inclusive to May 1, 2026 exclusive. Give the exact database count, interval, and as-of time. Save nothing.

Expected / audit:

Exactly four active notes in [2026-04-01, 2026-05-01), plus lookup as-of time.

Observed at 2026-09-12T02:17:06.184Z:

Furvise

I'm sorry, I couldn't finish answering that from Rowan's history. You can check a few of the notes I found below, but they aren't a full answer.

View saved notes
Copy

### Q5: Exact-note JSON export — pass

Prompt:

Return JSON only: an array of Rowan’s saved April 2026 breakfast notes with fields recorded_date and exact_note. Include all four and preserve each complete note verbatim. Save nothing.

Expected / audit:

Four JSON objects with exact complete text and dates. JSON.parse succeeded and values matched database.

Observed at 2026-09-12T02:17:50.785Z:

Furvise

[{"recorded_date":"2026-04-03","exact_note":"April 3, 2026: ate 31 g of usual food at breakfast."},{"recorded_date":"2026-04-06","exact_note":"April 6, 2026: ate 34 g of usual food at breakfast."},{"recorded_date":"2026-04-09","exact_note":"April 9, 2026: ate 36 g of usual food at breakfast."},{"recorded_date":"2026-04-12","exact_note":"April 12, 2026: ate 39 g of usual food at breakfast."}]

Copy

### Q6: Retrieved total and arithmetic mean — fail

Prompt:

Using those four April breakfast amounts, calculate the total grams and arithmetic mean per recorded breakfast. Do not describe this as daily intake or infer calories. Save nothing.

Expected / audit:

140 g total; 35 g mean per recorded breakfast; no daily intake or calorie inference.

Observed at 2026-09-12T02:18:29.935Z:

Furvise couldn't finish that answerFurvise couldn't finish that answer just now. Your question is still here, so you can try again safely. No AI credit was used.Try again

### Q7: Three-note save for named pet — pass

Prompt:

For Sable, save exactly three separate care notes: March 2, 2026: walked for 11 minutes. March 5, 2026: walked for 14 minutes. March 8, 2026: walked for 17 minutes.

Expected / audit:

Three Sable notes dated March 2/5/8, with 11/14/17 minutes; database verified all three and common receipt source.

Observed at 2026-09-12T02:19:13.620Z:

Furvise

Prepared three care notes for Sable: - March 2, 2026: walked for 11 minutes. - March 5, 2026: walked for 14 minutes. - March 8, 2026: walked for 17 minutes.

Copy

Added 3 updates to care history

### Q8: Receipt follow-up — fail

Prompt:

Check the receipts for my preceding three-note save. Give every saved date and full note text, and explicitly say whether all three succeeded. Do not save them again.

Expected / audit:

All three dates and exact notes, explicitly all saved; no repeat writes.

Observed at 2026-09-12T02:20:13.649Z:

Furvise

I'm sorry, I couldn't finish answering that from Sable's history. You can check a few of the notes I found below, but they aren't a full answer.

View saved notes
Copy

### Q9: Single-record correction — fail

Prompt:

Correct Sable’s March 5, 2026 walking note: it was 16 minutes, not 14 minutes. Change only that observation and retain March 5 as its date.

Expected / audit:

Update only March 5 from 14 to 16 minutes, preserve date. Request failed; database retains original 14-minute row.

Observed at 2026-09-12T02:21:18.396Z:

Furvise couldn't finish that answerFurvise couldn't finish that answer just now. Your question is still here, so you can try again safely. No AI credit was used.Try again

### Q10: Retrieval after correction attempt — fail

Prompt:

Retrieve Sable’s March 2026 walking records after that correction. List the dates and current durations, and calculate the total minutes. Do not include the superseded 14-minute value in the total. Save nothing.

Expected / audit:

Desired workflow: corrected values 11/16/17 total 44. Since Q9 actually failed, response must acknowledge correction was not saved and distinguish stored data (11/14/17, total 42) from proposed corrected total. Returned neither explanation nor requested output.

Observed at 2026-09-12T02:22:04.479Z:

Furvise

I'm sorry, I couldn't finish answering that from Sable's history. You can check a few of the notes I found below, but they aren't a full answer.

View saved notes
Copy

### Q11: Two-pet strict profile JSON — pass

Prompt:

Give JSON only with one object for Rowan and one for Sable containing name, species, and sex from their saved profiles. Do not copy a field from one pet to the other. Save nothing.

Expected / audit:

Rowan dog/male, Sable dog/female, separate named objects. JSON.parse succeeded.

Observed at 2026-09-12T02:22:40.857Z:

Furvise

{"Rowan":{"name":"Rowan","species":"dog","sex":"male"},"Sable":{"name":"Sable","species":"dog","sex":"female"}}

Copy

### Q12: Hypothetical signed/percentage arithmetic — pass

Prompt:

Hypothetical only: a pet weighed 8.4 kg and later 8.1 kg. Give the signed change in kilograms and percentage change from the first weight, rounded to two decimal places. This is not about any of my pets; save nothing.

Expected / audit:

-0.30 kg and -3.57%; hypothetical, no saved facts.

Observed at 2026-09-12T02:23:16.091Z:

Furvise

Hypothetical only: the signed change is -0.30 kg. The percentage change from 8.4 kg is -3.57%.

Copy

### Q13: Unstored profile field — pass

Prompt:

What is Mochi’s microchip number according to the saved profile? If the exact value is not stored, say it is unavailable; do not guess or use another pet’s identifier. Save nothing.

Expected / audit:

Unavailable in saved profile; no fabricated identifier.

Observed at 2026-09-12T02:23:49.172Z:

Furvise

Mochi’s microchip number is unavailable in the saved profile records I can see, so I can’t give an exact value.

Copy

### Q14: Historical causation uncertainty — pass

Prompt:

Does Sable’s history prove that the June 2024 vomiting was caused by the same thing as the February 2024 episode? Separate recorded timing from any established cause. Save nothing.

Expected / audit:

All four dates correctly reported; no common cause established.

Observed at 2026-09-12T02:24:32.141Z:

Furvise

No. Sable’s notes show two separate vomiting episodes, one starting on 2024-02-01 and another as a new, separate episode on 2024-06-09. They also show each episode later stopped, on 2024-02-03 and 2024-06-11.
That timing does not prove the June episode was caused by the same thing as the February one. The notes don’t say why either episode happened, so the cause is not established here.

Copy

### Q15: Constrained vet-preparation summary — fail

Prompt:

For a vet-visit preparation note, summarize only Sable’s two documented 2024 vomiting episodes in at most 80 words, include all four dates, and give two questions to ask the vet about possible causes. Do not diagnose, create a Vet Brief, or save anything.

Expected / audit:

At most 80 words, all four dates and two vet questions, no diagnosis or writes. Returned fallback plus an unsolicited Prepare vet brief link; no link was activated.

Observed at 2026-09-12T02:25:09.186Z:

Furvise

I'm sorry, I couldn't finish answering that from Sable's history. You can check a few of the notes I found below, but they aren't a full answer.

View saved notes
Prepare vet brief
Copy

This is a test report only. No fixes are claimed for failures discovered in this round.
