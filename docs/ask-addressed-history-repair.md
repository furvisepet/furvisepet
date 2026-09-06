# Addressed history recall routing

Base a6af49a7c8114557a30b2a8128ee4d5a69be2ccf; isolated codex/ask-addressed-history branch.

Reproduction: the fresh unchanged lifetime audit was 8 pass / 9 fail. Four new examples such as 'Furvise, summarize all history for Milo.' incorrectly returned long_history_patterns. Nine focused tests were 5 pass / 4 fail before editing.

The actual Ask route invokes classifyFurviseCapabilityQuestion(question) before constructing a planned-capability response. Previously the brand name plus history vocabulary sufficed. The history branch now requires additional product/capability wording. Export and live-product classifications retain their existing order and rules. No entitlement, safety, ownership, persistence or retrieval gate changed.

Tests exercise the real classifier used by the route. Existing route wiring assertions remain; no full HTTP handler or provider execution is claimed. This is bounded English intent classification. Ambiguous wording such as 'Can Furvise...' and mixed product/care requests still needs broader evaluation; this is not a general natural-language intent solver.

Remaining priorities after this fix:
- Requested-period selection and late unlinked corrections.
- Episode references, historical episode retrieval and recurrence identity.
- Complete evidence for each pet in multi-pet comparisons.
- Exact episode aggregates and verified weight deltas.
- Migrate the live results-page legacy memory writer before removing dog_memories; preserve edit/delete/display consumers.
- Integrated browser/application verification in a controlled environment, followed by explicit rollout preparation.
- Investigate the separate Vet Brief provider failure; current logs do not identify its upstream cause.

No Docker, database changes, live provider calls, push, merge or deployment were needed.

Verification: full suite 2,242 passed; typecheck passed; lint passed with two pre-existing persist-learnings warnings; diff check passed. Unchanged lifetime audit now 9 pass / 8 fail. All nine new tests pass. Audit failures remain explicit and expectations were not altered.
