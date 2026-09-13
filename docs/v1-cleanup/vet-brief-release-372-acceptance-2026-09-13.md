# Vet Brief production acceptance — 2026-09-13

Release: PR #372, production commit 545485b4bc3db271d36509a5f3f165ed64802a0e.
Deployment: dpl_9gtKBYbC1J8QczXJEGDBhZ4cKTSL, READY, aliases include www.furvise.com and furvise.com.
CI: Security CI run 34740184022 passed every gate. Local verification: 2,271 tests, full lint, TypeScript and production build passed.

Tests used the existing signed-in account and synthetic Mochi, Rowan and Sable fixtures. No source histories were modified. One synthetic Sable brief was saved and confirmed.

| Check | Result | Evidence |
| --- | --- | --- |
| Input above limit | PASS | 12,001 characters remained intact; counter displayed 12,001 / 12,000 and submit disabled. |
| Loading state | PASS | Visible spinner and skeleton; longer request changed to Still working. |
| Vague concern | PARTIAL | Completed without invented symptoms, but routine eating, play and grooming observations inflated overview/questions; coverage wording repeated. |
| Long medication note, first attempt | FAIL | 1,969-character request returned 401 Your session has expired before generation; text remained intact. |
| Same long note, explicit retry | PASS | Final NOT vomited and uncertain carprofen dose preserved, correct 2.5 mg/1.25 mg prednisone plan retained, prescription distinguished from administration, diagnoses owner-attributed, dated 15 kg retained. |
| Six-date vaccination/labs | PASS for clinical content | Both 1.1 and 1.4 mg/dL creatinine results with 0.5–1.6 intervals retained; prior rabies reaction/resolution, exact prednisone schedule, symptom dates and conflicting last-dose recollections preserved; no kidney diagnosis or vaccination clearance invented. Overview remains dense. |
| Urgent report | PARTIAL overall; urgency display PASS | Emergency guidance appears once before/during generation, once in preview and once in edit mode. Medication uncertainty retained, but overview includes unrelated old meal quantities. |
| Local draft save/reload | PASS | Restored report text exactly equal to pre-save text. |
| Confirmation | PASS | Synthetic Sable report 5533a501-f5e6-4948-8208-eec207aff326 confirmed as version 1. |
| Confirmed reload, first attempt | FAIL | Returned Your session has expired. |
| Confirmed reload, second attempt | PASS | Exact confirmed report text restored. Stored data was intact. |
| Production PDF | PARTIAL | Download succeeded, all three pages rendered and inspected, branding/fonts/readability/content intact without clipping. Coverage and disclaimer alone occupy a mostly empty third page. |
| Runtime error/fatal scan | No matching logs | Exact deployment, 15-minute scan. This does not erase observed 401 responses, which were info-level request logs. |

## Remaining acceptance issues

1. Intermittent session rejection on generation and confirmed reload. Existing lifetime preflight does not eliminate it. Server authentication currently maps missing getUser data to an expired-session message without distinguishing underlying errors. No root cause is claimed established.
2. Relevance and concision: routine historical observations still enter vague/urgent overviews, and generated sections can repeat coverage prose despite the separate History reviewed section.
3. PDF pagination: avoid a mostly empty trailing page while retaining all evidence and legibility.

Feature closure remains open. Retried successes are separate from first-attempt failures. No production code was changed after the tested release.
