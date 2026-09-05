# Ask per-learning memory confirmation

Base: 0b5c74adf486aeb5c63a1ffe2f856daa9df4c96f
Worktree: C:/Users/gwara/furvise-ask-memory-receipts
Branch: codex/ask-memory-receipts
Exclusive lock: C:/Users/gwara/furvise-ask-memory-receipts.lock, holder PID 33740.

## Reproduction
The V2 runtime previously selected raw accepted learnings and checked only whether any memory ID existed. A two-pet fixture copied both claims despite confirmation for only one pet. Missing receipts, wrong owner/source receipts and empty IDs also allowed writes when the generic memory ID was present. The valid runtime fixture had 2 passing controls and 5 failing cases before edits. An initial incomplete fixture was corrected before establishing that reproduction.

## Change
The production memory writer emits server-only confirmedMemoryWrites after a successful authority result and an exact active memory row match (subject type, pet, normalized key and value). Failed pet groups are excluded from confirmation and preference supersession. Receipts bind the current user/source message and preserve the governed learning. Existing IDs remain for UI confirmation; V2 no longer treats that aggregate as write authority.

The actual route supplies the persistence result alone to V2. The runtime selects only receipt-backed learnings with the expected owner/source and nonempty memory ID. Claim matching also requires an exact whitespace-normalized grounded quote matching the learning excerpt, so a different assertion about the same pet/concept cannot borrow its confirmation. Existing safety, concept, lifecycle, deduplication, ownership and idempotency rules remain.

## Verification boundary
Tests execute actual transpiled writer/runtime functions with mocked database boundaries and real V2 selection/execution policies. A structural route assertion checks the actual call's input. No HTTP, live database or provider execution is claimed. Lifetime audit expectations are unchanged.

## Remaining work
This does not retire the current memory store or complete V2 cutover. Receipt creation still uses that store. Exact quote matching can conservatively skip differing excerpt segmentation; arbitrary semantic value equivalence is not certified. Cross-query snapshot consistency remains absent. Consolidating memory readers and correction/supersession authority requires a separate complete migration, not deleting currently active writers.

Final verification: 2,217 default tests passed, including the new writer/runtime cases; typecheck passed; lint passed with the same two existing unused-supabase warnings; git diff --check passed. Full log: C:/Users/gwara/furvise-memory-receipts-full.log. No lifetime-audit rerun is claimed. No remote changes, push, merge or deployment.

Next step: trace and consolidate active memory readers and correction/supersession behavior without removing historical-note support; the receipt boundary is ready for a future replacement writer.
