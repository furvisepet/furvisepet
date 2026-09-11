# Ask launch flow audit — 2026-09-11

This is a chronological investigation log. Earlier pending statements describe that stage; the final acceptance section records the latest result.

## Live baseline

- Production compound navigation/explanation/calculation request correctly returned 2,100 g and a working Clover profile link. Persisted conversation `d7bc1888-8720-4e45-9a91-c3f7ccea014a` nevertheless had outcome limited: evidence, subject/date and calculation checks were not evaluated.
- Clover episode request reproduced the unresolved legacy correction limitation. No exact count was claimed.

## Repairs

- Non-history completion review now separately returns evidence, subject/date and calculation verdicts with reasons. A failed verdict invokes the existing single repair and independent re-review. Missing/malformed verdicts cannot certify completion. Inapplicable checks require explicit justification. Evidence and final answer/action snapshots are bound together across review. Existing deterministic failures remain failures; mutation readiness never becomes execution success.
- Deletion receipts now retain affected pet IDs. Known deleted sources affect their pet. Missing identities conservatively affect all pets present at capture. Existing owner-only debt is backfilled to every existing pet, never cleared. New pets do not inherit historical deletion identities. Correction edges inspect their endpoint subjects. The existing authenticated read boundary, revision bracketing and writer provenance remain mandatory.
- Migration rollback restores conservative account-wide readers without deleting the new receipt information.

## Verification before deployment

- 1,453 focused tests passed, zero failed/skipped/cancelled.
- Full project TypeScript check passed; changed TypeScript ESLint passed.
- Disposable PostgreSQL/WASM writer-to-reader scenarios passed, including 70 sources/two episodes, import deduplication, correction/deletion invalidation, saved ordinal references, and unaffected Luna counts after deleting Milo data. Provider mocked in these SQL pipeline scenarios.
- SQL time/role/receipt assertions passed and rolled back. Private scope helpers and receipt tables remain inaccessible to application roles. Native multi-connection concurrency was not tested by the embedded database.

## Remaining limits

- Old unlinked correction notes, unclassified historical sources and unknown deletion identities still cannot establish exact counts. No correction relation is inferred or cleared by this migration. This does not complete legacy reconciliation or narrow unknown correction effects within the same pet to individual topics.
- This is an Ask audit, not certification of billing, Vet Brief or all launch surfaces.

## Additional live save finding

The first app save for new synthetic pet Rowan failed with `ASK_TASK_INCOMPLETE_OBLIGATIONS_3` (request `a47d97af-ecfd-47de-aff3-fc56039e9fd4`). Completion review could inspect application cards but could not see already-governed semantic health events waiting for persistence. The reviewer now receives those events as pending actions for explicit saves, with exact subject/date/source data. It cannot invent events, change their authority or turn readiness into execution success. Ordinary observations retain their confirmation policy.

## Production acceptance

Database migration applied as `20260911062524`; retained legacy debt remains bound to the ten existing pets. Rowan was created using app onboarding afterward. Final application deployment and live recheck pending.

## Live persistence boundary finding

The retried answer reached persistence, where SQL rejected `RECORDED_SOURCE_PROVENANCE_INVALID`. `persistCanonicalSemanticEvent` had passed a presentation-rewritten source excerpt into the RPC while retaining the original source hash. The repair passes the original governed event; presentation preparation remains available for display and duplicate matching.

The disposable SQL scenario now runs every save through `persistIntelligenceLearnings`, the same coordinator used by the route, with only its connection factory replaced by the SQL test transport. It reproduced the exact production error before the one-line repair and passed all scenarios afterward. This supersedes the narrower direct-RPC writer coverage. No SQL validation was weakened.

## Production recheck after PR 299

- Rowan's empty recorded register returned exactly zero in conversation `cfb04a7d-4860-4736-8cc5-943d14f0998b`.
- On production `4cf0d5f75e0bb149b11b7b3a5b7f0ac88e08c88b`, a real Ask save created entry `1fbcd91b-9f64-4ea6-8ecd-b903bd51bd36`, original text and `2024-02-01` date intact, and episode `cdee674e-a232-4fcc-830d-4ac3eeb46c1c`. Conversation `a1bafbab-13db-4f4d-8aad-e6cec627becc` has the successful persistence receipt.
- Resolution request `d19836f0-4f30-45df-a2de-2a8d561e7e7a` failed before persistence with `provider_call_budget_exhausted` after interpretation and generation. The generator's repair/fallback calls lacked an explicit phase and were denied as third ordinary calls. They now use one generation-repair phase followed by independent review, at most four calls. Interpretation repair, generation repair and downstream review repair cannot stack into additional cycles. Deadline/cost accounting stays enforced.
- The successful save also exposed a redundant proposed application save card beside its receipt. Exact matching health proposals are now removed before review when the same owned pet's governed event already represents the explicit save. Distinct details, other destinations and unapproved writes are preserved. The actual receipt still depends on persistence.
- Full TypeScript and the save/completion plus real-admission request-contract regressions passed for these follow-up changes. Deployment and resolution retry pending.

## Further live acceptance and repairs

- Compound calculation/navigation retest on PR 300 production returned 2,100 grams, opened Rowan's actual profile, wrote no care entry, and persisted all five checks as passed. Conversation `7b5849ad-135f-4055-86ee-f6eabf55b671`, answer `1dfc66e7-1aa6-424d-b51d-de9e208c273c`.
- The resolution retry reached admitted generation repair but initially repeated invalid recovery metadata. Safe diagnostics then confirmed `return_to_baseline` was being used for a symptom ending. PR 301 supplied exact rejected evidence and narrower repair instructions; the next attempt passed that gate but requested another task repair after its review and exhausted the remaining deadline. PR 302 puts the distinction into the initial instructions and adds bounded task-review diagnostics. Resolution acceptance remains pending; a successful generation repair alone is not end-to-end success.
- History's actual UI rendered the original date-only February 1 observation as January 31, 4 PM in its browser time zone. PR 302 preserves the stated ISO calendar date when metadata matches UTC midnight, across desktop/mobile/detail views. Timed records retain local-clock formatting. Both negative and positive time-zone regressions passed.
- Other activity has added separate recent entries to Rowan while this test runs. Those entries were not created, modified or deleted by this verification. Whole-history certainty must account for unclassified sources; a year-bounded count is tested separately, not substituted for an all-time guarantee.

Positive native-count acceptance: conversation `35955bf4-c372-4b2c-952c-ddc9d665e9b5` returned exactly one recorded vomiting episode in 2024, February 1. Reload preserved the count and its saved reference. The subsequent real app question “What happened during episode 1?” returned the exact dated source note. This is actual production provider/browser/database evidence, not the mocked SQL harness. It does not certify broad-window counts when unrelated sources remain unclassified.

## Native symptom compatibility root cause

Production episode `cdee674e-a232-4fcc-830d-4ac3eeb46c1c` has `episode_type=symptom`, unprefixed key `vomiting`, and a rebuilt summary containing counts/source IDs but no semanticDomain. The governance matcher inferred domain only from summary or a prefixed key, making this legitimate health episode invisible to resolution. A regression using that exact shape failed before the fix and passed after recognizing the persisted symptom type as health. Explicit conflicting domain metadata, unknown episode types, uncertain recovery and unsafe resolution remain rejected. The SQL regression now also exercises resolution of this native shape through the real governance/persistence coordinator.

The same native-key mismatch existed in the private exact SQL writer. Migration `20260911072639` expands its three exact-key predicates to the typed health/symptom alias, preserving user/pet scope, ambiguity checks, chronology, advisory locks and grants. The extended SQL regression first reproduced `SEMANTIC_EVENT_ACTIVE_EPISODE_REQUIRED`, then passed all 13 scenarios after the migration. It was applied to production; the application compatibility deployment and final live retry follow.

## Resolution acceptance on production 86459b6

The original failed logical turn `d19836f0-4f30-45df-a2de-2a8d561e7e7a` now completed in three provider calls. It created exactly one resolution entry `39b31b27-3efc-41f1-b95c-d8f6af9cfdb1` from the original source message, dated `2024-02-03`; the original episode is resolved at that same date. Answer `6942466f-c5c0-4b3f-8e84-4edf15e7caa9` has a persisted receipt. The UI date fix is also verified: the initial History row now says February 1 without an invented clock time.

That successful resolution exposed two final presentation details: the duplicate-card filter omitted the canonical `symptom` category alias, and a generated recovery heading implied current improvement for a historical event. The filter now includes the alias with the same exact-source matching; a shared neutral recovery heading replaces that unsupported present-tense claim. Prior saved answers are not rewritten.

## Second-episode production finding and PR 305

Request `0c7e81ce-c3b8-419f-be4c-6dc5ab00197a` on PR 304 production rejected a started event as `unsupported_evidence`, then fell through to a legacy care action. It saved entry `344b7ea6-bec7-4757-a4dd-6c798bfda578` with occurrence time `2026-09-11T07:36:39.86482Z` despite the owner's explicit `2024-06-09` date. The UI simultaneously asked for confirmation and showed a persistence receipt. This was a real failed acceptance case, not an HTTP delivery failure.

PR 305 adds one bounded event-evidence repair using exact current-message assertions and blocks persistence after any semantic-governance rejection. A rejected semantic proposal can no longer fall through to the legacy writer. The repair cannot stack beyond the existing generation budget. Tests preserve the exact historical date and opening boundary and reject repeated unsupported evidence. All 76 focused tests, TypeScript and changed-file ESLint passed; preview and production builds passed. Production merge is `c2747306cccf58d033bf3bf9f13ed2655160ab67`.

Removal of the erroneous synthetic Rowan entry through History was blocked by automatic approval review: irreversible deletion needs explicit user authorization. No removal occurred, and no provenance or deletion debt was cleared. This entry is retained pending permission. Sable (`618343ec-7fa5-40bc-ab86-2f9a850d1d07`) was created through onboarding as an isolated synthetic test profile for the final rerun.

## Validated topic alias repair and final presentation coverage

Sable's first save, first resolution (after one retry), and second save produced three correctly dated entries across two episodes: February 1/3 on `d41b5958-293d-4591-8e22-4666a069a4d0`, and June 9 on `36b12da6-3475-4184-81d1-b63d65d24fb2`. The second entry `984c5576-1630-4f99-a51d-06b6ad291b3b` has intact opening proof and `inventoryTopic=vomiting`, but its generated topic is `vomiting_episode_update`. Exact-key readers excluded it, returning one verified episode and no exact total.

Migration `20260911080029` resolves that alias only through intact opening proof, matching owner, pet, episode, source, and generated topic. It applies the same key mapping to census, membership selection and displayed/reference keys. Unknown or altered evidence remains unclassified. No existing episode IDs or source rows change. The SQL harness reproduced the live one/null count before the fix and passed all 14 scenarios after it, including alias invalidation and foreign-owner negatives. Rollback/reapply restored the membership reader definition exactly.

The remaining duplicate proposals store the exact observation in input.value while paraphrasing input.detail. Presentation now recognizes either exact binding. A resolve-state proposal is omitted only for the sole exact governed resolved assertion, the whole current message, and a known owned episode reference. Distinct notes, multiple assertions, missing governance and unresolved targets remain independently reviewable. All 70 save/completion cases and TypeScript/ESLint passed.

One first-pass resolution attempt (`0e5db77d-1c3b-45a9-a4a7-afa5ec9164d2`) exhausted its bounded completion-review repair with an unmet advisory obligation. It wrote nothing and released the AI credit. The same logical turn succeeded in three provider calls on retry, with one dated resolution entry and no duplicate persistence. This remains observed first-pass reliability risk; a successful retry is not evidence of a flawless first attempt.

## Final live acceptance

- Production count answer `13119bb0-cbf8-40e6-9f8f-ce06f1d3b04f` returns exactly two recorded vomiting episodes during 2024, dated February 1 and June 9. Reload preserves the count and ordinal references.
- Follow-up answer `2f6514f5-febc-4ac8-a617-81dcfbc72d28` returns the exact June 9 source for episode 2 after reload. Both turns completed in two provider calls.
- The new private topic helper remains inaccessible to anon, authenticated and service_role direct execution. Public readers retain ownership and bounded-time checks.
- Latest broad local run: 1,457 focused tests passed. Subsequent targeted runs: 76 event/governance tests, 70 save/completion cases, 31 reasoning regressions and 14 database scenarios passed. These runs overlap; their counts must not be added as a distinct total. TypeScript, changed-file ESLint and both release builds passed.
- Remaining limits: old unlinked corrections and unclassified records still prevent certified exact totals; native multi-connection database concurrency was not exercised by the embedded harness; one real resolution required retry. This audit does not certify all non-Ask launch surfaces. The erroneous Rowan test entry remains intact awaiting specific deletion permission.

### Final resolution alias follow-up

The June 11 resolution (`53e504b2-d6cf-4403-b741-3c7a9eec3960`) failed safely with `RECOVERY_LIFECYCLE_MATCH_WEAK`: topic matching treated the generic words “episode” and “update” as clinical differences and scored the sole matching episode 0.78. No write occurred and the credit was released. A regression reproduces the exact failure. Those two generic label words now join the existing ignored lifecycle words; clinical modifiers such as “chronic” and competing episode candidates still cannot obtain an exact match. The event retains the matched episode's actual topic for persistence, so no SQL writer validation changes are needed. All 29 semantic-event tests passed, including the new positive and negative cases; TypeScript and ESLint passed. A further SQL scenario verifies that plain-symptom resolution preserves the alias episode identity and count.

### Historical-state resolution classification

The same live turn then reached a different rejected shape: `transition=resolved,state=historical`. Recovery assessment did not consider that shape a candidate, so valid dated cessation could never reach the full recovery checks. Historical resolved proposals are now candidates for assessment, not automatically accepted. Only the existing independent grounded terminal evidence, exact subject, unique episode, safety and confidence gates can promote state to resolved. Without that assessment they remain rejected. The generation instructions explicitly separate the historical date from the episode's resolved state. Regression cases preserve the date and reject absent/uncertain/ungrounded evidence, unsafe resolution and competing episodes.

## Closing acceptance on production 1caacca

The original June 11 logical turn succeeded on deployment `dpl_DiUu7jSSxdePYYDfAE9suSkiFp1W` / commit `1caacca47c980dc673e1ec27ca4c46938b197281`. Answer `c78006b5-607d-4458-8db0-a363b24f0932` completed in four provider calls, with no final error and no proposed application actions. It saved exactly one entry, `b202614e-bf30-43de-814a-91b4488327c1`, containing the original June 11 statement and date. The existing second episode `36b12da6-3475-4184-81d1-b63d65d24fb2` is resolved at `2024-06-11T00:00:00Z`. Sable retains exactly two episodes and four care entries: two openings and two resolutions. The live UI shows the neutral recovery heading and a single saved receipt, without duplicate save/resolve controls.

The final targeted run passed 61 reasoning/semantic cases, TypeScript and ESLint; the SQL harness passed all 15 scenarios. All code changes in this investigation are merged, and the final application build is deployed. The observed completion-review retry, legacy-data completeness limits, broader non-Ask launch scope and blocked Rowan cleanup remain explicitly disclosed above. This is evidence of the tested flows, not a zero-defect or 10/10 certification.
