# HTTP probe crash recovery

Verified HEAD ad14e61700b73cb8f3809e3d873272c500a24061 after reconnect. No Docker, Python or Codex processes were present in the inspected process list. Host free physical memory was approximately 6.6 GiB. Docker was not started during recovery.

The untracked scripts/test-canonical-save-http.py survived. The interrupted edit had not applied. Acquired the existing lock file exclusively, applied byte-mode subprocess input/output to avoid Windows newline translation in Linux curl configuration, and checked Python syntax without executing the probe. Released and removed the stale lock after the edit.

The previous HTTP attempt failed in curl configuration parsing, then reported cleanup verified. No HTTP success is claimed. Database state has not been re-inspected since the crash because Docker remains closed. The harness remains uncommitted pending runtime validation.

Next: diagnose host memory pressure before another Docker launch; then resume this same probe against only furvise-stage2-db-2788f0b / stage2_validation. Preserve the WSL and container caps. No application changes, database access, provider calls, push, merge or deployment occurred during recovery.
