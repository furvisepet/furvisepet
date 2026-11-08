# Read-only Ask replacement (2026-11-08)

Status: preview candidate, not launch-approved. Production is unchanged.

The public /api/ask route now executes ask-read-only/core.mjs, not interpret-ask, canonical request planning, grammar repair, mutation planning, or the application-action executor. Over 1,100 lines of mixed orchestration were removed from that route. Underlying non-AI CRUD, data, migrations, and historical evidence are preserved. The prior grammar checkpoint is a separate parent commit.

## Execution

1. Authenticate the actual session, require a confirmed non-anonymous user, enforce origin, input limits, owner-scoped conversation identity, idempotency, distributed AI admission and credit reservation.
2. Load a bounded owner-only pet directory and recent dialogue. Prior assistant text is conversational context, never saved evidence.
3. One native Responses API call chooses ordinary conversation or up to four calls to read_pet_profile and search_saved_records. Model schemas contain no user IDs, database IDs, mutation tools, SQL or canonical planner fields.
4. Server binds opaque handles to owned pets. The session-scoped Supabase client retains RLS; each read also rechecks owner and pet explicitly. Date filters are validated local calendar days and converted to half-open instants, including DST. Terms are literal LIKE patterns, never filter/SQL fragments. Pages are 16 records; total sources 32; evidence text 24,000 characters. Coverage and truncation remain explicit.
5. A second and final provider call either independently checks the general draft or answers from retrieved evidence. No repair/review can open a third physical call; SDK retries are zero. Every request uses existing exact-envelope admission and measured usage reconciliation.
6. An independent deterministic publication gate verifies source handles and copies selected original note bodies itself. Quotes are appended after prose presentation normalization to preserve bytes. The model never supplies quote text or numeric values: it selects source/measurement handles. Server arithmetic uses those literal, owned measurements. Runtime-branded results alone can issue owner/body/source-hash citation proofs for notes and saved profiles. The citations endpoint rechecks current ownership, source content, dates and deletion on every replay.
7. Persist and finalize the immutable conversation answer for durable replay before settling the logical user credit. Conversation metadata persistence is separate from pet-record mutation; Ask never saves/changes a pet record.

## Deliberate limits

Within the two-call policy, retrieval selection happens once. Complex requests needing additional search pages must continue in another user turn, with honest coverage disclosure. Read answers have deterministic source/quote validation, not an additional third paid semantic reviewer. General answers receive an independent second-call review. Model-generated interpretation remains uncertain; exact quotes remain source-bound.

Legacy planner libraries and their historical tests are not deleted wholesale: shared consumers and frozen ABI evidence still exist. Their old public-route assumptions need explicit migration rather than weakening release assertions. Current full CI results must be reported separately from new read-path tests.

## Release and rollback

Keep PR draft until independent owner review and real signed-in quotation, general conversation, comparison, citation replay and negative access tests pass on the exact preview SHA, and applicable CI is green. No independent source-owner approval has been established in this run. Existing server AI feature/daily guard switches remain the kill switch. Preview rollback is a branch revert to the prior exact commit; do not restore write tools. No production promotion is authorized here.

## Live acceptance and remaining release gates

The original saved-note question passed on 17519f6d604f443a826668f435b90b56439b40a0:
one owned read, exact verified quotation and citation, two physical calls, $0.001817.
Opening the saved conversation replayed the quotation/citation with no provider call.
A follow-up correctly distinguished synthetic software data from medical findings.
A general soap-bubble question passed without a private history read.
An attempted edit/delete was refused; History still showed the original exact note.

A two-date comparison on that revision failed closed at ASK_READ_QUOTE_NOT_VERIFIED:
the model requested only one date and attempted an unverified quotation. Exactly two
calls cost $0.002468; user credit was released. The next candidate replaces sequential
tool selection with a bounded batch and replaces copied model quotes with server-owned
source-handle selection; deterministic arithmetic selects server-owned measurement
handles. This candidate needs fresh exact-SHA live acceptance.

The focused CI job now exercises the active read-only path plus unchanged accounting,
SDK attempt, ownership/citation, replay and durable-finalization contracts. The Full
tests command is unfiltered and retains all old planner tests. Its failures are not
waived, hidden, or declared green.

The comparison and original quotation both passed live again on 782796ab. A profile
question then selected history and failed closed on an invalid quote reference
(two physical calls, $0.003752, user credit released). The next revision uses a
single max-four typed read array (profile/history), request-local owned-pet enums,
and returned-source/measurement enums in the final schema. Profile-only results
cannot request note quotations. Low reasoning effort is explicit; model, physical
call cap and token/output budgets are unchanged. No paid retry is made without a
relevant code change.


## Native capability simplification after live qualification

The current implementation exposes two ordinary strict native tools, `read_pet_profile` and `search_saved_records`. Each binds one owner-scoped pet handle. The first physical provider request may return up to four independent tool calls; the server validates every call before executing any read. The second physical request has no tools and renders the answer from bounded evidence. There is no nested `kind` union, batch wrapper, canonical planner, repair round or mutation capability. Multiple date windows and profiles are composed as ordinary native tool calls.

779622a7 passed a real current-profile read with a verified profile citation, then failed the original note question as a follow-up before retrieval with ASK_READ_TOOL_INVALID (one completed physical call, $0.001170, user credit released). Raw private arguments were deliberately not logged, so its precise invalid field is unknown. We do not claim that upstream failed or that this failure was repaired by local tests. Safe rejection telemetry now records known tool names, missing known fields, extra-field count and validity booleans without argument values. The new capability transport requires its own live qualification.

Local native-capability gates: 118 focused and 162 security tests pass, TypeScript, full lint (0 errors/123 pre-existing warnings), and production build pass. The prior exact-SHA Linux focused and database jobs pass; full CI is not declared green. Superseded runs were explicitly cancelled and their partial failure logs preserved. Production remains unchanged and PR remains draft pending independent source-owner review.


## Literal search primitive and bounded test runner

Signed-in dd53d089 passed the original saved-note quotation, two-date weight comparison and profile-after-history transition. A subsequent history follow-up failed before retrieval. Safe diagnostics narrowed the rejection to the terms array: known tool, exact fields, authorized pet, valid dates/order and offset, but termsValid=false. The precise invalid text was intentionally not collected. This is an application contract failure, not an upstream 500.

The history tool now takes a single nullable literal query (at most 160 characters, no control characters), plus the owner-bound pet handle, local calendar dates and bounded offset. A null/empty query means a broad bounded search within the same owner/pet/date scope. A nonempty query becomes one escaped literal LIKE phrase. This replaces the term-list wire grammar; it does not salvage malformed old plans or relax ownership, date validation, pagination or SQL boundaries. Existing bounded lexical fallback remains explicit and honest.

139 focused tests and 162 security tests pass, including actual public POST emergency/auth/allowance boundaries. The launcher clears inherited NODE_TEST_CONTEXT when starting its own workers; a child regression had otherwise exited zero without correctly reporting a pending test. Pending tests now fail correctly. Default per-test timeout is ten minutes, with overrides supported; timeouts fail rather than skip. Existing Windows --no-opt workaround remains, and is not represented as a native V8 repair. Full historical tests still run unfiltered in CI.

Current local TypeScript, lint and production build pass. Latest deployment/live acceptance and full CI remain pending for this candidate. No source-owner independent approval is configured; PR remains draft and production unchanged.


## Integrated read-only release candidate

The public action and suggestion endpoints now authenticate and return their existing unavailability contracts. Their unreachable execution bodies and privileged write-authority imports were removed; changing a feature flag cannot revive them. Non-AI CRUD and other product pages are unchanged. New actual endpoint tests cover anonymous denial, guessed IDs, owner spoofing, absence of database/provider access, and central origin rejection. The origin inventory follows the canonical authenticated helper; only the hard-disabled suggestion endpoint leaves the state-writing idempotency inventory, with explicit denial tests replacing that classification. No security test was skipped or deleted.

The compact final response still has five model fields. Its former model-controlled limited boolean is replaced by replyType (answer, clarification, refusal, partial). The server derives limited disposition from that response class and independent evidence coverage. This is a response contract, not a finite question or intent grammar. A live date clarification on 48c83346 had been correctly worded but incorrectly charged as complete; the new candidate must demonstrate the credit-release correction live. General supplied quotations remain a general-answer path.

The citation endpoint has a dedicated 256 KiB byte ceiling because the existing 24,000-character source allowance can exceed 64 KiB when UTF-8 encoded. An actual endpoint test verifies two maximal Unicode quotations and rejects an over-limit body before database access. Other request limits remain unchanged.

Local exact focused CI command: 160 passed. Security command: 169 passed using the repository test loader and Windows runtime workaround. TypeScript, lint (0 errors/123 existing warnings) and production build passed. Credit-recovery and concurrency assertions target the active implementation and retain behavioral ownership, replay, physical-call and denial checks.

Full unfiltered GitHub CI on 48c83346 completed with 6,025 tests: 5,829 passed, 194 failed, one cancelled by its ten-minute test timeout, one skipped. It is not a green release gate. The preserved failure manifest links the exact run and hashes its downloaded log. Canonical planner/mutation fixtures remain present and unfiltered; no baseline failure is silently waived.

The stronger import audit includes TypeScript import-type expressions. It found shared compile-time links through intelligence/types and related products, so globally deleting the retained planner modules would break those consumers. The new Ask runtime does not use that planner; broad deletion has not proceeded. Historical evidence is untouched.

Live 48c83346 qualification passed exact original quotation, profile/history follow-up, persisted quote/citation replay, unrelated general conversation, two-owned-pet comparison with server arithmetic, no-record honesty, mutation refusal and prompt owner-ID spoof refusal. Those results are recorded per request and do not qualify the new replyType/citation-envelope candidate until re-tested. A prompt-spoof refusal is not an authenticated cross-owner HTTP penetration test. The earlier anonymous citation fetch reached Vercel protection, so it is not claimed as application POST-auth acceptance.

Two historically incorrect completed-credit cases are explicitly retained in the ledger. No compensating credit or refund has been fabricated or applied. Production remains unchanged, preview only, PR draft pending independent source-owner review and applicable release checks. Roll back a candidate by a reviewed Git revert on preview branches; do not promote or alter production.


## Durable publication and byte envelope
New fault injection against the actual public persistence functions reproduced six failures in eight tests before the fix. All original assertions passed after terminal persistence moved before credit decisions and lost-acknowledgment readback began requiring the exact completed answer. A ninth test covers release infrastructure outages without discarding an already durable clarification. Ledger disposition remains independent billing authority; conversation metadata cannot authorize a charge.

Both conversation RPCs enforce a 65,536-byte JSONB limit. A citation endpoint Unicode test alone did not qualify conversation persistence. Publication now measures UTF-8 bytes of the entire signed response, reserves space for turn metadata, and returns an honest limited answer retaining only whole exact quotations that fit. The larger citation request contract still supports both full original notes. No source body is truncated or normalized, and no database migration is required.

Exact parent 16ab0e82 live acceptance passed six turns (original quote/citation, profile and history follow-ups, chronological comparison/calculation, free clarification, unrelated supplied-fiction conversation): 12 physical calls, $0.017932 measured and reconciled provider cost. Its full Linux suite was red: 6,039 total, 5,807 passed, 230 failed, one cancelled, one skipped. Those gates remain open. New-candidate acceptance is pending; production remains unchanged.


## Reservation alignment and active release contracts
The interrupted script registration was confirmed absent after reconnection. No uncertain mutation was replayed. The owned workspace remained at a5ad072f with the expected unpublished test/CI edits.

The server admission declaration now matches the actual read-only native provider envelope: two physical calls and at most 2,400 output tokens. An actual MemoryAiGuardTestStore reservation test verifies the smaller declared envelope ($0.0258 versus the retired $0.465 bound for gpt-5.4-mini) and the same durable two-call ceiling. Measured usage remains separately reconciled. No other feature budget was changed.

252 focused and 186 security tests pass locally, including actual native SDK wire/physical-attempt accounting, actual POST error/release cases, durable persistence fault injection, ownership/citation contracts and migrated active replay/security checks. TypeScript, lint, production audit and build pass. Full tests remain unfiltered. Production audit/build now run even after a failed Full tests step, retaining the failed job outcome.

Parent a5ad072f passed ten real signed-in turns with exact quotations/citations, profile/history transitions, two-date and two-pet server arithmetic, general conversation, clarification/no-match honesty, mutation refusal and prompt owner-switch refusal. The twenty physical calls cost $0.027489 reconciled. The source-owner/cross-account HTTP qualification limitations remain explicit.

Exact a5ad072f full Linux CI completed red: 6,051 total, 5,819 pass, 231 fail, zero cancelled, one skipped. The complete log and failure locations were preserved before further changes; no blanket waiver was applied. This candidate requires new exact-SHA preview acceptance and CI.
