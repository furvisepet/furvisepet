# Episode wording repair

Base 80edadc12db7a4074441678cd62a48a8faa4bee2 in codex/ask-remaining-reliability.
Exclusive file lock C:/Users/gwara/furvise-remaining.lock held by PID 3048; release sentinel C:/Users/gwara/furvise-episode-wording.release. No overlapping writer found. AGENTS.md and previous checkpoint read.

Reproductions before the corresponding edits:
- 'the second vomiting episode' bypassed reference lookup and reached generic generation.
- Multiple requested ordinals silently chose one episode.
- After a Luna discourse switch, a topic-qualified ordinal fell back to selected Milo.
Logs: C:/Users/gwara/furvise-episode-wording-before.log and furvise-episode-subject-before.log.

Implemented shared pure surface parser used by deterministic subject resolution and episode lookup. Supported topic qualifiers now retain current discourse and go through the existing stored reference/source-version/correction checks. Explicit named pets retain precedence. Multiple ordinal locators clarify before selecting an episode. 'That second vomiting episode' treats 'that' as a determiner, not a competing reference. Existing previous/this subject-only recognition remains; it acquires no new episode authority.

Verification: 27 focused callback/subject/reference cases passed; full suite 2,245 passed. Typecheck and diff checks passed. Lint passed with the same two existing warnings in persist-learnings.ts. Unchanged lifetime audit remains 12 pass / 5 fail.
Logs: C:/Users/gwara/furvise-episode-wording-focused.log, furvise-episode-wording-full.log, furvise-episode-wording-typecheck.log, furvise-episode-wording-lint.log, furvise-episode-wording-audit.log.

Limits: bounded English surface forms, not general episode co-reference. Existing source ownership, version hashes and supported linked-group semantics remain mandatory. Prose-only historical references, unlinked projections and exhaustive aggregates remain unresolved. Multiple-ordinal comparisons abstain rather than infer a selection. Tests use real subject/callback code with mocked database/provider boundaries; no browser, live-provider or new real-database validation is claimed.
No Docker, schema changes, migrations, push, merge or deployment. This checkpoint accompanies the local implementation commit; git log provides its exact ID. Release the lock after clean-worktree verification; no background writer should remain.
