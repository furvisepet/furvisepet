# Ask reviewed conversational composition

Branch: codex/ask-v1-stabilization
Parent: 51a29c2ebd22f27e4882b8c92fd3d469890d193c
Worktree: C:/Users/gwara/furvise-ask-v1-stabilization

## What changed
Historical generation proposes a concise narrative with per-sentence source IDs. A separate, bounded model review checks that narrative against all usable server-scoped evidence. Only an in-memory, evidence-version-bound receipt allows reviewed prose through final composition. Forged/cloned receipts and changed evidence do not survive. Invalid source sentences are removed before the remaining narrative is reviewed for support and coherence. Date/quantity anchors and visible source-ID cleanup run independently of the model.

User conversation turns are available separately for reference and tone; previous assistant assertions are excluded from historical generation and cannot become cited medical evidence. Existing deterministic counts, episode references, quoted-source behavior, ownership/correction rules, safety processing and write governance remain independent.

The third provider slot is reserved for one optional historical review. Ordinary calls and retries remain capped at two, including the shared admission store. Review failure, rejection or budget denial keeps the existing sourced answer instead of failing the completed turn. This adds cost and latency; it is not a free style transformation.

A shared prefix-normalization step helps literal history retrieval match inflections such as hiding/hides. It broadens candidate retrieval only and does not grant factual or mutation authority. Clear what/how-about questions with one explicit owned pet and a literal topic can recover an unnecessary clarification. Episode references and ambiguous/foreign subjects retain their gates. Pure updates discard unused historical date bounds without changing frame/ownership validation. Existing confirmed-loss classification runs before recovery repair, so death is not treated as symptom recovery.

## Reproductions and verification
The initial natural-summary callback reproduction failed before implementation and passed afterward. Later real-provider runs exposed incorrect event dates, visible internal citation IDs, a needless named-topic clarification, and grief failures. Each implemented correction has callback or pure boundary coverage; the final yesterday/source-ID reproductions were 0/2 before their fixes.

Final default suite: 2,293 passed, zero failed/skipped/cancelled. The new composition wrapper contains 21 focused cases; the existing conversational callback suite remains 64 cases. Typecheck and production build passed. Lint has zero errors and the two unchanged persist-learnings warnings. git diff --check passed. Original lifetime audit expectations were not modified or rerun (last reported 14 pass / 3 fail).

Local real Chrome component-fixture checks passed: production response serialization, local-storage reload, paragraph rendering, precise quantities/identifiers/negation, literal untrusted HTML, and no mandatory summary heading. This is not authenticated browser/API/database acceptance.

## Live provider evidence
Used the existing configured gpt-5.4-mini key only. Database and auth were synthetic; generation and review were real provider calls through the production callback harness. No database execution, Docker startup or deployed-application mutation.

79 recorded provider calls across smoke, full and targeted runs. Token-based cost estimate: USD0.68964975, ignoring cached-input discounts. Cumulative conservative reservations: USD3.46226175. User authorization: USD5; runner stops before USD4.50 in reservations, reserves before calls, persists its ledger and disables SDK retries. No further live calls are needed for this change.

Final targeted checks (docs/ask-composition-live-conversations.json):
- Chicken causation: directly says it was possible, not definite; preserves the unknown August food exposure. 3 calls, 18.898 seconds.
- Luna accidents: describes the vet visit and later no-more-accidents note, without assigning both accidents to a fabricated day. 3 calls, 19.041 seconds.
- Grief after switching back to Milo: empathetic paragraph without history tables or a failed-answer card. 2 calls, 12.970 seconds. The existing deterministic owner-reported death care action remains eligible; this is not a no-write question.

Historical questions in these live checks produced zero accepted care/memory/event writes. Earlier full runs also exercised summaries, Luna hiding, Oscar recurrence, medication completion, diagnosis absence and practical vet-visit conversation. Preserve the recorded failures; the full-pass artifact predates the final targeted fixes and is not an all-pass acceptance certificate.

## Limits and next gate
Model-assisted review is probabilistic, not universal factual verification. Earlier reviewers approved an incorrect event date, which prompted the additional deterministic anchor checks. Relative chronology and cross-source entailment remain bounded; an isolated subject-mismatch failure in an earlier grief run was not independently reproduced. No claim that all interpretation failures are solved.

An Oscar medication draft was rejected for implying ongoing non-use after a dated completion; it correctly fell back to quoted notes. Thus quote fallbacks remain and companion quality is not uniform. The reviewed narrative currently favors concise paragraphs; this work does not introduce a new expandable source drawer or a universal formatting system.

No certification of lifetime completeness, no unlinked legacy episode reconstruction, and no cross-query snapshot implementation. Current source/correction limitations may still be verbose. No database changes, PostgREST validation or authenticated deployed-app end-to-end testing. This is a local reviewable improvement, not V1 launch approval.

Before rollout: review the third-call policy and migration-independent diff; run an authenticated preview smoke with the actual deployment configuration and data. Do not advertise all lifetime gaps as solved.
