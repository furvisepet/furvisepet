# Ask V1 missing-field contract repair — 2026-11-13 (PST)

This checkpoint is NOT release approval. R18 on 5b24f4fe9dc893b63312b07738e935c971fb8db0 failed: the published answer asked for medicine name and strength when the owner asked about an explicitly unrecorded object's appearance/material. The active first-pass task had missing=medicine, kind=saved_content, recordMode=none, needsHistory=false, with no reads. Clinical occurrence was none, care context none and medication intent none. The second review also reported no medication intent/care context. This was an inapplicable task missing-field flag, not a need for prescription authority. No unsafe treatment advice was observed; this was not a clinical benchmark case.

Two actual core regressions reproduced that visible failure and the residual medicine flag before the change. The existing owner-bound no-read reconciliation now removes inapplicable medication-authority flags only under its nonclinical, source-free saved-detail contract, after binding one explicit unique owned pet through the existing binder. It preserves independent year ambiguity. Real medication/care intent, current/conditional events, clinical missing authority, history reads, signed references, owner-fact tasks, competing pets and binder drift remain excluded. The core still invokes this reconciliation only when the first pass planned zero reads; it grants neither read nor treatment authority. Both clinical assessments and final visible review remain in force.

The targeted suite completed 200/200 PASS under a 96 MB old-space bound. It includes an actual two-call core reproduction, source-sentence/native-provider tests, emergency and medication protocol regressions, task execution and benchmark gates. A native clinical fixture was aligned to the strict current wire schema (including combineHistory, historySynthesis and evidenceCompletion); the mocked envelope is now independently validated against each physical request's actual JSON schema. No production decoder was weakened for a legacy fixture.

Full broader local verification remains separate. Two earlier broad runs were cancelled, not green; one obsolete wire fixture was aligned, and the later run was stopped on laptop RAM pressure. The latest READY parent preview's Vercel production build completed successfully. A fresh exact-child preview build and fresh real repair cohort are still required. Prior passes do not transfer.

## Retained actual live spend and outcomes

- 83ae3b9a: A01/A02/A03 PASS, A04 FAIL; 4 answers, 8 calls, $0.036905.
- fe23dc55: R17 PASS, A11 FAIL; 1 answer + 1 explicit error, 4 calls, $0.031455.
- 5b24f4fe: R18 FAIL; 1 answer, 2 calls, $0.008487.
- New session: 7 turns, 4 PASS / 0 PARTIAL / 3 FAIL, 6 answers + 1 explicit error, 14/14 calls with actual receipts, $0.076847.
- Earlier retained history: 48 turns, 30 PASS / 9 PARTIAL / 9 FAIL, 96 attempts, $0.862480 known plus one original unrecovered actual.
- Combined: 55 turns, 34 PASS / 9 PARTIAL / 12 FAIL, 110 physical attempts, 109 actual receipts, $0.939327 known plus the same original unknown.

The original unknown receipt is still unresolved. G's explicit 48-turn / 96-call / $2.50 incremental authorization applies despite only that old unknown. A new unclear receipt stops paid testing. R18's receipts were recovered before any next submission; the first recorder was rejected before process start on resource admission, then a materially smaller 96 MB bounded recorder preserved the immutable original evidence and validated the result. The subsequent read-only source-print step had a text-encoding error after successful recording; neither the app nor the recording was replayed.

R19 is a fresh pre-output frozen unknown-detail analogue, independently reviewed against original A04 and the new R18 regression. R04 remains unused and fresh for the A11 collection repair. Original prompts/results/costs and the original48-case freeze remain unchanged; extra registered candidates do not increase paid caps or the16 actual reserve ceiling.

Supabase ACTIVE_HEALTHY was freshly verified. All6 owner profiles,628 care rows and update_my_care_entry function fingerprints matched baseline. PT409 remains preserved; no owner data, database settings, production deployments, dirty shared checkout, Forge workspace, branch protections or runner activation was changed. No fresh clinical case has been submitted on these repair SHAs.

Release remains NO-GO pending meaningful exact-head signed-in qualification, complete verification and external required CI gates. No statistical reliability or clinician signoff is claimed.
