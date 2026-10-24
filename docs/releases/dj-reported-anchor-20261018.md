# Reported-record event anchors

This commit adds an explicit stored-report event-relative read family. It does not turn effective facts into reports or rewrite a returned plan. Legacy notes without persisted source-semantics classification still fail effective-fact certification.

Reported event selection uses the existing authorized history reader, correction-lineage closure, exact source-version checks, unique anchor resolution, strict temporal boundary and exhausted grouped-selection proof. Missing, ambiguous, truncated or changed evidence fails closed. The answer must attribute reported content and does not certify effective truth.

The original canonical decoder and Binder pipeline remain in place. One additive read-ticket authority/operation combination is explicitly permitted; existing effective-fact validation is unchanged. Calendar, episode, probes and calculation restrictions for stored reports remain. Explicit user-supplied anchor qualifiers are preserved; ambiguous recurring events are not guessed.

Qualification: 92 focused checks passed, typecheck and changed-file lint passed. Local security reached 161 passing checks and one native dependency mismatch because shared local dependencies contain Sharp 0.35.4 instead of pinned 0.35.5. No shared dependency install or test weakening was used. Fresh exact-head CI security/full tests/build and a pinned staged production build are REQUIRED before promotion.

The runtime manifest is the 658-file positive upload closure from this commit. Six runtime files changed from the base. The older dated exporter and policy fixture retain their historical audit basis; the explicitly reviewed DJ deltas are additive and do not overwrite historical snapshots.

Current production rollback target before this release: dpl_FeBhHKGxXigZuVbCjd5bNW7huwhW. Production capture stays off, with no project environment, model, limit, auth, permission or database change. Runtime qualification does not establish real model compliance or product acceptance. The real event-relative production journey remains pending.
