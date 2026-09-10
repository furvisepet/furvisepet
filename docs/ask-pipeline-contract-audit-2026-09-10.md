# Ask pipeline contract audit — 2026-09-10

This is an offline architecture change, not a new acceptance benchmark. No paid provider requests were submitted. The last fresh live run remains 8/10 (one failure, one error). Historical grades are unchanged. Universal or 100% reliability is not established.

## Findings and changes

| Boundary | Finding | Change |
| --- | --- | --- |
| Retrieval planning → candidates | Chronological endpoints could crowd out an explicitly requested middle date. | Compile independent, access-clipped date targets inside the existing four-page budget. Reserve a broader query; disclose target overflow. |
| Candidates → evidence | Global ranking could discard a requested date even after retrieval. | Interleave date/pet groups and broader evidence before the record/character budget; retain per-target coverage. |
| Canonical read output | The limitation branch bypassed the main answer's layout validation. | Apply the prose container contract to limitation text too. |
| Draft → review | Review could approve wording later altered by serializer or reload policy. | Run publication preflight before approval; route failures through the existing one-repair/re-review limit. |
| API → stored reload → client parsing | The harness stopped before the real final gate. | Extract a shared publication inspector used by the API and harness, including reload sanitation and client parsing. |
| Final answer integrity | Number-set and uncertainty checks missed dropped explanations and changed attribution. | Compare ordered content tokens in addition to numeric and uncertainty checks. |
| Persisted presentation | Summary/sections were governed separately from safetyNote. | Share the untrusted-text policy and apply it to safetyNote too. |

## Audit scope

Inspected the request contract and interpretation/retrieval interfaces, history access clipping, retrieval selection/budgets, canonical read response, provider response parsing, intelligence validation order, review and review receipts, presentation restoration, route serialization/failure handling, stored-message sanitation, client response parsing and request timeout handling. Provider deadlines already settle locally even if cancellation is ignored; the UI has a bounded request timeout and explicit failure state.

Principal production files reviewed include ask-request-contract.ts, history-access.ts, history-retrieval.ts, explicit-history-dates.ts, generate-ask-history.ts, run-intelligence.ts, ask-reasoning.ts, historical-read-response.ts, review-history-narrative.ts, history-review-receipt.ts, validation/validate-answer.ts, ask-evidence-presentation.ts, history-presentation.ts, ask.mjs, ask-conversation-server.ts, application-actions/state-claims.ts, answer-integrity.ts, provider-deadline.ts, api/ask/route.ts and ask/page.tsx.

This was a cross-layer Ask audit, not a claim that every repository file was individually read or every subsystem rewritten. No pet names, benchmark IDs, saved answers or question-specific production branches were introduced. Date syntax parsing and existing general safety/access rules remain.

## Verification

Offline fetches were blocked by scripts/audits/helpers/deny-external-fetch.mjs. The repository suite, shared-request suite, typecheck and lint were run. New tests cover middle-history retrieval, access clipping, date-target overflow, unpublishable draft repair, canonical limitation format, final display/reload, dropped explanations and swapped attribution. Exact final counts and deployment evidence are recorded in the PR.

## Limits and follow-through

- These changes address shared failure mechanisms; they do not prove the exact prior Maple response is fixed because its failed draft was not retained in the available telemetry.
- Retrieval remains bounded and lexical/period based. Date targets are not semantic completeness, and unvisited records cannot establish absence.
- Model interpretation and semantic review can still be wrong. A present user quotation would prove format-instruction provenance, not correct semantic interpretation; richer request provenance remains a design opportunity.
- The final guard deliberately fails closed if later transforms alter answer content. Preflight makes this discoverable earlier, but cannot guarantee zero future failures.
- The new repair trigger uses the existing bounded repair path; live usage/cost was not measured.
- No account history, pet data or existing benchmark grades were changed.
