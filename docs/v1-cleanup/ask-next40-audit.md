# Ask next 40 file audit — 2026-09-11

Scope: inventory positions 21–60, immediately after the original 20 application files in `file-categories.csv`. Baseline repository commit: `1269a941932b38ca65cefb2a29dd7b9b930b6f9f`. These 40 files totalled 4,411 lines before this audit. Files that had earlier dependency edits still receive a complete review here.

## Findings and fixes

1. **High — emergency suppression across subjects/order.** `Luna cannot breathe. Pixel is breathing normally.`, a recurrence after an earlier recovery, and a human clause followed by a pet emergency all returned no immediate emergency. Triage now consumes temporally scoped clauses in source order, tracks surface subjects, and refuses uncertain or negated recovery as clearance. Unrecognized intervening subjects break pronoun continuity. This changes classification, not veterinary instructions or write authority.
2. **High — unbounded profile ownership read.** An SDK/fetch implementation ignoring abort could keep the pre-admission read pending forever. Each attempt now settles locally on timeout/caller abort, observes late promises and discards late data; retries remain bounded and ownership filters unchanged. Elapsed time uses a monotonic clock.
3. **High — post-review mathematical changes accepted.** `<` becoming `>`, reversed inequalities and Unicode numeric operators could pass the last-mile token invariant. These semantic symbols are retained in comparison. Source and calculation review remain independent requirements.
4. **Medium — added/duplicate actions survived presentation review.** The receipt checked only that every earlier action still existed. It now compares the complete action identity multiset; changed receipt status alone is permitted.
5. **Medium — open episode-date range crashed or vanished.** A from-only exact recorded count dereferenced null `to`; a to-only range was omitted. Both independent boundaries now render explicitly.
6. **Medium — insufficient stage allocation accepted.** `allocate(verification, 5, 0, 10)` returned 5. Invalid maximum/minimum combinations now reject before a stage can start.
7. **Medium — ISO date lost across a read follow-up.** `2024-01-01` was not recognized by the conversation anchor's named-date parser. ISO dates now use the existing calendar validator and participate in ambiguity checks. No new read/write authority is introduced.
8. **Medium — plural episode references escaped ambiguity checks.** `Compare first and second episodes` returned no reference. Plural wording now enters the existing clarification path rather than binding a single episode.

One implementation regression was found and corrected during verification: initially exposing full safety clause metadata in the shared prompt object consumed the ten-pet evidence budget. Clause access is now a separate local helper; the compact prompt object is unchanged, and the ten-pet test passes without raising budgets or weakening assertions.

The only application dependency changed outside the selected 40 is `ai/safety-temporal-scope.ts`, to expose the existing clause boundaries to local triage without expanding provider payloads. No migration, billing change, new write authority, or unrelated application refactor is included.

## Verification

- Baseline: **1,058 / 1,067 tests passed**, zero skipped. Nine failures were stale test contracts from the preceding completion-review work: four missing explicit reviewer verdict fixtures, one old schema field count, one source-code assertion tied to the previous admission implementation, and three fixture results missing the required `applicationActions` array. Fixtures were made explicit; the admission source assertion was replaced with behavioral checks for persistence failure, limited delivery and complete delivery.
- New regression suite: `tests/ask-next40-reliability.test.mjs`; failures were reproduced before fixes. Existing tests remain active.
- Final focused run: **1,105 / 1,105 tests passed**, zero failed/cancelled/skipped, across 65 directly relevant test files. Final scoped TypeScript and ESLint: zero diagnostics. A local production build passed; the final deployed-source build and live verification are pending.
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
