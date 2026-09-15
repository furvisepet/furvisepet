# Owner dashboard

Open `/admin` using the designated owner's existing Furvise account. The page validates the user with Supabase Auth; every dashboard API repeats authentication and the immutable owner-ID check. Editable metadata, email and URL parameters cannot grant access. Ordinary accounts receive 404, signed-out APIs receive 401, and responses use private no-store headers. The client clears its snapshot when an access check fails.

The five monitoring tables force RLS and revoke all client-role privileges. The snapshot and ingestion functions revoke PUBLIC, anon and authenticated execution. Only the application's server credentials can execute them. The snapshot uses a fixed empty search path and narrowly scoped SECURITY DEFINER access to read account counts without granting the service role general access to auth.users.

## Metrics and limitations

- Current account and subscription totals come from Auth and billing records. Promotional access is not counted as an active paid subscription.
- The owner is always excluded from customer totals unless "Include owner & marked test accounts" is selected. Other test accounts can be marked/restored.
- Visible app activity is deduplicated by user and UTC day; it is not a session-duration measurement. The last-24-hour filter uses today's UTC activity bucket, as indicated on the active-user card.
- Account age is time since signup. Historical time continuously on Free is unavailable.
- AI feature counts use the existing credit ledger. Released credits and incomplete answers are shown separately from errors.
- Provider costs include all traffic and report actual reconciled usage separately from pending reservations. They are estimates, not invoices, and start with this instrumentation.
- Ask outcomes and captured errors include all traffic in the selected period. Browser reports are explicitly unverified; the feed is limited to the latest 100 errors. Instrumentation does not capture every possible failure.
- Monitoring stores structured operational fields, not prompts, answers, pet histories, cookies, stack traces or raw browser error messages.
- The dashboard refreshes every minute while visible and supports manual refresh and 1/7/30/90-day ranges.

## Verification on 2026-09-15

- Four owner-access API tests pass: no database read before authorization, spoofed metadata denied, bounded queries, bounded mutations.
- All 160 focused security tests pass, including the expanded mutation-origin inventory. Owner exclusions delegate to the same authenticated origin guard as other protected APIs.
- TypeScript and production build pass. Lint has no errors; ten existing warnings remain outside these changes.
- Live database permissions verified: all five tables deny client access; all three functions deny client execution. Service-role snapshot reads succeeded. A rollback-only cost test verified that late reservation writes cannot erase reconciled usage or duplicate a provider call.
- The initial full run exposed integration/import, style and test-inventory issues, repaired in this change. The existing production branch independently reproduces 13 Ask test failures; this dashboard is not evidence of a globally passing Ask suite. No paid provider calls were made.
- Migration filenames match the already-applied production migration versions; they must not be reapplied under the earlier local draft timestamps.

Repeat database permission assertions with `supabase/tests/owner_dashboard_security.sql`. Application rollback means redeploying the previous app artifact; do not drop monitoring tables or reverse migrations containing user activity.
