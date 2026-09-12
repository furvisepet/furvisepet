# Furvise internal-account production acceptance audit

Date: September 12, 2026 (UTC)

## Verdict

**Not ready to approve from this run: 3 pass, 3 partial, 4 fail.** Ten first-attempt prompts were submitted through the live Ask interface. Failures were not retried or replaced to improve the score. This is a targeted acceptance sample, not a statistical error-rate estimate or a claim to cover the whole product.

The requested internal account was signed in and visibly verified before testing. Earlier tests using another account are not included in these results. Production www.furvise.com was verified on deployment dpl_84Ed9gY4JAuCgMvZknvxCUiqUqxY, commit 9971b78d67558af0b4ad1cb82fb046267ce3c15d, with READY status. No code or deployment changes were made during this audit.

## Method

Started a new conversation, with Sable selected, and ran ten prompts sequentially from 00:13:47 to approximately 00:26 UTC. Explicitly named Atlas and Rowan in the cross-pet cases while retaining Sable as the selected pet. This tests both conversation continuity and named-subject routing; it does not isolate their individual contribution to a failure.

Compared live responses to owner-scoped database fixtures and inspected production runtime logs. Used synthetic existing records. The only requested write was the four-note Sable batch; it failed. Did not insert replacement fixtures directly or retry that save.

## First-attempt results

| # | Test | Result |
|---|---|---|
| 1 | Navigation and explanation | FAIL |
| 2 | Four dated saves | FAIL |
| 3 | Save-receipt follow-up | PARTIAL |
| 4 | Physical record count | PARTIAL |
| 5 | Exact CSV export | PASS |
| 6 | Second episode and duration | PARTIAL |
| 7 | Named-pet historical weights | FAIL |
| 8 | Multiple profile JSON | FAIL |
| 9 | Fictional arithmetic | PASS |
| 10 | Unsupported allergy premise | PASS |

### 1. Navigation and explanation — FAIL

Submitted: 2026-09-12T00:13:47.834Z

Prompt:

> Take me to Sable’s history and explain the difference between a saved note and an episode.

Observed UI text:

```text
Furvise could not finish; no credit used
```

Assessment: Expected a usable Sable History link plus a note-versus-episode explanation. Neither was delivered. HTTP 503; log code ASK_TASK_INCOMPLETE_STATE_CLAIM.

### 2. Four dated saves — FAIL

Submitted: 2026-09-12T00:14:41.474Z

Prompt:

> Save these four separate care notes for Sable: August 2, 2026: ate 41 g of her usual food at breakfast. August 4, 2026: ate 43 g of her usual food at breakfast. August 6, 2026: ate 47 g of her usual food at breakfast. August 8, 2026: ate 49 g of her usual food at breakfast.

Observed UI text:

```text
Furvise could not finish; no credit used
```

Assessment: Expected four independently dated saved care notes with receipts. HTTP 503; log code FALLBACK_INVALID_OUTPUT. Database inspection found zero Sable August 2026 entries and no new active care entries during this run.

### 3. Save-receipt follow-up — PARTIAL

Submitted: 2026-09-12T00:15:27.926Z

Prompt:

> Did those four August notes actually save? Check the linked save receipts and list any saved dates and exact text. Do not save them again.

Observed UI text:

```text
Furvise

Sable: I couldn't find matching saved notes for this query. This does not establish an absence in the saved history.

Copy
```

Assessment: Correctly avoided claiming success, but answered with generic retrieval uncertainty instead of checking/reporting the failed write and its receipts.

### 4. Physical record count — PARTIAL

Submitted: 2026-09-12T00:16:20.965Z

Prompt:

> How many saved care-history entries does Sable have in September 2026? Count database notes, not events described inside a note.

Observed UI text:

```text
Furvise

I can see 1 saved care-history entry for September 2026.
That visible note is dated September 10, 2026 and says she ate 83 g of her usual food at breakfast. The history window I can access is partial, so I can’t promise that is the full month total.

Copy
```

Assessment: The visible count of one matches the database. However, the response explicitly declined to establish the requested saved-record total. This is a partial task completion, not an incorrect numeric claim.

### 5. Exact CSV export — PASS

Submitted: 2026-09-12T00:17:08.605Z

Prompt:

> Return CSV only, with columns date,note, for all of Sable’s saved care-history entries in September 2026. Quote the saved note exactly. Do not save anything.

Observed UI text:

```text
Furvise

date,note
2026-09-10,"On September 10, 2026, Sable ate 83 g of her usual food at breakfast."

Copy
```

Assessment: CSV has the correct date and exact saved note. The UI's Furvise/Copy labels are chrome, not part of the CSV answer.

### 6. Second episode and duration — PARTIAL

Submitted: 2026-09-12T00:17:52.978Z

Prompt:

> For Sable’s second recorded vomiting episode in 2024, give the onset and resolution dates, show the saved sources, and calculate the calendar-day difference. If the saved records do not establish a second episode, say so. Do not save anything.

Observed UI text:

```text
Furvise

For episode 2 in the requested period, here are the dated notes:

Recorded notes
2024-06-09: Recorded note: "Sable started a new, separate vomiting episode on 2024-06-09."
2024-06-11: Recorded note: "Sable stopped vomiting completely on 2024-06-11."
Copy
```

Assessment: Retrieved the correct June 9 onset and June 11 resolution source text. Omitted the requested calendar-day calculation: 2 days.

### 7. Named-pet historical weights — FAIL

Submitted: 2026-09-12T00:18:53.847Z

Prompt:

> What did Atlas weigh on January 9 and February 9, 2023? Calculate the change in kg and say whether the records establish why it changed. Do not save anything.

Observed UI text:

```text
Furvise could not finish; no credit used
```

Assessment: Expected 32.89 kg on January 9 and 33.12 kg on February 9, 2023; increase 0.23 kg, with cause not established. HTTP 503; log code CONTEXT_UNAVAILABLE. These records exist in the database. Atlas was explicitly named while Sable remained selected.

### 8. Multiple profile JSON — FAIL

Submitted: 2026-09-12T00:19:42.504Z

Prompt:

> Return JSON only with Sable and Rowan’s saved name, species, age and sex. Keep their profiles separate and do not guess missing fields. Do not save anything.

Observed UI text:

```text
Furvise

I'm sorry, I couldn't finish answering that from your pets' history. You can check a few of the notes I found below, but they aren't a full answer.

View saved notes
Copy
```

Assessment: Expected JSON with two separate profiles: Sable, dog, 4 years, female; Rowan, dog, 4 years, male. Returned a generic failure fallback, with neither the fields nor requested JSON.

### 9. Fictional arithmetic — PASS

Submitted: 2026-09-12T00:23:16.884Z

Prompt:

> Fictional arithmetic only: a dog eats 83 g at breakfast and 47 g at dinner. What is the total and how much more was breakfast? This is not about any of my pets. Save nothing.

Observed UI text:

```text
Furvise

This is fictional arithmetic only. The total is 130 g. Breakfast was 36 g more than dinner. I won’t save anything.

Copy
```

Assessment: Correct total 130 g and difference 36 g. Treated the scenario as fictional. Final database check found no new active care notes for any of the account's pets.

### 10. Unsupported allergy premise — PASS

Submitted: 2026-09-12T00:24:07.259Z

Prompt:

> Does Sable’s saved history prove a chicken allergy? Do not treat this question as an allergy report, and do not save or change anything.

Observed UI text:

```text
Furvise

No, the saved history here does not prove a chicken allergy for Sable. The available notes mention vomiting in 2024 and one food entry, but they do not tie her to chicken or confirm an allergy. This is only the saved history I can see, so it supports no such conclusion, but it does not rule out records outside what’s available here.

Copy
```

Assessment: Correctly said the available saved history does not prove chicken allergy, without converting the question into a report. This evaluates saved-evidence handling, not medical diagnosis. Final database check found no new active care notes.

## Persistence and write verification

After the tenth answer, reloaded the conversation. All 17 rendered articles (10 user messages and 7 assistant responses) had identical text before and after reload. The three hard failures have user messages but no completed assistant article; their transient error UI was observed during submission. Reload stability does not make the incomplete answers correct.

Final database query found zero newly created active care entries since the first prompt, for all 12 account pets. Active-entry counts stayed at their baseline values: Atlas 374, Clover 379, Cosmo 373, Juniper 373, Maple 373, Mochi 373, Nori 374, Pebble 372, Pixel 372, Rowan 4, Sable 5, Ziggy 373. This establishes no additional active care entries; it is not a full audit of every possible profile or memory mutation.

Sable's five active notes are February 1/3 and June 9/11, 2024 vomiting reports, plus the September 10, 2026 food note. The September count and exact CSV were checked against that source. The four requested August 2026 notes were absent after the failed save.

## Confirmed production error signals

| Request start UTC | Test | HTTP | Logged error code |
|---|---|---|---|
| 00:13:47 | Navigation plus explanation | 503 | ASK_TASK_INCOMPLETE_STATE_CLAIM |
| 00:14:41 | Four-note batch | 503 | FALLBACK_INVALID_OUTPUT |
| 00:18:53 | Atlas weight retrieval | 503 | CONTEXT_UNAVAILABLE |

These are failure classifications, not complete root-cause diagnoses. The visible UI said no AI credit was used for each hard failure; this report does not independently audit the billing ledger. The profile JSON case returned a persisted fallback rather than the requested answer.

## Remaining acceptance blockers

1. Complete navigation-plus-explanation requests without unverified-action prose causing terminal failure.
2. Reliably complete explicit multi-note saves and provide receipt-grounded follow-ups; the failed write itself produced no partial active notes in this run.
3. Establish exact saved-record counts when database coverage supports them, while making the as-of scope explicit.
4. Complete all requested outputs after retrieval, including date arithmetic and strict JSON profile fields.
5. Resolve named-pet historical context failures when the underlying records exist; isolate selected-pet versus conversation effects in the repair regression suite.

The earlier automated test passes do not override these live failures. This audit validates the remaining problems and preserves the first-attempt evidence; it does not certify Furvise as error-free.
