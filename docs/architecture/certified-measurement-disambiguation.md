# G3C: certified measurement disambiguation

Scope: saved-history calculation operands only. Brain proposes semantics, Lungs certifies the record, and Muscle identifies a measurement inside that exact record. Class 4 remains PARTIAL.

## Selector authority

A measurement read slot optionally carries `measurementSelector: {predicateIndexes: number[]}`, or null. Indexes reference the companion bound ReadTicket's existing `text_any` predicates. They must be nonempty, unique, integral, in range, and reference only text predicates. No selector text, source IDs, offsets, occurrence numbers, or numeric values enter through the provider shape. Event-time slots require null/omission; count_records has no operands.

Server binding snapshots include the entire CalculatePlan and ReadTicket, including predicate ordering. A serialized selector plan requires its trusted original when rebinding. Changed selectors, predicates, or ordering fail snapshot checks; there is no remapping by text. Legacy selector-free G1 serialization stays unchanged.

## Extraction and matching

The candidate extractor preserves G1's explicit-unit numeric regex, unit registry, signs, decimals, aliases, rational parsing, scales, and overflow checks. It enumerates only measurements compatible with the requested dimension. Exact rational parsing is deferred until a candidate is used, preserving G1 ambiguity precedence over numeric validation and preventing unrelated occurrences from blocking a selected valid occurrence.

Spans use half-open UTF-16 indexes into the unchanged certified body. Each source span includes the entire numeric-plus-unit token. Starting outside that token, context scans left and right to the nearest newline, carriage return, comma, semicolon, pipe, exclamation mark, question mark, or period that is not between two digits. The boundary character is excluded; surrounding whitespace is retained. Colons remain in context. No delimiter can split the candidate token, including its decimal point.

Lungs, effective selection, and measurement contexts share `read-text.ts`: NFKC, English locale lowercase, non-letter/non-number runs replaced by one space, then trim and padded literal token-sequence matching. Lungs retains its existing empty-normalized-term guard; effective selection retains its previous literal behavior. Extraction changes no retrieval, anchor, correction, coverage, or record-selection policy.

Every referenced predicate must match the same candidate context (AND across indexes, OR across each predicate's terms). Exactly one candidate is required. Zero matches yields `measurement_selector_no_match`; multiple matches yield `measurement_selector_ambiguous`. Null/omitted selectors use all dimension-compatible candidates and retain `measurement_unavailable` / `ambiguous_measurement`. No whole-record fallback, ranking, nearest-label rule, record reselection, model retry, or database call occurs in Muscle.

## Certificate and publication

Certified measurement operands retain record/source/subject identity, event time, the body, exact literal and numeric text, canonical unit and dimension, exact source/context spans, selector indexes, and a serialized exact rational measurement value. Calculation Labs' existing full snapshot and deterministic re-execution checks cover these fields. Identical literals at different offsets remain distinct. DAG dependency provenance reaches these leaf operands; G2 still requires all cohort candidates to certify.

Publication exposes the existing literal, timestamp, and mathematical result only. Offsets, predicates, and context mechanics remain internal. Emergency supremacy, no-write behavior, and zero-provider execution remain unchanged.

## Deliberate limits

Multiple compatible measurements sharing a matching structural segment remain ambiguous. Labels in other segments are not inherited; globally matching predicates cannot rescue a local no-match. Unsupported/unitless quantities and clinical interpretations gain no authority. Cross-source arithmetic and derived grouping beyond G2's complete per-subject cohort remain deferred.

## Offline closure gates (2026-09-24)

Base: `24b3c7560f07ba6bb706915eeef7a7daa1437233`. Tests use the existing direct-Node resolver shim and external-fetch guard. No existing test expectations were changed.

| Gate | Result |
| --- | --- |
| G3C focused | 74/74 |
| G1 | 94/94 |
| G2 | 89/89 |
| G3A | 89/89 |
| Legacy calculation retirement | 5/5 |
| ReadTicket/Lungs/retrieval | 239/239 |
| Brain | 78/78 |
| Body | 188/188 |
| Core | 51/51 |
| Publication | 85/85 |
| Profile | 78/78 |
| Canonical mutations | 184/184 |
| Capability/security | 84/84 |
| Safety | 54/56; exact same two established failure names |
| Audit | 209/222; exact same thirteen established failure names |
| Typecheck | Passed |
| Clean build | Passed |
| Whitespace | Passed |

The first isolated build found an incomplete pre-existing dependency junction (missing bidi-js). The successful fresh build used the complete previously installed cache after checking every direct dependency/dev-dependency version against package-lock.json. No package or lockfile changes were made. The build excluded environment files and credentials, used placeholder configuration, disabled telemetry, and blocked external fetch. No public assets were staged or modified.

No deployment, live Ask, paid APIs, or production access. GPT-5.4 Mini configuration is unchanged.
