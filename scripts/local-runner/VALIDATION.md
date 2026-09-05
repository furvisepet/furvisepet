# Validation status

Prototype implemented on codex/local-task-runner, based on 29417d1.
Nine Python tests passed both in the development environment and on the user's Windows laptop. They exercise real temporary Git repositories/worktrees, fake-agent two-task progression, checkpoint reuse, changed queue rejection, failed verification, out-of-scope changes, exclusive locking, stop handling and real process timeout/nonzero exit.

## Real Codex smoke attempt
Used the installed native Codex executable with an existing ChatGPT login, gpt-6-astra, workspace-write requested, approval never, sandbox command networking disabled and user config ignored. No API key was supplied.
Run directory: C:/Users/gwara/furvise-runner-smoke-1.
Codex started, reported read-only filesystem access, and its first attempted AGENTS.md read was rejected as blocked by policy. It returned structured blocked status. The runner recorded blocked, completed zero tasks and did not start task two. This validates fail-closed behavior, NOT successful autonomous editing or task-to-task Codex execution.
Follow-up: the user explicitly approved selecting windows.sandbox=elevated, matching their normal existing configuration. With that scoped setting added, the real smoke-2 run completed BOTH tasks automatically, verified their exact contents, and committed each in its isolated worktree (336eecf and 82e85b0). Nine Windows unit tests passed again. This proves basic CLI task advancement, not the correctness of arbitrary engineering work. The initial effective permission mismatch was resolved for this smoke run. No full-access fallback, ignored rules, permission-policy edits, Windows sandbox setup or administrator changes were attempted. Official Windows sandbox setup may require administrator approval; the observed log alone does not establish the underlying cause.
The task worktree and logs are preserved. No Furvise application edits, remote migrations, deployment or pushes occurred. The scoped real two-task test now passes. Broader application repair queues still need explicit acceptance checks and review. Windows shell calls initially started at C:/ rather than the requested cwd, so task prompts should require explicit working directories and prohibit searches outside their worktree.

References consulted:
- https://developers.openai.com/codex/non-interactive-mode
- https://developers.openai.com/codex/windows
