# Resource-safe targeted CI — 2026-11-16

Automatic laptop CI is PAUSED: this workflow is manual-only after an observed
host-memory safety stop. PR536 remains draft, so original full jobs are skipped,
not passed. Full release qualification and production remain NO-GO.

## Observed preflight
Physical RAM16,088MiB, free4,186MiB (74% used),67% commit; disk589GiB free.
Settled samples:4,205-4,215MiB available,65% commit, no paging-out.
WSL overall config:4,096MB,4 processors,2,048MB swap; Docker reports about4GB total.
This differs from the existing runner container3GiB/2CPU cap.
Initial vmmemWSL working set1,791MiB; runner container46.87MiB/0% CPU.
Runner27 online/idle; no active CI at initial preflight. An unrelated old queued
Security CI run was inspected and left untouched.
CPU temperatures were unavailable from standard sensors and PredatorSense windows.
Recent0x7f/parameter8 was observed; RAM, thermal, driver/hardware cause is unproven.
No WHEA event returned in the reviewed4-hour window.

## Actual small test
Local repaired subset:24 PASS,0 skipped,26.9 seconds.
One worker,384MiB Node heap; peak combined process-tree RSS330.0MiB;
minimum free host RAM4,044.7MiB; boot unchanged.
Only care-log, care-update-intent-lifecycle, care-workspace-stale-callback and the
new availability-route fixture were tested. No full suite/build/provider request.
Three workflow trust/scope policy checks passed separately.

## Actual CI attempts
Run43970885706 at f9b63d70 exited127 before tests: optional /usr/bin/time absent.
Removed that wrapper without installing diagnostics or changing assertions.

Run43971457442 at b4a31d43 was proactively cancelled during npm ci by the Windows
monitor: minimum free RAM3,361.3MiB crossed the3,500MiB reserve; peak vmmemWSL
working set3,294.5MiB. Monitoring began before push. Host boot remained unchanged.
No test pass or full validation is inferred from the cancelled run.

## Retained safeguards and next gate
Manual default is a separately named Targeted release checks status:3-minute job
cap,75-second dependency-install cap,90-second subset cap,1-CPU affinity,
384MiB Node heap, one worker, external fetch blocked and provider key empty.
Full steps are preserved behind explicit full selection. A targeted pass would
never be a full pass. Original verify/ask-database-contract names/workflow and
branch policies remain unchanged. No duplicate runner, listener/Docker restart,
skip-CI marker, protection bypass, production promotion or owner-data write.

Stop laptop attempts until greater headroom is available or a stable alternative
runner is reviewed. Observed installation increased WSL substantially; start with
at least6GB free host RAM before another monitored attempt, preserving the3.5GB
abort reserve. Do not diagnose the prior bugcheck as RAM exhaustion from this alone.
Only explicit manual execution may start the laptop workflow; ordinary pushes
cannot trigger it. Full CI, signed-in smoke and paid Mini qualification remain gates.
