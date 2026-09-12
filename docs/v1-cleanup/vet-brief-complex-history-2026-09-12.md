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
