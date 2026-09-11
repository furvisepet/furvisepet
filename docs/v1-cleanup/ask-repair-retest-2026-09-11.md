# Furvise Ask repair and retest — 11 September 2026

## Status

Repairs have been implemented in PRs #316–#319. This is not a certification that Furvise is error-free. The initial ten-question audit was **4 pass, 2 partial, 4 fail**. A six-case production retest after #316 was **2 pass, 2 partial, 2 fail**, and drove the additional fixes in #317. The test account then reached its 15-Ask allowance, so the final follow-up has automated verification but no subsequent live prompt verification.

## Implemented repairs

- Explicit multi-note saves preserve each requested date and verbatim note in one atomic transaction. Source-bound retries cannot duplicate the batch. Ownership and service-only execution are enforced. Existing records were not rewritten.
- Saved mutation status now reflects actual persisted care records. Linked receipt lookup uses records linked to the original request rather than relying on a lexical history search.
- Navigation repair supplies the destination kind; the server supplies the owned target and action envelope.
- Explicit pet/month requests discard unrelated planner-added conversation references. Actual displayed-list references stay pinned. Report-day comparisons keep their wider validated interval.
- Database-note totals have a separate owner-filtered, active-row aggregate. Counts are constrained to the accessible date interval and check time; they do not count clinical episodes or events mentioned inside notes. Failed reads issue no aggregate evidence.
- Exact-note answers use stored note text separately from titles. Correction provenance is retained.
- Date-only batches now use shared calendar-date display in History and Today, avoiding a prior-day shift in negative timezones. Tests cover America/Los_Angeles and Pacific/Kiritimati while preserving actual timed-entry formatting.
- Review checks publication/reload stability. Automatic-save prose must avoid internal workflow language and unnecessary requests for review or clicking. General notes do not certify clinical episode grouping.

## Six-case live retest of PR #316

Production commit: `ee0bafd48bf4916c6711dfda7081c594e26c3d25`. Deployment was READY and assigned to www.furvise.com before testing. A fresh conversation used the existing synthetic Audit Fable profile. The previous malformed combined test note remained in place, so successful creation of four new notes made the actual database total five.

| Case | Observed result | Grade before #317 |
|---|---|---|
| Navigation plus explanation | Correct explanation and usable link to Audit Fable's history | Pass |
| Save four dated notes | Four separate records, dates September 1/3/7/9, exact source text; UI confirmed four updates. Prose still said ready for review/persistence and implied episode grouping | Partial |
| Linked save receipts | Listed all four linked records with correct dates and exact text | Pass |
| Second vomiting episode in September | Still asked which displayed list despite explicit pet/month | Fail |
| Count September database notes | Returned an incomplete-answer fallback instead of the observed total five | Fail |
| September CSV | Exact text for the four newly saved notes, but omitted the older combined record in the same month | Partial |

The episode, count, export-scope and save-wording findings above motivated #317. They are not retrospectively graded as live passes.

## Persistence checks

Database inspection confirmed exactly four entries linked to the new save request, each with a separate source-note index and its requested date. The original combined record remained unchanged. After receipt, episode, count and CSV follow-ups, the active care-entry count was still five, including exactly four from the new batch. No additional care entries were created by these read-only follow-ups.

The save answer, four-update confirmation and receipt table remained unchanged after a browser reload. The final History-page check correctly opened the selected pet and showed all five rows, but exposed a timezone display error: UTC-midnight date-only entries appeared the previous afternoon. PR #318 corrected History, verified live with September 1/3/7/9 displayed correctly; PR #319 applies the shared date-only handling to Today as well, without changing stored records. The current account displayed its exhausted 15-Ask allowance and an October 1 reset. No allowance or billing controls were bypassed.

## Automated verification

- 2,152 application tests passed with zero failures or skips.
- Additional focused month/count/export scope regressions passed, including genuine displayed-list retention and report-day comparison scope.
- TypeScript, changed-file lint and the production build passed locally.
- PostgreSQL/WASM validation passed the existing history suites and writer/callback scenarios plus the new atomic-batch test: exact dates, rollback on a bad item, duplicate-free retries, ownership and service-only execution.
- Production function privileges were confirmed: anonymous false, authenticated false, service role true.
- PRs #316–#319 passed CI lint, TypeScript, focused security tests, full tests, production dependency audit and build before merge. The #317 merge commit is `4f831a471aa4fae9244f7a3fa2819bcb4201121b`.

## Remaining verification limits

The final #317 corrections still require live repetition of the save-wording, scoped-episode, count and full-month CSV cases using an account with available Ask credits. In particular, the expected current count is five and the CSV must include the older combined record as well as the four new notes. A raw note batch preserves observations; it does not by itself create a certified two-episode clinical register.

The database advisor also continues to report existing notices concerning public pg_trgm placement, authenticated security-definer functions, and disabled leaked-password protection. The new batch function is not among the authenticated-callable warnings. Those broader existing configuration notices were not represented as repaired by this Ask-focused work. Remediation references: [extension placement](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public), [function execution privileges](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), and [leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Original audit: [ask-ten-question-live-audit-2026-09-11.md](ask-ten-question-live-audit-2026-09-11.md).

Pull requests: https://github.com/furvisepet/furvisepet/pull/316, https://github.com/furvisepet/furvisepet/pull/317, https://github.com/furvisepet/furvisepet/pull/318 and https://github.com/furvisepet/furvisepet/pull/319.

## Final release

All four repair PRs (#316–#319) are merged. Final application commit: `9971b78d67558af0b4ad1cb82fb046267ce3c15d`. Every required CI check passed before merge.

Production deployment `dpl_84Ed9gY4JAuCgMvZknvxCUiqUqxY` was verified READY with www.furvise.com and furvise.com aliases on the final commit. After reloading, both History and Today displayed the four batch notes as September 1, 3, 7 and 9, 2026, with no invented time or previous-day shift. The old timestamped record retained its local clock display. This final browser check passed; the separate remaining Ask-credit limitation above still applies.
