# Ask next 40 file audit — 2026-09-11

Scope: inventory positions 21–60, immediately after the original 20 application files in `file-categories.csv`. Baseline repository commit: `1269a941932b38ca65cefb2a29dd7b9b930b6f9f`. These 40 files totalled 4,411 lines before this audit. Files that had earlier dependency edits still receive a complete review here.

## Findings and fixes

1. **High — emergency suppression across subjects/order.** `Luna cannot breathe. Pixel is breathing normally.`, a recurrence after an earlier recovery, and a human clause followed by a pet emergency all returned no immediate emergency. Triage now consumes temporally scoped clauses in source order, tracks surface subjects, and refuses uncertain or negated recovery as clearance. Unrecognized intervening subjects break pronoun continuity. Human exclusion is anchored to the subject: mentioning a child elsewhere in a named pet’s emergency cannot suppress it. This changes classification, not veterinary instructions or write authority.
2. **High — unbounded profile ownership read.** An SDK/fetch implementation ignoring abort could keep the pre-admission read pending forever. Each attempt now settles locally on timeout/caller abort, observes late promises and discards late data; retries remain bounded and ownership filters unchanged. Elapsed time uses a monotonic clock.
3. **High — post-review mathematical changes accepted.** `<` becoming `>`, reversed inequalities and Unicode numeric operators could pass the last-mile token invariant. These semantic symbols are retained in comparison. Source and calculation review remain independent requirements.
4. **Medium — added/duplicate actions survived presentation review.** The receipt checked only that every earlier action still existed. It now compares the complete action identity multiset; changed receipt status alone is permitted.
5. **Medium — open episode-date range crashed or vanished.** A from-only exact recorded count dereferenced null `to`; a to-only range was omitted. Both independent boundaries now render explicitly.
6. **Medium — insufficient stage allocation accepted.** `allocate(verification, 5, 0, 10)` returned 5. Invalid maximum/minimum combinations now reject before a stage can start.
7. **Medium — ISO date lost across a read follow-up.** `2024-01-01` was not recognized by the conversation anchor's named-date parser. ISO dates now use the existing calendar validator and participate in ambiguity checks. No new read/write authority is introduced.
8. **Medium — plural episode references escaped ambiguity checks.** `Compare first and second episodes` returned no reference. The shared locator grammar now explicitly marks plural wording ambiguous rather than binding a single episode. The semantic planner can still route a comparison as an ordinary historical read.

One implementation regression was found and corrected during verification: initially exposing full safety clause metadata in the shared prompt object consumed the ten-pet evidence budget. Clause access is now a separate local helper; the compact prompt object is unchanged, and the ten-pet test passes without raising budgets or weakening assertions.

Two application dependencies changed outside the selected 40: `ai/safety-temporal-scope.ts` exposes existing clause boundaries without expanding provider payloads; `application-actions/state-claims.ts` enforces truthful navigation state through the existing review/publication owner. No migration, billing change, new write authority, or unrelated application refactor is included.

9. **Medium — false navigation-execution claim found live.** A correct calculation and profile link shipped with “Her profile is open” before any click. A link is not browser execution. The existing state-claim policy now rejects active/passive opened-page claims during generation and reload, including when an unrelated database mutation has a verified success receipt. This preserves the valid calculation and link. Regression reproduced locally before the fix.

## Verification

- Baseline: **1,058 / 1,067 tests passed**, zero skipped. Nine failures were stale test contracts from the preceding completion-review work: four missing explicit reviewer verdict fixtures, one old schema field count, one source-code assertion tied to the previous admission implementation, and three fixture results missing the required `applicationActions` array. Fixtures were made explicit; the admission source assertion was replaced with behavioral checks for persistence failure, limited delivery and complete delivery.
- New regression suite: `tests/ask-next40-reliability.test.mjs`; failures were reproduced before fixes. Existing tests remain active.
- Initial focused run: **1,105 / 1,105 tests passed** across 65 relevant files. After the live navigation finding, the final run passed **1,120 / 1,120 tests** across 66 relevant files, with zero failed/cancelled/skipped. Final scoped TypeScript and ESLint: zero diagnostics. A local production build passed; the final deployed-source build and live verification are pending.
- All 40 application files plus the changed safety helper passed scoped TypeScript and ESLint checks before the final integration pass.

## Per-file audit

“Reviewed” means source and callers examined plus the listed applicable behavioral/integration tests; it does not mean every possible input, language, outage or concurrency schedule is proven correct. Existing SQL-authority tests include structural checks and mocked database cases; those are not represented as a new native concurrent PostgreSQL certification.

| # | File | Audit result |
|---|---|---|
| 21 | `app/lib/ai/conversation-intent.ts` | Observational questions and echo detection; emergency fallbacks and sanitized pet labels. |
| 22 | `app/lib/ai/execution-deadline.ts` | Fixed minimum-budget violation; provider timeout and late-result tests retained. |
| 23 | `app/lib/ai/history-source-transport.ts` | Added behavioral coverage for represented IDs, counts, caps, limitations, and input immutability. |
| 24 | `app/lib/ai/recovery-subject.ts` | Added cross-pet/human pronoun and uncertainty evidence regressions; write source checks remain separate. |
| 25 | `app/lib/ai/response-planner.ts` | Added acknowledgment and urgent-concern tests; ordinary questions continue to generation. |
| 26 | `app/lib/ai/turn-classifier.ts` | Reviewed ordered recurrence/recovery and question classification; existing semantic cases exercised. |
| 27 | `app/lib/answer-integrity.ts` | Fixed ignored mathematical comparison/operators in last-mile review. |
| 28 | `app/lib/ask-analytics.ts` | Reviewed enumerated event callers and browser event transport; no question text is passed by current callers. |
| 29 | `app/lib/ask-care-history-state.ts` | Reviewed saved/pending/failed/suggestion precedence against durable receipts. |
| 30 | `app/lib/ask-conversation-authority.ts` | Reviewed service authority RPC arguments and owner/source binding; existing authority/security tests exercised. |
| 31 | `app/lib/ask-conversation-server.ts` | Reviewed authenticated access, suggestion reconciliation, trusted capability reload, expiry, and terminal claims. |
| 32 | `app/lib/ask-conversations.ts` | Reviewed retry deduplication, notices, titles, dates and sign-out state cleanup. |
| 33 | `app/lib/ask-draft.ts` | Added isolated draft and blocked-storage behavioral tests. |
| 34 | `app/lib/ask-experience.ts` | Reviewed urgent/grief/casual/complex presentation and suggested-question suppression. |
| 35 | `app/lib/ask-onboarding-entry.ts` | Reviewed exact onboarding pet binding and empty-draft/thread gating. |
| 36 | `app/lib/ask-pet-selection.ts` | Reviewed conversation/explicit/active stored pet precedence and stable fallback selection. |
| 37 | `app/lib/ask-profile-read.ts` | Fixed uncooperative transport hangs, local cancellation, monotonic budget and invalid budget inputs. |
| 38 | `app/lib/ask-publication.ts` | Reviewed actual serializer/reload preflight and untrusted mutation-claim scrubbing. |
| 39 | `app/lib/ask-request-contract.ts` | Reviewed allowlisted payload construction; route separately validates required values. |
| 40 | `app/lib/ask-safety-context.ts` | Fixed global emergency suppression: preserve clause boundaries, subjects, order and uncertainty. |
| 41 | `app/lib/ask-session-request.ts` | Reviewed one auth replay, immutable payload/idempotency key, owner switching, refresh cancellation. |
| 42 | `app/lib/ask.mjs` | Reviewed parsing, format preservation, action coherence, suggested questions and guidance-save metadata. |
| 43 | `app/lib/intelligence/answer-assessment.ts` | Tested server-derived complete/limited/failed outcomes and exact body/evidence binding; no unchecked outcome upgrade. |
| 44 | `app/lib/intelligence/ask-evidence-presentation.ts` | Fixed review receipt accepting added/duplicate actions; terminal receipt status remains outside action identity. |
| 45 | `app/lib/intelligence/ask-evidence.ts` | Reviewed source scope, provenance, completeness, representation losses, attributed fallbacks and per-pet limitations. |
| 46 | `app/lib/intelligence/ask-request-contract.ts` | Reviewed read/mixed/write separation, original-question authority, owned scope, dates, needs and reference recovery. |
| 47 | `app/lib/intelligence/conversation-read-anchor.ts` | Fixed ISO-date follow-up anchors; reject conflicting/invalid calendar references and assistant-derived scope. |
| 48 | `app/lib/intelligence/conversation-scope.ts` | Added context-clearing test: user premises retained, stored pet facts and assistant prose removed. |
| 49 | `app/lib/intelligence/correction-report.ts` | Checked bounded unlinked-correction attribution and exclusion from shared semantic-request path. |
| 50 | `app/lib/intelligence/dated-correction-notes.ts` | Reviewed bounded correction discovery, ownership, malformed pages, cap/unavailable disclosure and deadline propagation. |
| 51 | `app/lib/intelligence/episode-contract.ts` | Fixed independently open date boundaries in exact recorded-episode count presentation. |
| 52 | `app/lib/intelligence/episode-history.ts` | Reviewed ownership, source versions, correction closure, revision bracketing, bounded inventory and stale-reference refusal. |
| 53 | `app/lib/intelligence/episode-membership.ts` | Added missing/foreign membership tests; existing episode integration cases cover source/claim validation. |
| 54 | `app/lib/intelligence/episode-presentation.ts` | Reviewed unverified presentation locator, allowed message IDs, single-pet list binding and item bounds. |
| 55 | `app/lib/intelligence/episode-reference-language.ts` | Fixed plural episode references bypassing ambiguity detection; no count or ownership authority inferred. |
| 56 | `app/lib/intelligence/evidence-need-coverage.ts` | Reviewed per-need/pet/date coverage and preservation of the last represented candidate under prompt budgets. |
| 57 | `app/lib/intelligence/evidence-needs.ts` | Reviewed user-quote grounding, reference roles, owned names, bounded terms and independent need windows. |
| 58 | `app/lib/intelligence/generate-ask-history.ts` | Reviewed actual read/generation/revalidation callback and final presentation receipts; integration tests exercised. |
| 59 | `app/lib/intelligence/historical-care-state.ts` | Added historical/current attribution test; this remains a heuristic plus independent review, not a clinical certificate. |
| 60 | `app/lib/intelligence/historical-read-response.ts` | Reviewed schema/parser consistency, single canonical body, navigation-only proposals, CSV/table/JSON and limitations. |

## Rating and limits

A 10/10 or “no faults” guarantee is not supported by finite tests. The release rating will reflect the final tested flows. In particular, general/navigation answers can still have an overall `limited` assessment when calculation/evidence checks are not independently evaluated; HTTP 200 and successful action receipts must not promote those checks to passed. English surface-language heuristics are not a proof of multilingual or arbitrary discourse understanding. Provider and database outage behavior is verified with controlled local failures, not disruptive production fault injection.

## Production acceptance — initial rollout

PR #294 merged as `b2ef00639dff3641bce3ebd93919843ed3461f04`; final-source Vercel preview and production builds passed. Production deployment `dpl_GxXos5EcSVcjftGjeKtbR6dZHg3s` was READY and assigned to `www.furvise.com` before browser checks. Tests used the existing synthetic account.

- Three independent emergency requests passed: another pet’s recovery, recurrence after earlier normal breathing, and human distress followed by a pet seizure. All showed immediate guidance and explicitly disclosed that emergency guidance was not saved to history.
- Original ISO-date read: Clover 2.20 kg and Pixel 5.12 kg on 2024-01-09. Conversation `58bb2a75-a4c9-444b-a976-fc26c78457a1`, request `1d2c68ec-8355-497d-b445-73b527e0276d`. Persisted assessment: all five checks passed, complete.
- Same-conversation plural follow-up converted both pets to grams for the same day: Clover 2200 g, Pixel 5120 g. Request `bbf1419f-879a-43bb-be80-f133b620cad5`. All five persisted checks passed, complete; both rows survived reload unchanged.
- Episode-count request since 2024-01-01: conversation `400060b8-9f67-4ebc-9b66-01252a40f5df`, request `e610daf7-f9d3-45f8-b51e-7de172740af7`. Returned a limited answer because inherited historical coverage contained `unlinked_correction_uncertain`; no count or episode references were certified. This is a safe refusal, **not a successful exact-count production test**. Open-bound count rendering is covered locally.
- Plural first/second-episode follow-up `72759c1a-516c-4fd3-b341-1ac56ee0b5ca` supplied no invented episode comparison and asked for the specific notes. The final assessment remained limited/taskCompletion failed. It did not acquire a verified episode reference from conversation wording.
- Navigation + `(2 + 3) * 4`: request `57e80998-d301-4519-b2d6-c00eeaa9eceb`, conversation `d608cc5b-a3cf-49ad-9fc5-693131619495`. Returned 20 and the correct Clover profile link, but incorrectly said the profile was already open. The link itself was clicked and worked. **This initial wording failed acceptance** and prompted finding 9; it is not relabelled a pass after repair.
- Synthetic live care rows remained **3,736**, unchanged from the pre-test baseline. No 5xx logs were found in the initial rollout window.

Final navigation-policy rollout and recheck: pending.
