# Canonical Ask suggestion save — local review

Base: 61143368dca6055d5428e5f575f0382762ec82de.
Branch: codex/canonical-suggestion-save.

The actual suggestion PATCH now calls a service-only, security-invoker RPC instead of inserting dog_memories and marking the suggestion separately. The RPC locks the suggestion, checks current pet ownership and exact reviewed content, inserts a canonical memory and marks the suggestion saved in one transaction. Retries return the prior result without recreating a forgotten memory. Independent suggestions use independent fact keys; this does not infer correction relationships.

The route retains legacy semantic eligibility and also crosses canonical typed-memory validation. Missing RPCs, conflicts and unconfirmed results return errors rather than false success. Existing canonical readers consume the resulting active pet memory. Other legacy writers/readers remain and dog_memories must not be removed yet.

## Verification

- Full suite: 2,233 passed using node --test --test-concurrency=1.
- Typecheck passed on retry. The first run failed with Node allocation exhaustion; it was not counted as a pass.
- Eleven new tests execute the actual transpiled PATCH with mocked database boundaries and real preparation logic. They validate RPC use, failure mapping, retries and semantic rejection; they do not prove database semantics.
- Existing writer-boundary structural test follows the new shared helper without removing the eligibility requirement.
- SQL assertions and rollback SQL are prepared but NOT executed.

## Blocker and next step

Docker Desktop was started, but the dockerDesktopLinuxEngine pipe remains unavailable. No database was accessed or migration applied. Migration syntax, real roles/triggers, transactional behavior and rollback remain unverified. Do not deploy this revision until these pass in furvise-stage2-db-2788f0b / stage2_validation.

Apply the new migration transactionally in that disposable database, execute supabase/tests/ask_suggestion_canonical_memory.sql, expand/verify ownership-transfer and concurrent-save cases, then test rollback and reapplication. Rollback must follow reverting the application RPC call; it preserves existing saved memories.

No providers, remote migrations, push, merge or deployment. Lifetime audit expectations are unchanged; the audit was not rerun. This change does not solve lifetime completeness or remove all legacy persistence.

Final local checks: 32 focused tests passed; lint passed with only the two existing persist-learnings warnings. Docker CLI start also timed out after 30 seconds (reported 38.5 seconds including overhead). No further engine restart was attempted. The process-aware exclusive lock was held during edits and is released after the local review commit.
