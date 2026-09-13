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
import {
  FURVISE_EMAIL_OTP_HTML_PATTERN,
  FURVISE_EMAIL_OTP_LENGTH,
  isCompleteAuthEmailOtp,
  normalizeAuthEmailOtp,
} from "../lib/auth-email-otp";
import { GOOGLE_AUTH_ENABLED, normalizeAuthEmail } from "../lib/auth-identity";
import { getSafeNextPath } from "../lib/auth-routing";
import { signInWithGoogle } from "../lib/google-auth-client";
import { getSupabaseConfigError, setBrowserSupabasePersistence } from "../lib/supabase";
import { idempotentClientFetch } from "../lib/security/idempotency/client";

type AuthMode = "signin" | "signup";
type SigninStep = "method" | "password";
type SignupStep = "method" | "password" | "otp";
type EmailOtpMode = "signup_confirmation" | "signin_otp";

const SIGNUP_RESEND_COOLDOWN_SECONDS = 60;
const ACCOUNT_ROUTE_WATCHDOG_MS = 15_000;
const accountLinkClass =
  "inline-flex min-h-11 items-center justify-center text-sm font-semibold text-[var(--ghost-action-foreground)] underline decoration-transparent underline-offset-4 transition hover:decoration-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pw-focus-ring)]";
const legalLinkClass =
  "font-semibold text-[var(--ghost-action-foreground)] underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pw-focus-ring)]";
const accountSecondaryClass =
  "inline-flex min-h-12 w-full items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface-primary)] px-5 text-base font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pw-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-primary)] disabled:cursor-not-allowed disabled:text-[var(--text-tertiary)]";

export default function LoginPage() {
  return <Suspense fallback={<LoginPageFallback />}><LoginPageContent /></Suspense>;
}

function LoginPageFallback() {
  return (
    <AccountAccessLayout title="Welcome back">
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
  const [signupOtp, setSignupOtp] = useState("");
  const [emailOtpMode, setEmailOtpMode] = useState<EmailOtpMode>("signup_confirmation");
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpRecoveryOpen, setOtpRecoveryOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState(() => searchParams.get("error") === "google_auth_failed" ? "Google sign-in couldn’t be completed. Please try again." : "");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [, setCaptchaToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);
  const [authChallengeVisible, setAuthChallengeVisible] = useState(false);
  const [authSubmitPending, setAuthSubmitPending] = useState(false);
  const [accountRouteChallengeVisible, setAccountRouteChallengeVisible] = useState(false);
  const [accountRoutePending, setAccountRoutePending] = useState(false);
  const [accountRouteExecuteSignal, setAccountRouteExecuteSignal] = useState<number | null>(null);
  const [resendChallengeVisible, setResendChallengeVisible] = useState(false);
  const [resendSubmitPending, setResendSubmitPending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const didRedirectRef = useRef(false);
  const googleStartingRef = useRef(false);
  const authSubmitPendingRef = useRef(false);
  const accountRoutePendingRef = useRef(false);
  const accountRouteExecuteSequenceRef = useRef(0);
  const accountRouteWatchdogRef = useRef<number | null>(null);
  const resendSubmitPendingRef = useRef(false);
  const authCaptchaTokenRef = useRef<string | null>(null);
  const resendCaptchaTokenRef = useRef<string | null>(null);
  const otpInputRef = useRef<HTMLInputElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const otpRecoveryTriggerRef = useRef<HTMLButtonElement>(null);
  const otpVerifyingRef = useRef(false);
  const otpAbortRef = useRef<AbortController | null>(null);
  const accountRouteAbortRef = useRef<AbortController | null>(null);
  const authChecked = authStatus !== "loading";

  useEffect(() => {
    if (isPetDeleteReauthentication || didRedirectRef.current || authStatus !== "signedIn") return;
    if (mode === "signup" && signupStep === "otp") return;
    didRedirectRef.current = true;
    router.replace(nextPath);
  }, [authStatus, isPetDeleteReauthentication, mode, nextPath, router, signupStep]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setInterval(() => setResendCooldown((value) => Math.max(0, value - 1)), 1_000);
    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  useEffect(() => () => {
    if (accountRouteWatchdogRef.current !== null) window.clearTimeout(accountRouteWatchdogRef.current);
  }, []);

  useEffect(() => {
    if (!otpRecoveryOpen) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOtpRecoveryOpen(false);
      window.requestAnimationFrame(() => otpRecoveryTriggerRef.current?.focus());
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [otpRecoveryOpen]);

  function clearTransientAuthState() {
    otpAbortRef.current?.abort();
    otpAbortRef.current = null;
    accountRouteAbortRef.current?.abort();
    accountRouteAbortRef.current = null;
    otpVerifyingRef.current = false;
    authSubmitPendingRef.current = false;
    accountRoutePendingRef.current = false;
    if (accountRouteWatchdogRef.current !== null) window.clearTimeout(accountRouteWatchdogRef.current);
    accountRouteWatchdogRef.current = null;
    resendSubmitPendingRef.current = false;
    authCaptchaTokenRef.current = null;
    resendCaptchaTokenRef.current = null;
    setPassword("");
    setSignupOtp("");
    setEmailOtpMode("signup_confirmation");
    setOtpVerifying(false);
    setOtpRecoveryOpen(false);
    setShowPassword(false);
    setError("");
    setStatusMessage("");
    setLoading(false);
    setCaptchaToken(null);
    setCaptchaReset((value) => value + 1);
    setAuthChallengeVisible(false);
    setAuthSubmitPending(false);
    setAccountRouteChallengeVisible(false);
    setAccountRoutePending(false);
    setAccountRouteExecuteSignal(null);
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

  function closeOtpRecovery() {
    setOtpRecoveryOpen(false);
    window.requestAnimationFrame(() => otpRecoveryTriggerRef.current?.focus());
  }

  function startSignInOtpFromRecovery() {
    const normalizedEmail = normalizeAuthEmail(email);
    clearTransientAuthState();
    setEmail(normalizedEmail);
    setMode("signup");
    setSignupStep("otp");
    setEmailOtpMode("signin_otp");
    resendSubmitPendingRef.current = true;
    setResendSubmitPending(true);
    setResendChallengeVisible(true);
    returnViewportToTop();
  }

  function signInWithPasswordFromOtp() {
    const normalizedEmail = normalizeAuthEmail(email);
    clearTransientAuthState();
    setEmail(normalizedEmail);
    setMode("signin");
    setSigninStep("password");
    setSignupStep("method");
    returnViewportToTop();
  }

  function useAnotherEmailFromOtp() {
    returnToSignupEmail(true);
    window.requestAnimationFrame(() => emailInputRef.current?.focus());
  }

  function resetCaptchaAfterRequest() {
    authCaptchaTokenRef.current = null;
    resendCaptchaTokenRef.current = null;
    setCaptchaToken(null);
    setCaptchaReset((value) => value + 1);
  }

  function clearAccountRouteWatchdog() {
    if (accountRouteWatchdogRef.current !== null) window.clearTimeout(accountRouteWatchdogRef.current);
    accountRouteWatchdogRef.current = null;
  }

  function failAccountRouteSecurityCheck() {
    if (!accountRoutePendingRef.current) return;
    accountRoutePendingRef.current = false;
    clearAccountRouteWatchdog();
    setAccountRoutePending(false);
    setAccountRouteExecuteSignal(null);
    setLoading(false);
    setCaptchaToken(null);
    setError("Security check failed. Try again.");
  }

  function continueSignupWithEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading || accountRoutePendingRef.current) return;
    const normalizedEmail = normalizeAuthEmail(email);
    setEmail(normalizedEmail);
    setPassword("");
    setShowPassword(false);
    setError("");
    setStatusMessage("");
    setCaptchaToken(null);
    accountRoutePendingRef.current = true;
    setAccountRoutePending(true);
    setAccountRouteChallengeVisible(true);
    accountRouteExecuteSequenceRef.current += 1;
    setAccountRouteExecuteSignal(accountRouteExecuteSequenceRef.current);
    clearAccountRouteWatchdog();
    accountRouteWatchdogRef.current = window.setTimeout(failAccountRouteSecurityCheck, ACCOUNT_ROUTE_WATCHDOG_MS);
  }

  function handleAccountRouteChallengeToken(token: string | null) {
    setCaptchaToken(token);
    if (!token) {
      failAccountRouteSecurityCheck();
      return;
    }
    if (!accountRoutePendingRef.current) return;
    accountRoutePendingRef.current = false;
    clearAccountRouteWatchdog();
    setAccountRouteExecuteSignal(null);
    setCaptchaToken(null);
    void routeSignupEmail(token);
  }

  async function routeSignupEmail(token: string) {
    if (!token) return;
    const normalizedEmail = normalizeAuthEmail(email);
    const controller = new AbortController();
    accountRouteAbortRef.current?.abort();
    accountRouteAbortRef.current = controller;
    setLoading(true);
    setError("");
    setStatusMessage("");

    let response: Response;
    try {
      response = await fetch("/api/auth/account-route", {
        body: JSON.stringify({ captchaToken: token, email: normalizedEmail }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
        signal: controller.signal,
      });
    } catch {
      if (controller.signal.aborted) return;
      accountRouteAbortRef.current = null;
      accountRoutePendingRef.current = false;
      setAccountRoutePending(false);
      setLoading(false);
      setAccountRouteChallengeVisible(false);
      setCaptchaToken(null);
      setCaptchaReset((value) => value + 1);
      setError("Account access is temporarily unavailable. Please try again.");
      return;
    }
    if (controller.signal.aborted) return;
    accountRouteAbortRef.current = null;
    const payload = await response.json().catch(() => null) as { error?: string; flow?: "signin" | "signup" } | null;
    if (!response.ok || (payload?.flow !== "signin" && payload?.flow !== "signup")) {
      accountRoutePendingRef.current = false;
      setAccountRoutePending(false);
      setLoading(false);
      setAccountRouteChallengeVisible(false);
      setCaptchaToken(null);
      setCaptchaReset((value) => value + 1);
      setError(payload?.error || "Account access is temporarily unavailable. Please try again.");
      return;
    }

    clearTransientAuthState();
    setEmail(normalizedEmail);
    if (payload.flow === "signin") {
      setMode("signin");
      setSigninStep("password");
      setSignupStep("method");
    } else {
      setMode("signup");
      setSigninStep("method");
      setSignupStep("password");
    }
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
    setSignupOtp("");
    setEmailOtpMode("signup_confirmation");
    setOtpVerifying(false);
    otpVerifyingRef.current = false;
    setResendChallengeVisible(false);
    setResendCooldown(SIGNUP_RESEND_COOLDOWN_SECONDS);
    setSignupStep("otp");
    returnViewportToTop();
  }

  function updateSignupOtp(value: string) {
    const normalized = normalizeAuthEmailOtp(value);
    setSignupOtp(normalized);
    setError("");
    if (isCompleteAuthEmailOtp(normalized)) void verifySignupOtp(normalized);
  }

  function submitSignupOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isCompleteAuthEmailOtp(signupOtp)) {
      setError(`Enter all ${FURVISE_EMAIL_OTP_LENGTH} digits.`);
      otpInputRef.current?.focus();
      return;
    }
    void verifySignupOtp(signupOtp);
  }

  async function verifySignupOtp(code: string) {
    if (!isCompleteAuthEmailOtp(code) || otpVerifyingRef.current) return;
    otpVerifyingRef.current = true;
    setOtpVerifying(true);
    setError("");
    setStatusMessage("");
    const controller = new AbortController();
    otpAbortRef.current?.abort();
    otpAbortRef.current = controller;

    let response: Response;
    try {
      response = await fetch("/api/auth/verify-email-otp", {
        body: JSON.stringify({ email: normalizeAuthEmail(email), token: code }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
        signal: controller.signal,
      });
    } catch {
      if (controller.signal.aborted) return;
      otpVerifyingRef.current = false;
      otpAbortRef.current = null;
      setOtpVerifying(false);
      setSignupOtp("");
      setError("Furvise could not verify that code. Please try again.");
      window.requestAnimationFrame(() => otpInputRef.current?.focus());
      return;
    }

    if (controller.signal.aborted) return;
    otpAbortRef.current = null;
    const payload = await response.json().catch(() => null) as { destination?: string; error?: string; verified?: boolean } | null;
    if (!response.ok || !payload?.verified || typeof payload.destination !== "string") {
      otpVerifyingRef.current = false;
      setOtpVerifying(false);
      setSignupOtp("");
      setError(payload?.error || "That code is invalid or expired. Try again or send a new one.");
      window.requestAnimationFrame(() => {
        otpInputRef.current?.focus();
        otpInputRef.current?.select();
      });
      return;
    }

    didRedirectRef.current = true;
    router.replace(getSafeNextPath(payload.destination, "/onboarding"));
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
      const endpoint = emailOtpMode === "signin_otp" ? "/api/auth/login-otp/start" : "/api/auth/resend";
      const idempotencyScope = emailOtpMode === "signin_otp" ? "auth-login-otp-start" : "auth-resend";
      response = await idempotentClientFetch(endpoint, { body: JSON.stringify({ captchaToken: token, email: normalizedEmail }), headers: { "Content-Type": "application/json" }, method: "POST" }, `${idempotencyScope}:${normalizedEmail}`);
    } catch {
      resetCaptchaAfterRequest();
      setResendChallengeVisible(false);
      setLoading(false);
      setError("Furvise could not send a new code. Please try again.");
      return;
    }
    resetCaptchaAfterRequest();
    setResendChallengeVisible(false);
    const payload = await response.json().catch(() => null) as { error?: string; message?: string; retryAfterSeconds?: number } | null;
    setLoading(false);
    if (!response.ok) {
      setError(payload?.error || "Furvise could not send a new code. Please try again.");
      if (response.status === 429) setResendCooldown(Math.max(SIGNUP_RESEND_COOLDOWN_SECONDS, payload?.retryAfterSeconds || SIGNUP_RESEND_COOLDOWN_SECONDS));
      return;
    }
    setResendCooldown(SIGNUP_RESEND_COOLDOWN_SECONDS);
    setSignupOtp("");
    setStatusMessage("New code sent.");
    window.requestAnimationFrame(() => otpInputRef.current?.focus());
  }

  if (authStatus === "signedIn" && !isPetDeleteReauthentication) {
    return (
      <AccountAccessLayout title="Welcome back">
        <AccountStatus text="Opening Furvise..." />
      </AccountAccessLayout>
    );
  }

  const signinTitle = signinStep === "method" ? "Welcome back" : "Enter your password";
  const signinSupportingText = signinStep === "method" && isPetDeleteReauthentication
    ? "Sign in again to continue with permanent pet deletion."
    : undefined;
  const signupTitle = signupStep === "method"
    ? "Create your account"
    : signupStep === "password"
      ? "Create a password"
      : emailOtpMode === "signin_otp" ? "Confirm it’s you" : "Confirm your email";
  const signupSupportingText = signupStep === "otp"
    ? <span>Enter the code for <span className="inline-block max-w-full"><strong className="break-all font-semibold text-[var(--text-primary)]">{email}</strong>.</span></span>
    : undefined;
  const returnToEmail = mode === "signin" ? returnToSigninEmail : () => returnToSignupEmail(false);
  const passwordStep = mode === "signin" ? signinStep === "password" : signupStep === "password";

  return (
    <AccountAccessLayout
      backLabel="Back to email"
      compact={mode === "signup" && signupStep === "otp"}
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
            inputRef={emailInputRef}
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
            accountRouteChallengeVisible={accountRouteChallengeVisible}
            accountRoutePending={accountRoutePending}
            accountRouteExecuteSignal={accountRouteExecuteSignal}
            authChecked={authChecked}
            captchaReset={captchaReset}
            email={email}
            googleLoading={googleLoading}
            handleAccountRouteChallengeToken={handleAccountRouteChallengeToken}
            handleAccountRouteChallengeFailure={failAccountRouteSecurityCheck}
            loading={loading}
            onContinue={continueSignupWithEmail}
            inputRef={emailInputRef}
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
          <SignupOtpStep
            captchaReset={captchaReset}
            emailOtpMode={emailOtpMode}
            handleResendChallengeToken={handleResendChallengeToken}
            loading={loading}
            otp={signupOtp}
            otpInputRef={otpInputRef}
            otpVerifying={otpVerifying}
            recoveryOpen={otpRecoveryOpen}
            recoveryTriggerRef={otpRecoveryTriggerRef}
            resendChallengeVisible={resendChallengeVisible}
            resendCooldown={resendCooldown}
            resendSubmitPending={resendSubmitPending}
            requestResendConfirmation={requestResendConfirmation}
            startSignInOtp={startSignInOtpFromRecovery}
            submitOtp={submitSignupOtp}
            closeRecovery={closeOtpRecovery}
            openRecovery={() => setOtpRecoveryOpen(true)}
            signInWithPassword={signInWithPasswordFromOtp}
            updateOtp={updateSignupOtp}
            useAnotherEmail={useAnotherEmailFromOtp}
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
  inputRef,
  onContinue,
  setEmail,
  startGoogle,
  switchToSignup,
}: {
  authChecked: boolean;
  email: string;
  googleLoading: boolean;
  isPetDeleteReauthentication: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onContinue: (event: FormEvent<HTMLFormElement>) => void;
  setEmail: (value: string) => void;
  startGoogle: () => Promise<void>;
  switchToSignup: () => void;
}) {
  return (
    <>
      <form className="grid gap-4" onSubmit={onContinue}>
        <EmailInput email={email} inputRef={inputRef} setEmail={setEmail} />
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
  accountRouteChallengeVisible,
  accountRouteExecuteSignal,
  accountRoutePending,
  authChecked,
  captchaReset,
  email,
  googleLoading,
  handleAccountRouteChallengeToken,
  handleAccountRouteChallengeFailure,
  inputRef,
  loading,
  onContinue,
  setEmail,
  startGoogle,
  switchToSignin,
}: {
  accountRouteChallengeVisible: boolean;
  accountRouteExecuteSignal: number | null;
  accountRoutePending: boolean;
  authChecked: boolean;
  captchaReset: number;
  email: string;
  googleLoading: boolean;
  handleAccountRouteChallengeToken: (token: string | null) => void;
  handleAccountRouteChallengeFailure: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  loading: boolean;
  onContinue: (event: FormEvent<HTMLFormElement>) => void;
  setEmail: (value: string) => void;
  startGoogle: () => Promise<void>;
  switchToSignin: () => void;
}) {
  return (
    <>
      <form className="grid gap-4" onSubmit={onContinue}>
        <EmailInput email={email} inputRef={inputRef} setEmail={setEmail} />
        {accountRouteChallengeVisible ? (
          <TurnstileChallenge
            action="account_route"
            executeSignal={accountRouteExecuteSignal}
            execution="execute"
            onFailure={handleAccountRouteChallengeFailure}
            onToken={handleAccountRouteChallengeToken}
            resetSignal={captchaReset}
          />
        ) : null}
        <button className={accountPrimaryClass} disabled={!authChecked || loading || accountRoutePending} type="submit">
          {loading || accountRoutePending ? <AccountPendingLabel /> : "Continue"}
        </button>
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
  const [passwordValidationMessage, setPasswordValidationMessage] = useState("");

  return (
    <>
      <form className="grid gap-4" onSubmit={requestAuthSubmission}>
        <PasswordInput
          autoComplete="new-password"
          maxLength={128}
          minLength={12}
          password={password}
          placeholder="Create a password"
          setPassword={(value) => {
            setPassword(value);
            if (value.length >= 12) setPasswordValidationMessage("");
          }}
          setShowPassword={setShowPassword}
          showPassword={showPassword}
          validationMessageId="signup-password-error"
          onInvalid={(input) => setPasswordValidationMessage(input.validity.valueMissing ? "Enter a password." : "Password needs at least 12 characters.")}
        />
        {passwordValidationMessage ? <p className="text-sm font-medium leading-6 text-[var(--danger-text)]" id="signup-password-error" role="alert">{passwordValidationMessage}</p> : null}
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

function SignupOtpStep({
  captchaReset,
  emailOtpMode,
  handleResendChallengeToken,
  loading,
  otp,
  otpInputRef,
  otpVerifying,
  recoveryOpen,
  recoveryTriggerRef,
  resendChallengeVisible,
  resendCooldown,
  resendSubmitPending,
  requestResendConfirmation,
  startSignInOtp,
  closeRecovery,
  openRecovery,
  signInWithPassword,
  submitOtp,
  updateOtp,
  useAnotherEmail,
}: {
  captchaReset: number;
  emailOtpMode: EmailOtpMode;
  handleResendChallengeToken: (token: string | null) => void;
  loading: boolean;
  otp: string;
  otpInputRef: React.RefObject<HTMLInputElement | null>;
  otpVerifying: boolean;
  recoveryOpen: boolean;
  recoveryTriggerRef: React.RefObject<HTMLButtonElement | null>;
  resendChallengeVisible: boolean;
  resendCooldown: number;
  resendSubmitPending: boolean;
  requestResendConfirmation: () => void;
  startSignInOtp: () => void;
  closeRecovery: () => void;
  openRecovery: () => void;
  signInWithPassword: () => void;
  submitOtp: (event: FormEvent<HTMLFormElement>) => void;
  updateOtp: (value: string) => void;
  useAnotherEmail: () => void;
}) {
  return (
    <div className="mx-auto grid w-full max-w-sm justify-items-center gap-0 text-center" data-ui="signup-otp-actions">
      <form aria-busy={otpVerifying} className="relative grid w-full justify-items-center pb-5" onSubmit={submitOtp}>
        <label className="sr-only" htmlFor="signup-otp">Verification code</label>
        <div className="relative h-[4.25rem] w-full max-w-[18rem] overflow-hidden rounded-xl border border-[var(--input-border)] bg-[var(--input-background)] focus-within:border-[var(--focus-ring)] focus-within:outline-none focus-within:ring-2 focus-within:ring-[var(--pw-focus-ring)] focus-within:ring-offset-2 focus-within:ring-offset-[var(--surface-primary)]" data-ui="signup-otp-input">
          <input
            aria-label="Verification code"
            autoComplete="one-time-code"
            className="absolute inset-0 z-10 h-full w-full cursor-text rounded-xl bg-transparent text-transparent caret-transparent opacity-0 outline-none [-webkit-text-fill-color:transparent] disabled:cursor-wait"
            disabled={otpVerifying}
            id="signup-otp"
            inputMode="numeric"
            maxLength={FURVISE_EMAIL_OTP_LENGTH}
            name="signup-otp"
            onChange={(event) => updateOtp(event.target.value)}
            onPaste={(event) => {
              event.preventDefault();
              updateOtp(event.clipboardData.getData("text"));
            }}
            pattern={FURVISE_EMAIL_OTP_HTML_PATTERN}
            ref={otpInputRef}
            type="text"
            value={otp}
            style={{ WebkitTextFillColor: "transparent" }}
          />
          <div aria-hidden="true" className="grid h-full grid-cols-6 px-5">
            {Array.from({ length: FURVISE_EMAIL_OTP_LENGTH }, (_, index) => (
              <span className="flex min-w-0 items-center justify-center text-[1.625rem] font-semibold tabular-nums text-[var(--deep-forest)]" key={index}>
                {otp[index] || <span className="h-px w-5 bg-[var(--text-tertiary)]" />}
              </span>
            ))}
          </div>
        </div>
        <p aria-live="polite" className="absolute inset-x-0 bottom-0 min-h-5 text-sm font-medium leading-5 text-[var(--text-secondary)]" role="status">
          {otpVerifying ? "Verifying…" : ""}
        </p>
        <button className="sr-only" disabled={otpVerifying} type="submit">Verify code</button>
      </form>
      <p className="min-h-11 text-sm leading-[2.75rem] text-[var(--text-secondary)]" role={resendCooldown > 0 ? "status" : undefined}>
        {resendCooldown > 0 ? (
          <span className="font-semibold text-[var(--text-secondary)]">Resend in {resendCooldown}s</span>
        ) : (
          <button className={accountLinkClass} disabled={loading || resendCooldown > 0 || resendSubmitPending || otpVerifying} onClick={requestResendConfirmation} type="button">
            {loading ? "Sending..." : resendSubmitPending ? <AccountPendingLabel /> : "Resend code"}
          </button>
        )}
      </p>
      {resendChallengeVisible ? (
        <div className="mt-2 grid w-full gap-3" data-testid="resend-security-challenge">
          <TurnstileChallenge onToken={handleResendChallengeToken} resetSignal={captchaReset} />
        </div>
      ) : null}
      <button className={`${accountSecondaryClass} mt-1`} disabled={otpVerifying} onClick={openRecovery} ref={recoveryTriggerRef} type="button">Didn&apos;t get a code?</button>
      {recoveryOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(18,63,39,0.18)] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] sm:items-center sm:p-6" data-ui="otp-recovery-overlay">
          <div
            aria-labelledby="otp-recovery-title"
            aria-modal="true"
            className="relative w-full max-w-sm rounded-t-3xl rounded-b-2xl border border-[var(--line)] bg-[var(--surface-primary)] p-5 pt-7 text-left shadow-[var(--shadow-surface-2)] sm:rounded-3xl sm:p-7"
            onKeyDown={(event) => {
              if (event.key !== "Tab") return;
              const controls = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not([disabled])"));
              const first = controls[0];
              const last = controls.at(-1);
              if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last?.focus();
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first?.focus();
              }
            }}
            role="dialog"
          >
            <button aria-label="Close alternate sign-in options" autoFocus className="absolute right-3 top-3 inline-flex size-11 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface-primary)] text-xl leading-none text-[var(--text-primary)] transition hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pw-focus-ring)]" onClick={closeRecovery} type="button">
              <span aria-hidden="true">×</span>
            </button>
            <h2 className="pr-12 text-center text-2xl font-semibold tracking-[-0.025em]" id="otp-recovery-title">Try another way</h2>
            <div className="mt-7 grid gap-3">
              <button className={accountSecondaryClass} disabled={emailOtpMode === "signin_otp" && resendCooldown > 0} onClick={startSignInOtp} type="button">Send me a sign-in code</button>
              <button className={accountSecondaryClass} onClick={signInWithPassword} type="button">Sign in with password</button>
              <button className={accountSecondaryClass} onClick={useAnotherEmail} type="button">Use another email</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function EmailInput({ email, inputRef, setEmail }: { email: string; inputRef: React.RefObject<HTMLInputElement | null>; setEmail: (value: string) => void }) {
  return (
    <AccountField label="Email" name="email">
      <input autoComplete="email" className={accountInputClass} id="email" name="email" onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" ref={inputRef} required type="email" value={email} />
    </AccountField>
  );
}

function PasswordInput({
  autoComplete,
  maxLength,
  minLength,
  password,
  placeholder,
  onInvalid,
  setPassword,
  setShowPassword,
  showPassword,
  validationMessageId,
}: {
  autoComplete: "current-password" | "new-password";
  maxLength: number;
  minLength: number;
  password: string;
  placeholder: string;
  onInvalid?: (input: HTMLInputElement) => void;
  setPassword: (value: string) => void;
  setShowPassword: (value: boolean | ((current: boolean) => boolean)) => void;
  showPassword: boolean;
  validationMessageId?: string;
}) {
  return (
    <AccountField label="Password" name="password">
      <div className="relative">
        <input aria-describedby={validationMessageId} autoComplete={autoComplete} className={`${accountInputClass} pr-20`} id="password" maxLength={maxLength} minLength={minLength} name="password" onChange={(event) => setPassword(event.target.value)} onInvalid={(event) => onInvalid?.(event.currentTarget)} placeholder={placeholder} required type={showPassword ? "text" : "password"} value={password} />
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
