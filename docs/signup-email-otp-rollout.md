# Signup email OTP rollout

Furvise remains a password-based signup system. The six-digit code replaces only the normal email-ownership confirmation-link experience. Do not use `signInWithOtp`, disable Confirm Email, or change recovery and magic-link templates as part of this rollout.

## Phase A: deploy compatible application code

1. Deploy the application changes while the existing hosted Confirm signup template still contains its current confirmation link.
2. Confirm `/auth/callback` continues accepting previously issued confirmation links.
3. Do not change the hosted Supabase template until the application deployment and its security checks are healthy.

## Phase B: update the hosted Confirm signup template

In the Supabase Dashboard for the production project:

1. Open **Authentication**.
2. Open **Email Templates**.
3. Select **Confirm signup**. Do not select Magic Link or Reset password.
4. Set the subject to `Your Furvise verification code`.
5. Replace the Confirm signup HTML with:

```html
<div>
  <p>Your Furvise code:</p>
  <p style="font-size:32px;font-weight:700;letter-spacing:6px;">
    {{ .Token }}
  </p>
  <p>Enter this code in Furvise to confirm your email.</p>

  <!-- Temporary rollout fallback only. -->
  <p style="margin-top:24px;font-size:12px;">
    Having trouble? You can also
    <a href="{{ .ConfirmationURL }}">confirm your email here</a>.
  </p>
</div>
```

6. Save the hosted Confirm signup template.
7. Leave Confirm Email enabled.

The repository and its tests do not change hosted production templates automatically.

## Phase C: production end-to-end check

Using a fresh QA email address and no production pet data:

1. Complete password-based signup in Furvise.
2. Confirm the email contains one six-digit `{{ .Token }}` value and the temporary fallback link.
3. Enter the code in the original signup tab.
4. Confirm the same tab becomes authenticated and routes to `/onboarding`.
5. Confirm a wrong code stays generic, resend remains Turnstile protected, and the 60-second cooldown remains active.
6. Confirm a previously issued fallback link still completes through `/auth/callback`.

## Phase D: remove the temporary fallback

After the OTP journey is proven healthy in production and all previously issued confirmation links have expired:

1. Return to **Authentication** → **Email Templates** → **Confirm signup**.
2. Remove only the fallback paragraph containing `{{ .ConfirmationURL }}`.
3. Keep the `{{ .Token }}` code and the same subject.
4. Repeat the fresh-account OTP end-to-end check.

Do not remove legacy `/auth/callback` compatibility in the same operational change. Schedule that cleanup separately after the rollout window.
