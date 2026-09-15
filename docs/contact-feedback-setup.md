# Public beta contact reports

`/contact` is public and sends descriptions plus one optional PNG/JPEG/WebP screenshot (2 MiB maximum) to the designated support address, `supportfurvise@gmail.com`. The reporter's address is reply-to only; no acknowledgement is sent to arbitrary addresses. No pet records or conversation bodies are attached automatically. Ask links open a separate tab so active requests and drafts remain in place.

## Required before production release

Configure server-only `RESEND_API_KEY` in Vercel for Production and Preview. The default sender is `Furvise Support <support@furvise.com>`; its domain was verified in Resend and a setup email was confirmed delivered to the support inbox on September 15, 2026. Optional `FURVISE_SUPPORT_FROM` overrides must use a verified sender in the same Resend account. Never use an unverified Gmail address as the sender. Configure the existing Redis rate-limit credentials as well; this public endpoint always enforces limits and fails closed without them. Limits: 5 submissions per IP per hour and 100 total per hour, including retries.

Without a configured sender, the API returns an honest unavailable response and preserves the form contents. The direct support email remains visible. Do not treat local mocked delivery tests as proof of live inbox delivery.

## Delivery behavior

Only server-confirmed provider acceptance produces a submission confirmation/reference. Provider failure or timeout retains the user's form and screenshot. Identical report retries use a deterministic provider idempotency key (24-hour deduplication window). Attachments are sent with the email, not published in a public storage bucket. The report isn't inserted into care history. Inbox delivery still needs a real smoke test after credentials and sender verification are configured.

## Verification

Run `node --test tests/contact-report.test.mjs`, `npm run typecheck`, and lint changed files. Before release, verify one real report with a screenshot reaches the support inbox, Reply targets the reporter, and opening Contact from Ask leaves an active conversation/draft intact. Verify mobile form layout, screenshot removal, validation errors and failed submission preservation.
