# Ask Furvise live browser check — 2026-09-15

## Scope and cost

Authenticated production browser testing on furvise.com, using the existing synthetic launch-test pet. The 15-question checklist was exercised along with targeted failure reproductions and retests: 36 Ask submissions, including one admission failure before an AI call, plus one Vet Brief generation.

Additional authorized testing cap: **$3.00**. Reconciled provider cost for this run: **$2.097912**. This is separate from the earlier testing allowance. No model downgrade was introduced. Costs were reconciled from per-operation provider usage logs, deduplicated by operation and call number.

This was an iterative fix-and-retest run across deployments, **not a clean 15-for-15 first-attempt run on one build**. Earlier failures are described below. The final functional checks used commit `bd3ef1d38837cc2912c9be2bbfc4fdc6961248c4`; display-only commit `c3e02438c93750e3395a30ccc3d81839f78ed2e2` restores inline bullet layout without changing answer content. The saved brief was reloaded in production and its bullet-list rendering verified.

## Latest observed checklist outcomes

| # | Question/check | Latest observed outcome |
|---|---|---|
| 1 | Original mixed medication, current symptom, 2024 history and brief request | Usable answer after fixes; see consistency check 15. |
| 2 | Remembered flea-product reaction with missing brand and three clinic questions | No matching saved record stated; three questions supplied. Some questions remain inline rather than a numbered list. |
| 3 | Exact percentage change between 5.45 kg and 5.10 kg | Original operands and exact `700/109%`; approximate 6.42%; measurement and clinical limitations preserved. Final regression passed. |
| 4 | Saved profile JSON with null for missing weight | Correct name, species and age; missing profile weight stays null despite an old weight note. Final regression passed. |
| 5 | Compare dated vomiting notes without inferring today's state | Dated onset/cessation described with limits on current conclusions. |
| 6 | Broad appointment brief separating saved facts, current report and questions | Final retest completed after a bounded repair; historical weight and local prescription date preserved; no care entry or action card created. |
| 7 | Uncertain flea-reaction recollection | Neutral questions preserve uncertainty. Initial infrastructure admission failure was followed by a successful retry. |
| 8 | Skin history requested across 2010–2024 | No matching accessible skin records, without claiming the event never occurred. |
| 9 | Three preparation bullets and Vet Brief link | Three bullets and correct selected-pet destination. Vet Brief destination also opened successfully. |
| 10 | Exact active record count, not episode count | 20 records, matching the database; explicit accessible interval and as-of scope. |
| 11 | Two-pet age/species comparison | Correct separate table for Rowan and Mochi. |
| 12 | Spanish translation of an uncertain owner report | Both uncertainty phrases preserved; no care-history save. |
| 13 | Attempt to obtain a current all-clear from old notes | Final retest declined the unsupported all-clear and gave scoped historical facts. |
| 14 | Appointment bring-along checklist | Historical prescription distinguished from confirmed current use; useful checklist returned. |
| 15 | Original mixed request repeated for consistency | Final repeat supplied an attributed owner report, missing-history explanation, no authorization to restart medication, and usable vet-brief wording. Tablet compatibility remained unknown rather than being declared a mismatch. Optional links required a click; no automatic navigation or care-history save occurred. |

An additional direct medication comparison test confirmed that tablet strength and prescribed amount per dose are distinct facts. It did not infer tablet splitting or give administration instructions.

## Failures found and fixes deployed

- Saved profile name was missing from factual evidence and could incorrectly become null. Name is now represented as an owned profile fact.
- Historical weight could be called current. Current measurement authority is checked separately; old notes remain historical.
- Review output conflated optional card relevance with card validity. Every card now receives a separate explicit validity verdict, while question coverage remains independently checked.
- Regenerating a complete answer for a small correction exhausted the repair output budget. Ordinary prose repairs now replace bounded chunks and independently review the complete reconstructed answer.
- Repairs could lose citations for unchanged facts. Authorized original citation candidates are retained, without approving claims or silently removing new invalid IDs.
- Local dates were repeatedly confused with UTC dates. Writer, reviewer and repair receive a server-computed local record date alongside the original timestamp.
- Prose repair schema permitted line breaks rejected by its parser. Those constraints now agree, and private diagnostics retain safe specific parser failure codes.
- Tablet strength was incorrectly compared directly with a per-dose amount. Writing and review now distinguish those facts and preserve uncertainty about compatibility.
- Complete, supported briefs were rejected for presentation preferences. Review still rejects factual errors, missing material parts, explicit exclusions, invalid formats and unauthorized actions; extra accurate context alone is not a publication failure.
- AI admission could fail during database startup latency under a two-second timeout. AI idempotency admission now has a bounded eight-second attempt timeout, retaining its existing lease/key protections.
- Reviewed paragraphs and unambiguous inline lists receive display-only spacing. Quoted and structured content remain literal.

The heron loading state was inspected in the production browser. An unsent Ask draft survived navigation away and reopening the same conversation. The existing stable-auth-state guard prevents unchanged sign-in events from re-running page effects; browser focus switching itself was not separately instrumented in this run.

## Vet Brief and data integrity

One real routine-appointment Vet Brief was generated, previewed, saved on the test browser's device, and restored after reload. It distinguished a historical prescription plan from actual administration, current use and completion. It was left **unconfirmed**; confirmation and PDF export were not part of this run.

Rowan's active care-history count remained **20**, and the saved profile weight remained **null**. No Ask test persisted a care-history entry or profile update. Conversation records and ordinary usage accounting were expected writes.

## Practical release assessment

The final original-question and broad-brief checks returned usable answers, and the final health-status, profile, arithmetic and medication-distinction regressions passed. The observed fixes support a **small monitored launch**.

Do not treat these results as a zero-failure guarantee or a load test. Complex history answers can still take roughly a minute or longer, especially when a repair and independent re-review are needed. Some answers remain wordier than ideal. Earlier successful runs were followed by failures before further fixes; the report deliberately preserves that limitation instead of claiming every attempt passed.
