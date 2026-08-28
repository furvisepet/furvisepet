# Cloudflare Turnstile setup

Furvise uses Cloudflare Turnstile because Supabase Auth supports it directly and it provides an accessible, low-friction challenge without adding a Google reCAPTCHA dependency.

## Production setup

1. Create a Turnstile widget for the exact production Furvise hostname and intentionally approved preview hostnames.
2. Add the public site key to Vercel as `NEXT_PUBLIC_TURNSTILE_SITE_KEY` separately for preview and production. Add the matching server-only widget secret as `TURNSTILE_SECRET_KEY` for each environment. Never prefix the secret with `NEXT_PUBLIC_`.
3. In Supabase Dashboard, open Authentication → Bot and Abuse Protection, enable CAPTCHA, select Cloudflare Turnstile, and enter the Turnstile secret. Never place the secret value in `NEXT_PUBLIC_*`, `.env.example`, browser code, or logs.
4. Review whether the Supabase setting requires CAPTCHA on every password sign-in. If it does, set server-only `FURVISE_AUTH_LOGIN_CAPTCHA_MODE=always`; otherwise retain the default progressive mode.
5. Repeat signup, sign-in, recovery, and resend tests against a non-production environment before production rollout.

The browser obtains a token immediately before an Auth action and sends it through Supabase’s supported `captchaToken` option. Tokens remain React state only, are cleared after submission, and the widget resets after success, failure, expiry, or provider error. They are never placed in browser storage, cookies, analytics, or logs.

The report-only CSP allows exactly `https://challenges.cloudflare.com` for the Turnstile script, frame, and connection when the site key is configured. No wildcard Cloudflare origin is allowed.

## Development

Prefer Cloudflare’s documented Turnstile test site key/token behavior. A no-widget local bypass is also available only when both conditions hold:

- `NODE_ENV` is not `production`.
- `FURVISE_CAPTCHA_DEV_BYPASS=true` is explicitly set server-side.

Production ignores that bypass. Leave the value false by default. Do not use production Turnstile secrets in local or preview environments.

## Failure and accessibility

The widget remains keyboard reachable and uses Turnstile’s managed accessibility behavior. Expiry or provider failure clears the token and allows a fresh challenge. Auth forms retain the entered email, stop loading after failures, and announce status through the existing accessible account status component.

If a user cannot complete the challenge, support should verify the accessibility report without requesting passwords, CAPTCHA tokens, or reset links. Operators may issue support guidance or investigate provider availability; they must not create a reusable bypass token.

Emergency rollback requires coordinated changes: disable Supabase CAPTCHA only after assessing direct hosted-endpoint abuse, remove/disable the site key for the affected environment, and retain application IP/email limits. A development bypass is never a production rollback mechanism.

References: [Supabase CAPTCHA protection](https://supabase.com/docs/guides/auth/auth-captcha), [Cloudflare Turnstile client rendering](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/).
