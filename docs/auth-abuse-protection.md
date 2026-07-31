# Authentication abuse protection

## Trust boundary and flow inventory

Furvise now mediates first-party email/password Auth initiation through same-origin `/api/auth/*` routes. Those routes provide distributed IP/email limits, generic responses, origin validation, bounded parsing, safe logs, and replay protection. They use Supabase Auth as the identity authority and never persist passwords or CAPTCHA tokens.

This does not prevent an attacker from calling the public Supabase Auth URL directly. Supabase Dashboard CAPTCHA, hosted Auth rate limits, confirmation, SMTP, provider, and redirect configuration are therefore required controls rather than optional duplicates.

| Flow | Exposure / authority | CAPTCHA | Application limit | Enumeration and replay | Email / application record | External requirement |
|---|---|---|---|---|---|---|
| Create account | public `POST /api/auth/signup` → Supabase password signup | fresh Turnstile token | 5/IP/15m, 3/email/hour, 20/IP/day | neutral success; Redis request-key replay/conflict | may send confirmation; no workspace before confirmation unless Dashboard confirmation is disabled | enable Turnstile and Confirm Email; SMTP/rates |
| Password sign-in | public `POST /api/auth/login` → Supabase | progressive after 3 credential failures; `always` mode available | 20/IP/15m; 10 genuine credential failures/email/15m; 80/IP/day | always “Email or password is incorrect”; no permanent lock | no email; canonical workspace upsert after success | hosted token/IP limits; align CAPTCHA mode with Dashboard |
| Sign out | authenticated browser Supabase sign-out | none | hosted Supabase limits | no enumeration | no email/write | session policy |
| Email confirmation | Supabase email → server `/auth/callback?flow=confirmation` | token was required at initiating signup/resend | Supabase verification limits | safe fixed destination | creates `user_profiles` once via PK/upsert | Confirm Email, template, redirect allowlist |
| Confirmation resend | shown only after signup pending state; public `POST /api/auth/resend` | fresh token | 5/IP/hour, 3/email/hour, 20/IP/day; 60s UI cooldown | generic response; same logical key sends once | may send confirmation | CAPTCHA, SMTP, resend limit |
| Password recovery request | public `POST /api/auth/recovery` | fresh token | 5/IP/hour, 3/email/hour, 20/IP/day | existing/nonexistent email get identical response; replay sends once | may send recovery email | CAPTCHA, SMTP, recovery rate/redirect |
| Recovery callback | server `/auth/callback?flow=recovery` | inherited from initiation | Supabase verification limits | server-selected `/update-password` | establishes recovery session | template must use approved redirect |
| Password update | same-origin `POST /api/auth/update-password` with verified Supabase session | none | hosted authenticated limits | safe bounded response | no email in repository; password never logged | session invalidation policy and leaked-password protection |
| OAuth initiation | public `POST /api/auth/oauth`; Google remains feature-disabled | none initially | 20/IP/15m, 80/IP/day | server-selected callback and internal next path | provider may create identity; workspace upsert once after callback | keep Google disabled until production testing |
| OAuth callback | server `/auth/callback` PKCE exchange | provider-owned | Supabase verification limits | external/protocol-relative next rejected | workspace upsert once | exact callback allowlist/provider settings |
| Onboarding/profile workspace | authenticated profile API | none | S2B profile-write limits | S2F idempotency | `user_profiles.user_id` PK; pet rows owned by auth user | none beyond Auth identity |
| Session refresh | Next proxy and Supabase SSR cookies | none | Supabase refresh limits | no public details | no application creation | session duration/refresh settings |

## Enforcement details

The Auth policy registry is part of `app/lib/security/rate-limit/config.ts`. Auth counters use Upstash Redis and a separate `FURVISE_AUTH_RATE_LIMIT_HASH_SECRET`. Email identity is Unicode NFKC normalized, trimmed, lowercased, validated, and HMACed. Furvise does not remove dots, plus aliases, or merge provider-specific addresses. Raw email never appears in a limiter key or Auth event log.

Signup, recovery, and resend require UUID idempotency keys. Redis atomically binds the key to an HMAC fingerprint of flow, normalized email, and—only for signup—the password as an HMAC input. The password and fingerprint are not logged. Exact replay returns the neutral response without another Supabase call; changed-payload reuse conflicts. CAPTCHA/provider failures release the claim so a fresh CAPTCHA can retry with the logical key.

Login IP limits count initiation attempts. Email failure counters count only Supabase `invalid_credentials` outcomes, not provider/network failures or unconfirmed-state errors. Three failures within the window require a CAPTCHA; ten temporarily throttle that email identity. Success clears the email failure window. Expiry prevents permanent attacker-induced lockout.

Production fails closed when Redis or the dedicated Auth hashing secret is unavailable. Development only bypasses distributed controls under the existing explicit rate-limit configuration behavior.

## Confirmation and disposable-account controls

The database `reserve_ai_credit` function checks `auth.users.email_confirmed_at` and rejects anonymous/unconfirmed users before inserting an AI usage row. Thus signup alone cannot reserve a shared AI credit. Usage is keyed to durable `auth.users.id`; deleting/recreating a pet or `user_profiles` row cannot reset it. Repeated workspace provisioning uses `ON CONFLICT (user_id) DO NOTHING`.

No static disposable-domain blocklist is used. Account-farming exposure is instead constrained by confirmation, Auth IP/email limits, hosted CAPTCHA, one canonical auth-user entitlement, S2B request controls, and S2C global spending ceilings. Minimum account age is not enabled in S2G; it remains an optional future policy if beta evidence justifies it.

## Logging and residual risk

Logs contain request ID, flow, CAPTCHA presence, IP/email decisions, safe outcome category, and elapsed time. They exclude email, password, CAPTCHA token, reset/confirmation token, OAuth code, sessions, cookies, and raw Supabase error details.

Repository controls are bypassable at the hosted Supabase URL; Dashboard protection is mandatory. Server-mediated Auth currently uses the publishable key, so Supabase sees the deployment egress address for those calls; application IP limiting remains the primary per-client control unless an operator separately validates Supabase’s supported forwarded-IP configuration. No production Dashboard setting was verified during this stage.
