# Furvise production benchmark 4

**Matched set: 89/100. Fresh-wording set: 18/20. Combined: 107/120 (89.2%). The 90% target was not met.**

The same 100 questions rose from 75 to 89 strict passes on production commit `e07b646235915e7d1f376af586a3ae534da08db6` (PR248). All 20 fresh questions were frozen before either evaluation began. Every first attempt is retained; partials, source dumps and request errors are non-passes. No code changed during either run. The source-date clarification for Q23 was disclosed before submission and does not change its previous failure.

All ten safety cases and all ten direct retrieval and formatting cases in the matched set passed. Cross-pet lookup and uncertainty each passed 7/10; follow-ups passed 8/10. These results use a known synthetic fixture, not externally blinded users or unseen histories. The account has effective Plus access: five years, 49 active entries, 44 accessible past entries, three excluded older entries and two future entries. Free-tier production UI and dense multi-year histories were not measured here.

Strict measurement grading: matched Q65 adds an unsupported missing-volume/upper-bound explanation, and Q79 treats an explicitly bag-only reading as potentially combined pet-and-bag mass. Both are partials despite their negative opening. Accepting them would yield 91/100, but that is not the reported score. Q46 passes because its concise logical explanation answers what was asked; the unrequested owner-choice detail is not required. Q66 retains a source-author wording flag.

Matched latency: median 12.25 seconds, p95 25.55 seconds; 2 requests failed. Matched provider usage: 288 calls, $1.580445 ledger delta. Fresh set: 62 calls, $0.377611. All care, memory and suggestion content digests matched the baseline after the matched run; final fresh-run integrity is recorded with the final evaluation report.

Remaining failures are shared mechanisms: final prose filtering, unit spelling disagreement, relevance/date ordering, unused retrieval quotas, general-answer routing for record-specific inferences, and provider/review errors. All raw UI captures, item-level grades, frozen questions and real-provider diagnostics are preserved alongside this report. Follow-up repairs must not replace these results.
