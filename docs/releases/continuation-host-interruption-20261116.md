# Release continuation: interrupted host and verified fixture repairs

On 2026-11-16 the original baseline-test supervisor was recovered as uncertain.
Its test log was empty. All six source effects and unchanged remote HEAD56b431d6
were inspected; no completion, commit or push was inferred.

The TypeScript test loader now supplies the real filename to transpileModule.
Without it, generic arrow functions in .ts were parsed as TSX and emitted invalid
JSX. The shared offline route fixture now explicitly supplies its availability
dependency. Two real-POST boundary regressions are included in the release list:
disabled503 before any IO or row mutation; enabled-but-unauthenticated401.

Fresh boundary test run: 2 PASS, zero skipped.
Fresh full focused run: 299 PASS / 3 file failures, 302 observed tests; NOT321 PASS.
The care-log, care-update-intent-lifecycle and care-workspace-stale-callback
workers exited with Windows access violation3221225477 (0xC0000005), without a
reported assertion failure. Original log: release-evidence/resume-release321.log.

The bounded interpreted-worker comparison then lost its supervisor. Its result
remains UNKNOWN, not passed. Windows LastBootUpTime1794863834500 is 14.77 seconds
after job start1794863819731. Kernel-Power41 and WER-SystemErrorReporting1001 were
observed. No hardware, driver, V8 or thermal root cause is proven from this alone.

The interrupted job was acknowledged only after effect/process inspection; it was
not replayed. Current node process was identified as the existing Codex app-server.
No test worker was killed or a healthy service restarted. Further heavy local/runner
testing is paused until host stability is established.

Unqualified optimization-flag/workflow proposals were preserved under ignored
release-evidence/resume-unqualified-runtime-proposal.patch, then only those exact
owned edits were restored to HEAD. No application assertion, original CI check,
branch rule, laptop runner configuration or source guard was relaxed.

This commit contains the reviewed loader/fixture fixes, two boundary tests, test
selection and this evidence record. It is a LOCAL checkpoint, NOT pushed or
production-qualified. Pushing would automatically trigger the laptop CI workflow;
do not do so while the host is rebooting during checks. No skip-CI marker or workflow
disable was introduced. PR536 must report the distinction between this local commit
and remote56b431d6 / READY preview.

Paid provider calls: zero. Production, owner records, PR531 and the shared dirty
checkout were not modified. Ask remains required for V1 and must receive fresh Mini
online qualification after recharge. Signed-in candidate smoke remains pending an
explicitly connected preview tab. V1 notes remain draft/unpublished.
