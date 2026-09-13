# Recorded inventory PostgreSQL validation

Validated directly on authorized disposable furvise-stage2-db-2788f0b/stage2_validation, network none, PostgreSQL17.6. No other writer active, exclusive lock held. FreeRAM6.67GB at preflight; no scale workload.

Forward draft applied successfully. First actual SQL test failed because synthetic soft deletion omitted required deletion_reason; fixed fixture without changing constraints. Second failed full-import acceptance with import_frontier_gap. Root cause: unqualified id in correlated lineage query resolved to lineage.id, not outer care root. Qualified care_root.care_id. Existing positive full-import and negative partial-import SQL assertions now both pass.

Committed database rollback of the initial draft succeeded, followed by application of corrected draft. Complete assertion suite then reached final ROLLBACK. Reversal test restored prior reader inside a transaction and verified reversal before outer ROLLBACK retained the corrected reader. Final synthetic authusers0, careentries0, othersessions0. No application code changed this validation; preceding2284-test result is separate evidence. git diff --check passes.

This validates these actual SQL assertions, including statement-snapshot and transactional revision rollback assertions; not a multi-session concurrency or scale benchmark. Narrow strict-text semantics, global revision contention, owner-wide removal debt,32episode/64source caps and general freeform-history limitations remain. Original lifetime audit14/3 not rerun here. No migration registration, push, merge, deployment or provider call. SQL remains a draft pending packaging and product-scope review.
