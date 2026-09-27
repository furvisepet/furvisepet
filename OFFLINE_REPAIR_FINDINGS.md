# Furvise offline repair — approved architecture decision

Base: 0a00fc14e40d827e47ab6c6f51870ceadab3af5b
FULL OFFLINE GREEN: true, for the established Phase 5 gate manifest plus the new adversaries and captured-evidence replays.
Provider calls: 0. Provider cost: $0. No live acceptance, push, merge, deploy, or production access.

## Architecture and evidence-domain repair
Brain remains the only semantic interpreter. The provider's supplied-calculation branch now receives a bounded vocabulary of unique, exact numeric spans from the authenticated current USER turn. No candidates (or an over-budget vocabulary) means no supplied-calculation branch. Quotes and premiseQuotes share that vocabulary; current-turn sourceTurnId uses null. Ask binding accepts only the current USER source for calculation premises and rejects prior/assistant/foreign reference authority.

This is lexical syntax and source restriction, not a date/name/label classifier. The existing numeric/unit Binder remains authoritative for exact values, dimensions and source binding. Brain instructions explicitly distinguish missing historical operands from supplied quantities, preserve saved-history read scope and subject authority, and forbid invented zeroes, units and placeholders. They do not add another interpretation call.

The vocabulary is bounded at 256 unique spans, respects the existing 400-character premiseQuotes envelope limit, and uses existing unit aliases. Overflow fails closed for that provider branch rather than reopening unrestricted quote strings. Source-exact scalar substrings can still be semantically misclassified by Brain; tests retain this limitation explicitly. Offline frozen semantic proposals test contract behavior, not live model accuracy.

Current-USER-only calculation premises are the authorized scope change. The old Ask test permitting prior USER calculation operands was migrated to assert rejection; lower-level canonical calculation APIs were not redesigned. Other dialogue reference behavior remains unchanged.

## Calculation DAG decision
Canonical CalculatePlan, roles, slots, Muscle and strict Binder are unchanged. Provider instructions and the DAG branch description require unique producer IDs, roots before consumers, and references only to already-declared nodes.

A homogeneous calculations-array schema cannot compare sibling IDs or express earlier-node existence; reordering preserves that schema's validity. Fixed positional objects, nested producer trees, or tuple/conditional machinery would add a provider representation and translation layer or require unsupported keywords in the repository's current dialect. Under the user's approved fallback, no such representation was introduced.

Self, future and unknown producer references still fail Binder. Tests cover alternative valid root orders, invalid consumer-first permutations, and self/future/unknown IDs. No sorting, role swapping, implicit producer creation, repair call, or second planner exists.

## Certified profile registry audit
All 13 request-contract selectors now have an explicit disposition.

| Selector | Authoritative stored representation | Disposition |
| --- | --- | --- |
| name | name | Exact stored string |
| species | species | Existing dog/cat enum |
| breed | breed | Exact reported string |
| sex | sex | Existing stored enum, including not_sure |
| weight | weight_value + weight_unit | Existing positive numeric value and explicit kg/lb |
| current_food | current_food | Exact reported string |
| main_concern | main_concern | Exact reported concern; no diagnosis inferred |
| care_goal | wellness_goal | Exact stored goal |
| avoid | avoid_ingredients | Exact cloned string array; no prose splitting |
| age | age_value + age_unit | Recorded nonnegative value with explicit months/years; no elapsed-age derivation |
| lifecycle_status | lifecycle_status | Exact active/deceased/archived enum |
| pronouns | No field in authoritative row contract | Per-field unavailable; never inferred from sex |
| monthly_budget | Numeric value lacks explicit currency companion | Per-field unavailable; no currency guessed |

Unavailable fields no longer suppress unrelated supported fields. Existing snapshot binding, representation checks, certified Labs, publication review and final validation enforce per-field authority. Invalid internal selectors remain rejected. No renderer, publication policy, safety organ, or database schema was changed.

## Source-semantics discriminator
The already-applied discriminator was preserved byte-for-byte. New adversaries verify schema/parser parity and APPEND schema composition for observations, unknown classifications, attributed corrections and forged targets. Existing APPEND/REPLACE source-body serialization and SQL gates remain green.

## Captured first-attempt evidence replay
Original live evidence was read only and never rewritten.
- Cases 2, 5 and 6: invented supplied-premise proposals are now rejected by the context-aware provider schema; strict Binder rejection remains.
- Cases 7 and 9: incompatible source-semantics combinations are rejected by the provider schema; strict Binder rejection remains.
- Case 4: the original proposal now also violates canonical current-source spelling (it supplied the current ID instead of null). An explicitly labelled offline diagnostic changing only that spelling passes the provider schema and still fails Binder with backward_reference. This is evidence of the retained wire-schema limitation, NOT a claim that forward references became structurally impossible.
- Case 3: replay through deterministic profile context, Labs, review and final validation produces the captured cat and rice-and-turkey profile facts, with outcome complete and zero provider calls. History did not substitute for profile values.

## Offline gates
The exact commands, test files, counts, elapsed times and log hashes are recorded in OFFLINE_REPAIR_RESULTS.json. Groups overlap and must not be summed as unique tests.

Key results: new adversaries/profile 114/114; expanded 816/816; audit 222/222; Brain 78/78; calculation 360/360; extended calculation/domain 678/678; domain 379/379; retrieval 244/244; route/read 217/217; publication 149/149; official security 160/160; receipt/security 99/99; stress cases 17/17; Phase 5 corrections/receipts 74/74. All remaining established manifest groups also passed, with no skipped tests or waived assertions.

Typecheck, changed-file lint (zero warnings), diff check and clean offline webpack build passed. Two inherited unused-variable warnings in touched files were fixed without changing behavior.

The clean build used a copied source snapshot with a dependency junction, network guard, existing local font fixture, and dummy loopback configuration. Real environment files were excluded. Build-source hashes match the final code.

Database gates: clean application of 135 migrations under the existing offline schema harness; canonical/source-semantics SQL 43/43; fresh 134-to-135 legacy upgrade 1/1. The existing harness's hosted scheduler exclusion is unchanged. A disposable local PostgreSQL container used network=none, no ports, 512 MiB and one CPU. It was removed. Existing acceptance service IDs/port mappings were unchanged.

## Complexity and changed files
Production delta against the candidate, including the pre-existing discriminator: 79 lines added, 34 removed; net +45 across four files. This turn's new production work excludes that pre-existing +20/-12 discriminator: +59/-22, net +37. One 17-line lexical schema helper was added; no planner, authority layer, execution adapter, DB migration, or provider call was added.

Production:
- app/lib/furvise-brain/source-semantics.ts — preserved existing discriminator.
- app/lib/intelligence/ask-request-contract.ts — bounded current-USER premise schema/binding, Brain and DAG instructions, inherited lint cleanup.
- app/lib/intelligence/calculation-premise-schema.ts — lexical numeric/unit quote vocabulary only.
- app/lib/intelligence/profile-field-authority.ts — complete selector audit and certified per-field projection.

Tests:
- tests/brain-evidence-domain-composition.test.mjs — current-USER premise scope regression.
- tests/live-matrix-offline-repair.test.mjs — broad unrelated source/domain/DAG/discriminator adversaries.
- tests/profile-field-authority.test.mjs — registry parity, exact mappings, missing units, unsupported fields, Labs/publication and final validation.

Evidence:
- OFFLINE_REPAIR_FINDINGS.md
- OFFLINE_REPAIR_RESULTS.json

## Preservation and remaining limits
All five ASTRA briefs and the pre-existing discriminator were hash-verified unchanged. The earlier OFFLINE_REPAIR_AUTHORITY_BOUNDARY.md remains an untracked historical finding; the user's subsequent architecture decision resolves that stop.

All 637 frozen live-packet files verified unchanged. Aggregate remains stopped with 11 consumed slots. Case 11 marker, result and aggregate hashes are retained. Its provider outcome/accounting reservation remains unresolved; no zero-cost reconciliation was fabricated. Cases 12–14 were not dispatched.

Public V1 calculation and mutation policy remains disabled and unchanged. Lungs, Muscle, Labs implementations, roles, slot execution, Brief, Immune, publication and production configuration were not modified.

Next step: review this offline-green repair and obtain a fresh bounded live-acceptance authorization when desired. The previous stopped matrix authorization must not be reused.
