# Vet Brief redesign — 2026-09-12

## Product objective

Reduce owner effort and give the veterinarian a concise, evidence-backed appointment preparation report. This is not a diagnosis, a complete medical record, or a substitute for examination. Commercial willingness to pay and clinical usefulness require actual owner/veterinarian feedback; neither is established by software tests.

## Changes

- Purpose-first preparation; no generation before the owner supplies the appointment reason.
- One reading column by default. Optional expandable edits replace the multi-column dashboard and nested preview scrolling.
- AI-generated visit overview precedes dated observations, medication records, supporting history and discussion questions.
- Independent review checks grounding, material omissions, classification, uncertainty, repetition and question quality before publishing the generated draft.
- Routine food observations are no longer automatically classified as changes. Timing words do not by themselves establish patterns.
- One publication contract feeds screen, print, PDF and shared text. Exact duplicates collapse; distinct dates, amounts and contradictory observations survive. Empty sections are omitted and material unknowns grouped.
- PDF embeds licensed fonts and preserves supported Unicode. Unsupported characters trigger an explicit browser-print alternative rather than silent deletion.
- Existing saved briefs remain readable; confirmed versions are retained when editing a new version.

## Verification

- Initial full local run: 2,212/2,212 passed before the overview/font additions.
- Later full local run: 2,213/2,214; one legacy-draft equality regression caused by defaulting an optional overview to an empty string. Fixed by preserving absence on legacy documents. Focused compatibility/report suite: 12/12 passed after the fix.
- TypeScript passed. Lint: zero errors; nine existing warnings outside changed code.
- Rendered representative PDF inspected with embedded fonts. Long timeline checked across two pages; sparse output checked for empty-section noise. All five sample PDFs regenerated with the production generator.
- PR342 CI: all gates passed, including 2,214 tests, focused security checks, dependency audit and production build. Merge commit: `69137fe44731e167ec2da85b5dfb96c1b76fbf8c`. Deployed acceptance remains pending.

## Frozen live acceptance checks

1. Sable routine preparation: use existing September feeding evidence; no invented food change, no repeated breakfast note, useful bounded overview.
2. Sable historical preparation: December 1–3, 2025 scent-game records; preserve 11 and 13 minutes and correct dates without asserting current symptoms.
3. Mochi weight discussion: April 2024 record versus current profile; preserve historical/current distinction and avoid invented diagnosis.
4. Edit a generated section continuously, review, confirm an internal QA version, reopen, and verify edits survived.
5. Download the confirmed PDF and compare the synopsis, dates, amounts and questions with the on-screen brief; verify the deployed font assets.
6. Open print view and inspect export controls; inspect native sharing without sending to a recipient.

Keep first-attempt failures separate from retries.

## Remaining limits

- Vet Brief retrieval is bounded (up to 300 care entries over at most 730 days, with separate memory limits). It does not certify complete lifetime coverage. Capped/unavailable history is disclosed.
- The AI reviewer improves validation but is not a mathematical guarantee against every unsupported sentence or omission.
- Owner edits after AI review are owner-authored. Confirmation means owner approval of that version, not veterinarian approval.
- Native sharing completion depends on the user's device and chosen recipient application.
- Paid launch confidence requires passing live acceptance plus a wider unseen set and practitioner feedback.

## First deployed attempts (PR342)

- Routine Sable brief: FAILED. Independent review accepted factual support, categories, uncertainty and duplication but rejected question usefulness. No draft was published and the AI credit was released. Added one bounded repair plus independent re-review and clarified the distinction between unknown facts and new discussion prompts (PR343).
- Historical Sable brief: FAILED. Native date inputs displayed December 1–3, 2025 but React state/request retained June 14–September 12, 2026. The report therefore contained the September feeding note instead of the requested scent-game history. Reproduced by switching views and seeing the date values reset. Added native input-event synchronization (PR343).
- Visual inspection: one readable column, optional editing, no nested preview scroll. Export validation of a confirmed live version remains pending.

## Recovery patch

PR343 passed all CI gates with 2,217 tests. Merge commit `a2dab6a949dab9f4f3c2a97ff2603e5febc2e78d`. The generation/review sequence permits one repair and re-review, bounded by four provider calls. The concurrency lease outlives the 150-second route. Native date input events now update state before generation.

## PR343 live retries and PR344 follow-up

- Historical Sable retry: PASS. December 1 and 3, 2025 records preserved at 11 and 13 minutes; no current symptoms inferred. Useful questions and unknowns shown.
- Routine Sable retry: FAILED before generation. The first failed attempt had released its credit; the browser retained its idempotency key, and the ledger correctly refused to replay it. PR344 introduces a specific released-request response and rotates only that terminal key once. Completed, in-progress and ambiguous outcomes do not create automatic fresh charges.
- Edit/confirm/reopen: PASS. Internal QA note survived continuous typing, confirmation and reopening private version 1 (`28c6121e-0607-4990-88a4-11b7f60c9503`).
- Print view: PASS for matching saved content. Native share is unavailable in the test browser; no recipient sharing performed.
- Production PDF: content PASS, pagination FAIL. Correct dates, amounts, questions and edited text downloaded, but the disclaimer occupied a second page alone. PR344 compacts identity information and calculates the actual disclaimer space; five sample PDFs regenerated and inspected.
- Mochi historical-weight first attempt: PARTIAL. April 9, 2024 body weight 3.97 kg correctly distinguished from current profile 3.8 kg, with no diagnosis or cause invented. However, unrelated grooming/activity/housekeeping cluttered the report. PR344 adds an independent visit-focus criterion and clarifies relevance selection rather than applying a pet-specific filter.

PR344 final deployed retries remain pending at this checkpoint. Earlier failures are retained above; they are not replaced by later passes.

## Final deployed verification

PR344 merged as `4fd5594f27486925b24ace5753e40111de4095a7`. CI run 34689315467 passed all gates: lint, TypeScript, 160 focused security checks, 2,218 full tests, production dependency audit and production build. Vercel deployment `dpl_5EYYpYKTf8g5bgPCBNeDwv9FkjDR` reached READY with furvise.com and www.furvise.com aliases.

- Original routine Sable wording retried in the same browser session: PASS. Report explicitly acknowledges sparse records, preserves September 10 breakfast at 83 g, classifies it as routine, and includes useful discussion questions. No actual change or current illness invented.
- Mochi exact original request and April 1–30, 2024 range retried: PASS. Current profile 3.8 kg remains visibly separate from April 9 household measurement 3.97 kg. Measurement method and unknown cause preserved. Unrelated activity, grooming and housekeeping removed. Questions focus on rechecking/tracking weight and the unknown medication list.
- Confirmed historical Sable production PDF downloaded after final deployment: PASS. One page, all original dates, 11/13-minute amounts, overview, questions and QA owner addition retained. Rendered and visually checked. The browser automation download-event wait timed out, but the actual saved PDF and successful UI status independently confirmed completion.
- Saved brief reopening and print content parity passed on PR343; final PDF regenerated from that same private confirmed version on PR344. No real patient data or external recipient sharing was used.
- Final sample: `output/pdf/furvise-vet-brief-live-qa-2026-09-12.pdf` (synthetic internal QA; not a clinical example or evidence of practitioner endorsement).

All six targeted checks are resolved within their stated scope. Native sharing is unavailable in this test browser and was not end-to-end tested. These retries are not a fresh broad acceptance suite and do not replace earlier first-attempt results. The bounded-history and clinical-validation limitations above remain.
