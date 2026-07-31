# Security headers rollout

## Added headers

All responses receive:

- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- a restrictive `Permissions-Policy` denying camera, microphone, geolocation, payment, USB, Bluetooth, motion/orientation sensors, browsing topics, interest cohort, fullscreen, and display capture;
- `X-Frame-Options: DENY`;
- one CSP header selected by `FURVISE_CSP_MODE`.

Production HTTPS also receives `Strict-Transport-Security: max-age=31536000; includeSubDomains`. `poweredByHeader: false` removes the normal Next.js disclosure header.

## Environment controls

```text
FURVISE_CSP_MODE=report-only
FURVISE_CSP_REPORT_URI=
FURVISE_ALLOWED_ORIGINS=https://www.furvise.com
FURVISE_ALLOWED_IMAGE_ORIGINS=
FURVISE_ALLOWED_CONNECT_ORIGINS=
FURVISE_ALLOWED_DEVELOPMENT_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
```

Modes are `report-only`, `enforce`, and `off`. An invalid/missing value safely defaults to report-only. `off` is an emergency CSP rollback only; baseline headers, origin validation, private caching, and HSTS remain enabled.

## Controlled rollout

1. Deploy preview with its exact application and Supabase origins. Keep `report-only`.
2. Exercise homepage, login, signup, recovery, callback, direct private navigation, Today, profile, Ask, deterministic and guided Products, History, memories, and Vet Brief.
3. Review browser console violations. If `FURVISE_CSP_REPORT_URI` points to an operator-owned same-origin endpoint, review sanitized reports there. S2D does not create that endpoint or integrate a vendor.
4. Prove every reported resource is actually required. Add only an exact origin through the appropriate environment list. Never add `*`, broad `https:`, broad `wss:`, OpenAI, or an unverified analytics/monitoring origin.
5. Retest Supabase session refresh, email/password auth, recovery, callback navigation, public images, local data-URL photos, downloads, and all private features.
6. Switch preview to `enforce`. Repeat the entire matrix, including an external iframe attempt and foreign-Origin writes.
7. Observe a controlled preview period before enforcing production. Production remains report-only until an operator completes and records this evidence.

## Current temporary allowances

- Production `script-src 'unsafe-inline'`: required by the current static Next.js App Router hydration/RSC output and homepage JSON-LD. Scripts still cannot load from arbitrary external origins, and inline HTML event attributes are separately blocked with `script-src-attr 'none'`.
- `style-src 'unsafe-inline'`: required by verified React style props and framework-rendered styles.

These allowances materially limit XSS protection and must not be described as a strict nonce CSP. The repository includes a tested nonce generator and nonce-aware policy builder, but nonce mode is deliberately inactive until every relevant route is dynamically rendered and the installed Next.js nonce procedure has been validated.

## Browser verification checklist

- Public: `/`, `/login`, signup state, `/forgot-password`, `/privacy`, `/terms`.
- Authentication: email/password login, refresh, direct protected URL, logout, Back, recovery callback; Google structure only, without enabling Google.
- Private: Today, pet profile/edit, Ask submission, Product deterministic search, Product AI when enabled, History, remembered details, Vet Brief read/generate/download/print.
- Security: foreign/malformed/missing browser Origin, valid same-origin write, no mutation/credit/provider call on rejection, cross-origin iframe blocked, no permissive preflight, private cache headers, hashed asset cacheability.

## Emergency rollback

If enforcement breaks production:

1. Change only `FURVISE_CSP_MODE` from `enforce` to `report-only` and redeploy/restart the affected environment.
2. If report-only header generation itself is implicated, use `off` temporarily. Do not remove baseline headers, HSTS, origin validation, or private cache controls.
3. Capture the affected route, directive, blocked URL class, environment, and deployment ID without recording private page content or tokens.
4. Reproduce in preview, prove the minimum exact allowance, add a regression test, and return to report-only before another enforcement attempt.

Do not use wildcard sources as an emergency workaround.

## Deployment checks remaining

- Confirm Vercel serves the headers on HTML, redirects, APIs, error responses, and HTTPS custom-domain responses.
- Confirm the apex and every subdomain covered by `includeSubDomains` are HTTPS-only. Do not add preload yet.
- Confirm CDN behavior retains private/no-store on authenticated and Set-Cookie responses while preserving immutable caching for hashed assets.
- Complete the report-only and enforced browser matrices on preview and production.
- Verify iframe blocking from a separately hosted origin.
