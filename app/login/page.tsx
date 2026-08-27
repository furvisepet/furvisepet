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
  accountSignupPrimaryClass,
} from "../components/account-access";
import { TurnstileChallenge } from "../components/turnstile-challenge";
import { useConfirmedSupabaseAuth } from "../lib/auth-session";
import { GOOGLE_AUTH_ENABLED, normalizeAuthEmail } from "../lib/auth-identity";
import { getSafeNextPath } from "../lib/auth-routing";
import { signInWithGoogle } from "../lib/google-auth-client";
import { getSupabaseConfigError, setBrowserSupabasePersistence } from "../lib/supabase";
import { idempotentClientFetch } from "../lib/security/idempotency/client";

type AuthMode = "signin" | "signup";
type SignupStep = "method" | "password" | "verify";

const SIGNUP_RESEND_COOLDOWN_SECONDS = 60;
const accountLinkClass =
  "inline-flex min-h-11 items-center justify-center text-sm font-semibold text-[var(--ghost-action-foreground)] underline decoration-transparent underline-offset-4 transition hover:decoration-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pw-focus-ring)]";
const legalLinkClass =
  "font-semibold text-[var(--ghost-action-foreground)] underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pw-focus-ring)]";

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
  const [signupStep, setSignupStep] = useState<SignupStep>("method");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState(() => searchParams.get("error") === "google_auth_failed" ? "Google sign-in couldn’t be completed. Please try again." : "");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);
  const [resendChallengeVisible, setResendChallengeVisible] = useState(false);
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

  function clearTransientSignupState() {
    setPassword("");
    setShowPassword(false);
    setError("");
    setStatusMessage("");
    setLoading(false);
    setCaptchaToken(null);
    setCaptchaReset((value) => value + 1);
    setResendChallengeVisible(false);
    setResendCooldown(0);
  }

  function returnViewportToTop() {
    window.scrollTo({ top: 0 });
  }

  function switchMode(nextMode: AuthMode) {
    clearTransientSignupState();
    setMode(nextMode);
    setSignupStep("method");
    if (nextMode === "signin") setKeepSignedIn(true);
    returnViewportToTop();
  }

  function returnToSignupEmail(clearEmail: boolean) {
    clearTransientSignupState();
    if (clearEmail) setEmail("");
    setSignupStep("method");
    returnViewportToTop();
  }

  function resetCaptchaAfterRequest() {
    setCaptchaToken(null);
    setCaptchaReset((value) => value + 1);
  }

  function continueSignupWithEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = normalizeAuthEmail(email);
    setEmail(normalizedEmail);
    setPassword("");
    setShowPassword(false);
    setError("");
    setStatusMessage("");
    setCaptchaToken(null);
    setCaptchaReset((value) => value + 1);
    setSignupStep("password");
    returnViewportToTop();
  }

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode === "signup" && signupStep !== "password") return;
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
    setPassword("");
    setShowPassword(false);
    setResendChallengeVisible(false);
    setResendCooldown(SIGNUP_RESEND_COOLDOWN_SECONDS);
    setSignupStep("verify");
    returnViewportToTop();
  }

  async function startGoogle() {
    if (googleStartingRef.current) return;
    googleStartingRef.current = true;
    setGoogleLoading(true);
    setError("");
    setStatusMessage("");
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
    setLoading(true);
    setError("");
    setStatusMessage("");
    const token = captchaToken;
    let response: Response;
    try {
      response = await idempotentClientFetch("/api/auth/resend", { body: JSON.stringify({ captchaToken: token, email: normalizedEmail }), headers: { "Content-Type": "application/json" }, method: "POST" }, `auth-resend:${normalizedEmail}`);
    } catch {
      resetCaptchaAfterRequest();
      setLoading(false);
      setError("Furvise could not send a new email. Please try again.");
      return;
    }
    resetCaptchaAfterRequest();
    const payload = await response.json().catch(() => null) as { error?: string; message?: string; retryAfterSeconds?: number } | null;
    setLoading(false);
    if (!response.ok) {
      setError(payload?.error || "Furvise could not send a new email. Please try again.");
      if (response.status === 429) setResendCooldown(Math.max(SIGNUP_RESEND_COOLDOWN_SECONDS, payload?.retryAfterSeconds || SIGNUP_RESEND_COOLDOWN_SECONDS));
      return;
    }
    setResendChallengeVisible(false);
    setResendCooldown(SIGNUP_RESEND_COOLDOWN_SECONDS);
    setStatusMessage(payload?.message || "A new verification email is on its way.");
  }

  if (authStatus === "signedIn" && !isPetDeleteReauthentication) {
    return (
      <AccountAccessLayout supportingText="Your account is ready. Taking you back to Furvise." title="Welcome back">
        <AccountStatus text="Opening Furvise..." />
      </AccountAccessLayout>
    );
  }

  const signupTitle = signupStep === "method" ? "Create your account" : signupStep === "password" ? "Secure your account" : "Check your email";
  const signupSupportingText = signupStep === "method"
    ? "Start with your pet. We’ll help with the rest."
    : signupStep === "password"
      ? <><span className="block">Creating an account for</span><strong className="block break-all font-semibold text-[var(--text-primary)]">{email}</strong></>
      : <><span className="block">We sent a verification link to</span><strong className="block break-all font-semibold text-[var(--text-primary)]">{email}</strong></>;

  return (
    <AccountAccessLayout
      supportingText={isPetDeleteReauthentication ? "Sign in again to continue with permanent pet deletion." : mode === "signin" ? "Sign in to continue caring for your pets." : signupSupportingText}
      title={mode === "signin" ? "Welcome back" : signupTitle}
      variant={mode === "signup" ? "progressive" : "default"}
    >
      <div className="space-y-5">
        {!authChecked ? <AccountStatus text="Checking your session..." /> : null}
        {configError ? <AccountStatus tone="warning" text={configError} /> : null}
        {error ? <AccountStatus tone="danger" text={error} /> : null}
        {mode === "signin" && passwordResetSucceeded ? <AccountStatus text="Your password has been updated. Sign in with your new password." /> : null}
        {mode === "signin" && isPetDeleteReauthentication ? <AccountStatus text="After signing in, you’ll return to the pet profile. Permanent deletion will still require a new confirmation." /> : null}
        {statusMessage ? <AccountStatus text={statusMessage} /> : null}

        {mode === "signin" ? (
          <SigninForm
            authChecked={authChecked}
            captchaBlocksSubmission={captchaBlocksSubmission}
            captchaReset={captchaReset}
            configError={configError}
            email={email}
            googleLoading={googleLoading}
            isPetDeleteReauthentication={isPetDeleteReauthentication}
            keepSignedIn={keepSignedIn}
            loading={loading}
            password={password}
            setCaptchaToken={setCaptchaToken}
            setEmail={setEmail}
            setKeepSignedIn={setKeepSignedIn}
            setPassword={setPassword}
            setShowPassword={setShowPassword}
            showPassword={showPassword}
            startGoogle={startGoogle}
            submitAuth={submitAuth}
            switchToSignup={() => switchMode("signup")}
          />
        ) : signupStep === "method" ? (
          <SignupMethodStep
            authChecked={authChecked}
            email={email}
            googleLoading={googleLoading}
            onContinue={continueSignupWithEmail}
            setEmail={setEmail}
            startGoogle={startGoogle}
            switchToSignin={() => switchMode("signin")}
          />
        ) : signupStep === "password" ? (
          <SignupPasswordStep
            authChecked={authChecked}
            captchaBlocksSubmission={captchaBlocksSubmission}
            captchaReset={captchaReset}
            configError={configError}
            loading={loading}
            password={password}
            returnToEmail={() => returnToSignupEmail(false)}
            setCaptchaToken={setCaptchaToken}
            setPassword={setPassword}
            setShowPassword={setShowPassword}
            showPassword={showPassword}
            submitAuth={submitAuth}
          />
        ) : (
          <SignupVerificationStep
            captchaToken={captchaToken}
            captchaReset={captchaReset}
            loading={loading}
            resendChallengeVisible={resendChallengeVisible}
            resendConfirmation={resendConfirmation}
            resendCooldown={resendCooldown}
            revealResendChallenge={() => {
              setError("");
              setStatusMessage("");
              setResendChallengeVisible(true);
            }}
            setCaptchaToken={setCaptchaToken}
            useDifferentEmail={() => returnToSignupEmail(true)}
          />
        )}
      </div>
    </AccountAccessLayout>
  );
}

function SigninForm({
  authChecked,
  captchaBlocksSubmission,
  captchaReset,
  configError,
  email,
  googleLoading,
  isPetDeleteReauthentication,
  keepSignedIn,
  loading,
  password,
  setCaptchaToken,
  setEmail,
  setKeepSignedIn,
  setPassword,
  setShowPassword,
  showPassword,
  startGoogle,
  submitAuth,
  switchToSignup,
}: {
  authChecked: boolean;
  captchaBlocksSubmission: boolean;
  captchaReset: number;
  configError?: string | null;
  email: string;
  googleLoading: boolean;
  isPetDeleteReauthentication: boolean;
  keepSignedIn: boolean;
  loading: boolean;
  password: string;
  setCaptchaToken: (token: string | null) => void;
  setEmail: (value: string) => void;
  setKeepSignedIn: (value: boolean) => void;
  setPassword: (value: string) => void;
  setShowPassword: (value: boolean | ((current: boolean) => boolean)) => void;
  showPassword: boolean;
  startGoogle: () => Promise<void>;
  submitAuth: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  switchToSignup: () => void;
}) {
  return (
    <>
      {GOOGLE_AUTH_ENABLED ? <><GoogleButton googleLoading={googleLoading} startGoogle={startGoogle} /><AuthDivider /></> : null}
      <form className="grid gap-4" onSubmit={submitAuth}>
        <EmailInput email={email} setEmail={setEmail} />
        <PasswordInput
          autoComplete="current-password"
          maxLength={128}
          minLength={1}
          password={password}
          placeholder="Your password"
          setPassword={setPassword}
          setShowPassword={setShowPassword}
          showPassword={showPassword}
        />
        <div className="flex min-h-11 flex-wrap items-center justify-between gap-3">
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium text-[var(--text-primary)]" htmlFor="keep-signed-in">
            <input checked={keepSignedIn} className="h-4 w-4 accent-[var(--action-primary)]" id="keep-signed-in" onChange={(event) => setKeepSignedIn(event.target.checked)} type="checkbox" />
            Keep me signed in
          </label>
          <Link className={accountLinkClass} href="/forgot-password">Forgot password?</Link>
        </div>
        <TurnstileChallenge onToken={setCaptchaToken} resetSignal={captchaReset} />
        <button className={accountPrimaryClass} disabled={!authChecked || loading || Boolean(configError) || captchaBlocksSubmission} type="submit">
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
      {!isPetDeleteReauthentication ? (
        <button className={`${accountLinkClass} w-full`} onClick={switchToSignup} type="button">New to Furvise? Create account</button>
      ) : null}
      <p className="border-t border-[var(--line)] pt-5 text-sm leading-6 text-[var(--text-secondary)]">Your pets, notes, conversations, and Vet Visit Briefs stay private to your account.</p>
    </>
  );
}

function SignupMethodStep({
  authChecked,
  email,
  googleLoading,
  onContinue,
  setEmail,
  startGoogle,
  switchToSignin,
}: {
  authChecked: boolean;
  email: string;
  googleLoading: boolean;
  onContinue: (event: FormEvent<HTMLFormElement>) => void;
  setEmail: (value: string) => void;
  startGoogle: () => Promise<void>;
  switchToSignin: () => void;
}) {
  return (
    <>
      {GOOGLE_AUTH_ENABLED ? <><GoogleButton googleLoading={googleLoading} startGoogle={startGoogle} /><AuthDivider label="or" uppercase={false} /></> : null}
      <form className="grid gap-4" onSubmit={onContinue}>
        <EmailInput email={email} setEmail={setEmail} />
        <button className={accountSignupPrimaryClass} disabled={!authChecked} type="submit">Continue</button>
      </form>
      <button className={`${accountLinkClass} w-full`} onClick={switchToSignin} type="button">Already have an account? Sign in</button>
    </>
  );
}

function SignupPasswordStep({
  authChecked,
  captchaBlocksSubmission,
  captchaReset,
  configError,
  loading,
  password,
  returnToEmail,
  setCaptchaToken,
  setPassword,
  setShowPassword,
  showPassword,
  submitAuth,
}: {
  authChecked: boolean;
  captchaBlocksSubmission: boolean;
  captchaReset: number;
  configError?: string | null;
  loading: boolean;
  password: string;
  returnToEmail: () => void;
  setCaptchaToken: (token: string | null) => void;
  setPassword: (value: string) => void;
  setShowPassword: (value: boolean | ((current: boolean) => boolean)) => void;
  showPassword: boolean;
  submitAuth: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  return (
    <>
      <button className={accountLinkClass} onClick={returnToEmail} type="button">Change email</button>
      <form className="grid gap-4" onSubmit={submitAuth}>
        <PasswordInput
          autoComplete="new-password"
          maxLength={128}
          minLength={12}
          password={password}
          placeholder="Create a password"
          setPassword={setPassword}
          setShowPassword={setShowPassword}
          showPassword={showPassword}
        />
        <p className="text-sm leading-6 text-[var(--text-secondary)]">Use 12 to 128 characters.</p>
        <TurnstileChallenge onToken={setCaptchaToken} resetSignal={captchaReset} />
        <button className={accountSignupPrimaryClass} disabled={!authChecked || loading || Boolean(configError) || captchaBlocksSubmission} type="submit">
          {loading ? "Creating account..." : "Create account"}
        </button>
      </form>
      <p className="text-center text-sm leading-6 text-[var(--text-secondary)]">
        By continuing, you agree to Furvise’s <Link className={legalLinkClass} href="/terms">Terms</Link> and <Link className={legalLinkClass} href="/privacy">Privacy Policy</Link>.
      </p>
    </>
  );
}

function SignupVerificationStep({
  captchaToken,
  captchaReset,
  loading,
  resendChallengeVisible,
  resendConfirmation,
  resendCooldown,
  revealResendChallenge,
  setCaptchaToken,
  useDifferentEmail,
}: {
  captchaToken: string | null;
  captchaReset: number;
  loading: boolean;
  resendChallengeVisible: boolean;
  resendConfirmation: () => Promise<void>;
  resendCooldown: number;
  revealResendChallenge: () => void;
  setCaptchaToken: (token: string | null) => void;
  useDifferentEmail: () => void;
}) {
  return (
    <div className="space-y-4">
      {!resendChallengeVisible ? (
        <button className={`${accountLinkClass} w-full`} onClick={revealResendChallenge} type="button">Didn&apos;t get it? Resend email</button>
      ) : (
        <div className="grid gap-4 rounded-2xl border border-[var(--line)] bg-[var(--surface-primary)] p-4" data-testid="resend-security-challenge">
          <p className="text-sm leading-6 text-[var(--text-secondary)]">Complete the security check to send a new verification email.</p>
          {resendCooldown > 0 ? <p className="text-sm font-medium text-[var(--text-primary)]" role="status">You can send a new email in {resendCooldown}s.</p> : null}
          <TurnstileChallenge onToken={setCaptchaToken} resetSignal={captchaReset} />
          <button className={accountSignupPrimaryClass} disabled={loading || resendCooldown > 0 || !captchaToken} onClick={() => void resendConfirmation()} type="button">
            {loading ? "Sending..." : "Send new email"}
          </button>
        </div>
      )}
      <button className={`${accountLinkClass} w-full`} onClick={useDifferentEmail} type="button">Use a different email</button>
    </div>
  );
}

function EmailInput({ email, setEmail }: { email: string; setEmail: (value: string) => void }) {
  return (
    <AccountField label="Email" name="email">
      <input autoComplete="email" className={accountInputClass} id="email" name="email" onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required type="email" value={email} />
    </AccountField>
  );
}

function PasswordInput({
  autoComplete,
  maxLength,
  minLength,
  password,
  placeholder,
  setPassword,
  setShowPassword,
  showPassword,
}: {
  autoComplete: "current-password" | "new-password";
  maxLength: number;
  minLength: number;
  password: string;
  placeholder: string;
  setPassword: (value: string) => void;
  setShowPassword: (value: boolean | ((current: boolean) => boolean)) => void;
  showPassword: boolean;
}) {
  return (
    <AccountField label="Password" name="password">
      <div className="relative">
        <input autoComplete={autoComplete} className={`${accountInputClass} pr-20`} id="password" maxLength={maxLength} minLength={minLength} name="password" onChange={(event) => setPassword(event.target.value)} placeholder={placeholder} required type={showPassword ? "text" : "password"} value={password} />
        <button aria-pressed={showPassword} className="absolute right-2 top-1/2 inline-flex min-h-11 -translate-y-1/2 items-center px-3 text-sm font-semibold text-[var(--ghost-action-foreground)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pw-focus-ring)]" onClick={() => setShowPassword((value) => !value)} type="button">{showPassword ? "Hide" : "Show"}</button>
      </div>
    </AccountField>
  );
}

function GoogleButton({ googleLoading, startGoogle }: { googleLoading: boolean; startGoogle: () => Promise<void> }) {
  return (
    <button className="relative inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--surface-primary)] px-12 text-base font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pw-focus-ring)] focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-65" disabled={googleLoading} onClick={() => void startGoogle()} type="button">
      <GoogleIcon />
      {googleLoading ? "Opening Google..." : "Continue with Google"}
    </button>
  );
}

function AuthDivider({ label = "Or use email", uppercase = true }: { label?: string; uppercase?: boolean }) {
  return <div className={`flex items-center gap-3 text-xs font-semibold tracking-[0.08em] text-[var(--text-tertiary)] ${uppercase ? "uppercase" : ""}`}><span className="h-px flex-1 bg-[var(--line)]" /><span>{label}</span><span className="h-px flex-1 bg-[var(--line)]" /></div>;
}

function GoogleIcon() {
  return <svg aria-hidden="true" className="absolute left-4 h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M21.35 12.2c0-.7-.06-1.38-.18-2.03H12v3.85h5.24a4.48 4.48 0 0 1-1.95 2.94v2.5h3.16c1.85-1.71 2.9-4.22 2.9-7.26ZM12 21.7c2.64 0 4.85-.87 6.45-2.24l-3.16-2.5c-.88.59-2 .94-3.29.94-2.54 0-4.69-1.71-5.47-4.02H3.27v2.54A9.75 9.75 0 0 0 12 21.7ZM6.53 13.88A5.87 5.87 0 0 1 6.23 12c0-.65.11-1.29.3-1.88V7.58H3.27A9.75 9.75 0 0 0 2.25 12c0 1.57.37 3.06 1.02 4.42l3.26-2.54ZM12 6.1c1.43 0 2.72.5 3.73 1.46l2.8-2.8A9.38 9.38 0 0 0 12 2.25a9.75 9.75 0 0 0-8.73 5.33l3.26 2.54C7.31 7.81 9.46 6.1 12 6.1Z" /></svg>;
}
