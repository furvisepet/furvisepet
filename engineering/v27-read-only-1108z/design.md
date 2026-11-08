# Read-only Ask replacement (2026-11-08)

Status: preview candidate, not launch-approved. Production is unchanged.

The public /api/ask route now executes ask-read-only/core.mjs, not interpret-ask, canonical request planning, grammar repair, mutation planning, or the application-action executor. Over 1,100 lines of mixed orchestration were removed from that route. Underlying non-AI CRUD, data, migrations, and historical evidence are preserved. The prior grammar checkpoint is a separate parent commit.

## Execution

1. Authenticate the actual session, require a confirmed non-anonymous user, enforce origin, input limits, owner-scoped conversation identity, idempotency, distributed AI admission and credit reservation.
2. Load a bounded owner-only pet directory and recent dialogue. Prior assistant text is conversational context, never saved evidence.
3. One native Responses API call chooses ordinary conversation or up to four read_pet_profile / search_saved_records tool calls. Model schemas contain no user IDs, database IDs, mutation tools, SQL or canonical planner fields.
4. Server binds opaque handles to owned pets. The session-scoped Supabase client retains RLS; each read also rechecks owner and pet explicitly. Date filters are validated local calendar days and converted to half-open instants, including DST. Terms are literal LIKE patterns, never filter/SQL fragments. Pages are 16 records; total sources 32; evidence text 24,000 characters. Coverage and truncation remain explicit.
5. A second and final provider call either independently checks the general draft or answers from retrieved evidence. No repair/review can open a third physical call; SDK retries are zero. Every request uses existing exact-envelope admission and measured usage reconciliation.
6. An independent deterministic publication gate verifies source handles and exact quote substrings. Quotes are appended after prose presentation normalization to preserve bytes. Runtime-branded results alone can issue existing owner/body/source-hash citation proofs. The citations endpoint rechecks current ownership, source content, dates and deletion on every replay.
7. Persist one immutable conversation answer, settle the logical user credit, and finalize durable replay. Conversation metadata persistence is separate from pet-record mutation; Ask never saves/changes a pet record.

## Deliberate limits

Within the two-call policy, retrieval selection happens once. Complex requests needing additional search pages must continue in another user turn, with honest coverage disclosure. Read answers have deterministic source/quote validation, not an additional third paid semantic reviewer. General answers receive an independent second-call review. Model-generated interpretation remains uncertain; exact quotes remain source-bound.

Legacy planner libraries and their historical tests are not deleted wholesale: shared consumers and frozen ABI evidence still exist. Their old public-route assumptions need explicit migration rather than weakening release assertions. Current full CI results must be reported separately from new read-path tests.

## Release and rollback

Keep PR draft until independent owner review and real signed-in quotation, general conversation, comparison, citation replay and negative access tests pass on the exact preview SHA, and applicable CI is green. No independent source-owner approval has been established in this run. Existing server AI feature/daily guard switches remain the kill switch. Preview rollback is a branch revert to the prior exact commit; do not restore write tools. No production promotion is authorized here.
