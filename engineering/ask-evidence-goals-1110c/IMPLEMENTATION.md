# Ask evidence goals and continuity — implementation checkpoint

Baseline: audit dated 2026-11-10, PR #516 source 4d94cf5e97e34f473f836926e7727e71ce75ce82. Engineering owner: ask-intelligence-1110c. Separate branch: codex/ask-evidence-goals-1110c.

## Active-path changes

- A: Native history calls now declare exact_quote, relevant_records, boundary, comparison or complete_set. The owner/pet binding remains in code. One comparison side is one pet/time-scoped call.
- Discovery: up to three model-proposed literal alternatives search note OR title with quoted PostgREST values and escaped LIKE wildcards. Complementary same-owner/pet/time discovery runs even after nonzero lexical hits. Lanes interleave candidates and deduplicate exact sources. Bounded paging supports multi-page scopes without another model round.
- Allocation: whole sources receive equal per-goal slot/character reservations before spare capacity is redistributed. Measurement handles are also distributed across admitted sources. Oversized sources remain omitted, never shortened and represented as exact full quotations.
- Coverage: per-goal event/recorded bounds, discovery lane totals/pages, distinct inspected candidates, omitted evidence, partial/unavailable/stale references, and absent selected support. Query exhaustion is explicitly not semantic recall or corrected-truth certification.
- B: independent local-calendar event and recorded-date bounds; explicit ordering axis. Entitlement bounds remain on event time. Retained references preserve their original timezone. Context-relative dates can reuse established scopes; unknown dependent event anchors still require clarification. Historical report versus current/corrected truth is explicit; no effective-history closure is added.
- C: bounded structured references persist inside existing response_data through readOnlyReferences, with no migration. At most four goals and eight source fingerprints per goal, no copied record text. They carry across source-free interruptions. A conditional read_referenced_sources tool rebinds to currently owned pets, filters exact source IDs and freshly checks text/timestamp fingerprints. Changed/missing sources are withheld and disclosed. Multiple plausible referents still require clarification; this is not unlimited memory.
- D: native final output is divided into general, saved and limitation components. Unsupported saved components are replaced individually; valid general components survive. Each saved component selects its source handles. Legacy injected-output validation is retained for existing internal callers; the active provider receives the new strict schema.
- E: profile measurements expose explicit metric identity; history measurements expose bounded nearby wording and leave metric unknown. Duplicate operands and cross-pet temporal changes return unavailable. Cross-pet absolute differences remain available. Server-rendered sums/means explicitly describe selected operands and partial coverage. Arbitrary historical metric interpretation remains unverified.
- F: two physical provider calls, four tool calls, 32 source records, 24,000 source characters, 64 measurement handles, six quotations and four calculations remain. History acquisition is capped at eight pages of at most 16 rows, plus sentinels, and 64 candidate rows total per turn; row capacity is also reserved across discovery lanes, with a shared eight-second acquisition deadline and five-second per-request bounds. Per-read profile ownership checks remain. SDK database retries are disabled on these reads so hidden retries cannot inflate the query ceiling. No additional agents, provider retries or services.

## Checks and interpretation

Focused execution covers nonzero lexical decoys, title/alternative SDK query construction, event-versus-recorded windows including DST boundaries, page exhaustion, four-way allocation, source omissions, mixed components, stale references, JSONB property reordering, source-free interruptions, publication/persistence/context/re-read handoff, exact quotes and citation provenance, arithmetic controls, and existing durable answer/credit behavior. Type checking and lint are required before publishing this branch.

All model responses in these checks are injected fixtures. The actual Supabase SDK is exercised against an injected HTTP transport; this does not establish live PostgREST query acceptance or model intelligence. No paid generation or real-app submission is authorized by these checks.

## Remaining acceptance and limits

Fresh signed-in preview generation is pending a separately approved pilot budget. Independently inspect authorized records before selecting unseen questions. Capture chosen goals, scopes, retrieval lanes, coverage, answer components, citations, and failures. Do not reuse the historical golden questions as the acceptance set, and do not count conversation replay as generation.

The audit's 12 turns / 24 calls / $0.10 remains an unapproved proposal. No production deployment or merge is included. Preview build/readiness must be reported separately from live acceptance.

Remaining limitations: model-selected intent and semantic support are not formally certified; lexical plus bounded broad discovery can still miss relevant records; complete-query coverage is not universal semantic completeness; unknown event-anchor dependencies need clarification; effective correction lineage is not restored; arbitrary same-unit historical metrics may still be ambiguous; references are bounded, and old conversations acquire them only after a new successful sourced turn.

Brain now proposes compact evidence obligations; Lungs performs bounded discovery and fair evidence acquisition; Memory carries bounded references requiring fresh reads; Labs reports actual coverage and provenance. This remains the compact native two-call path.
