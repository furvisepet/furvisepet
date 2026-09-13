# Repair 1: shared symptom recognition (revision of f74d85b4)

## Cause and bounded change

The source transition extractor and concern-topic matcher duplicated symptom
forms. Both recognized `threw up` and `throwing up`, but omitted `thrown up`.
Consequently the shared recovery decision saw yesterday's recovery without
today's competing symptom, including at the actual final persistence boundary.
This is a remaining lexical coverage gap in f74d85b4, not a chronology failure.

`concern-symptoms.ts` now supplies activity forms to predicate extraction and
topic aliases to concern matching. The vocabulary includes throw/throws/threw/
thrown/throwing up. Predicate-local grammatical negation excludes affirmative
activity; uncertain activity retains source certainty flags. Negated recovery
remains distinct from negated symptoms. Existing subject binding, interval
comparison, current-concern applicability, and canonical payload rebuilding
are unchanged.

An additional failing downstream test found that the history-worthiness lexical
check also omitted thrown-up observations. It now reuses vomiting recognition
without discarding qualified wording or granting terminal authority. This is
the only extension beyond extraction/topic matching.

## Execution and verification

Source assertions -> coordinated predicates -> shared concern decision ->
orchestration / automatic resolution proposal -> fresh owner/pet concern lookup
in `persistPendingSuggestion` -> repeated shared decision -> canonical payload
rebuild -> pending insert. The final persistence implementation was not changed.

Behavioral tests were added before implementation. Both reported messages and
their past-perfect variants inserted resolved payloads on the old implementation;
the new tests failed at the actual mocked persistence assertion. After repair,
blocked cases return no terminal suggestion/action and perform zero inserts.

The matrix covers all four requested forms, sentence reordering, coordinated
predicates, semicolons, explicit save requests, negative/uncertain reports,
overlapping intervals, and clearly later recovery. Positive controls assert
canonical persisted payloads and orchestration output. A separate exact insert
assertion preserves `I think Milo has thrown up today.` as nonterminal history.
All previously committed regressions remain in place.

Verification on September 4, 2026:

- Focused reliability/source/persistence tests: 142 passed.
- Full test suite: 2,179 passed, zero failures.
- Typecheck passed.
- Lint: zero errors; existing unused-parameter warnings in
  `persist-learnings.ts` at lines 149 and 378.
- `git diff --check` passed.

## Limitations

This remains bounded English lexical recognition, not an exhaustive language
parser. Novel idioms and more complex negation may need additional coverage.
Negated activity alone is not newly promoted to confirmed recovery. Existing
conservative uncertainty/interval abstention and UTC-relative-date limitations
remain. Tests use mocked dependencies and providers, not a real database or live
provider. No retrieval/caching, schema, model, deployment or production changes.
