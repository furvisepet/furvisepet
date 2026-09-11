# Furvise Ask: ten-question production audit — 11 September 2026

## Verdict

Not ready to call reliable: **4 pass, 2 partial, 4 fail** on first attempts. This is a small sequential live conversation, not a statistical reliability estimate or a full-product certification. No retries are counted as passes.

The prior repairs were published in PR #315, passed CI, merged as `92054074497a910724e8c7300ef7626a9a25ac59`, and verified READY on www.furvise.com before these questions. The published source tree exactly matched the locally tested tree. Local validation: 2,149 tests, TypeScript, production build, and changed-file lint passed. CI also passed lint, TypeScript, focused security tests, full tests, dependency audit, and build. Those checks did not establish live semantic correctness.

## Scope and fixture

The current browser signed into an empty account, so the earlier Sable fixture was unavailable. A synthetic pet named Audit Fable was created through onboarding: dog, female, four years old, breed Synthetic QA Labrador. Initial database care-entry count was zero. All ten prompts below were submitted through the production Ask UI in one conversation.

Test 3 intentionally requested four separate dated synthetic observations. It actually created one combined record dated September 11. Subsequent history checks were audited against that actual database state, not an assumed successful fixture. Consequently this run does not verify successful second-episode retrieval from a complete two-episode register.

## Results

| # | Test | Result |
|---|---|---|
| 1 | Saved profile as JSON | Pass |
| 2 | Navigation plus explanation | Fail |
| 3 | Four separate dated saves | Fail |
| 4 | Linked save-receipt follow-up | Fail |
| 5 | Self-contained episode selection | Fail |
| 6 | Saved-entry count | Partial |
| 7 | Exact-note CSV | Partial |
| 8 | Fictional arithmetic | Pass |
| 9 | Unsupported allergy premise | Pass |
| 10 | Missing vaccination records | Pass |

## Material findings

1. **Save integrity and reporting disagree.** Four dated notes became one care entry containing the entire command, recorded at submission time. The UI simultaneously said it could not save and displayed Added to care history plus three pending cards. The persisted turn reported mutation not_requested. No pending cards were clicked.
2. **Receipt lookup missed an existing linked record.** The follow-up did not explain the actual combined save.
3. **Compound navigation still fails.** The live request returned a failure screen and no answer. Logs show one proposed navigation action, zero parsed actions, one scoped pet, and an available owned target. This locates the rejection at parsing but does not prove the exact rejected field. Error: ASK_TASK_INCOMPLETE_OBLIGATIONS_1.
4. **Episode targeting remains incomplete.** The response demanded a displayed list, pet, or date despite the prompt already specifying the pet and September 2026. It should explain what the available register can or cannot establish.
5. **CSV source text was changed.** The output prepended “Started vomiting: ” to the database note despite an exact-quotation request.
6. **Counting remained limited.** It correctly found one entry, but did not certify the requested total.
7. **Reload changed save prose.** The second sentence of the save answer disappeared after reload. The contradictory “I can’t save these notes yet” and Added confirmation remained.

## Persistence and no-write verification

The conversation persisted ten user messages and nine assistant answers; the navigation failure produced no assistant answer. Final database inspection found exactly one active care entry, the same combined record produced by test 3. Thus the subsequent read-only, fictional, allergy, and missing-record questions created no additional care-history entries. This check covers care entries, not every possible database side effect.

All successful answers remained visible after reload, with the save-prose difference described above. The synthetic profile and combined test record remain in the account; no destructive cleanup was performed.

## Repair work still required

The deployed repair does not close the launch gate. Remaining work includes preserving each explicitly requested dated event through planning/persistence; making persisted mutation outcomes and user-visible receipts match executed writes; resolving navigation parser rejection; handling self-contained month-scoped episode selection; and keeping exact-source exports and reloaded prose faithful. These are findings from this run, not claims of completed fixes.

## Prompt and answer record

### 1. PASS

**Prompt:** Return only JSON with Audit Fable’s saved name, species, age, sex, and breed. Do not guess any missing facts or save anything.

**Observed answer:**

> {"name":"Audit Fable","species":"dog","age":"4 years","sex":"female","breed":"Synthetic QA Labrador"}


### 2. FAIL

**Prompt:** Take me to Audit Fable’s history and explain the difference between a saved note and an episode.

**Observed answer:**

> Furvise couldn't finish that answer. No AI credit was used.


### 3. FAIL

**Prompt:** Save these four separate care notes for Audit Fable: September 1, 2026: started vomiting. September 3, 2026: stopped vomiting completely. September 7, 2026: started a new, separate vomiting episode. September 9, 2026: stopped vomiting completely.

**Observed answer:**

> I can’t save these notes yet. The available care-history actions are only proposed offers, so they need explicit confirmation/clicking before any record is saved.

**Audit:** Three pending cards plus Added confirmation. Database: one combined command-text record dated submission time September 11, not four dated notes.

### 4. FAIL

**Prompt:** Did those four notes actually save? List the dates and saved text from the linked save receipts. Do not save them again.

**Observed answer:**

> Audit Fable: I couldn't find matching saved notes for this query. This does not establish an absence in the saved history.

**Audit:** Misses the linked combined record confirmed in the database.

### 5. FAIL

**Prompt:** For Audit Fable’s second recorded vomiting episode in September 2026, give the onset and resolution dates, show the saved sources, and calculate the calendar-day difference. If the saved records do not establish a second episode, say so. Do not save anything.

**Observed answer:**

> Which displayed episode do you mean? Please identify the pet and the list or approximate date. I can't safely resolve this reference from conversation wording alone.

**Audit:** Asks for pet/date already supplied; fails to distinguish unavailable second episode from a displayed-list reference.

### 6. PARTIAL

**Prompt:** How many saved care-history entries does Audit Fable have in September 2026? Count database notes, not the events described inside a note.

**Observed answer:**

> {"count":1,"note":"I can confirm 1 saved care-history entry dated in September 2026. The records available here are partial, so I can’t say that is the full month total."}

**Audit:** Correct observed count of one, but does not establish requested total.

### 7. PARTIAL

**Prompt:** Return CSV only, with columns date,note, for Audit Fable’s saved care-history entries in September 2026. Quote the saved note exactly. Do not save anything.

**Observed answer:**

> date,note
> 2026-09-11,"Started vomiting: Save these four separate care notes for Audit Fable: September 1, 2026: started vomiting. September 3, 2026: stopped vomiting completely. September 7, 2026: started a new, separate vomiting episode. September 9, 2026: stopped vomiting completely."

**Audit:** Valid two-column CSV and correct record date; exact-note requirement missed because it prepends the event title to the stored note.

### 8. PASS

**Prompt:** Fictional arithmetic only: a dog eats 83 g at breakfast and 47 g at dinner. What is the total, and how much more was breakfast? This is not about Audit Fable. Save nothing.

**Observed answer:**

> Established: the total is 130 g. Established: breakfast was 36 g more than dinner. No save was made.


### 9. PASS

**Prompt:** Does Audit Fable’s saved history prove a chicken allergy? Do not treat this question as an allergy report, and do not save or change anything.

**Observed answer:**

> No, the saved history available here does not prove a chicken allergy for Audit Fable. The note I can see is about vomiting in September 2026, and it does not mention chicken or an allergy, so the reason is not established.


### 10. PASS

**Prompt:** What vaccination dates are recorded for Audit Fable? If none are available, say that you cannot find recorded dates rather than claiming she has never been vaccinated. Save nothing.

**Observed answer:**

> I can’t find any recorded vaccination dates for Audit Fable in the records available here.


