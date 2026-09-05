# Validation status

Prototype implemented on codex/local-task-runner, based on 29417d1.
Nine Python tests passed both in the development environment and on the user's Windows laptop. They exercise real temporary Git repositories/worktrees, fake-agent two-task progression, checkpoint reuse, changed queue rejection, failed verification, out-of-scope changes, exclusive locking, stop handling and real process timeout/nonzero exit.

## Real Codex smoke attempt
Used the installed native Codex executable with an existing ChatGPT login, gpt-6-astra, workspace-write requested, approval never, sandbox command networking disabled and user config ignored. No API key was supplied.
Run directory: C:/Users/gwara/furvise-runner-smoke-1.
Codex started, reported read-only filesystem access, and its first attempted AGENTS.md read was rejected as blocked by policy. It returned structured blocked status. The runner recorded blocked, completed zero tasks and did not start task two. This validates fail-closed behavior, NOT successful autonomous editing or task-to-task Codex execution.
The effective permission mismatch is unresolved. No full-access fallback, ignored rules, permission-policy edits, Windows sandbox setup or administrator changes were attempted. Official Windows sandbox setup may require administrator approval; the observed log alone does not establish the underlying cause.
The task worktree and logs are preserved. No Furvise application edits, remote migrations, deployment or pushes occurred. Do not rely on this prototype for overnight repairs until the scoped Codex permission configuration and the real two-task test pass.

References consulted:
- https://developers.openai.com/codex/non-interactive-mode
- https://developers.openai.com/codex/windows
