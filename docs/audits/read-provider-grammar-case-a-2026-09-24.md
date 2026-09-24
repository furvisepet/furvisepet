# Case A after provider grammar repair — 2026-09-24

Functional commit: 82b48257ae765c63d4cc89172913b5271313dcc9 (fix: align read provider grammar with binder).
Previous certified sufficient publication repair remains intact. Binder changes: none.

## Result: STOP
Exact prompt: "What was Milo's recorded weight on September 1, 2026?"
HTTP 200 in 9,548 ms, but no 10 kg answer. A supported factual read returned a source-free unsupported-operation limitation. Case A failed acceptance; B–T and Classes 4/9/10 were not resumed. No retries or stacked fixes.

## Observed next boundary
Brain emitted read/recall/saved_history, named Milo, Sep 1–Sep 2 bounds, measurement predicates, null strategy, sufficient completeness, null limit, no selection, no episode/needs/write.
Binder accepted. Lungs retrieved exactly record 7d60413b-df49-43c9-88f8-1e14db37f462, containing "Body weight: 10 kg." at 2026-09-01T12:00:00Z.
Lungs resultSet: matchingSetComplete=true, representationComplete=true, certified=true, no omitted IDs; owned subject d1768cec-4789-46bc-83e0-edbd2bcc278d.
Publication dispatch: path=unavailable, sentToModelGeneration=false, resultSetComponentCertified=false, certificateAuthorizedEventIds=[], certificateAuthorizedSourceIds=[], requirement kind=additional_obligation.
Published: "The requested history operation is not supported by certified publication yet. I can’t provide a verified result for it."
The certified receipt survived retrieval, but publication eligibility did not accept it. The observable boundary is the publication capability gate, before deterministic Labs publication. Read-only inspection locates these gates in supportedHistoryPublication / supportedPlainResultSetRead and buildLabsList. The logs do not identify the individual false capability predicate; no speculative fix was made.

## Execution and credit
Request aa4b73a4-1ba1-4f76-ab1f-c60fd5f20b23.
Attempt 10492a75-0898-4593-bdee-8de7092c74d5.
One gpt-5.4-mini interpretation, 8,746 ms, 27,897 input / 763 output tokens.
No factual generation, review, repair, or provider fallback.
Application cost ledger: 24,357 microdollars = $0.024357 this run. Prior two admitted calls: $0.039930; cumulative three calls: $0.064287.
Credits used 0; released; settlement reconciled; remaining 55.
No care/history mutations. User message and one assistant limitation persisted before cleanup.
The real authenticated HTTP client/API path was exercised; browser UI rendering was not verified.

## Isolation and cleanup
Restored local Supabase with previously applied 135 migrations; exact migration versions and copied source files verified, no replay needed. Local Redis was fresh. Two new synthetic users, four profiles, thirteen care rows; cross-user RLS empty and service-only RPC denied to client.
Two users deleted, sessions revoked, private session file removed. All enumerated public/private user-owned rows and auth sessions verified zero. Local services are stopped after cleanup; no production backend, deployment, or cutover touched.

## Offline status
See read-provider-grammar-alignment-2026-09-24.md and offline-gates.json.
Schema-focused 145/145, sufficient repair 45/45, publication-focused 189/189, retrieval 239/239.
G1 94/94, G2 89/89, G3A 89/89, G3C 74/74.
Brain 78/78, Body 188/188, Core 51/51, Publication 85/85, Profile 78/78, Mutations 184/184, Security 84/84.
Safety exact known 2 failures; Audit exact known 13. No new required-gate failures.
Typecheck, fresh build, clean typecheck and whitespace pass; no prohibited production matching additions.
Extra feature-provider test failure ASK_MEMORY_BRAIN_REQUIRED reproduced in previous clean source and was left unchanged.

## Class status
Grammar drift repaired and independently Binder-validated. Case A remains failed at publication eligibility, not interpretation or retrieval. Subsequent acceptance and later completion phases remain blocked. Production cutover remains blocked.
