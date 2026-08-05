# Authentication email and password policy

## Public responses

- Signup: “Check your email to continue. If you already have an account, sign in or reset your password.”
- Recovery: “If an account exists for that email, a recovery link will be sent.”
- Resend: “If confirmation is still required, a new email will be sent.”
- Failed login: “Email or password is incorrect.”

The application does not disclose account existence, confirmation state, password-vs-OAuth provider, or provider-specific rejection details. Invalid email syntax can be rejected before Auth because it says nothing about registration.

## Passwords

Signup and password update require 12–128 JavaScript string code units. Furvise does not trim, lowercase, normalize, or impose arbitrary uppercase/number/symbol composition rules on passwords. Spaces, Unicode, and password-manager generated strings are allowed. Existing users with older shorter passwords may still sign in; the stronger policy applies when creating or replacing a password.

Supabase Dashboard must independently enforce the minimum and leaked-password protection. Passwords cross only the same-origin server route and Supabase Auth call; they are never persisted or logged by Furvise.

## Recovery

The recovery request is CAPTCHA-protected, IP/email limited, and non-enumerating. Its redirect is constructed server-side as `/auth/callback?flow=recovery`; clients cannot supply a redirect. The reset email first opens `/reset-password/confirm` with only the Supabase token hash and literal recovery type in a fragment that is not sent on the initial GET. Only the native POST Continue button can pass those strictly validated fields through the one-time Redis gate; Furvise then constructs the exact configured Supabase verification URL and fixed callback. The callback exchanges the PKCE code with Supabase and redirects to the dynamic, no-store update page only when Supabase classifies the exchange as recovery. Password update requires that recovery-bound Supabase session, the single-use HttpOnly marker, and a same-origin request.

Repository code does not create reset tokens and does not log confirmation URLs, token hashes, codes, or sessions. Supabase remains authoritative for token expiry, single-use behavior, password hashing, and other-session invalidation. Operators must install and verify the scanner-resistant Reset password template from `docs/supabase-auth-production-checklist.md` and document the selected session invalidation policy.

## Confirmation and entitlement

Production policy requires email confirmation. The application does not infer confirmation from reaching a private page: `reserve_ai_credit` checks authoritative `auth.users.email_confirmed_at` and anonymous status. Unconfirmed users can retain non-AI saved data according to existing product behavior but cannot create an AI credit reservation. Dashboard Confirm Email must still be enabled; otherwise Supabase implicitly marks password signups confirmed.
