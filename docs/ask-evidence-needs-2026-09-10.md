# Evidence-needs planner — 2026-09-10

The previous shared request had one pooled lexical search and one whole-question review obligation. This change carries distinct requested facts through the existing planner, retrieval, prompt budgeting, writer and reviewer.

## Contract and authority

The existing interpretation call may propose up to four evidence needs. Each contains an exact quote from current USER text or an explicitly referenced prior USER turn, search terms, optional narrowed pet names, and earliest/latest/context ordering. The server assigns need IDs, validates the quote source, and resolves pet names only within the already authorized read scope. Invalid advisory needs are discarded with diagnostic reasons; they cannot replace the original question or authorize a new subject, date window or write. Older contracts without needs remain supported.

## Retrieval and representation

Date targets and need searches share the existing four-page-per-pet budget. A broader period-context query remains available when the proposed strategies contain one. Unscheduled needs receive a budget reason. Pet access, date clipping, correction checks and record/character budgets remain authoritative.

Evidence selection interleaves need/pet groups, date groups and broader context. Earliest/latest needs preserve their own ordering. During final prompt trimming, the server prefers removing redundant candidates over the last represented candidate for a requested group; when the hard budget forces a loss, that loss remains explicit.

Coverage is rebuilt from the actual final represented records after each trim. It distinguishes candidates available, query unavailable, not represented, not queried and no candidate match. Available means a lexical candidate, not verified semantic support. Only authorized, fully represented, loaded sources with acceptable correction provenance qualify.

## Composition, review and diagnostics

The writer receives the availability checklist. Review evaluates the original entire question plus each grounded need quote. No search result or checklist state proves that an event never happened. The model must read the actual sources, preserve material uncertainty, and acknowledge unsupported facts without inventing limitations where evidence exists.

Need definitions and final coverage are retained in the owner's conversation context metadata, alongside existing retrieval diagnostics. This allows subsequent failures to be traced from request part to query and final evidence without storing provider reasoning.

## Verification and limits

Offline tests cover exact USER provenance, assistant/foreign-scope rejection, per-pet isolation, bounded scheduling, opposite temporal directions, correction/deletion and prompt-loss coverage, rare middle-history evidence, verbose history pressure, separate review obligations, and final publication. External fetch was blocked during tests. CI results and final counts are in the PR.

No paid API benchmark was run and no account history was modified. The previous 8/10 live result remains unchanged. The additional planner fields and metadata may affect live latency/cost; this was not measured. Decomposition, synonyms and semantic review still depend on model judgment. Four needs and bounded retrieval do not establish exhaustive lifetime coverage or universal accuracy. This is an architectural extension, not a claim that every fallback has been retired.
