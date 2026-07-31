# Browser security policy

Evidence date: 2026-07-30. This document describes repository behavior. It does not prove that production environment values or response headers are deployed.

## Browser resource inventory

| Directive | Required source | Feature | Environment | Why required / removal condition |
|---|---|---|---|---|
| `default-src` | `'self'` | fallback for Furvise-owned resources | all | baseline; retain |
| `script-src` | `'self'` | Next.js client bundles and React hydration | all | retain |
| `script-src` | `'unsafe-inline'` | current statically generated App Router hydration/RSC scripts and homepage JSON-LD | temporary, report-only production rollout | remove after a nonce-compatible dynamic strategy or verified framework-supported hash strategy covers every public/auth page |
| `script-src` | `'unsafe-eval'` | React/Next development diagnostics | development only | absent from production |
| `style-src` | `'self'` | compiled Tailwind/global CSS | all | retain |
| `style-src` | `'unsafe-inline'` | current React `style` props for menus, brand sizing, Vet Brief zoom, and safe-area layout | temporary | replace the remaining dynamic style attributes with nonce-compatible styles or CSS variables before removal |
| `img-src` | `'self'` | public icons, brand files, dog/cat illustrations, Next image output | all | retain |
| `img-src` | `data:` | local pet photo previews stored as bounded data URLs | all while local previews exist | removable if local data-URL photos are removed or replaced with approved private object URLs |
| `font-src` | `'self'` | local/framework assets; UI otherwise uses system font fallbacks | all | no external font origin required |
| `connect-src` | `'self'` | Furvise custom APIs | all | retain |
| `connect-src` | exact `NEXT_PUBLIC_SUPABASE_URL` origin | Supabase browser Auth and direct owner-scoped data calls | all | retain while the browser Supabase client is used |
| `connect-src` | `ws://localhost:*`, `ws://127.0.0.1:*` | Next development HMR | development only | absent from production |
| `manifest-src` | `'self'` | `/manifest.webmanifest` | all | retain while PWA metadata exists |
| `worker-src` | `'self'` | conservative same-origin boundary | all | no worker currently found; may become `'none'` after browser rollout verification |
| `media-src` | `'self'` | conservative boundary | all | no browser media playback found; may become `'none'` after rollout verification |
| `frame-src` | `'none'` | no frames are used | all | retain |
| `frame-ancestors` | `'none'` | prevents Furvise embedding | all | retain |
| `object-src` | `'none'` | no plugin/object content | all | retain |
| `base-uri` | `'self'` | prevents injected external base URLs | all | retain |
| `form-action` | `'self'` | Furvise forms submit locally or call Supabase via JavaScript | all | compatible with email/password and recovery; retain |

Verified absent from the browser resource graph:

- `next/font`, external font stylesheets, analytics scripts, error-monitoring scripts, third-party widgets, iframes, service workers, web workers, Supabase Realtime channels, and browser OpenAI calls.
- Supabase Realtime WSS is therefore not allowed.
- Product manufacturer and retailer URLs are outbound links, not CSP image/connect allowances.
- The existing Vet Brief Blob URL is used for a local download link, not an image or worker, so `blob:` is not allowed by the current policy.
- No current Supabase Storage upload flow was found. Additional Storage image origins must not be added until a real browser-loaded asset requires one.

`FURVISE_ALLOWED_IMAGE_ORIGINS` and `FURVISE_ALLOWED_CONNECT_ORIGINS` accept comma-separated exact origins. Malformed URLs, credentials, paths, queries, fragments, wildcard values, and broad `https:`/`wss:` schemes are rejected. OpenAI belongs server-side and must never be added to `connect-src`.

## Current policy

Production defaults to `Content-Security-Policy-Report-Only`:

```text
default-src 'self';
base-uri 'self';
object-src 'none';
frame-ancestors 'none';
form-action 'self';
script-src 'self' 'unsafe-inline';
script-src-attr 'none';
style-src 'self' 'unsafe-inline';
img-src 'self' data:;
font-src 'self';
connect-src 'self' <exact Supabase HTTPS origin>;
frame-src 'none';
worker-src 'self';
manifest-src 'self';
media-src 'self';
upgrade-insecure-requests;
```

Only configured, validated origins are appended. A same-origin report path may be supplied through `FURVISE_CSP_REPORT_URI`; no reporting endpoint or monitoring vendor is created in S2D.

`block-all-mixed-content` is intentionally omitted. Modern browsers have deprecated it, while the production `upgrade-insecure-requests` directive supplies the useful mixed-content transition behavior without a redundant directive.

## Nonce strategy

`createCspNonce()` generates an unpredictable 144-bit request nonce, and the policy builder supports nonce plus `strict-dynamic` without script `unsafe-inline`. It is not activated in the default rollout. The installed Next.js 16 guidance states that nonce CSP requires dynamic rendering and is incompatible with static shells/PPR. Furvise still intentionally statically generates public, login, recovery, privacy, and terms pages. Activating nonces without converting and testing those surfaces would block hydration.

The current honest posture is report-only plus temporary script/style inline allowances. Before nonce enforcement, use the installed Next.js-supported proxy request-header mechanism, ensure every affected page renders dynamically, repeat the full browser matrix, and verify the performance/caching impact. Do not enable a nonce environment toggle without that work.

## HSTS and framing

Production configuration emits:

```text
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Frame-Options: DENY
```

Browsers ignore HSTS received over HTTP; the deployment must redirect HTTP to HTTPS. HSTS is absent in development. `frame-ancestors 'none'` is authoritative and `X-Frame-Options: DENY` is retained for legacy defense.

Preload is deferred. It requires proof that the apex and every relevant present/future subdomain are permanently HTTPS-only, an operator review of preload removal delays, and a production-domain exercise.

## Cache policy

- S2A private-page responses and unauthenticated private redirects retain `private, no-cache, no-store, must-revalidate, max-age=0`, `Pragma: no-cache`, and `Expires: 0`.
- The OAuth callback applies the same policy to every session-setting redirect.
- All custom `/api/*` responses now receive the private/no-store policy centrally. This covers Ask, Product sessions, Vet Briefs/PDF metadata, memories, care history, profile/account data, and error responses.
- Rate-limit and AI-admission errors already apply the same private policy directly.
- Public pages do not receive the private cache policy.
- Hashed `/_next/static` and optimized image assets are not assigned private cache headers and retain platform cacheability.

## CORS

Normal Furvise browser APIs are same-origin. No custom API or Next configuration adds `Access-Control-Allow-Origin` or credentialed wildcard CORS. Unrecognized cross-origin preflights therefore receive no permissive CORS contract. A future genuine cross-origin API must use an explicit origin list, `Vary: Origin`, minimal methods/headers, and must never combine credentials with `*`.
