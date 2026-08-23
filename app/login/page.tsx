"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import {
  AccountAccessLayout,
  AccountField,
  AccountStatus,
  accountInputClass,
  accountPrimaryClass,
} from "../components/account-access";
import { TurnstileChallenge } from "../components/turnstile-challenge";
import { useConfirmedSupabaseAuth } from "../lib/auth-session";
import { GOOGLE_AUTH_ENABLED, normalizeAuthEmail } from "../lib/auth-identity";
import { getSafeNextPath } from "../lib/auth-routing";
import { signInWithGoogle } from "../lib/google-auth-client";
import { getSupabaseConfigError, setBrowserSupabasePersistence } from "../lib/supabase";
import { idempotentClientFetch } from "../lib/security/idempotency/client";

type AuthMode = "signin" | "signup";

export default function LoginPage() {
  return <Suspense fallback={<LoginPageFallback />}><LoginPageContent /></Suspense>;
}

function LoginPageFallback() {
  return (
    <AccountAccessLayout supportingText="Sign in to continue caring for your pets." title="Welcome back">
      <div aria-hidden="true" className="min-h-[28rem]" />
    </AccountAccessLayout>
  );
}

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const configError = getSupabaseConfigError();
  const passwordResetValues = searchParams.getAll("passwordReset");
  const passwordResetSucceeded = passwordResetValues.length === 1 && passwordResetValues[0] === "success";
  const reauthValues = searchParams.getAll("reauth");
  const isPetDeleteReauthentication = reauthValues.length === 1 && reauthValues[0] === "pet-delete";
  const nextPath = getSafeNextPath(searchParams.get("next") || searchParams.get("returnTo"), "/today");
  const { status: authStatus } = useConfirmedSupabaseAuth();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState(() => searchParams.get("error") === "google_auth_failed" ? "Google sign-in couldn’t be completed. Please try again." : "");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showConfirmationRecovery, setShowConfirmationRecovery] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);
  const [resendCooldown, setResendCooldown] = useState(0);
  const didRedirectRef = useRef(false);
  const googleStartingRef = useRef(false);
  const authChecked = authStatus !== "loading";
  const captchaBlocksSubmission = process.env.NODE_ENV === "production" && !captchaToken;

  useEffect(() => {
    if (isPetDeleteReauthentication || didRedirectRef.current || authStatus !== "signedIn") return;
    didRedirectRef.current = true;
    router.replace(nextPath);
  }, [authStatus, isPetDeleteReauthentication, nextPath, router]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setInterval(() => setResendCooldown((value) => Math.max(0, value - 1)), 1_000);
    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError("");
    setStatusMessage("");
    setShowConfirmationRecovery(false);
    setCaptchaToken(null);
    setCaptchaReset((value) => value + 1);
    setShowPassword(false);
    if (nextMode === "signin") setKeepSignedIn(true);
  }

  function resetCaptchaAfterRequest() {
    setCaptchaToken(null);
    setCaptchaReset((value) => value + 1);
  }

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setStatusMessage("");

    if (mode === "signin") setBrowserSupabasePersistence(keepSignedIn ? null : "session");
    else setBrowserSupabasePersistence(null);

    const normalizedEmail = normalizeAuthEmail(email);
    setEmail(normalizedEmail);
    const token = captchaToken;
    const endpoint = mode === "signin" ? "/api/auth/login" : "/api/auth/signup";
    const init = { body: JSON.stringify({ captchaToken: token || undefined, email: normalizedEmail, password }), headers: { "Content-Type": "application/json" }, method: "POST" };
    let result: Response;
    try {
      result = mode === "signup"
        ? await idempotentClientFetch(endpoint, init, `auth-signup:${normalizedEmail}`)
        : await fetch(endpoint, init);
    } catch {
      resetCaptchaAfterRequest();
      setLoading(false);
      setError("Account access is temporarily unavailable. Please try again.");
      return;
    }
    const payload = await result.json().catch(() => null) as { code?: string; error?: string; message?: string; pendingConfirmation?: boolean } | null;
    if (!result.ok) {
      resetCaptchaAfterRequest();
      setLoading(false);
      setError(payload?.error || (mode === "signin" ? "Email or password is incorrect." : "Furvise could not complete that request. Please try again."));
      return;
    }
    if (mode === "signin") {
      didRedirectRef.current = true;
      router.replace(nextPath);
      return;
    }
    resetCaptchaAfterRequest();
    setLoading(false);
    if (mode === "signup") {
      setShowConfirmationRecovery(true);
      setResendCooldown(60);
      setStatusMessage("");
    }
  }

  async function startGoogle() {
    if (googleStartingRef.current) return;
    googleStartingRef.current = true;
    setGoogleLoading(true); setError(""); setStatusMessage("");
    try {
      const { error: oauthError } = await signInWithGoogle(nextPath);
      if (oauthError) throw oauthError;
    } catch {
      googleStartingRef.current = false;
      setGoogleLoading(false);
      setError("Google sign-in couldn’t start. Please try again.");
    }
  }

  async function resendConfirmation() {
    const normalizedEmail = normalizeAuthEmail(email);
    if (!normalizedEmail || !captchaToken || resendCooldown > 0 || loading) return;
    setLoading(true); setError("");
    const token = captchaToken;
    let response: Response;
    try {
      response = await idempotentClientFetch("/api/auth/resend", { body: JSON.stringify({ captchaToken: token, email: normalizedEmail }), headers: { "Content-Type": "application/json" }, method: "POST" }, `auth-resend:${normalizedEmail}`);
    } catch {
      resetCaptchaAfterRequest();
      setLoading(false);
      setError("Furvise could not complete that request. Please try again.");
      return;
    }
    resetCaptchaAfterRequest();
    const payload = await response.json().catch(() => null) as { error?: string; message?: string; retryAfterSeconds?: number } | null;
    setLoading(false);
    if (!response.ok) { setError(payload?.error || "Furvise could not complete that request. Please try again."); if (response.status === 429) setResendCooldown(Math.max(60, payload?.retryAfterSeconds || 60)); return; }
    setResendCooldown(60);
    setStatusMessage(payload?.message || "If confirmation is still required, a new email will be sent.");
  }

  if (authStatus === "signedIn" && !isPetDeleteReauthentication) {
    return (
      <AccountAccessLayout supportingText="Your account is ready. Taking you back to Furvise." title="Welcome back">
        <AccountStatus text="Opening Furvise..." />
      </AccountAccessLayout>
    );
  }

  return (
    <AccountAccessLayout
      supportingText={isPetDeleteReauthentication ? "Sign in again to continue with permanent pet deletion." : mode === "signin" ? "Sign in to continue caring for your pets." : "Keep your pet’s care, history, and guidance in one private place."}
      title={mode === "signin" ? "Welcome back" : "Create your Furvise account"}
    >
      <div className="space-y-5">
        {!authChecked ? <AccountStatus text="Checking your session..." /> : null}
        {configError ? <AccountStatus tone="warning" text={configError} /> : null}
        {error ? <AccountStatus tone="danger" text={error} /> : null}
        {passwordResetSucceeded ? <AccountStatus text="Your password has been updated. Sign in with your new password." /> : null}
        {isPetDeleteReauthentication ? <AccountStatus text="After signing in, you’ll return to the pet profile. Permanent deletion will still require a new confirmation." /> : null}
        {showConfirmationRecovery ? <SignupSuccessNotice /> : null}
        {statusMessage ? <AccountStatus text={statusMessage} /> : null}

        {GOOGLE_AUTH_ENABLED ? <>
          <button className="relative inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--surface-primary)] px-12 text-base font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pw-focus-ring)] focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-65" disabled={googleLoading} onClick={() => void startGoogle()} type="button">
            <GoogleIcon />
            {googleLoading ? "Opening Google…" : "Continue with Google"}
          </button>
          <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)]"><span className="h-px flex-1 bg-[var(--line)]" /><span>Or use email</span><span className="h-px flex-1 bg-[var(--line)]" /></div>
        </> : null}

        <form className="grid gap-4" onSubmit={submitAuth}>
          <AccountField label="Email" name="email">
            <input autoComplete="email" className={accountInputClass} id="email" name="email" onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required type="email" value={email} />
          </AccountField>
          <AccountField label="Password" name="password">
            <div className="relative">
              <input autoComplete={mode === "signin" ? "current-password" : "new-password"} className={`${accountInputClass} pr-20`} id="password" maxLength={128} minLength={mode === "signin" ? 1 : 12} name="password" onChange={(event) => setPassword(event.target.value)} placeholder="Your password" required type={showPassword ? "text" : "password"} value={password} />
              <button aria-pressed={showPassword} className="absolute right-2 top-1/2 inline-flex min-h-10 -translate-y-1/2 items-center px-3 text-sm font-semibold text-[var(--ghost-action-foreground)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pw-focus-ring)]" onClick={() => setShowPassword((value) => !value)} type="button">{showPassword ? "Hide" : "Show"}</button>
            </div>
          </AccountField>

          {mode === "signin" ? (
            <div className="flex min-h-11 flex-wrap items-center justify-between gap-3">
              <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium text-[var(--text-primary)]" htmlFor="keep-signed-in">
                <input checked={keepSignedIn} className="h-4 w-4 accent-[var(--action-primary)]" id="keep-signed-in" onChange={(event) => setKeepSignedIn(event.target.checked)} type="checkbox" />
                Keep me signed in
              </label>
              <Link className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--ghost-action-foreground)] underline decoration-transparent underline-offset-4 transition hover:decoration-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pw-focus-ring)]" href="/forgot-password">Forgot password?</Link>
            </div>
          ) : <p className="text-sm leading-6 text-[var(--text-secondary)]">Use 12 to 128 characters. Spaces and password-manager generated passwords are supported.</p>}

          <TurnstileChallenge onToken={setCaptchaToken} resetSignal={captchaReset} />

          <button className={accountPrimaryClass} disabled={!authChecked || loading || Boolean(configError) || captchaBlocksSubmission} type="submit">
            {loading ? (mode === "signin" ? "Signing in..." : "Creating account...") : (mode === "signin" ? "Sign in" : "Create account")}
          </button>
        </form>

        {showConfirmationRecovery ? <button className="inline-flex min-h-11 w-full items-center justify-center text-sm font-semibold underline underline-offset-4" disabled={loading || resendCooldown > 0 || !captchaToken} onClick={() => void resendConfirmation()} type="button">{resendCooldown > 0 ? `Resend available in ${resendCooldown}s` : "Resend confirmation email"}</button> : null}

        {!isPetDeleteReauthentication ? (
          <button className="inline-flex min-h-11 w-full items-center justify-center text-sm font-semibold text-[var(--ghost-action-foreground)] underline decoration-transparent underline-offset-4 transition hover:decoration-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pw-focus-ring)]" onClick={() => switchMode(mode === "signin" ? "signup" : "signin")} type="button">
            {mode === "signin" ? "New to Furvise? Create account" : "Already have an account? Sign in"}
          </button>
        ) : null}
        <p className="border-t border-[var(--line)] pt-5 text-sm leading-6 text-[var(--text-secondary)]">Your pets, notes, conversations, and Vet Visit Briefs stay private to your account.</p>
      </div>
    </AccountAccessLayout>
  );
}

function GoogleIcon() {
  return <svg aria-hidden="true" className="absolute left-4 h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M21.35 12.2c0-.7-.06-1.38-.18-2.03H12v3.85h5.24a4.48 4.48 0 0 1-1.95 2.94v2.5h3.16c1.85-1.71 2.9-4.22 2.9-7.26ZM12 21.7c2.64 0 4.85-.87 6.45-2.24l-3.16-2.5c-.88.59-2 .94-3.29.94-2.54 0-4.69-1.71-5.47-4.02H3.27v2.54A9.75 9.75 0 0 0 12 21.7ZM6.53 13.88A5.87 5.87 0 0 1 6.23 12c0-.65.11-1.29.3-1.88V7.58H3.27A9.75 9.75 0 0 0 2.25 12c0 1.57.37 3.06 1.02 4.42l3.26-2.54ZM12 6.1c1.43 0 2.72.5 3.73 1.46l2.8-2.8A9.38 9.38 0 0 0 12 2.25a9.75 9.75 0 0 0-8.73 5.33l3.26 2.54C7.31 7.81 9.46 6.1 12 6.1Z"/></svg>;
}

function SignupSuccessNotice() {
  return (
    <div aria-live="polite" className="rounded-[var(--radius-md)] border border-[var(--pw-success-border)] bg-[var(--pw-success-surface)] p-4 sm:p-5" role="status">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--surface-primary)] text-[var(--pw-success-text)]">
          <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6" /></svg>
        </span>
        <div>
          <h2 className="text-base font-semibold text-[var(--text-primary)]">Check your email</h2>
          <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">We sent you a confirmation link. Open it to finish creating your Furvise account.</p>
        </div>
      </div>
    </div>
  );
}
