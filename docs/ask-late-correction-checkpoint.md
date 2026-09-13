# Late correction discovery repair

Branch codex/ask-remaining-reliability; base 5d250cf6594786b3ed0a86b7a7d929b589dbb7b4.
Exclusive file lock C:/Users/gwara/furvise-remaining.lock held by PID 8780 during edits; release sentinel C:/Users/gwara/furvise-late-correction.release.
No overlapping writer found. Root AGENTS.md read.

Reproduced the original late-correction failure and two new callback failures before implementation. Logs: C:/Users/gwara/furvise-late-correction-before.log and furvise-late-callback-before.log.
The lifetime audit's local exercise wrapper DOES use the production callback; an initial inspection of only the test body missed that wrapper. No audit expectations were changed.

Implemented bounded same-owned-pet correction-note discovery for dated lookups with primary candidates. Up to twelve roots are reserved inside the existing 64-root budget, split across at most three authorized pets. Uses the existing authenticated candidate RPC with literal correction terms and no period filter. An explicit matching year locates possible correction notes; it does not create a correction edge, move a pet, or establish a new event date.
Every accepted note passes shared current-source/lineage revalidation. Changed/deleted notes are withheld. Unlinked notes retain uncertain provenance; an exhausted reserve or unavailable lookup cannot authorize an effective historical assertion. Loaded-source counts include supplemental roots.

Verification: full suite 2,245 passed; nine new callback cases; existing candidate and Stage 2 regression suites passed. Typecheck and diff checks passed. Lint passed with the same two unused-parameter warnings in persist-learnings.ts. Unchanged lifetime audit: 12 passed / 5 failed (previously 11 / 6).
Logs: C:/Users/gwara/furvise-late-verified.log, furvise-late-typecheck.log, furvise-late-lint.log, furvise-late-audit.log.
Existing query-count assertions now separately check the added correction RPC; the saturated prompt-budget fixture fills the new reserved roots and retains its original prompt-loss assertion.

Limits: bounded English correction stems and an explicit year; one supplemental page per pet; no exhaustive discovery or semantic correction linkage. Unrelated same-year corrections can conservatively prevent an answer. No cross-query snapshot is introduced. Tests mock database/provider boundaries; no new real database or live provider run is claimed. Existing RPC SQL contract is unchanged.
No Docker, migrations, push, merge, or deployment. Other five lifetime audit gaps and the broader checkpoint remain open.
Status: verified and included in the local fix(ask): discover qualified late correction notes for dated history commit. Read git log for the exact containing commit. Release sentinel is written after final clean-worktree verification; no background writer is intended to remain.
