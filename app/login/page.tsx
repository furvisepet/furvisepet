"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import {
  AccountAccessLayout,
  AccountField,
  AccountPendingLabel,
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
type SigninStep = "method" | "password";
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
    <AccountAccessLayout supportingText="Sign in to pick up where you left off." title="Welcome back">
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
  const [signinStep, setSigninStep] = useState<SigninStep>("method");
  const [signupStep, setSignupStep] = useState<SignupStep>("method");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState(() => searchParams.get("error") === "google_auth_failed" ? "Google sign-in couldn’t be completed. Please try again." : "");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [, setCaptchaToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);
  const [authChallengeVisible, setAuthChallengeVisible] = useState(false);
  const [authSubmitPending, setAuthSubmitPending] = useState(false);
  const [resendChallengeVisible, setResendChallengeVisible] = useState(false);
  const [resendSubmitPending, setResendSubmitPending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const didRedirectRef = useRef(false);
  const googleStartingRef = useRef(false);
  const authSubmitPendingRef = useRef(false);
  const resendSubmitPendingRef = useRef(false);
  const authCaptchaTokenRef = useRef<string | null>(null);
  const resendCaptchaTokenRef = useRef<string | null>(null);
  const authChecked = authStatus !== "loading";

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

  function clearTransientAuthState() {
    authSubmitPendingRef.current = false;
    resendSubmitPendingRef.current = false;
    authCaptchaTokenRef.current = null;
    resendCaptchaTokenRef.current = null;
    setPassword("");
    setShowPassword(false);
    setError("");
    setStatusMessage("");
    setLoading(false);
    setCaptchaToken(null);
    setCaptchaReset((value) => value + 1);
    setAuthChallengeVisible(false);
    setAuthSubmitPending(false);
    setResendChallengeVisible(false);
    setResendSubmitPending(false);
    setResendCooldown(0);
  }

  function returnViewportToTop() {
    window.scrollTo({ top: 0 });
  }

  function switchMode(nextMode: AuthMode) {
    clearTransientAuthState();
    setMode(nextMode);
    setSigninStep("method");
    setSignupStep("method");
    returnViewportToTop();
  }

  function returnToSignupEmail(clearEmail: boolean) {
    clearTransientAuthState();
    if (clearEmail) setEmail("");
    setSignupStep("method");
    returnViewportToTop();
  }

  function continueSigninWithEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = normalizeAuthEmail(email);
    setEmail(normalizedEmail);
    clearTransientAuthState();
    setSigninStep("password");
    returnViewportToTop();
  }

  function returnToSigninEmail() {
    clearTransientAuthState();
    setSigninStep("method");
    returnViewportToTop();
  }

  function resetCaptchaAfterRequest() {
    authCaptchaTokenRef.current = null;
    resendCaptchaTokenRef.current = null;
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
    authCaptchaTokenRef.current = null;
    authSubmitPendingRef.current = false;
    setAuthChallengeVisible(false);
    setAuthSubmitPending(false);
    setCaptchaReset((value) => value + 1);
    setSignupStep("password");
    returnViewportToTop();
  }

  function requestAuthSubmission(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode === "signin" && signinStep !== "password") return;
    if (mode === "signup" && signupStep !== "password") return;
    if (loading || authSubmitPendingRef.current) return;
    if (authCaptchaTokenRef.current) {
      const token = authCaptchaTokenRef.current;
      authCaptchaTokenRef.current = null;
      setCaptchaToken(null);
      void submitAuth(token);
      return;
    }
    authSubmitPendingRef.current = true;
    setAuthSubmitPending(true);
    setCaptchaToken(null);
    setAuthChallengeVisible(true);
    setError("");
    setStatusMessage("");
  }

  function handleAuthChallengeToken(token: string | null) {
    setCaptchaToken(token);
    authCaptchaTokenRef.current = token;
    if (!token) {
      authSubmitPendingRef.current = false;
      setAuthSubmitPending(false);
      return;
    }
    if (!authSubmitPendingRef.current) return;
    authSubmitPendingRef.current = false;
    authCaptchaTokenRef.current = null;
    setCaptchaToken(null);
    setAuthSubmitPending(false);
    void submitAuth(token);
  }

  async function submitAuth(token: string) {
    if (!token) return;
    setLoading(true);
    setError("");
    setStatusMessage("");

    setBrowserSupabasePersistence(null);

    const normalizedEmail = normalizeAuthEmail(email);
    setEmail(normalizedEmail);
    const endpoint = mode === "signin" ? "/api/auth/login" : "/api/auth/signup";
    const init = { body: JSON.stringify({ captchaToken: token, email: normalizedEmail, password }), headers: { "Content-Type": "application/json" }, method: "POST" };
    let result: Response;
    try {
      result = mode === "signup"
        ? await idempotentClientFetch(endpoint, init, `auth-signup:${normalizedEmail}`)
        : await fetch(endpoint, init);
    } catch {
      resetCaptchaAfterRequest();
      setAuthChallengeVisible(false);
      setLoading(false);
      setError("Account access is temporarily unavailable. Please try again.");
      return;
    }
    const payload = await result.json().catch(() => null) as { code?: string; error?: string; message?: string; pendingConfirmation?: boolean } | null;
    if (!result.ok) {
      resetCaptchaAfterRequest();
      setAuthChallengeVisible(false);
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
    setAuthChallengeVisible(false);
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

  function requestResendConfirmation() {
    if (resendCooldown > 0 || loading || resendSubmitPendingRef.current) return;
    if (resendCaptchaTokenRef.current) {
      const token = resendCaptchaTokenRef.current;
      resendCaptchaTokenRef.current = null;
      setCaptchaToken(null);
      void resendConfirmation(token);
      return;
    }
    resendSubmitPendingRef.current = true;
    setResendSubmitPending(true);
    setCaptchaToken(null);
    setResendChallengeVisible(true);
    setError("");
    setStatusMessage("");
  }

  function handleResendChallengeToken(token: string | null) {
    setCaptchaToken(token);
    resendCaptchaTokenRef.current = token;
    if (!token) {
      resendSubmitPendingRef.current = false;
      setResendSubmitPending(false);
      return;
    }
    if (!resendSubmitPendingRef.current) return;
    resendSubmitPendingRef.current = false;
    resendCaptchaTokenRef.current = null;
    setCaptchaToken(null);
    setResendSubmitPending(false);
    void resendConfirmation(token);
  }

  async function resendConfirmation(token: string) {
    const normalizedEmail = normalizeAuthEmail(email);
    if (!normalizedEmail || !token || resendCooldown > 0 || loading) return;
    setLoading(true);
    setError("");
    setStatusMessage("");
    let response: Response;
    try {
      response = await idempotentClientFetch("/api/auth/resend", { body: JSON.stringify({ captchaToken: token, email: normalizedEmail }), headers: { "Content-Type": "application/json" }, method: "POST" }, `auth-resend:${normalizedEmail}`);
    } catch {
      resetCaptchaAfterRequest();
      setResendChallengeVisible(false);
      setLoading(false);
      setError("Furvise could not send a new email. Please try again.");
      return;
    }
    resetCaptchaAfterRequest();
    setResendChallengeVisible(false);
    const payload = await response.json().catch(() => null) as { error?: string; message?: string; retryAfterSeconds?: number } | null;
    setLoading(false);
    if (!response.ok) {
      setError(payload?.error || "Furvise could not send a new email. Please try again.");
      if (response.status === 429) setResendCooldown(Math.max(SIGNUP_RESEND_COOLDOWN_SECONDS, payload?.retryAfterSeconds || SIGNUP_RESEND_COOLDOWN_SECONDS));
      return;
    }
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

  const signinTitle = signinStep === "method" ? "Welcome back" : "Enter your password";
  const signinSupportingText = signinStep === "method"
    ? isPetDeleteReauthentication
      ? "Sign in again to continue with permanent pet deletion."
      : "Sign in to pick up where you left off."
    : <><span className="block">Signing in as</span><strong className="block break-all font-semibold text-[var(--text-primary)]">{email}</strong></>;
  const signupTitle = signupStep === "method" ? "Create your account" : signupStep === "password" ? "Create a password" : "Check your email";
  const signupSupportingText = signupStep === "method"
    ? "Add your pet to get started."
    : signupStep === "password"
      ? <><span className="block">For</span><strong className="block break-all font-semibold text-[var(--text-primary)]">{email}</strong></>
      : <><span className="block">We sent a verification link to</span><strong className="block break-all font-semibold text-[var(--text-primary)]">{email}</strong></>;
  const returnToEmail = mode === "signin" ? returnToSigninEmail : () => returnToSignupEmail(false);
  const passwordStep = mode === "signin" ? signinStep === "password" : signupStep === "password";

  return (
    <AccountAccessLayout
      backLabel="Back to email"
      onBack={passwordStep ? returnToEmail : undefined}
      supportingText={mode === "signin" ? signinSupportingText : signupSupportingText}
      title={mode === "signin" ? signinTitle : signupTitle}
    >
      <div className="space-y-5">
        {!authChecked ? <AccountStatus text="Checking your session..." /> : null}
        {configError ? <AccountStatus tone="warning" text={configError} /> : null}
        {error ? <AccountStatus tone="danger" text={error} /> : null}
        {mode === "signin" && passwordResetSucceeded ? <AccountStatus text="Your password has been updated. Sign in with your new password." /> : null}
        {mode === "signin" && isPetDeleteReauthentication ? <AccountStatus text="After signing in, you’ll return to the pet profile. Permanent deletion will still require a new confirmation." /> : null}
        {statusMessage ? <AccountStatus text={statusMessage} /> : null}

        {mode === "signin" && signinStep === "method" ? (
          <SigninMethodStep
            authChecked={authChecked}
            email={email}
            googleLoading={googleLoading}
            isPetDeleteReauthentication={isPetDeleteReauthentication}
            onContinue={continueSigninWithEmail}
            setEmail={setEmail}
            startGoogle={startGoogle}
            switchToSignup={() => switchMode("signup")}
          />
        ) : mode === "signin" ? (
          <SigninPasswordStep
            authChecked={authChecked}
            authChallengeVisible={authChallengeVisible}
            authSubmitPending={authSubmitPending}
            captchaReset={captchaReset}
            configError={configError}
            handleAuthChallengeToken={handleAuthChallengeToken}
            loading={loading}
            password={password}
            requestAuthSubmission={requestAuthSubmission}
            setPassword={setPassword}
            setShowPassword={setShowPassword}
            showPassword={showPassword}
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
            authChallengeVisible={authChallengeVisible}
            authSubmitPending={authSubmitPending}
            captchaReset={captchaReset}
            configError={configError}
            handleAuthChallengeToken={handleAuthChallengeToken}
            loading={loading}
            password={password}
            requestAuthSubmission={requestAuthSubmission}
            setPassword={setPassword}
            setShowPassword={setShowPassword}
            showPassword={showPassword}
          />
        ) : (
          <SignupVerificationStep
            captchaReset={captchaReset}
            handleResendChallengeToken={handleResendChallengeToken}
            loading={loading}
            resendChallengeVisible={resendChallengeVisible}
            resendCooldown={resendCooldown}
            resendSubmitPending={resendSubmitPending}
            requestResendConfirmation={requestResendConfirmation}
            useDifferentEmail={() => returnToSignupEmail(true)}
          />
        )}
      </div>
    </AccountAccessLayout>
  );
}

function SigninMethodStep({
  authChecked,
  email,
  googleLoading,
  isPetDeleteReauthentication,
  onContinue,
  setEmail,
  startGoogle,
  switchToSignup,
}: {
  authChecked: boolean;
  email: string;
  googleLoading: boolean;
  isPetDeleteReauthentication: boolean;
  onContinue: (event: FormEvent<HTMLFormElement>) => void;
  setEmail: (value: string) => void;
  startGoogle: () => Promise<void>;
  switchToSignup: () => void;
}) {
  return (
    <>
      <form className="grid gap-4" onSubmit={onContinue}>
        <EmailInput email={email} setEmail={setEmail} />
        <button className={accountPrimaryClass} disabled={!authChecked} type="submit">Continue</button>
      </form>
      {GOOGLE_AUTH_ENABLED ? <><AuthDivider /><GoogleButton googleLoading={googleLoading} startGoogle={startGoogle} /></> : null}
      {!isPetDeleteReauthentication ? (
        <button className={`${accountLinkClass} w-full`} onClick={switchToSignup} type="button">New to Furvise? Create account</button>
      ) : null}
    </>
  );
}

function SigninPasswordStep({
  authChecked,
  authChallengeVisible,
  authSubmitPending,
  captchaReset,
  configError,
  handleAuthChallengeToken,
  loading,
  password,
  requestAuthSubmission,
  setPassword,
  setShowPassword,
  showPassword,
}: {
  authChecked: boolean;
  authChallengeVisible: boolean;
  authSubmitPending: boolean;
  captchaReset: number;
  configError?: string | null;
  handleAuthChallengeToken: (token: string | null) => void;
  loading: boolean;
  password: string;
  requestAuthSubmission: (event: FormEvent<HTMLFormElement>) => void;
  setPassword: (value: string) => void;
  setShowPassword: (value: boolean | ((current: boolean) => boolean)) => void;
  showPassword: boolean;
}) {
  return (
    <form className="grid gap-4" onSubmit={requestAuthSubmission}>
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
        <Link className={`${accountLinkClass} justify-self-start`} href="/forgot-password">Forgot password?</Link>
        {authChallengeVisible ? <TurnstileChallenge onToken={handleAuthChallengeToken} resetSignal={captchaReset} /> : null}
        <button className={accountPrimaryClass} disabled={!authChecked || loading || authSubmitPending || Boolean(configError)} type="submit">
          {loading ? "Signing in..." : authSubmitPending ? <AccountPendingLabel /> : "Sign in"}
        </button>
      </form>
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
      <form className="grid gap-4" onSubmit={onContinue}>
        <EmailInput email={email} setEmail={setEmail} />
        <button className={accountPrimaryClass} disabled={!authChecked} type="submit">Continue</button>
      </form>
      {GOOGLE_AUTH_ENABLED ? <><AuthDivider /><GoogleButton googleLoading={googleLoading} startGoogle={startGoogle} /></> : null}
      <button className={`${accountLinkClass} w-full`} onClick={switchToSignin} type="button">Already have an account? Sign in</button>
    </>
  );
}

function SignupPasswordStep({
  authChecked,
  authChallengeVisible,
  authSubmitPending,
  captchaReset,
  configError,
  handleAuthChallengeToken,
  loading,
  password,
  requestAuthSubmission,
  setPassword,
  setShowPassword,
  showPassword,
}: {
  authChecked: boolean;
  authChallengeVisible: boolean;
  authSubmitPending: boolean;
  captchaReset: number;
  configError?: string | null;
  handleAuthChallengeToken: (token: string | null) => void;
  loading: boolean;
  password: string;
  requestAuthSubmission: (event: FormEvent<HTMLFormElement>) => void;
  setPassword: (value: string) => void;
  setShowPassword: (value: boolean | ((current: boolean) => boolean)) => void;
  showPassword: boolean;
}) {
  return (
    <>
      <form className="grid gap-4" onSubmit={requestAuthSubmission}>
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
        {authChallengeVisible ? <TurnstileChallenge onToken={handleAuthChallengeToken} resetSignal={captchaReset} /> : null}
        <button className={accountPrimaryClass} disabled={!authChecked || loading || authSubmitPending || Boolean(configError)} type="submit">
          {loading ? "Creating account..." : authSubmitPending ? <AccountPendingLabel /> : "Create account"}
        </button>
      </form>
      <p className="text-center text-sm leading-6 text-[var(--text-secondary)]">
        By continuing, you agree to Furvise’s <Link className={legalLinkClass} href="/terms">Terms</Link> and <Link className={legalLinkClass} href="/privacy">Privacy Policy</Link>.
      </p>
    </>
  );
}

function SignupVerificationStep({
  captchaReset,
  handleResendChallengeToken,
  loading,
  resendChallengeVisible,
  resendCooldown,
  resendSubmitPending,
  requestResendConfirmation,
  useDifferentEmail,
}: {
  captchaReset: number;
  handleResendChallengeToken: (token: string | null) => void;
  loading: boolean;
  resendChallengeVisible: boolean;
  resendCooldown: number;
  resendSubmitPending: boolean;
  requestResendConfirmation: () => void;
  useDifferentEmail: () => void;
}) {
  return (
    <div className="mx-auto grid w-full max-w-sm justify-items-center gap-2 pt-1 text-center" data-ui="signup-verification-actions">
      <button className={accountLinkClass} disabled={loading || resendCooldown > 0 || resendSubmitPending} onClick={requestResendConfirmation} type="button">
        {loading ? "Sending..." : resendSubmitPending ? <AccountPendingLabel /> : "Resend email"}
      </button>
      {resendCooldown > 0 ? <p className="text-sm text-[var(--text-secondary)]" role="status">You can resend in {resendCooldown}s.</p> : null}
      {resendChallengeVisible ? (
        <div className="mt-2 grid w-full gap-3" data-testid="resend-security-challenge">
          <TurnstileChallenge onToken={handleResendChallengeToken} resetSignal={captchaReset} />
        </div>
      ) : null}
      <button className={accountLinkClass} onClick={useDifferentEmail} type="button">Use a different email</button>
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
    <button
      aria-label="Continue with Google"
      className="mx-auto flex size-14 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--surface-primary)] transition hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pw-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-primary)] disabled:cursor-wait disabled:opacity-65"
      disabled={googleLoading}
      onClick={() => void startGoogle()}
      title="Continue with Google"
      type="button"
    >
      <GoogleIcon />
      <span className="sr-only">{googleLoading ? "Opening Google" : "Continue with Google"}</span>
    </button>
  );
}

function AuthDivider() {
  return <div className="flex items-center gap-3 text-xs font-semibold text-[var(--text-tertiary)]"><span className="h-px flex-1 bg-[var(--line)]" /><span>or</span><span className="h-px flex-1 bg-[var(--line)]" /></div>;
}

function GoogleIcon() {
  return <Image alt="" height={20} src="/icons/google-g.svg" width={20} />;
}
