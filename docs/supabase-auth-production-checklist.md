# Supabase Auth production checklist

These settings cannot be proven from repository code. Record screenshots/exported configuration and reviewer/date before launch; unchecked items remain unverified.

## Bot and abuse protection

- [ ] Enable CAPTCHA protection.
- [ ] Select Cloudflare Turnstile.
- [ ] Configure the production Turnstile secret; verify it differs from preview.
- [ ] Test signup, sign-in, recovery, expired token, and reused token against the production-like project.
- [ ] Align `FURVISE_AUTH_LOGIN_CAPTCHA_MODE` with Supabase’s sign-in CAPTCHA requirement.

## Rate limits

- [ ] Review combined email-send quota and configure production SMTP before increasing it.
- [ ] Review signup confirmation and recovery resend intervals; retain at least a 60-second per-address interval.
- [ ] Review verification, token-refresh, OTP/magic-link, anonymous-user, and Web3 limits.
- [ ] Confirm anonymous sign-in is disabled.
- [ ] If evaluating Supabase IP forwarding for server-mediated Auth, enable it only with the supported key type and verify the trusted header path; do not forward arbitrary client headers.

## Email

- [ ] Require email confirmation in the Email provider configuration.
- [ ] Configure and test production SMTP, sender domain, SPF/DKIM/DMARC, and sender identity.
- [ ] Review confirmation and recovery templates for neutral copy and exact approved redirects.
- [ ] Disable mail-provider link tracking that mutates Supabase links.
- [ ] Confirm magic link/OTP behavior is disabled or intentionally configured if unused.
- [ ] In **Authentication → Email Templates → Reset password**, replace the reset link with the scanner-resistant Furvise intermediate link below. This Dashboard-only setting is not verifiable from the repository.

```html
<a href="{{ .SiteURL }}/reset-password/confirm#confirmation_url={{ .ConfirmationURL }}">Reset password</a>
```

The token-bearing `ConfirmationURL` must remain in the URL fragment. Do not move it into the query string, and do not link to `ConfirmationURL` directly. Set the production Site URL to `https://www.furvise.com` without a trailing slash, send a fresh recovery email, and verify that the first HTTP request is only to `/reset-password/confirm`.

## Password security

- [ ] Set the Supabase minimum to at least 12 characters, matching the application.
- [ ] Enable leaked-password protection where the project plan supports it.
- [ ] Avoid composition rules that reject password-manager output, spaces, or Unicode without evidence.
- [ ] Verify maximum/password hashing behavior with a 128-character test password.

## URL configuration

- [ ] Set production Site URL to the exact canonical HTTPS origin.
- [ ] Allow the exact `/auth/callback` confirmation, recovery, and OAuth callback locations.
- [ ] Define preview redirect policy explicitly; do not use a broad production wildcard.
- [ ] Reject external, encoded-external, and protocol-relative `next` values in an end-to-end test.

## Providers and sessions

- [ ] Keep anonymous sign-in disabled.
- [ ] Keep Google disabled until a dedicated production test is approved.
- [ ] Disable all unused providers and manual identity linking unless intentionally required.
- [ ] Review access-token lifetime, refresh-token reuse/rotation behavior, inactivity timeout, maximum session duration, and concurrent-session policy.
- [ ] Document whether password updates invalidate other sessions; repository code does not claim this setting.

## Evidence status

No Dashboard setting above was verified by S2G repository work. Application controls complement these settings and do not replace them. Supabase documents hosted Auth quotas and Dashboard configuration at [Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits) and [general Auth configuration](https://supabase.com/docs/guides/auth/general-configuration).
