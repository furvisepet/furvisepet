# CSRF and origin protection

## Current posture

Supabase SSR and browser clients configure cookies with `SameSite=Lax`, `Secure` in production, and path `/`. Session persistence may be session-only or provider-defined persistent. SameSite reduces some cross-site cookie delivery but is not treated as complete CSRF protection.

Furvise custom browser APIs currently send an explicit Supabase bearer token in addition to the SSR cookie architecture. S2D adds an independent origin check for every authenticated state-changing custom route before ownership queries, rate limiting, credit reservation, AI admission, provider work, or mutation.

## Origin trust model

Allowed production origins are:

- `https://www.furvise.com`
- comma-separated exact HTTPS origins explicitly configured in `FURVISE_ALLOWED_ORIGINS`

Preview domains are not automatically trusted. Each preview origin intended for write testing must be listed in that preview environment. Production never admits localhost. Development admits only the actual request origin when its hostname is exactly `localhost` or `127.0.0.1`, plus exact local origins in `FURVISE_ALLOWED_DEVELOPMENT_ORIGINS`.

Validation requires all of the following for browser writes:

1. A syntactically exact HTTP(S) `Origin` with no credentials, path, query, fragment, backslash, or protocol-relative form.
2. Membership in the explicit application-origin set.
3. Equality with the resolved target origin.
4. `Sec-Fetch-Site` must not be `cross-site`; fetch metadata is supplemental and never the sole control.

Outside Vercel, forwarded-host headers are ignored and the URL/Host must agree. In the verified Vercel deployment mode (`VERCEL=1` and a platform `x-vercel-id`), the platform-supplied single `x-forwarded-host`/Host and HTTPS `x-forwarded-proto` resolve the public target. Comma-separated, credential-bearing, slash-containing, malformed, or non-HTTPS forwarded targets fail.

Missing Origin policy:

- Browser-indicated requests (`Sec-Fetch-*`) or requests carrying ambient Supabase/Furvise auth cookies fail with `ORIGIN_NOT_ALLOWED`.
- A non-browser caller presenting an explicit bearer token and no browser metadata is the alternate server/operator mechanism and may proceed to normal authentication/authorization.
- An unauthenticated request with no browser evidence proceeds only far enough to receive the route's existing authentication failure.
- A supplied foreign or malformed Origin is always rejected, including when a bearer token is present.

The scanner-resistant recovery continuation is the sole route-specific exception. Its native form page uses `Referrer-Policy: same-origin`: `no-referrer` would cause a non-CORS form POST to serialize `Origin` as `null`. A supplied `Origin` (including `null`) must still pass the normal exact policy. If a browser genuinely omits `Origin`, only an exact `/reset-password/confirm` Referer from the independently validated target origin is accepted. The target must be an exact configured origin; on Vercel, `Host` and `X-Forwarded-Host` must agree and `X-Forwarded-Proto` must be exactly HTTPS. Missing Origin and Referer, malformed or foreign Referer, apex-host submissions, conflicting forwarding headers, and forwarding headers outside the declared Vercel production/preview environment fail closed.

The rejection is HTTP 403, private/no-store, uses a stable safe code, and exposes no host/allowlist internals.

## Protected mutations

Origin validation is shared by the authentication contexts used by:

- pet creation, profile edit, and pet deletion;
- manual care creation, edit, and deletion;
- memory edit, confirmation, forgetting, and legacy memory writes/deletion;
- conversation creation, message writes, title changes, and deletion;
- suggestion apply/dismiss;
- account country detection and updates;
- Ask, care-plan analysis, Product AI operations, Safety follow-up, and Product catalog POST queries;
- Vet Brief generation, creation, confirmation/version writes, and refresh;
- any later state-changing route that adopts the canonical authenticated request contexts.

There is no custom account-deletion route in the current repository. A future implementation must require exact Origin validation, explicit destructive confirmation, a recent-authentication or provider reauthentication check, an idempotency key, and a non-predictable one-time CSRF token if an ambient-cookie form is used. Origin and SameSite alone are insufficient for that operation.

## Authentication flows

- Email/password sign-in, signup, sign-out, and password recovery currently call the exact Supabase project origin through the browser SDK.
- The server OAuth callback is a GET navigation with PKCE code exchange; it validates internal `next` paths and applies private/no-store headers. It is not treated as an application mutation POST.
- External, encoded external, protocol-relative, and backslash redirect forms remain rejected by `getSafeNextPath`.
- Future Google OAuth remains structurally compatible because the Supabase HTTPS origin is in `connect-src`, callback navigation is same-site, and CSP does not add Google browser script/frame origins. Google remains disabled until its separate production test stage.
- Sign-out invalidates the hosted Supabase session and S2A proxy verification prevents subsequent private rendering. It is not a custom Furvise API mutation.

## Residual considerations

Origin validation limits cross-site browser submission; it does not mitigate same-origin XSS, stolen bearer tokens, malicious browser extensions, or compromised Supabase credentials. CSP rollout, output encoding, RLS, ownership checks, rate limiting, and AI admission remain separate controls.
