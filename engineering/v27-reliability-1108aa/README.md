# Read-only Ask reliability candidate — 2026-11-08 PST

Status: preview qualification only; production remains unchanged. This is an isolated delta on cd77d6730adf99d2a13bc25de008e2e9863d4f26, stacked on draft PR #514.

## Runtime changes

The public compact engine and its two native read capabilities remain the architecture. No write capability, SQL privilege, migration, authentication relaxation or non-AI CRUD change is introduced.

- Bounded history supports ascending or descending event order. Earliest/latest comparisons can compose two searches within the existing four-tool batch.
- Overlapping reads retain shared source references in each result. Changed source content/identity between reads fails before answer generation.
- An empty later literal-search page never falls back to unrelated notes. Coverage includes actual pet/date/query/order/offset and previous/unread/truncated pages. Publication adds a deterministic, body-signed Search coverage section that survives reply-size fallback.
- Reads without selected evidence cannot publish the model's unsupported narrative as a completed answer. They return an honest partial result. This can omit generic parts of mixed questions rather than risk unsupported attribution; it is not a proof of semantic correctness for arbitrary prose.
- Dialogue truncation is explicit in both phases. General-answer review omits the internal pet-handle map.
- Server arithmetic converts compatible units, handles unambiguous decimal commas, and explains undefined percentage baselines, tied event chronology, incompatible units and overflow. Ambiguous grouped, fractional, ranged or scientific numeric tokens are not guessed. Exact original note strings remain unchanged.
- Native SDK requests settle locally inside the accounted invocation, even if an endpoint ignores cancellation. Late success/rejection cannot replace a timeout or reconcile after terminal settlement. Timeouts retain their diagnostic classification. SDK retries remain disabled and all turns remain capped at two physical requests.
- Citation display separates event and recording instants in the reader's local timezone, includes the zone across repeated DST hours, and enlarges the native disclosure target. Real mobile accessibility and rendered candidate QA are pending.

## Evidence and honest scoring

The 50 unique prompts span science, math-fiction, code, philosophy, multilingual, slang, counterfactual, profiles, aliases, pronouns, exact history, follow-ups, conversation-vs-record, comparisons, units, percentages, ambiguous/relative dates, spring/fall DST, pagination, truncation, literal/fallback searches, adversarial text, mutation attempts and medical uncertainty.

The harness uses the real orchestration, data adapter and publication with scripted model choices and a bounded in-memory Supabase-shaped fixture. It asserts exact expected synthetic source IDs, ownership/deletion, quotations, arithmetic, partial coverage, call counts and no mutation. It does **not** measure whether a real model chooses the right tool or gives an intelligent answer.

The identical strengthened corpus passes 39/50 against pinned cd77 modules and 50/50 against the candidate. Earlier harness calibration errors and their logs are retained locally; the calibrated/pinned strengthened baseline is authoritative. Six further evidence regressions cover unsupported narrative, source changes, bounded dialogue and ambiguous numeric forms.

SDK uncertainty coverage now exercises both native phases plus the shared structured helper. The first native run had six failures: ignored cancellation admitted late success and timeouts lost classification. All 39 uncertainty cases pass after the runtime fix. They preserve exact admission-to-wire equality, started liability, missing-usage/reconciliation failure, uncertain start, late-settlement invariance and denial of a third call. The preceding-slot seed is accounting-only and explicitly not a physical/provider call. All testing in these fixtures is unpaid.

## CI applicability

The cd77 full Linux run 42521411417 had 6,067 tests: 5,779 passed, 287 failed, one skipped, zero cancelled. Its complete failure-location manifest and raw-log SHA are included; the raw log remains in the owned Windows workspace. No failures are blanket waived or tests excluded.

Three stale assertions were migrated without changing product behavior: six-call policy to actual two-call/2,400-token policy; former care-write finalization to skipped care writes plus answer-before-credit persistence/replay; suggestion mutation admission to authenticated private denial. The transport uncertainty suite was migrated from the bypassed canonical generation interface to active native phases and retains the shared structured path. Its former third-call fallback expectation is now an explicit denial assertion. Retained grammar/write failures still require applicability review and cannot be represented as a green full suite.

The workflow adds the new regression and migrated active-contract suites to the focused job; unfiltered Full tests remain intact. Final local gate receipts are in local-gates.json. Windows uses the existing bounded --no-opt workaround; the native V8 issue is not claimed fixed.

## Live baseline and remaining gates

live-baseline-cd77.json records this iteration's two signed-in baseline turns: original Cedar quotation returned the exact synthetic note, and a courtroom explanation of 0.999…=1 answered correctly with zero record reads. Total: four physical calls and $0.006920 reconciled provider cost. The quote's expanded citation/replay remains pending in this iteration. Earlier parent QA is not candidate acceptance.

The browser connection subsequently returned: "Browser access requires the originating browser context. Open ChatGPT in the browser with the connected extension and try again." No candidate question was sent after that boundary. Do not replace signed-in candidate acceptance with offline mocks or anonymous 401s.

Remaining paid allowance in this iteration is at most 14 turns and $0.143080 reconciled cost. Verify the exact candidate preview SHA before original quotation + unrelated unusual question, then expand only after those gates. Do not replay an uncertain Send or repeat a failed paid question without a code change.

Required release gates remain exact-candidate signed-in unusual-question/citation/replay acceptance; unfiltered full-CI closure; authenticated cross-owner and changed-source negatives; real mobile UI inspection; independent source-owner review; monitoring and rollback qualification. No independent approval is supplied by this engineering run. Keep the PR draft.

Rollback: abandon this isolated preview candidate and retain the immutable cd77 preview. No database rollback is involved. Production must not be promoted.

## Local build qualification

Final Windows focused 416/416, security 188/188, typecheck, lint and production audit pass. An uncached TypeScript run also passes. The final native Next build compiled but exited during its type-check worker without diagnostics; this is retained as a FAILED local gate. Diagnostic --no-opt could not run through Next because it forwards a forbidden NODE_OPTIONS flag, and --jitless failed because WebAssembly is unavailable. No types/compiler check was suppressed. Publishing this protected draft preview is for independent exact-SHA Linux diagnosis, not a release or a claim of a green local build. Linux CI/Vercel results must be recorded separately.
