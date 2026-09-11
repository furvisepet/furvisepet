# Ask architecture follow-up — 11 September 2026

Baseline: main `75fe1a52b02fc26a8f1aed0441559a267d1e8b1e`. The repository already includes the original A1–A10 implementation; this follow-up fixes remaining composed-contract defects found during renewed testing.

## Reproduced live

- A self-contained request for Sable’s second recorded 2024 vomiting episode, its dates, sources and calendar-day difference returned a limited answer. The saved turn says answer/task limited and mutation not requested. SQL confirms the four synthetic source records and two episode groups are present.
- Asking for the episode list returned the correct count (two) and dates. A subsequent displayed-list reference returned June 9 and June 11, with a two-day difference. It did not visibly show the requested supporting notes.
- Navigation plus a general explanation failed with `ASK_TASK_INCOMPLETE_OBLIGATIONS_0_1`. Both initial preparation and repaired preparation yielded zero cards. The logs do not establish whether the model omitted the card or target scope prevented preparation.
- After the successful feeding save described below, a read-only question asking for its date and amount from the receipt failed with `ASK_HISTORY_REVIEW_UNAVAILABLE`. The saved entry remained present; this was an answer failure, not a failed save.

## Changes

- Separate fresh, explicitly scoped register selection from versioned displayed-list selection. Retain original target bounds independently of access-clipped retrieval bounds. Fresh selection requires certified complete evidence, an available ordinal, and an untruncated list. It cannot reinterpret a clipped interval or substitute a different episode.
- Preserve interpreted episode targets despite non-adjacent wording, requiring the episode noun and ordinal in user text. Discard model-invented ordinals.
- Keep stale/version/ownership/correction checks for displayed references. Both selectors feed the same verified member projection. Presentation distinguishes a requested period from a previously displayed list.
- Resolve contradictory navigation/general-question planner instructions. A declared read-only navigation operation can normalize a redundant general-evidence label while retaining its owned destination and discarding history bounds. General-only and fictional tasks retain their separate scope.
- Require visible source attribution when requested; internal source IDs do not count as user-visible citations. This remains model-assisted semantic review, not a deterministic entailment guarantee.
- Record safe review/repair contract codes and separate container, selection, anchor and publication failures. Navigation repair logs bounded proposal/parsed/target counts without source text.
- Project receipt status and each linked care record separately through one shared evidence owner. Retain each record's date through prompt construction and representation, and verify receipt spans against their originating receipt content. Review distinguishes an existing linked record from a claim that the current response performed a write. Publication and mutation checks remain active.

## Verification

New regression cases exercise record/duration/episode projections, incomplete registers, missing ordinals, display truncation, subscription clipping, invented selectors and navigation/general scope composition. Existing versioned-reference and mutation-authority suites remain required. No database migration or dependency change.

Production acceptance of this branch and a complete 50-question rerun remain pending. Earlier passing local suites and successful individual live questions do not close that gate.

Local final checks: 2,149 top-level tests passed, zero failures/skips; TypeScript and production build passed. Changed-file ESLint passed. The complete lint run had zero errors and nine pre-existing warnings outside this change. Ten new cases run inside the existing parent suites, including receipt-date attribution and changed/removed receipt rejection.

A subsequent synthetic feeding save created exactly one source-turn-linked care entry with the requested date and amount, and its saved confirmation survived browser reload. A redundant pending Add card remained visible; the executor checks for an existing source-turn entry before insertion. That presentation inconsistency is retained as an observation, not classified as a duplicate write.

Publication is blocked by automatic approval review pending explicit authorization to push to the public repository. Production identifiers have been removed from this follow-up document; no further push was attempted.
