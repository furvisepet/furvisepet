# Ask presentation and delivery repair

Base: 004c6fc4a4f299c61c9944360a3fc58804d382dc
Branch: codex/ask-presentation
Worktree: C:/Users/gwara/furvise-ask-presentation

## What failed
Three production-callback reproductions failed before edits: a request for two points became one paragraph, numbered layout disappeared, and a paragraph request retained model bullet decoration. The reviewer joined sentences with spaces and the final sanitizer collapsed whitespace.

The first real Chrome test of actual callback output then failed at production response serialization. cleanAnswerProse converted lists into newly worded prose and could inject "Useful next steps" into a historical answer. Action-copy filtering also collapsed line boundaries. This explains why a valid callback answer was not sufficient to establish visible formatting.

## Changes
- Presentation is applied to already retained sentences. It changes separators and list prefixes only, without paraphrasing, dropping, duplicating or reordering claims.
- Explicit bounded English requests for bullets, numbered lists or paragraphs control layout. When fewer supported sentences exist than requested points, the response does not invent more. Requested groups are contiguous sentence groups, not a semantic outline.
- Long default reviewed prose receives paragraph breaks at complete sentence boundaries. Coverage remains a separate paragraph.
- Unambiguous bullet decoration is normalized before source review; a spaced negative numeric value is retained.
- After downstream sanitation, layout is restored only if whitespace normalization proves every token unchanged. Removed diagnosis, action or persistence copy cannot be restored by presentation.
- The response serializer preserves list lines and paragraphs. The existing action-copy guard still removes references to absent actions, without rewriting unrelated lines. Application action IDs and authorization are unchanged.
- Chrome acceptance consumes five generated production-callback outputs, serializes/reloads them through the real response parser, and renders the real AskAnswerText component. These are synthetic providers/database responses, not authenticated application requests.

## Verification
- Original callback reproductions: 0/3 before, 3/3 after.
- New focused suite: 8/8 passed. Includes partial rejection, no invented points, decimal/negation preservation, layout-only restoration, false-persistence removal and serialization.
- Full default suite: 2,295 passed, zero failed/skipped/cancelled.
- Typecheck and production build passed with current production code.
- Final lint passed with only the two existing persist-learnings.ts warnings.
- Chrome presentation: 8 checks passed over five callback samples; original quotation/browser suite: 6 checks passed. Both exited zero and removed their owned profiles.
- One obsolete test assertion requiring serialization to flatten embedded list markers was changed to exact text preservation. Its action-ID checks remain. No lifetime audit expectations were changed; that audit was not rerun (last reported14/3).
- No provider calls or budget-ledger changes. Cumulative preceding testing remains USD0.851979 estimated, USD4.367871 reserved; this pass USD0.

Reproduce callback/browser fixtures:
FURVISE_PRESENTATION_EXPORT=1 node --experimental-transform-types --test scripts/audits/ask-presentation.cases.mjs
node scripts/audits/ask-memory-browser.mjs --ask-presentation
node scripts/audits/ask-memory-browser.mjs --ask-conversation
Set the environment variable using the shell's syntax. Default tests do not rewrite fixtures.

## Limits
Formatting recognition is deliberately bounded English, not arbitrary document generation or perfect intent understanding. The layout helper does not summarize or semantically regroup claims. A downstream content change can cause layout restoration to abstain. General generation and older answer-economy transformations are not replaced wholesale. Lists are plain text with preserved line breaks in the existing renderer, not a new rich Markdown/HTML interpreter.

No authenticated preview or deployed application was exercised. Database, auth, provider quality/latency and rollout remain separate gates. No Docker, DB execution, migration, push, merge or deployment occurred. This repair does not claim V1 launch readiness or universal question handling.
