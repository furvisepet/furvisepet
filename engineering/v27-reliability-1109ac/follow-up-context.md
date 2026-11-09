# Visible conversation context for read-only Ask follow-ups

A reply can display exact notes and deterministic calculations in sections while its direct answer only says “Here are the notes.” The authenticated context loader previously retained only directAnswer. Follow-ups such as “quote the second one again” therefore lost the visible antecedent before retrieval selection. Older summary-only replies were also omitted.

The loader now copies the prior visible direct answer (or legacy summary) plus string section headings/items into conversation context. It never copies citation proofs, capabilities, application actions, source IDs or arbitrary JSON fields. No new retrieval tool, write capability or provider call is added. Prior dialogue remains untrusted context; saved-record claims and quotations still require a fresh owner/pet-scoped read. Existing 2,000-character/message and 8,000-character/window limits apply, with explicit clipping disclosure.

## Controlled evidence

On source base 707ecebf40a35306082095596a65f7f1ac77e844, the first 14-case regression had 9 passes / 5 failures: lost quote/calculation text, lost malformed-field-safe visible text, summary-only recall, missing follow-up antecedent and missing clipping disclosure. After the fix, the initial combined cohort passed 35/35. Two further adversarial cases retain rejection of foreign sources and prove embedded instructions remain dialogue data. All 16 new cases pass in the full focused/security gates.

- Focused: 701 total / 700 pass / 0 fail / 0 cancelled / 1 existing optional skip.
- Security: 454/454.
- Uncached TypeScript, lint, production dependency audit and production build: pass.
- The 50-question mocked corpus remains separate from live model accuracy; overlapping suites are not added as new user scenarios.
- Paid calls in this continuation: zero. The prior iteration cap remains closed at 16 turns / 32 physical calls / $0.062993 reconciled usage.
- Exact new-source authenticated acceptance is not demonstrated by these offline tests.

## Interrupted independent Linux run

The prior 707ecebf Linux job v27-rel1109ab-linux-full-v4-job lost its supervisor. Host boot 1794210101.9016504 occurred after job start 1794209888.9625452. Recovery observed no running WSL distribution and no Docker engine pipe; fullSuite remained null and no terminal receipt existed. Diagnostic 65 pass / 1 skip plus two SQL passes are preserved. The unfiltered full suite is interrupted, not a pass or a measured final failure count. Supported acknowledgment records the evidence without retrying the old job.

GitHub run 42575477497 refused all three jobs before any steps due to account billing/spending restrictions. Local Linux validation is independent evidence, not GitHub CI. No billing controls, runner trust, release gates or production settings are changed.

No files/tests, non-AI CRUD, migrations or historical evidence are deleted. Rollback is a normal revert of this isolated follow-up patch; no data migration is involved. PR remains draft and production release remains NO-GO pending current-source live acceptance, applicable full CI, independent ownership/security review and monitoring qualification.
