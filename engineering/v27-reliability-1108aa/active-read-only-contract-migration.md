# Active read-only route contract migration

This batch changes tests, shared offline fixtures and CI inclusion only. Application files and package-lock.json are identical to 61eed36fec8d3e6180111f8f3d3a52430df6e047. No files or tests were deleted. Existing non-AI editing and database migrations were untouched.

The exact 61ee full GitHub run 42552103710 completed with 6159 tests: 5890 passed, 268 failed, 1 existing optional skip. Its focused contract, database contract, lint, types, security, production dependency audit and build passed. Those failures remain a release gate; this migration does not waive the remaining old/shared suite.

## Replaced obsolete public contract assertions

- Provider envelope/error route fixtures now execute the actual public POST and native SDK adapter. Malformed envelopes fail on one physical call. SDK failures on call one and call two preserve only the bounded diagnostic fields, do not leak private markers, release reserved user credit, and cannot access mutation tables.
- Durable publication cases now execute the actual read-only publication/persistence/settlement boundary. Independent review identity, durable-before-charge ordering, source/answer identity and already-completed owned replay remain mandatory. Existing outage/lost-acknowledgment tests are retained.
- Public owner-note and suggestion endpoints deny confirmation regardless of previously issued capability IDs or spoofed owner input. Authentication, origin rejection, no-store and zero provider/database effects are checked. Private capability rebind, source-span, local-date and authorization-before-RPC assertions are retained.
- Memory integrity and deployment compatibility tests no longer require unavailable public AI writes. Existing manual memory/CRUD semantic boundaries, private continuation identity/rebinding checks, database grants and retired prose writer guards remain.
- The least-privilege CI test excluded only standalone test-file argument lines from its conservative deployment-command substring guard. This prevents a filename containing deployment from being mistaken for execution. Real deploy commands/actions, secret expressions, write-all and individual contents/id-token/pull-request write permissions remain rejected by explicit negative cases.

Controlled before/after runs: native/persistence contracts 5 failures before and 58/58 targeted after; writer contracts 2 failures before and 24/24 after; public/retained architecture boundaries 5 failures before and 18/18 after. These targeted sets overlap and are not summed as distinct coverage.

Local final gates: focused 523 total / 522 passed / 0 failed / 1 existing optional skip; security 278/278; TypeScript, lint, production dependency audit and production build passed. The first expanded security run's filename false positive is retained in the gate receipt and local log.

The 50-prompt deterministic harness result remains 50/50 versus baseline 39/50. It uses scripted model responses and does not measure real-model semantic accuracy. Real signed-in acceptance remains 8/8 observed representative cases on exact 61ee, including the original byte-faithful saved-note quote/replay, unrelated JavaScript question, partial dated comparison/server arithmetic, impossible-date clarification, read-only refusal, two-pet profile comparison, medical uncertainty and conversation recall. This test-only commit has no new paid acceptance claim. Total paid iteration remains 16 turns, 32 physical calls and $0.062993 reconciled provider usage; the cap is closed.

New exact-head GitHub full CI and preview are required after publication. Production remains unchanged and PR draft. Independent source-owner review and authenticated cross-owner/change-source penetration are outstanding. Release NO-GO.
