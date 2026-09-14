# Vet Brief broad reliability and presentation audit

## Trigger

The owner supplied a new failed request combining current lethargy/thirst, alleged five-year weight decline, Stage 2 renal disease, carprofen and a recently completed prednisone course. Saved Rowan evidence does not establish all these premises. Runtime request c0f2d783-2f97-47f4-ace7-5ba04315f1a2 first failed categoriesAccurate; a whole-document repair then failed factsSupported, uncertaintyPreserved and questionsUseful, with diagnosis_or_causation located in questions. This is a new failure, not hidden by the prior accepted cases.

## Changes

- Independent review locates every section needing repair. The server replaces only those sections, retains other sections unchanged and re-reviews the complete assembled report. Moving an event requires both source and destination targets. Source references are retained across the merge. Unsupported second attempts still fail; no factual criterion is bypassed and no additional provider-call allowance is introduced.
- General owner-premise guidance preserves alleged diagnoses, medication use and historical trends as attributed reports while comparing them against actual records. No symptom-, diagnosis- or pet-specific recognition patch was introduced.
- Vet Brief uses the shared workspace width, PageHeader and section typography. Inter is self-hosted for the whole website and embedded in the PDF. The earlier CSS named Inter without loading it, causing platform fallback differences.
- Generation replaces the static form with an accessible skeleton and indeterminate activity indicator. Reduced-motion preferences disable animation. After 30 seconds the copy honestly says it is still working; no fabricated percent or server stage is shown. Initial loading also has a skeleton. Failed preparation retains the reason/date state.
- Screen/print use the canonical BrandMark. PDF uses a rasterization of the unchanged official vector master, forest colors, dated evidence labels, continued-page identity and page numbers. Fonts and branding are explicitly included in server output tracing.

## Local verification

2,259 tests pass, TypeScript and focused lint pass. Tests exercise attempted rewrite drift during category repair, preservation of unrelated sections and source references, complete second review, terminal failure after a second factual rejection, and invalid/missing repair targets. Two old visual assertions were updated to the deliberate workspace and font-loading changes.

The exact unchanged confirmed Sable document was rendered through production PDF code. Initial Inter subset embedding produced missing glyphs visible in raster inspection; full font embedding fixed it. Both final pages were visually inspected with no clipping, missing glyphs or orphaned headings. Sample: output/pdf/Furvise-Branded-Vet-Brief.pdf. Its clinical wording remains the earlier confirmed owner-reviewed text, not a new model acceptance attempt.

## Live acceptance

Eight cases were frozen before deployment in vet-brief-broad-acceptance-2026-09-13.json. Results are recorded separately below. Earlier Ask first-attempt score remains 12 pass / 7 fail / 1 partial. Passing this bounded set does not establish universal input handling, complete lifetime retrieval, veterinary endorsement or willingness to pay.

The new eight-case first attempts were **5 pass / 3 fail**, spanning the iterative releases below. Passes: complex owner premises, messy medication uncertainty, missing dental history, cross-pet instruction noise, and invalid historical measurement pressure. Failures: Spanish historical retrieval, vague concern, and contradictory dates. Retries do not replace those first attempts.

## Failures and general follow-up fixes

- Spanish first attempt omitted both the older creatinine and vaccine reaction records. Search-language guidance retrieved both lab results on its first retry, but still omitted the reaction, so that retry remained a failure. Literal query anchors now avoid multiword phrases and normalize long terminal-e words to match changed endings without altering clinical evidence or adding query terms.
- Vague concern first failed categorization/relevance. Generated non-medication events now use neutral dated supporting history with descriptive labels. The first retry no longer failed categorization, but failed factual/uncertainty checks and then important-history preservation. Scoped repair now receives proposed wording separately from unchanged evidence so it can edit the failure while retaining other supported details. A rejected draft is never promoted to evidence and the assembled result still receives independent review.
- Contradictory-date request d19eb074-8da0-4bb9-8fbc-7f3958b5f9d1 reported unavailable history reads and then AiCreditLedgerError. The credit was already completed. Vet Brief no longer performs an unused allowance lookup after durable completion, so that optional display read cannot hide a paid result. Long requests refresh a near-expiry browser session before capturing a fixed bearer; server authentication and RLS remain authoritative. Token expiry was a code-level exposure, not proven as the sole cause of this request.
- Database inspection found candidate readers still rejected non-ASCII words even though planning allowed them. Migration 20260913023635 changes only the literal character validator to Unicode alphanumeric input. It verifies old function hashes, preserves ownership/limits/timeouts, updates exact readiness pins, and revokes temporary DDL privilege before commit. Live SQL accepted accented words, found the synthetic vaccine record with vaccin, rejected wildcards/backslash and an unauthorized pet, and verified both reader owners, grants and pins. Security advisors returned existing RPC/extension/password-protection warnings; this work does not claim a clean project-wide advisor report.
- The contradictory-date retry on PR369 replayed the old terminal request d19eb074 rather than generating again. It is a recovery-flow failure, not new evidence about the patched model. The client now retires a key only after the exact known completed preparation failure; the next explicit click can retry. Ambiguous transport failures, 429 and in-progress responses keep their key. No automatic paid retry was added.
- A future appointment was also incorrectly interpreted as a request for future-dated records, producing an invalid unpaired background RPC range. Vet Brief now always retains its as-of history boundary. A real retrieval harness checks both date bounds and retained historical evidence for tomorrow's appointment.
- Vague concern on PR369 generated successfully and passed publication review, but the external usefulness audit marked it partial for excessive routine detail. Generator and reviewer now agree to use recent representative routine observations rather than repeated normal logs, while preserving material abnormalities, medications, reactions and requested comparisons.

## Current retry evidence

Spanish clinical content passed on PR368 plus the multilingual SQL change: both creatinine values with dates, units and reference ranges; rabies reaction and resolution; exact prednisone schedule and last dose; itching improvement/recurrence; no invented renal diagnosis. English product headings remain English; the requested clinical body is Spanish.

The exact complex owner-premise case passed again on PR369, retaining 15 kg, the prescribed prednisone schedule, the disputed completion date, current symptoms, and missing historical peak/renal/carprofen evidence. One preceding authentication failure did not reach generation and is retained separately.

PR370 adds completed-failure key recovery, as-of bounds for future appointments, and concise routine baseline guidance. CI first caught outdated harness wiring and an old nested-test count; the helper was added to the harness and the count updated to include the added regression. The real page request harness verifies a known terminal failure does not automatically retry, the next explicit attempt gets a new key, and ambiguous failures retain theirs. Final Security CI 34734241249 passed all gates on head 169130a5d718438a106d471f6fb8d2b41f61731b.

PR370 merge fd68e658c2bcbe1a1f10ba8dc18e0a0a82459e66 deployed as dpl_Biqn1v7szwTF4QZmDgqmG6bfXPF8, verified READY with the exact SHA and furvise.com/www aliases.

The contradictory-date case passed on PR370 after the expected one-time legacy cached response. The next explicit click produced a new report preserving the saved September 10 and uncertain owner September 12 last-dose dates, full dosing course, itching improvement/recurrence, and prior rabies reaction/resolution. No date or source record was edited to obtain this pass.

The PR370 vague report remained partial for excessive routine detail and an expanded owner purpose. Root inspection found the planner's expanded focus was exposed as the appointment focus in the evidence bundle. PR371 substitutes the original owner request and makes the generation/review distinction explicit: retrieval checks can broaden searching but cannot invent requested output goals. A semantic test verifies an invented planner purpose never becomes the report purpose.

PR371: all Security CI 34734716176 gates passed; merge 6749b0601fc0e60835e25ed39ac2dbf46be5ba16 deployed as dpl_86YZj3FtRVPvEempi72Zpq9oUJE2, READY with exact SHA and furvise.com/www aliases.

## Completed acceptance result

All eight frozen scenarios now have passing results across the iterative releases. The original first-attempt score remains **5 pass / 3 fail**. Full attempts, including failed/partial retries, an authentication failure and a cached replay, are preserved in vet-brief-broad-results-2026-09-13.json. This does not claim all eight were rerun on the final SHA.

| Scenario | First attempt | Passing release |
| --- | --- | --- |
| Complex owner premises | Pass | PR364; repeated on PR369 |
| Messy medication uncertainty | Pass | PR364 |
| Spanish labs, vaccine reaction and medication course | Fail | PR368 plus multilingual SQL |
| Missing dental history | Pass | PR364 |
| Cross-pet instruction noise | Pass | PR365 |
| Vague concern | Fail | PR371 |
| Contradictory medication dates | Fail | PR370 |
| Historical measurement pressure | Pass | PR366 |

The final vague report keeps the original owner purpose, uses representative recent baseline observations rather than repeated normal logs, does not invent current symptoms or trends, and gives practical exam/home-observation questions. It remains a preparation document based on available owner records, not a complete clinical record or a veterinary endorsement. Price/value should still be evaluated through real owner and veterinarian use.

The SQL migration source was recorded under its matching version/name in deployment migration history after successful verification. Preliminary DDL attempts failed atomically because the dedicated reader owner requires its existing SET-role membership and temporary CREATE privilege; the final transaction followed the original migration pattern and restored no-CREATE before commit. No role membership or public execution grant was added.

## Deployment evidence

- PR364: merge deeb788edf50d4871772d20416afa13169d812c7; Security CI 34731892842 passed; production dpl_BvvjSbS6g2F9xoCXttTihiMzFB5j READY with furvise.com aliases.
- PR365: merge d07f7e82ba91622b28bea8d8e8bbbaf0e50261b2; Security CI 34732231237 passed; production dpl_BQPpNt2zUWdvrWeR64gPxXacMobb READY. Skeleton bars initially matched their background; this patch corrected contrast and a live screenshot verified visible bars (output/pdf/furvise-loading-verified.jpg).
- PR366: merge 06b4167d7f65c8716b3720c58f117a3c09f141d6; Security CI 34732441880 passed; production dpl_7iLDeaFZ61pgN4vwsf1Qxnxg4PS3 READY.
- PR367: merge b4fa0940f0cbbf83704eb6d2c54375a6cf3b67f0; Security CI 34733011749 passed; production dpl_EU6iTr2GKzPmTf9rTguDnAYqrkXP READY with exact SHA and furvise.com aliases.
- PR368: merge bb7cf14fbadc47f98cf530b66412030ed6b9bdb9; final Security CI 34733420928 passed. Includes session freshness, literal anchors, no unused post-completion allowance read, and proposed-draft repair context. Additional semantic/session/accounting tests passed locally.
- PR368 production dpl_B96Z5kkemWSZQ4HyGovxWnkBf4x7 was verified READY with the exact merge and furvise.com aliases.
- PR369: merge a6894d74aabba3c9fe46449164946b8ac16dd030; Security CI 34733600976 passed; production dpl_4SSoojymXEQJJJnD976bgUaWYdqX READY with the exact merge and furvise.com aliases. It records the already applied multilingual reader migration.

## Live presentation and export

Desktop workspace width, shared headings, loaded Inter body font, official report logo and visible loading skeleton were inspected in production. Reduced-motion behavior is implemented; mobile browser resizing was not available in this session, so this is not a claim of live mobile verification.

The production Download PDF action produced a 424,686-byte PDF. The browser automation download event timed out, but the downloaded file was present and its extracted clinical text matched the visually inspected sample exactly. Both sample pages were inspected after fixing subset-font glyph loss. No external sharing or source-history edits were used to make tests pass.
