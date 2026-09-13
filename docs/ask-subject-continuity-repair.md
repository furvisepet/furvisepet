# Ask pet subject continuity repair

Base: 88733cd. Branch: codex/ask-subject-continuity.

## Cause and implementation
The actual Ask route resolves the per-turn subject before rebuilding alternate-pet context. The deterministic resolver treated messages without personal pronouns as selected-pet context, including ordinal episode follow-ups after an explicit pet switch.
The bounded correction uses existing owner-established recent subject state for ordinal/demonstrative episode references. Explicit current pet names and species retain precedence; ordinary non-referential questions retain selected-pet semantics. Ambiguous multi-pet and outside-animal references cannot silently choose the selected pet. Assistant prose does not establish this focus.
This selects only a pet, never an episode identity. Existing owned envelope, source-version, correction and deletion revalidation remain mandatory downstream.

## Verified
- Initial resolver reproductions: 5/11 passed before, 11/11 after. Three additional continuity controls are included in the final suite (14 resolver tests).
- Three composed resolver/context-loader/actual-generation-callback/final-validator/reference-attachment cases pass: Luna evidence after switching, wrong-pet envelope rejection, and stale deleted source rejection.
- Full default suite: 2,198 passed, zero failures, skips or cancellations. The existing wrapper runs the three additional callback cases.
- Typecheck passed. Lint: zero errors and two pre-existing unused-parameter warnings in persist-learnings.ts.
- Git diff whitespace check passed.
- Unchanged lifetime audit: 7 passing / 10 failing, versus 6 / 11 before. The ordinal pet-switch assertion now passes; no audit expectations were weakened.

## Scope and limitations
Tests use mocked database/provider dependencies with real application functions. They compose the resolver and existing callback in route order, not an HTTP request or real database transaction. No live provider, database changes, remote migrations, push, merge or deployment occurred. The parent dependency tree was reused via a node_modules junction without installation.
Recognition remains bounded English and uses the existing eight-owner-turn subject window. Long-distance subject recovery, arbitrary co-reference, exact lifetime totals, complete multi-pet evidence, and the ten remaining audit failures are not solved. PostgREST deployment prerequisites remain unverified.
An exclusive OS file handle at the worktree-specific temporary lock prevented cooperating writers from entering during this repair; no other process was interrupted. Original branches and worktrees were preserved.
