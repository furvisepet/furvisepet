# History publication capability investigation — 2026-09-24

Base HEAD: 0a150727086e9df762a8ecbe93bb154dffe4748e.
Preserved repairs: 9b8c2b93f913d882707e7da5c580d2f13b7a1a3e and 82b48257ae765c63d4cc89172913b5271313dcc9.

## Status: semantic repair blocked by missing original metadata
The exact failed live predicate cannot be established from the preserved artifacts. The previous capture retained the typed ReadTicket, Lungs result-set certificate, publication dispatch and HTTP response, but not the full admitted request/evidence metadata.
Specifically, the successful interpretation log omits requirements, quantity, outputFormat and other outer request dimensions. No raw provider output or provider response ID was retained. The previous cleanup deleted the synthetic users/data and removed Redis. Replaying an invented request is not evidence of the original request.

The existing trace proves legal read/recall/saved_history interpretation, correct bounded ticket, exact certified source, then unavailable publication. It does not prove requirements_present. No claim to that effect is made.

## Completed authorized diagnostic work
Refactored the existing predicates into one pure historyPublicationCapability evaluator with supported and stable reasons. Existing supportedHistoryPublication and supportedPlainResultSetRead delegate to it. Its history and plain_result_set modes preserve their prior boundaries.
No provider/DB call, raw-question inspection, requirement-text parsing, mutations or new authority store.
Added capability reasons to both Labs eligibility and publication dispatch. Dispatch diagnostics execute even when the earlier capability check prevents buildLabsList from being called, which was the observability gap in the prior run.
Requirements remains a veto pending proof of the actual live cause. No factual permissions, source receipts, Binder, Brain, Lungs, completion or credit policy changed.

## Offline findings: hypothesis is distinct from live proof
20 new tests:
- A certified bounded ordinary measurement read with explicitly assumed empty requirements enters Labs.
- The same synthetic fixture with one free-text requirement returns exactly requirements_present and is rejected.
- Stable reasons cover task, projection, profile fields, evidence needs, quantity, presentation, writes, calculations, stored reads, record selection, mutations, scope and foreign subjects.
- Unavailable dispatch reports the same evaluator results used for authorization.
These tests intentionally label the original metadata as missing. They do not misrepresent the synthetic fixture as an exact replay of the admitted live request.

## Why additional_obligation can appear
obligationAuthority only classifies index 0 as result_set_records after supportedPlainResultSetRead succeeds and certifiedResultSetMatches succeeds. A false capability predicate produces additional_obligation despite an existing Lungs certificate. The offline requirements hypothesis reproduces this downstream effect. The log label alone cannot identify which capability predicate failed.

## Component versus whole-task completion
Inspected history-obligations, Labs, deterministic review, validation, AnswerAssessment, AskTurnLifecycle and task-execution-contract.
buildHistoryObligations currently creates the whole-question obligation and typed evidence-need/cohort obligations; it does not separately account for request.requirements.
labsTaskComplete currently derives completion from selected/result coverage. validate-answer uses it for taskCompletion, and assessTaskExecution completes the credit only for a complete, non-clarification task; otherwise releases it.
Simply deleting the requirements veto could mark a companion task complete based only on factual coverage. That semantic repair has not been attempted without the required live diagnosis.

## Validation
Focused capability/sufficient/diagnostics/certificate suite: 92/92.
Schema-focused including new evaluator tests: 165/165.
Sufficient-result-set: 45/45; focused publication/Labs/dispatch: 189/189; retrieval: 239/239.
G1 94/94; G2 89/89; G3A 89/89; G3C 74/74; retirement 5/5.
Brain 78/78; Body 188/188; Core 51/51; Publication 85/85; Profile 78/78; Mutations 184/184; Security 84/84.
Safety exact known two failures; Audit exact known thirteen failures. Groups overlap.
Repository typecheck, fresh production build, clean typecheck, whitespace and anti-hardcoding checks pass.

## Cost, live acceptance and cleanup
Zero provider calls and $0 new cost this turn. No live Case A retest, B–T, deployment or production cutover.
No synthetic runtime started, no database or care-data mutations. Prior cleanup remains intact.
The five pre-existing untracked assets remain untouched.

## Required next evidence
Either supply the original full admitted request/evidence metadata, or authorize one diagnostic-only local Case A execution on this behavior-preserving change. A fresh run will establish its own exact veto, not retroactively prove the previous run.
Capture the full sanitized typed request/evidence capability inputs and reason array before cleanup. Then reproduce that exact shape offline, perform the bounded semantic repair, rerun gates, and execute the post-repair acceptance sequence under the existing stop rule.
Classes 4/9/10 and production cutover remain blocked.
