# Stage 1 revision: named topics and quotation integrity

Revises `56e3f5e7c5b597c8e9b64d2e07c0a9c624e373e2` on the existing isolated
`codex/ask-evidence-contract-stage-1` branch. Prior commits and unrelated
worktrees are preserved.

## Causes and changed paths

`source-note-recall.ts` had a urine-specific match followed by a generic
`test/result/vet` fallback. An explicitly requested blood test could therefore
select a same-day urine result or skin-diagnosis vet note. The fallback was
introduced by the previous source-recall revision.

Named-test matching now requires the complete literal descriptor from the
dated request to match the source's named test/result. It preserves compound
descriptors, such as liver function versus kidney function, and accepts spaces
or hyphens. Generic or coordinated/ambiguous descriptors require clarification;
they cannot fall back to generic test, result, or vet words. The existing
diagnosis-note path remains separate from named-test requests. Candidate,
competing-evidence, source ownership, date, and representation gates remain.

`validate-answer.ts` previously ran assistant-prose cleanup over the complete
source quotation. Its existing false-persistence regex removed `I recorded...`
and `I added...` from inside the quotation while leaving the citation intact.
Decimal-bearing source text could also be reduced to a fragment. This was an
integration regression between the new source renderer and existing sanitizer.

The validator now processes assistant-authored prose separately, then composes
the server-grounded quotation after prose rewriting. It does not detect trusted
quotes by punctuation: model-written quotation marks confer no exemption.
The deferred quotation comes only from the server contract's approved complete
span. The quoted text and the cited record value are identical. Final subject
checks still inspect the composed answer; assistant false-persistence and
diagnostic-prose checks still inspect assistant prose. Emergency guidance stays
ahead of a source quote. No ordinary-prose persistence protection is disabled.

No retrieval, model, database, persistence, or route changes were made.

## Reproductions and verification

Added actual mocked-provider/final-validator regressions before changing
implementation: the two topic mismatches and three source-wording cases failed
(**42 passed, 5 failed** in the initial expanded matrix). Positive matching
blood-result and ordinary false-persistence controls already passed.

Final results:

- Direct Stage 1 provider/validator matrix: **50 passed** (40 existing plus
  10 added checks).
- Default `npm test`: **2,180 passed**, including the wrapper executing all
  50 actual-path cases.
- Focused reliability, recovery-source, pending-persistence, context-reasoning,
  and Stage 1 suite: **172 passed**.
- `npm run typecheck`: passed.
- `npm run lint`: zero errors, only the two existing unused `supabase` warnings
  in `persist-learnings.ts:149,378`.
- Diff checks: passed.
- Remaining lifetime audit: **6 passed, 16 explicitly failed**, unchanged.

Tests assert visible content and references together: mismatches have no quote
or citation; successful pending results retain the exact entire quoted/cited
text, including first-person recorded/added wording, 2.7, negation, and
uncertainty. Model-authored persistence claims are still removed, even when
the model surrounds them with quotation marks. Existing source-recall,
exhaustive-answer, safety, and recovery regressions remain green.

## Limitations

Named-test matching is bounded literal matching, not a clinical synonym or
semantic resolver. The supported locator grammar places the test descriptor
after the explicit date; unsupported arrangements or ambiguous descriptors
fail with clarification. It does not infer equivalence between differently
named tests. Historical quotations still do not certify current medical status.
The existing retrieval and lifetime-audit limitations remain.

Verification uses synthetic records and mocked provider responses through the
real loading/generation/final-validation path, not live provider, production,
HTTP-route, or RLS checks. No provider calls, migrations, production changes,
push, merge, deployment, retrieval redesign, or caching work was performed.
