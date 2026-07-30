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
import { useConfirmedSupabaseAuth } from "../lib/auth-session";
import { GOOGLE_AUTH_ENABLED, normalizeAuthEmail } from "../lib/auth-identity";
import { getSafeNextPath } from "../lib/auth-routing";
import { signInWithGoogle } from "../lib/google-auth-client";
import { getBrowserSupabase, getSupabaseConfigError, setBrowserSupabasePersistence } from "../lib/supabase";

type AuthMode = "signin" | "signup";

export default function LoginPage() {
  return <Suspense fallback={null}><LoginPageContent /></Suspense>;
}

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const configError = getSupabaseConfigError();
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
  const didRedirectRef = useRef(false);
  const googleStartingRef = useRef(false);
  const authChecked = authStatus !== "loading";

  useEffect(() => {
    if (didRedirectRef.current || authStatus !== "signedIn") return;
    didRedirectRef.current = true;
    router.replace(nextPath);
  }, [authStatus, nextPath, router]);

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError("");
    setStatusMessage("");
    setShowConfirmationRecovery(false);
    setShowPassword(false);
    if (nextMode === "signin") setKeepSignedIn(true);
  }

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setStatusMessage("");

    if (mode === "signin") setBrowserSupabasePersistence(keepSignedIn ? null : "session");
    else setBrowserSupabasePersistence(null);

    const authSupabase = getBrowserSupabase(mode === "signin" ? keepSignedIn : true);
    if (!authSupabase) {
      setLoading(false);
      setError(configError || "Supabase is not configured.");
      return;
    }

    const normalizedEmail = normalizeAuthEmail(email);
    setEmail(normalizedEmail);
    const result = mode === "signin"
      ? await authSupabase.auth.signInWithPassword({ email: normalizedEmail, password })
      : await authSupabase.auth.signUp({ email: normalizedEmail, password });

    if (result.error) {
      setLoading(false);
      setError(friendlyAuthError(result.error.message));
      return;
    }
    if (result.data.session) {
      didRedirectRef.current = true;
      router.replace(nextPath);
      return;
    }
    setLoading(false);
    if (mode === "signup") {
      setShowConfirmationRecovery(true);
      setStatusMessage("Check your email to continue. If you already have an account, sign in or reset your password.");
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
    const authSupabase = getBrowserSupabase(true);
    const normalizedEmail = normalizeAuthEmail(email);
    if (!authSupabase || !normalizedEmail) return;
    setLoading(true); setError("");
    const { error: resendError } = await authSupabase.auth.resend({ type: "signup", email: normalizedEmail });
    setLoading(false);
    if (resendError) { setError(friendlyAuthError(resendError.message)); return; }
    setStatusMessage("If confirmation is still needed, Furvise sent new instructions. You can also sign in or reset your password.");
  }

  if (authStatus === "signedIn") {
    return (
      <AccountAccessLayout supportingText="Your account is ready. Taking you back to Furvise." title="Welcome back">
        <AccountStatus text="Opening Furvise..." />
      </AccountAccessLayout>
    );
  }

  return (
    <AccountAccessLayout
      supportingText={mode === "signin" ? "Sign in to continue caring for your pets." : "Keep your pet’s care, history, and guidance in one private place."}
      title={mode === "signin" ? "Welcome back" : "Create your Furvise account"}
    >
      <div className="space-y-5">
        {!authChecked ? <AccountStatus text="Checking your session..." /> : null}
        {configError ? <AccountStatus tone="warning" text={configError} /> : null}
        {error ? <AccountStatus tone="danger" text={error} /> : null}
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
              <input autoComplete={mode === "signin" ? "current-password" : "new-password"} className={`${accountInputClass} pr-20`} id="password" minLength={6} name="password" onChange={(event) => setPassword(event.target.value)} placeholder="Your password" required type={showPassword ? "text" : "password"} value={password} />
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
          ) : <p className="text-sm leading-6 text-[var(--text-secondary)]">Use at least 6 characters.</p>}

          <button className={accountPrimaryClass} disabled={!authChecked || loading || Boolean(configError)} type="submit">
            {loading ? (mode === "signin" ? "Signing in..." : "Creating account...") : (mode === "signin" ? "Sign in" : "Create account")}
          </button>
        </form>

        {showConfirmationRecovery ? <button className="inline-flex min-h-11 w-full items-center justify-center text-sm font-semibold underline underline-offset-4" disabled={loading} onClick={() => void resendConfirmation()} type="button">Resend confirmation email</button> : null}

        <button className="inline-flex min-h-11 w-full items-center justify-center text-sm font-semibold text-[var(--ghost-action-foreground)] underline decoration-transparent underline-offset-4 transition hover:decoration-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pw-focus-ring)]" onClick={() => switchMode(mode === "signin" ? "signup" : "signin")} type="button">
          {mode === "signin" ? "New to Furvise? Create account" : "Already have an account? Sign in"}
        </button>
        <p className="border-t border-[var(--line)] pt-5 text-sm leading-6 text-[var(--text-secondary)]">Your pets, notes, conversations, and Vet Visit Briefs stay private to your account.</p>
      </div>
    </AccountAccessLayout>
  );
}

function friendlyAuthError(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("invalid login") || lower.includes("invalid credentials") || lower.includes("wrong email or password") || lower.includes("invalid email or password")) return "That email and password did not match.";
  if (lower.includes("email not confirmed")) return "Please confirm your email before signing in.";
  if (lower.includes("already registered") || lower.includes("user already registered")) return "An account already exists for that email.";
  if (lower.includes("password")) return "Use a password with at least 6 characters.";
  if (lower.includes("signups not allowed") || lower.includes("signup disabled")) return "New account creation is currently unavailable.";
  if (lower.includes("network") || lower.includes("fetch")) return "Furvise could not reach the sign-in service. Please try again.";
  return "Furvise could not complete that request. Please try again.";
}

function GoogleIcon() {
  return <svg aria-hidden="true" className="absolute left-4 h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M21.35 12.2c0-.7-.06-1.38-.18-2.03H12v3.85h5.24a4.48 4.48 0 0 1-1.95 2.94v2.5h3.16c1.85-1.71 2.9-4.22 2.9-7.26ZM12 21.7c2.64 0 4.85-.87 6.45-2.24l-3.16-2.5c-.88.59-2 .94-3.29.94-2.54 0-4.69-1.71-5.47-4.02H3.27v2.54A9.75 9.75 0 0 0 12 21.7ZM6.53 13.88A5.87 5.87 0 0 1 6.23 12c0-.65.11-1.29.3-1.88V7.58H3.27A9.75 9.75 0 0 0 2.25 12c0 1.57.37 3.06 1.02 4.42l3.26-2.54ZM12 6.1c1.43 0 2.72.5 3.73 1.46l2.8-2.8A9.38 9.38 0 0 0 12 2.25a9.75 9.75 0 0 0-8.73 5.33l3.26 2.54C7.31 7.81 9.46 6.1 12 6.1Z"/></svg>;
}
