# Resource-safe targeted CI — 2026-11-16

G authorized a small retry, not an unbounded full-suite run. Preflight observed
16,088MiB physical RAM, 4,186MiB free (74% used),67% commit,589GiB free disk.
After settling:4,205-4,215MiB available,65% commit, no paging-out.
WSL config:4,096MB overall memory,4 processors,2,048MB swap. Docker reports
about4GB total; this is separate from the existing container3GiB/2CPU cap.
vmmemWSL working set1,791MiB; idle runner container46.87MiB,0% CPU.
Runner27 online/idle, no active CI. Standard CPU-temperature sensors and
PredatorSense window readings were unavailable; no temperature claim is made.
Recent0x7f bugcheck/parameter8 was observed; cause is not established as RAM,
thermal, driver or hardware. No WHEA event returned in the reviewed4-hour window.

Local monitored repaired subset:24 PASS,0 skipped,26.9 seconds total.
One worker,384MiB Node heap; peak combined process-tree RSS330.0MiB;
minimum available host RAM4,044.7MiB. Host boot unchanged. Exact failed care-log,
care-update-intent-lifecycle, care-workspace-stale-callback files plus the two new
availability route tests were run. No full suite/build or paid API request.

Pushes now run a separately named Targeted release checks status,3-minute job cap,
75-second dependency-install cap,90-second subset cap,1-CPU affinity and384MiB
Node heap. Full steps remain defined but require explicit full dispatch; a targeted
pass is NOT full release qualification. Trust/ref/SHA/resource checks, no fork/PR
trigger, read-only token and immutable actions remain. Existing verify and
ask-database-contract workflow/names are unchanged. PR536 is placed in draft
before push to pause its original full checks; skipped checks are not passed.
No runner/Docker restart, duplicate runner, rule bypass or production promotion.

First scoped CI43970885706 exited127 before tests because optional /usr/bin/time was absent. The wrapper was removed without installing tooling or changing test selection. No crash was observed; the corrected run remains separately evidenced in PR536.
