# Vet Brief complex-history repair — 2026-09-12

## Trigger and actual production evidence

User supplied a failed Rowan request combining current lethargy, hind-leg weakness, heavy breathing, a five-year osteoarthritis/blood-work review and a prednisone taper said to have ended yesterday. Production diagnostics contained both incomplete output and compatibility validation failures. No patient text was logged by the new diagnostics.

Owner-scoped inspection of the internal synthetic Rowan account found 20 active care records, February 2024–September 2026. No five-year arthritis or blood-work series was present in those care records. A September 11 medication note describes a course starting tomorrow: 2.5 mg twice daily for five days, then 1.25 mg once daily for five days. This conflicts with the new owner statement that the course ended yesterday. Acceptance must preserve both sources and ask the clinician to reconcile the dates, not invent the requested trend or causal explanation.

## Architecture changes

- An appointment evidence plan identifies up to three distinct topics and an appropriate historical period. Explicit long-history requests and clinically relevant vaccination/background records can reach beyond the selected recent dates. Date input permits a century-scale range; source/page/time budgets remain bounded.
- Vet Brief uses the existing owner-scoped historical candidate and correction RPCs, with separate topic searches and reserved recent-record coverage. Corrected effective records are the only care records supplied to synthesis; raw originals cannot be appended as fallback.
- Generation and independent review receive the same evidence bundle. Current owner reports, saved records, background notes and coverage uncertainty remain distinct. The hidden 20-record serialization cutoff is removed from this route.
- The model generates prose fields and source references only. The server assembles profile identity, version, dates, title, settings and disclaimer. It no longer rejects otherwise useful prose because the model recopied immutable metadata differently.
- One bounded structural retry can handle incomplete/invalid output. The existing one semantic repair plus independent re-review remains. Maximum provider calls changes from four to six: planning, generation, review, repair/re-review, and at most one structural retry. All calls remain within the same metered operation and daily limits. Generation gets 12,288 output tokens; route/lease windows are 240/255/270 seconds. No new model or pricing is introduced.
- Immediate symptom guidance renders before generation and survives a preparation error. Historical/hypothetical/negated symptoms are scoped out. The report preserves urgency separately from optional detail sections.
- Corrected claim source references are verified using the existing authenticated correction RPC and retained when saving confirmed documents, including subsequent versions. No table privilege expansion or schema migration.

## Verification

- Initial new contract, urgent-scope and existing publication tests: 30 passed.
- Actual retrieval integration: vaccination evidence from 2001, laboratory evidence from 2014 and a recent taper survive among 5,000 routine records. Cross-pet evidence excluded; changed source withheld; correction-transport failure produces explicit gaps rather than unverified fallback. Three integration cases passed.
- Full suite before final provenance addition: 2,239 passed, zero failed. Updated obsolete static expectations for deliberate range, provider-budget and immediate-guidance changes; brand token violation was fixed in implementation.
- Final provenance checks pass: owner/pet-scoped RPC, malformed/foreign IDs rejected, unavailable verification fails saving safely.
- TypeScript passed before final provenance addition; final CI pending.

## Frozen live acceptance set (not yet run on this patch)

1. Exact Rowan complex request: current symptoms, immediate-care notice, conflicting taper dates and unavailable arthritis/lab history; no invented cause or five-year completeness claim.
2. Rowan vaccination appointment: recorded medication timing and unknown vaccine/reaction records; no invented schedule or clearance.
3. Mochi April 2024 weight comparison: historical measurement versus profile value; exclude unrelated diary entries.
4. Mochi April 2024 coat-care purpose: select brushing observation; no invented skin diagnosis.
5. Synthetic complex history with documented values and intervention response: preserve exact dates/doses/units and relevant negatives across topics.
6. Confirm, reload and export a complex brief: identical clinical content and retained source references, readable page breaks.

The browser session reset and is signed out. Production live acceptance is pending reconnection; local tests do not establish model performance or practitioner usefulness. Earlier Ask and Vet Brief first-attempt failures remain unchanged. This work does not import external records, certify complete lifetime retrieval, diagnose causes, or establish willingness to pay.

## PR352 deployed result and follow-up

PR352 passed every CI gate and deployed as ddb261b5ace3dfd0e7c5f3d4c3e0744d56a15043 (dpl_7JvjDg8y1x71ZHCfeV6ho8RCF1XX). Internal browser sign-in was restored through secure Google authentication.

Exact Rowan retry FAILED: both reviews rejected noDuplication, while the other six criteria passed. Request 60a698cb-c515-4140-b210-93ea9b0bf264; credit released. Immediate-care guidance was visible before generation and remained visible after failure. This is not a content acceptance pass.

Follow-up replaces parallel generated detail arrays with one canonical event list, each event assigned one section by the server. Duplication verdicts must cite valid same-date item locations in two actual supporting sections; overview/profile/question repetitions or nonexistent locations cannot veto the report. Grounding, omission, uncertainty, category, relevance and question checks remain independent and unchanged; no clinical text is deleted to satisfy a duplicate verdict.

During richer synthetic fixture setup, the Today native datetime input displayed a historical selection but saved its previous current-time state. This is the same native-input event synchronization class previously fixed on Vet Brief dates. Both Today and the shared care-entry editor now synchronize on input as well as change. One synthetic Sable lab note needs its timestamp corrected through the editor after deployment; its text already states the actual intended June 1, 2023 observation date.

## PR353 live audit and admission repair

PR353 passed all CI gates and deployed as 2f878dfb19fd584c2fdfa78d31a4c12abbb361fc (dpl_5SxxB7KiTAoZT9YDRUbENcpvsNs6). Exact Rowan now generates with current urgent guidance, exact recorded taper doses, the owner/record timing conflict, and unavailable arthritis/laboratory history. Manual audit keeps it PARTIAL because one question called the hind-leg weakness chronic without evidence and the short reason presented disputed completion too definitely.

Rowan vaccination also generated and preserved missing vaccination/reaction records and the recorded prescription. Audit keeps temporal attribution open: a question called the taper current, and its dated prescription appeared under Date unknown. Mochi weight comparison FAILED generation: both reviews rejected categoriesAccurate (request 65b314a7-4699-4ea1-b057-b72b307b1c5b). Mochi coat-care PASSED factual focus: April 18, 2024, seven minutes, easily removed tangle, no invented skin diagnosis or unrelated diary. Its sparse output was unnecessarily verbose and its questions asked for some already listed information.

The richer Sable fixture's first submission was denied because another generation was active. Subsequent clicks replayed the same denial even after that work finished. Root cause: rate/concurrency admission was inside the idempotent completion callback, so a temporary 409 became a persisted terminal response while the client retained its key. Admission now precedes completion; denied admission abandons its claim before any credit reservation or provider call. The client scope advances to v3 to retire keys cached by the old behavior. Actual-route tests verify both 409 and 429 denial, zero generation/credit on denial, then successful same-request retry and lease release.

Generation and review now explicitly check factual premises inside reasons/questions, source-relative medication timing and current-use uncertainty. Category instructions distinguish record storage labels from published clinical meaning, and permit measurements/routine observations in supporting history. Sparse outputs should have proportionate detail and questions that advance the appointment.

Synthetic fixture date correction was completed through the existing care-history editor, not SQL. UI verified June 1, 2023 at noon. Five additional synthetic Sable records were saved through the same editor with verified occurrence dates: September 13, 2023 rabies vaccination/reaction/clinic next-due date; August 28, 2026 comparison creatinine; September 1 prednisone schedule ending September 10; September 8 itching improvement; September 12 itching return with no heavy breathing or weakness. Rowan's original records were not altered.
