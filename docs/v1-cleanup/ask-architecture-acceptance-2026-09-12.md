# Furvise architecture acceptance audit — 2026-09-12

Ten-question acceptance: **10/10 passed on the first attempt on PR #324**, using **gwaraich604@gmail.com**. All five supplied blocker categories passed their scenario checks. An additional conversation-start failure was discovered afterward and is documented separately with its repair below.

Latest production: PR #325, commit `dae353fb36f147c08fd4b07493f44c96fb24221a`, deployment `dpl_9awVu6kYatM6CveX3p1ofF6vBsHF`, verified READY on www.furvise.com. CI run `34666227354` passed all gates, including lint, TypeScript, security, full tests, dependency audit and production build. Local full suite: **2,167 passed**. This final patch changes only recovery of transient conversation-start RPC failures; its fresh/existing conversation regression results appear at the end of this report.

Production commit: `f4af500602ab4bc829133d0879aa4ec6aacf8ccf` (PR #324), deployment `dpl_5cBCp22GsspHWmS5xxwbhirhj9PA`, verified READY with furvise.com and www.furvise.com aliases before testing. CI run `34665443773` passed lint, TypeScript, security tests, all tests, dependency audit and production build. **2,165 full tests passed** locally; 64 stress/episode-review cases passed during the repair. Lint retains 9 existing warnings and has zero errors.

| # | Final scenario | Result |
|---|---|---|
| 1 | Navigation plus explanation | Pass |
| 2 | Atomic four-note save | Pass |
| 3 | Receipt-grounded exact text | Pass |
| 4 | Exact record count with as-of scope | Pass |
| 5 | Lossless CSV | Pass |
| 6 | Historical date arithmetic and quotes | Pass |
| 7 | Named-pet history with another pet selected | Pass |
| 8 | Strict two-pet profile JSON | Pass |
| 9 | Fictional arithmetic and uncertainty | Pass |
| 10 | Historical causation without new facts | Pass |

The final run created exactly four April care notes for Rowan and no entries for other pets. All four notes have exact requested text/date and the same source-message receipt. No new saved memories were created. All 20 conversation articles survived reload unchanged; the JSON parsed successfully and the navigation card opened Rowan's profile.

Earlier failures are retained below. Passing these scenarios does not establish that every possible future input is error-free.


Account: gwaraich604@gmail.com (internal testing). Selected pet: Rowan. Live tests use synthetic historical data.

## Repairs

PR #320 fixes navigation claim cleanup before completion review, server-owned atomic multi-note planning, action index capacity, profile JSON intent, physical-record inventory routing, and optional conversation-lineage failure isolation. PR #321 separates correction-dependent clinical evidence from independently verified inventory/profile/receipt evidence, enforces complete exact-note text, and validates equivalent timestamps, sourced dates and calendar-day calculations. No pet-name or test-question special cases; no database migration.

PRs: https://github.com/furvisepet/furvisepet/pull/320 and https://github.com/furvisepet/furvisepet/pull/321.

Both passed CI lint, typecheck, focused security tests, full tests, dependency audit and production build. Local verification included 149 focused first-repair cases and 142 follow-up focused cases. Final-head CI is authoritative.

## First production round (PR #320)

Production commit: 699eee45a41b12a86d043f16d7c348d51f66bcea. Conversation: fbbe5b5b-5df8-44b8-a2e0-1c4f4c298370.

Result: 7 pass, 2 partial, 1 fail. These first-attempt failures are retained rather than counted as later passes. They triggered PR #321.

### Question 1 — pass

Open Rowan’s profile and explain why an owner’s observation is different from a veterinary diagnosis.

Observed response:

Furvise

An owner’s observation is what you notice at home, like a cough, limping, appetite changes, or behavior that seems off. A veterinary diagnosis is a professional conclusion made after examining the pet, and often after testing, to explain what’s causing those signs. In practice, your observation is the starting point, while the diagnosis is the vet’s medical interpretation of it. His profile also shows him as a 4-year-old male dog, with a current weight of 15 kg.

Copy

Open Rowan's profile

Open this Furvise page.

Open

### Question 2 — pass

Save four separate care notes for Rowan: July 3, 2026: ate 31 g of usual food at breakfast. July 6, 2026: ate 34 g of usual food at breakfast. July 9, 2026: ate 36 g of usual food at breakfast. July 12, 2026: ate 39 g of usual food at breakfast.

Observed response:

Furvise

Prepared four separate care-note entries for Rowan: - July 3, 2026: ate 31 g of usual food at breakfast. - July 6, 2026: ate 34 g of usual food at breakfast. - July 9, 2026: ate 36 g of usual food at breakfast. - July 12, 2026: ate 39 g of usual food at breakfast.

Copy

Added 4 updates to care history

### Question 3 — partial

Verify the writes from my preceding save request using its receipts. List every linked note with its date and exact text, and tell me if any did not save. Do not repeat the save.

Observed response:

Furvise

Yes. All four requested care notes are linked as saved records. The notes are dated July 3, 2026 and say "ate 31 g of usual food at breakfast."
The notes dated July 6, 2026 say "ate 34 g of usual food at breakfast."
The notes dated July 9, 2026 say "ate 36 g of usual food at breakfast."
The notes dated July 12, 2026 say "ate 39 g of usual food at breakfast."
None of the four are shown as not saved.

Copy

### Question 4 — fail

As of now, what is the exact number of Rowan’s saved care-history entries dated in July 2026? Count stored notes, not clinical episodes. Save nothing.

Observed response:

Furvise

Rowan: I couldn't check corrections, so I can't reliably attribute the saved reports yet.

Copy

### Question 5 — pass

Export Rowan’s July 2026 saved notes as CSV only, with recorded_date and exact_note columns. Preserve the wording exactly. Save nothing.

Observed response:

Furvise

recorded_date,exact_note
2026-07-03,"July 3, 2026: ate 31 g of usual food at breakfast."
2026-07-06,"July 6, 2026: ate 34 g of usual food at breakfast."
2026-07-09,"July 9, 2026: ate 36 g of usual food at breakfast."
2026-07-12,"July 12, 2026: ate 39 g of usual food at breakfast."

Copy

### Question 6 — partial

Using Rowan’s first recorded vomiting episode in 2024, identify the start and stop dates and calculate the calendar-day gap. Quote the two supporting notes. Save nothing.

Observed response:

Furvise

A few saved notes for Rowan:

Rowan's 2024-02-01 report: "Rowan started vomiting on 2024-02-01."

Rowan's 2024-02-03 report: "Rowan stopped vomiting completely on 2024-02-03."

These saved reports are not proof of when it first happened in their life.

Some history could not be checked or included. This answer covers only the usable reports; a narrower topic or date range may help.

Copy

### Question 7 — pass

Look up Atlas’s body weights on March 9 and April 9, 2023. Give both measurements and the change in kilograms, and distinguish that change from any proven cause. Save nothing.

Observed response:

Furvise

On 2023-03-09, Atlas weighed 31.10 kg.
On 2023-04-09, he weighed 31.32 kg, which is 0.22 kg higher than on March 9.
The notes say the reason for that change was not established, so the increase is recorded, but no proven cause is given.

Copy

### Question 8 — pass

Give JSON only for Atlas and Mochi: name, species, age, and sex from each saved profile. Keep the two pets separate; use null for an unstored field. Save nothing.

Observed response:

Furvise

{"Atlas":{"name":"Atlas","species":"dog","age":"9 years","sex":"male"},"Mochi":{"name":"Mochi","species":"cat","age":"8 years","sex":"female"}}

Copy

### Question 9 — pass

A fictional dog’s bowl starts with 225 ml, another 75 ml is added, and 60 ml remains. What is the net amount removed? Can we say the dog drank all of it if some may have spilled? This is fictional; save nothing.

Observed response:

Furvise

This is fictional, and I didn’t save anything.

The net amount removed from the bowl is 240 ml: 225 ml + 75 ml added - 60 ml remaining = 240 ml no longer in the bowl.

What’s established is that 240 ml left the bowl. What the scenario does not establish is that the dog drank all of it, because some of it may have spilled.

Copy

### Question 10 — pass

Does Rowan’s saved history establish that a beef allergy caused the 2024 vomiting? Separate what the notes report from what they cannot establish. This question is not a new symptom or allergy report. Save nothing.

Observed response:

Furvise

Rowan’s saved notes show a vomiting episode that started on 2024-02-01 and was reported as fully stopped on 2024-02-03.
They do not establish that a beef allergy caused it. The notes don’t mention beef allergy as a trigger, and they don’t prove the cause of the vomiting.

Copy


## Continuing live verification


## Second production round (PR #321)

Production commit: 92c860e552dc43bc23b7fd20e598c9f204e37d6e; deployment dpl_GL3Gby7Xr4wfetYaBFu7NcBQjjET READY on www.furvise.com. Conversation: 6df77749-858a-46a0-93ce-b83804dc9cb3. Result: 5 pass, 2 partial, 3 fail.

### Second round Q1 — pass

Open Rowan’s profile and explain why an owner’s observation is different from a veterinary diagnosis.

Furvise

Rowan’s profile link is prepared below. An owner’s observation is a description of what you see or notice, such as limping, coughing, eating less, or acting tired. A veterinary diagnosis is a professional conclusion made after the vet evaluates the pet and may use an exam, tests, and medical judgment. In short: observations describe signs; diagnoses explain what those signs mean medically.

Copy

Open Rowan's profile

Open this Furvise page.

Open

### Second round Q2 — pass

Save four separate care notes for Rowan: August 3, 2026: ate 31 g of usual food at breakfast. August 6, 2026: ate 34 g of usual food at breakfast. August 9, 2026: ate 36 g of usual food at breakfast. August 12, 2026: ate 39 g of usual food at breakfast.

Furvise

I’ve got the four separate notes ready for Rowan.

Notes to save
August 3, 2026: ate 31 g of usual food at breakfast.
August 6, 2026: ate 34 g of usual food at breakfast.
August 9, 2026: ate 36 g of usual food at breakfast.
August 12, 2026: ate 39 g of usual food at breakfast.
Copy

Added 4 updates to care history

### Second round Q3 — pass

Verify the writes from my preceding save request using its receipts. List every linked note with its date and exact text, and tell me if any did not save. Do not repeat the save.

Furvise
Date	Exact text	Saved successfully?
2026-08-03	August 3, 2026: ate 31 g of usual food at breakfast.	Yes
2026-08-06	August 6, 2026: ate 34 g of usual food at breakfast.	Yes
2026-08-09	August 9, 2026: ate 36 g of usual food at breakfast.	Yes
2026-08-12	August 12, 2026: ate 39 g of usual food at breakfast.	Yes
Copy

### Second round Q4 — partial

As of now, what is the exact number of Rowan’s saved care-history entries dated in August 2026? Count stored notes, not clinical episodes. Save nothing.

Furvise

I can see 4 saved care-history entries for Rowan dated in August 2026 in the records I have access to.
I can’t confirm that this is the exact total for the whole month, because the retrieval is partial and there may be other August 2026 entries outside what’s shown here.

Copy

### Second round Q5 — fail

Export Rowan’s August 2026 saved notes as CSV only, with recorded_date and exact_note columns. Preserve the wording exactly. Save nothing.

Terminal error: Furvise couldn’t finish this answer. Your question is still here. Try again in a moment.

### Second round Q6 — partial

Using Rowan’s first recorded vomiting episode in 2024, identify the start and stop dates and calculate the calendar-day gap. Quote the two supporting notes. Save nothing.

Furvise

A few saved notes for Rowan:

Rowan's 2024-02-01 report: "Rowan started vomiting on 2024-02-01."

These saved reports are not proof of when it first happened in their life.

Some history could not be checked or included. This answer covers only the usable reports; a narrower topic or date range may help.

Copy

### Second round Q7 — fail

Look up Atlas’s body weights on March 9 and April 9, 2023. Give both measurements and the change in kilograms, and distinguish that change from any proven cause. Save nothing.

Furvise

I'm sorry, I couldn't finish answering that from Atlas's history. You can check a few of the notes I found below, but they aren't a full answer.

View saved notes
Copy

### Second round Q8 — pass

Give JSON only for Atlas and Mochi: name, species, age, and sex from each saved profile. Keep the two pets separate; use null for an unstored field. Save nothing.

Furvise

{"Atlas":{"name":"Atlas","species":"dog","age":"9 years","sex":"male"},"Mochi":{"name":"Mochi","species":"cat","age":"8 years","sex":"female"}}

Copy

### Second round Q9 — pass

A fictional dog’s bowl starts with 225 ml, another 75 ml is added, and 60 ml remains. What is the net amount removed? Can we say the dog drank all of it if some may have spilled? This is fictional; save nothing.

Furvise

The net amount removed is 240 ml. That comes from 225 ml plus 75 ml added, leaving 300 ml total before the loss, and 60 ml remaining.

No, we can’t say the dog drank all of it if some may have spilled. What’s established is that 240 ml is no longer in the bowl. What’s not established is whether that missing amount was all drank, all spilled, or some mix of both. This is fictional, and I’ll save nothing.

Copy

### Second round Q10 — fail

Does Rowan’s saved history establish that a beef allergy caused the 2024 vomiting? Separate what the notes report from what they cannot establish. This question is not a new symptom or allergy report. Save nothing.

Furvise

I'm sorry, I couldn't finish answering that from Rowan's history. You can check a few of the notes I found below, but they aren't a full answer.

View saved notes
Copy

Database verification: exactly four August entries, correct full note texts and midnight UTC dates, all linked to source message c5b603ea-f508-48cb-b40a-43b8c48601d2. No extra care entries for any other pet; no writes from the read-only questions. CSV failure was REQUEST_LOOKUP before persistence, date question review_timeout, cross-pet weight and causation repair_independent_review_failed:draft_anchors_invalid. Malformed search hints prevented physical inventory routing. PR #322 addresses the read and calculation boundaries; further live acceptance pending.

## Targeted follow-up on PR #322

Production commit ecfe4b9f7882e1d58778b71cfb4f1d22a041e370. Fresh Rowan conversation f4473d0f-e8a8-4868-ab56-1d2e7a24fd87. Three pass, two partial; no terminal failures in these five checks.

### count — partial

As of now, what is the exact number of Rowan’s saved care-history entries dated in August 2026? Count stored notes, not clinical episodes. Save nothing.

Furvise

Rowan has 4 saved care-history entries dated in August 2026 in the records I can see.

Copy

### csv — pass

Export Rowan’s August 2026 saved notes as CSV only, with recorded_date and exact_note columns. Preserve the wording exactly. Save nothing.

Furvise

recorded_date,exact_note
2026-08-03,"August 3, 2026: ate 31 g of usual food at breakfast."
2026-08-06,"August 6, 2026: ate 34 g of usual food at breakfast."
2026-08-09,"August 9, 2026: ate 36 g of usual food at breakfast."
2026-08-12,"August 12, 2026: ate 39 g of usual food at breakfast."

Copy

### days — partial

Using Rowan’s first recorded vomiting episode in 2024, identify the start and stop dates and calculate the calendar-day gap. Quote the two supporting notes. Save nothing.

Furvise

A few saved notes for Rowan:

Rowan's 2024-02-01 report: "Rowan started vomiting on 2024-02-01."

Rowan's 2024-02-03 report: "Rowan stopped vomiting completely on 2024-02-03."

These saved reports are not proof of when it first happened in their life.

Some history could not be checked or included. This answer covers only the usable reports; a narrower topic or date range may help.

Copy

### cross_pet — pass

Look up Atlas’s body weights on March 9 and April 9, 2023. Give both measurements and the change in kilograms, and distinguish that change from any proven cause. Save nothing.

Furvise

Atlas weighed 31.10 kg on March 9, 2023, and 31.32 kg on April 9, 2023.
That is an increase of 0.22 kg, and the notes do not establish any proven cause for the change.

Copy

### causation — pass

Does Rowan’s saved history establish that a beef allergy caused the 2024 vomiting? Separate what the notes report from what they cannot establish. This question is not a new symptom or allergy report. Save nothing.

Furvise

No, Rowan’s saved history does not establish that a beef allergy caused the 2024 vomiting.
The notes I can see only report that he started vomiting on 2024-02-01 and stopped vomiting completely on 2024-02-03, but they do not say why, and they do not record a beef allergy or a proven cause.

Copy

The remaining multi-quotation failure was reproduced in a unit regression: attribution dates accumulated from all preceding quotes. PR #323 scopes attribution to each quote's local clause, preserving rejection of a wrong local date. Literal inventory routing also no longer requires the planner's quantity label. Local full suite at that stage: 2,163 pass; stress/episode review: 64 pass.

## Selected-pet isolation before PR #323

The same Atlas measurement question passed with Atlas selected in a fresh conversation, and had already passed with Rowan selected in a mixed conversation. It failed with Rowan selected in a fresh conversation. Runtime diagnostics identified an unsupported 0.22 kg anchor caused by missing calculation metadata; retrieved subject identity remained Atlas. These runs do not prove a selected-pet authorization defect. They motivated a server-computed comparison draft and require rechecking after that repair.

- Atlas selected / fresh: pass; https://www.furvise.com/ask?conversation=f7943708-f774-40df-9e75-6676e4288bd5
- Rowan selected / fresh: fail; https://www.furvise.com/ask?conversation=cae2a8fb-9d22-4381-8e8d-874d5f33f1aa

## Final repair implementation

PR #323 adds per-quotation date attribution, removes a planner quantity-label veto of independently validated physical inventories, and computes two-date body-mass comparisons from eligible source records. It rejects ambiguous or equipment-inclusive measurements and retains independent whole-task review. Clause certainty for stored measurements is distinct from the heuristic that classifies newly asserted owner facts.

PR #323 head: 91f6cbfa45dae455970a61add7d0e0ddadf095ab. Merge: 69cbe66eb84c72a1c2b02eed393d2666a5520afc. CI run 34664840906 passed every gate. Local full tests 2,164 pass; 64 stress/episode-review cases pass.

## Ten-question round on PR #323

Production commit 69cbe66eb84c72a1c2b02eed393d2666a5520afc, deployment dpl_HJ9H9QZ884FBX7xtAJyvogzz8y1F, conversation 25a420b8-02b8-4541-b8db-c3e42ba8382f. Result: 8 pass, 1 partial, 1 fail. Exact dates and both quotations now passed with a two-day gap.

### PR #323 Q1 — pass

Open Rowan’s profile and explain why an owner’s observation is different from a veterinary diagnosis.

Furvise

An owner’s observation is what you see or hear at home, like appetite, vomiting, limping, or behavior changes. A veterinary diagnosis is a professional medical judgment that usually combines an exam, history, and sometimes tests, so the two aren’t the same even when they’re about the same problem.

Why they’re different
An observation is a report of what you noticed.
A diagnosis is the vet’s interpretation of what those signs most likely mean.
The same observation can fit more than one cause, which is why vets use exams and tests when needed.
Copy

Open Rowan's profile

Open this Furvise page.

Open

### PR #323 Q2 — pass

Save four separate care notes for Rowan: May 3, 2026: ate 31 g of usual food at breakfast. May 6, 2026: ate 34 g of usual food at breakfast. May 9, 2026: ate 36 g of usual food at breakfast. May 12, 2026: ate 39 g of usual food at breakfast.

Furvise

I’ve prepared four separate care notes for Rowan with the dates and breakfast amounts you gave.

Copy

Added 4 updates to care history

### PR #323 Q3 — pass

Verify the writes from my preceding save request using its receipts. List every linked note with its date and exact text, and tell me if any did not save. Do not repeat the save.

Furvise

2026-05-03 linked saved note: "May 3, 2026: ate 31 g of usual food at breakfast."
2026-05-06 linked saved note: "May 6, 2026: ate 34 g of usual food at breakfast."
2026-05-09 linked saved note: "May 9, 2026: ate 36 g of usual food at breakfast."
2026-05-12 linked saved note: "May 12, 2026: ate 39 g of usual food at breakfast."

Copy

### PR #323 Q4 — partial

As of now, what is the exact number of Rowan’s saved care-history entries dated in May 2026? Count stored notes, not clinical episodes. Save nothing.

Furvise

Rowan has 4 saved care-history entries dated in May 2026.

Copy

### PR #323 Q5 — pass

Export Rowan’s May 2026 saved notes as CSV only, with recorded_date and exact_note columns. Preserve the wording exactly. Save nothing.

Furvise

recorded_date,exact_note
2026-05-03,"May 3, 2026: ate 31 g of usual food at breakfast."
2026-05-06,"May 6, 2026: ate 34 g of usual food at breakfast."
2026-05-09,"May 9, 2026: ate 36 g of usual food at breakfast."
2026-05-12,"May 12, 2026: ate 39 g of usual food at breakfast."

Copy

### PR #323 Q6 — pass

Using Rowan’s first recorded vomiting episode in 2024, identify the start and stop dates and calculate the calendar-day gap. Quote the two supporting notes. Save nothing.

Furvise

Rowan’s vomiting episode started on 2024-02-01 and stopped on 2024-02-03, so the calendar-day gap is 2 days.
The supporting notes are: “Rowan started vomiting on 2024-02-01.” and “Rowan stopped vomiting completely on 2024-02-03.”

Copy

### PR #323 Q7 — fail

Look up Atlas’s body weights on March 9 and April 9, 2023. Give both measurements and the change in kilograms, and distinguish that change from any proven cause. Save nothing.

Furvise

I'm sorry, I couldn't finish answering that from Atlas's history. You can check a few of the notes I found below, but they aren't a full answer.

View saved notes
Copy

### PR #323 Q8 — pass

Give JSON only for Atlas and Mochi: name, species, age, and sex from each saved profile. Keep the two pets separate; use null for an unstored field. Save nothing.

Furvise

{"Atlas":{"name":"Atlas","species":"dog","age":"9 years","sex":"male"},"Mochi":{"name":"Mochi","species":"cat","age":"8 years","sex":"female"}}

Copy

### PR #323 Q9 — pass

A fictional dog’s bowl starts with 225 ml, another 75 ml is added, and 60 ml remains. What is the net amount removed? Can we say the dog drank all of it if some may have spilled? This is fictional; save nothing.

Furvise

The net amount removed is 240 ml, using 225 ml + 75 ml added = 300 ml, then 60 ml left. What is established is that 240 ml left the bowl overall. What is not established is that the dog drank all of it. If some may have spilled, the drank amount is unknown. This is fictional, and no save was made.

Copy

### PR #323 Q10 — pass

Does Rowan’s saved history establish that a beef allergy caused the 2024 vomiting? Separate what the notes report from what they cannot establish. This question is not a new symptom or allergy report. Save nothing.

Furvise

No, the saved history available here does not establish that a beef allergy caused Rowan’s 2024 vomiting.
The notes do report that he started vomiting on 2024-02-01 and stopped vomiting completely on 2024-02-03.
What they do not establish is causation: the records shown here do not say the vomiting was due to beef, and they do not prove that a beef allergy was the reason.

Copy

Database: four May notes, exact texts/dates, source message c46cdc05-8c58-492b-895c-6e8f5444e020. The count query succeeded (inventory trace representedPets=1), but generic 280-character prose compaction discarded its evidence. The comparison's unspecified output format was null, so an explicit-prose-only condition skipped the server draft. PR #324 fixes both boundaries. BuildAskContext regression proves the count evidence survives selection and retains its as-of text; comparison regression now exercises null format. Local full suite: 2,165 pass.

## Final production run — 10/10 pass

Conversation: https://www.furvise.com/ask?conversation=6895ffde-bfb0-495f-9f88-196ace0b5aef

### Final Q1 — pass

Open Rowan’s profile and explain why an owner’s observation is different from a veterinary diagnosis.

Furvise

An owner’s observation is what you notice at home, like appetite, energy, limping, vomiting, or a change in behavior. A veterinary diagnosis is the clinician’s conclusion after examining him and, when needed, using tests to identify what’s causing the signs. So your observation describes what happened, while a diagnosis explains what it means medically.

Copy

Open Rowan's profile

Open this Furvise page.

Open

### Final Q2 — pass

Save four separate care notes for Rowan: April 3, 2026: ate 31 g of usual food at breakfast. April 6, 2026: ate 34 g of usual food at breakfast. April 9, 2026: ate 36 g of usual food at breakfast. April 12, 2026: ate 39 g of usual food at breakfast.

Furvise

Prepared four separate care-note entries for Rowan, each as its own note: - April 3, 2026: ate 31 g of usual food at breakfast. - April 6, 2026: ate 34 g of usual food at breakfast. - April 9, 2026: ate 36 g of usual food at breakfast. - April 12, 2026: ate 39 g of usual food at breakfast.

Copy

Added 4 updates to care history

### Final Q3 — pass

Verify the writes from my preceding save request using its receipts. List every linked note with its date and exact text, and tell me if any did not save. Do not repeat the save.

Furvise

2026-04-03 linked saved note: "April 3, 2026: ate 31 g of usual food at breakfast."
2026-04-06 linked saved note: "April 6, 2026: ate 34 g of usual food at breakfast."
2026-04-09 linked saved note: "April 9, 2026: ate 36 g of usual food at breakfast."
2026-04-12 linked saved note: "April 12, 2026: ate 39 g of usual food at breakfast."

Copy

### Final Q4 — pass

As of now, what is the exact number of Rowan’s saved care-history entries dated in April 2026? Count stored notes, not clinical episodes. Save nothing.

Furvise

Database count checked at 2026-09-12T01:45:16.334Z: exactly 4 active saved care-history entries with recorded dates from 2026-04-01 inclusive to 2026-05-01 exclusive. This counts database notes, not episodes or events described within notes. It covers only this accessible date interval, not later dates or excluded history.

Copy

### Final Q5 — pass

Export Rowan’s April 2026 saved notes as CSV only, with recorded_date and exact_note columns. Preserve the wording exactly. Save nothing.

Furvise

recorded_date,exact_note
2026-04-03,"April 3, 2026: ate 31 g of usual food at breakfast."
2026-04-06,"April 6, 2026: ate 34 g of usual food at breakfast."
2026-04-09,"April 9, 2026: ate 36 g of usual food at breakfast."
2026-04-12,"April 12, 2026: ate 39 g of usual food at breakfast."

Copy

### Final Q6 — pass

Using Rowan’s first recorded vomiting episode in 2024, identify the start and stop dates and calculate the calendar-day gap. Quote the two supporting notes. Save nothing.

Furvise

The first recorded vomiting episode I found started on 2024-02-01 and stopped on 2024-02-03, which is a 2-day calendar gap.
The two supporting notes are: "Rowan started vomiting on 2024-02-01." and "Rowan stopped vomiting completely on 2024-02-03."

Copy

### Final Q7 — pass

Look up Atlas’s body weights on March 9 and April 9, 2023. Give both measurements and the change in kilograms, and distinguish that change from any proven cause. Save nothing.

Furvise

Atlas's 2023-03-09 report: "Atlas weighed 31.10 kg on 2023-03-09. This was body mass on the household scale with no carrier or harness included. The reason for any change was not established."
Atlas's 2023-04-09 report: "Atlas weighed 31.32 kg on 2023-04-09. This was body mass on the household scale with no carrier or harness included. The reason for any change was not established."
The recorded body-mass change is 0.22 kg (later minus earlier). This arithmetic alone does not establish a cause.

Copy

### Final Q8 — pass

Give JSON only for Atlas and Mochi: name, species, age, and sex from each saved profile. Keep the two pets separate; use null for an unstored field. Save nothing.

Furvise

{"Atlas":{"name":"Atlas","species":"dog","age":"9 years","sex":"male"},"Mochi":{"name":"Mochi","species":"cat","age":"8 years","sex":"female"}}

Copy

### Final Q9 — pass

A fictional dog’s bowl starts with 225 ml, another 75 ml is added, and 60 ml remains. What is the net amount removed? Can we say the dog drank all of it if some may have spilled? This is fictional; save nothing.

Furvise

The net amount removed is 240 ml. That comes from 225 ml plus 75 ml added, for 300 ml total, with 60 ml left.

No, we can’t say the dog drank all of it if some may have spilled. What’s established is that 240 ml left the bowl. What the notes do not establish is how much, if any, was actually drunk versus spilled.

Copy

### Final Q10 — pass

Does Rowan’s saved history establish that a beef allergy caused the 2024 vomiting? Separate what the notes report from what they cannot establish. This question is not a new symptom or allergy report. Save nothing.

Furvise

No, Rowan’s saved history does not establish that a beef allergy caused the 2024 vomiting.
The notes report that Rowan started vomiting on 2024-02-01 and stopped vomiting completely on 2024-02-03.
What they do not establish is the cause. These records do not say that beef caused the vomiting, and they do not show a confirmed beef allergy as the reason for it.

Copy

Final database receipt: source message 4ca58ab1-14b5-46f8-a905-0a6eb9d6782d, four April rows. As-of count reported 2026-09-12T01:45:16.334Z, exactly four active notes in [2026-04-01, 2026-05-01). The final run began with zero April notes. Other pet counts were unchanged, and no new furvise_memories or dog_memories rows were created.

## Additional startup resilience check

After the 10/10 answer run, the same Atlas question passed with Atlas selected in both a fresh and an existing conversation. The fresh Rowan-selected attempt failed before interpretation or generation: CONVERSATION_CREATE, stage persistence_prepare, providerCallCount=0. This additional failure is separate from the ten-question run and is not hidden by its score.

PR #325 adds one transient retry to the existing database-idempotent begin-turn RPC with an unchanged request payload. The RPC already locks owner/request ID and replays the same user message; no schema migration or ordinary insert retry was added. The exact underlying transport/database cause was not exposed by the original high-level error log. Unit tests cover a lost response after a committed creation, one-message replay, bounded retry, and permanent-error rejection. Local full suite: 2,167 pass.

- Atlas selected / fresh: pass. https://www.furvise.com/ask?conversation=daae46be-1bb4-4dc6-bd51-35a24b58fcf0
- Atlas selected / existing: pass. https://www.furvise.com/ask?conversation=daae46be-1bb4-4dc6-bd51-35a24b58fcf0
- Rowan selected / fresh: fail. https://www.furvise.com/ask?pet=3093e38e-58de-4d99-9156-b907e7f26d79


## Final startup and subject-context regression — PR #325

All four cases passed on their first submission after deployment, from 2026-09-12T02:06:22.433Z through 2026-09-12T02:08:56.396Z. The same Atlas body-weight question was used in every case, holding the named subject and dates constant while varying the selected pet and conversation state. No manual retry was needed.

| Selected pet | Conversation | Result | Completed UTC | Conversation ID |
|---|---|---|---|---|
| Rowan | fresh | Pass | 2026-09-12T02:07:01.225Z | 628c62a9-59be-4a53-9b80-3a6b2a10c0d9 |
| Rowan | existing | Pass | 2026-09-12T02:07:34.817Z | 628c62a9-59be-4a53-9b80-3a6b2a10c0d9 |
| Atlas | fresh | Pass | 2026-09-12T02:08:15.837Z | 01aa8e7f-3701-4ad3-8342-212801a9ba6d |
| Atlas | existing | Pass | 2026-09-12T02:08:56.396Z | 01aa8e7f-3701-4ad3-8342-212801a9ba6d |

Prompt:

Look up Atlas’s body weights on March 9 and April 9, 2023. Give both measurements and the change in kilograms, and distinguish that change from any proven cause. Save nothing.

All four responses matched this source-grounded result:

Furvise

Atlas's 2023-03-09 report: "Atlas weighed 31.10 kg on 2023-03-09. This was body mass on the household scale with no carrier or harness included. The reason for any change was not established."
Atlas's 2023-04-09 report: "Atlas weighed 31.32 kg on 2023-04-09. This was body mass on the household scale with no carrier or harness included. The reason for any change was not established."
The recorded body-mass change is 0.22 kg (later minus earlier). This arithmetic alone does not establish a cause.

Copy

Database verification found zero new care entries, zero new furvise_memories, and zero new dog_memories during these four read-only tests. The browser cases verify ordinary successful startup after the patch; the simulated lost-response unit test verifies replay safety under an injected transient failure. The earlier production log does not prove its underlying cause, nor do these four successes prove the retry path was exercised live.

Database message verification also found exactly one user message and one Furvise answer for each of the four request IDs; no duplicate turns were created.

The ten-question suite was run on PR #324; the final startup-only patch in PR #325 was verified by the four-case matrix and the complete automated/CI gates. Earlier failures remain recorded above. Acceptance is scoped to these tested behaviors, not a guarantee that all possible inputs are free of defects.
