# Certified sufficient result sets — bounded repair
Base: f32449590c860dabe65fd6da9e32b7a54ea651da. Date: 2026-09-24.
Root cause: buildLabsList rejected non-selection reads unless completeness was exhaustive or quantity was records, before consulting already-certified result-set authority.
The new path composes supportedHistoryPublication, isOrderedResultSet, and the existing resultSetSnapshotMatches check. It requires a certified result set and complete/complete_empty coverage.
No new proof store, semantic interpreter, selection, calculation, or source reconstruction was introduced. Certificate consistency enforces matching-set completeness, full representation, retained/omitted IDs, subject scope, windows, and lineage.
The ordinary path excludes alternate typed obligations and domains: task, projection, evidence needs, requirements, profile, stored read, calculation, selection jobs, episode, mutation and write jobs. The existing typed records/measurement recall contract remains; no measurement-only exception was added.
Sufficient describes the request's need, not the absence of a complete organ proof. Uncertified ordinary results now fail at Labs construction rather than downstream publication.
Multiple certified rows retain exact order and bodies. Existing typing has no separate singular-wording flag; this code never interprets singular prose or creates take(1). Explicit selection/limit obligations cannot reuse this plain-result-set path.
Selection certification and Calculation Labs operand transport remain separate. Lexical-empty caution and effective-stream absence rules are unchanged.
Diagnostics retire legacy.non_exhaustive_non_records and observe typed/certificate rejection and result-set source binding; they do not authorize execution.
Production diff has no added weight/weighed/weighing/September/Milo checks or raw-wording routing.
New generic eligibility tests: 45/45. Focused requested publication suites: 189/189.
G1 94/94; G2 89/89; G3A 89/89; G3C 74/74; retirement 5/5; retrieval 239/239.
Brain 78/78; Body 188/188; Core 51/51; Publication 85/85; Profile 78/78; mutations 184/184; security 84/84.
Safety 54/56 and Audit 209/222: exact known baseline failure names, no added or missing failures.
Typecheck, fresh production build (43 static pages), clean-copy typecheck, and whitespace check passed. Gate groups overlap.
Directly affected test adjustments: removed obsolete rejection of certified sufficient measurement; assert early null for uncertified sets; retain stale Labs review/validation rejection and actual source-free limitation checks.
No unrelated expectation was weakened. No Brain, Lungs, Heart, SQL, Brief, or Immune implementation changes.
No paid API call or production change was made during this repair. Actual Case A retest follows the repair commit.
