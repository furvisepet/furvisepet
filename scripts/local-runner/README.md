# Local task runner

Uses the installed native Codex CLI and existing ChatGPT login. No API-key fallback, dashboard, remote service or scheduler is required. Start once; the Python process advances the approved queue itself.

## Usage
`python runner.py --queue smoke-queue.json --repo C:/Users/gwara/furvise-local-task-runner --run-dir C:/Users/gwara/furvise-runner-smoke-1 --codex C:/Users/gwara/AppData/Roaming/npm/node_modules/@openai/codex/node_modules/@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/bin/codex.exe`

Use absolute paths and a NEW run directory for a new queue. Keep the laptop awake. Run tests with `python -m unittest test_runner.py -q` from this directory.

## Queue contract
Version 1 accepts 1-4 tasks, an explicit model, and a per-command timeout of 30-7200 seconds. Every task has a unique simple ID, a precise prompt, allowed changed paths (exact files or directory prefixes ending in /), and 1-6 trusted verification argument arrays. The queue is hashed and cannot change during resume. Verification is executable code: review it before approving a queue.
Each task gets its own worktree based on the last verified commit. Agent completion, path checks, verification exit codes and a clean local commit are required before advancing. Logs and final structured output live outside agent worktrees in the run directory. No task generation, retries, merges, pushes or deployment.

## Stop and recovery
Create a file named STOP inside the run directory to interrupt the current command and prevent further tasks. The runner kills its own child process tree on timeout/stop and preserves work. state.json records task/phase, commits and errors. An OS file lock excludes concurrent runners for that run directory.
Completed runs are no-ops. Ready checkpoints can advance on rerun. Running/blocked checkpoints are NOT automatically retried: inspect the preserved worktree and logs, then prepare an explicitly reviewed new queue/run. Do not blindly delete state or edit it to claim completion. A laptop reboot does not automatically restart this process.

## Boundaries
Codex uses workspace-write, network disabled for sandboxed commands, approval never (requests are rejected rather than auto-granted), and ignores user config to avoid inheriting full-access settings. The Windows sandbox implementation is explicitly elevated, matching the user's approved existing configuration; this is not danger-full-access. Existing execpolicy rules are retained. Common secret environment names are stripped; this is not a complete secret isolation boundary. The CLI still contacts OpenAI for inference and uses its existing local login.
Allowed-path checks detect changes AFTER execution, not a substitute for sandboxing. The model's done report and passing tests are not independent code review or proof of correctness. Eight hours limits the agent/verification command budget per invocation, not an exact token/dollar cap. Git/setup operations have no independent timeout. Shared Git administration and trusted repository hooks remain part of the local trust boundary. Use only on your trusted repository.

Official interface reference: https://developers.openai.com/codex/non-interactive-mode
