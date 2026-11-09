# Omitted saved text is distinct from an empty search

The compact native read-only engine now distinguishes an owned record omitted by read limits from a search that returned no record. Previously both paths could publish 'I did not find saved information', despite a verified matching row being present but too large to forward.

The server records omission only after validating the returned row's owner, pet, kind and timestamps. A bare truncated flag cannot establish that a saved record exists. The model cannot supply this marker, source wording, fabricated quotes or authority. An omitted record produces an honest partial limit explanation with no invented citation. Genuine empty searches retain their existing no-match response. Oversized foreign evidence fails before omission, without disclosing its existence.

Five new regressions exercise answer/partial drafts over an oversized owned note, complete empty results, oversized foreign rows, and a metadata-only truncated flag. Controlled focused run: 28 total / 26 passed / 2 failed before; 28/28 after. This overlapping targeted set is not an additional user-question corpus.

Final local gates: 647 total / 646 pass / 0 fail / 1 existing optional skip; security 402/402; TypeScript, lint, production dependency audit and build passed. All-dependencies audit is NOT green: 10 findings (2 high, 8 moderate); production-only audit is zero. Dependency manifests/lock versions were not changed; see the separate audit checkpoint.

The adjacent b352 local commit migrates 28 reproduced stale public-write/Brain-shape failures while retaining actual private capability, owner/source/target tamper, manual CRUD, SQL RLS/privilege/lease and credit invariants. No files or tests were deleted. Public Ask still exposes exactly two native read tools, at most four tool requests and two physical provider calls per logical turn. There is no mutation feature, provider repair, cost increase or new capability schema.

The 50-prompt scripted-model harness remains 50/50 versus baseline 39/50; it does not measure model semantic accuracy. Real paid generation remains on exact 61ee: original note quotation/citation/replay and seven clean representative dimensions passed, with a separately documented mutation-explanation presentation defect. Latest publication and omitted-text fixes have offline regressions, not new paid acceptance. The approved cap remains closed at 16 turns, 32 physical calls and $0.062993 reconciled usage.

The exact 0175 preview passed authenticated old-conversation replay and application-level anonymous/invalid-bearer 401 probes without another Ask submission. This is replay, not new generation on this commit. Exact latest full GitHub CI and preview must be verified after push. Remaining full-suite failures are unwaived. No CODEOWNERS file or PR review was observed; protection/ruleset reads returned 403, so an independent owner gate remains unverified. PR #516 remains draft, production unchanged, release NO-GO.
