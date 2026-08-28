"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { AccountAccessLayout, AccountField, AccountPendingLabel, AccountStatus, accountInputClass, accountPrimaryClass } from "../components/account-access";
import { TurnstileChallenge } from "../components/turnstile-challenge";
import { getSupabaseConfigError } from "../lib/supabase";
import { idempotentClientFetch } from "../lib/security/idempotency/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [, setCaptchaToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);
  const [challengeVisible, setChallengeVisible] = useState(false);
  const [submitPending, setSubmitPending] = useState(false);
  const submitPendingRef = useRef(false);
  const captchaTokenRef = useRef<string | null>(null);
  const configError = getSupabaseConfigError();

  function requestReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading || submitPendingRef.current) return;
    if (captchaTokenRef.current) {
      const token = captchaTokenRef.current;
      captchaTokenRef.current = null;
      setCaptchaToken(null);
      void submitReset(token);
      return;
    }
    submitPendingRef.current = true;
    setSubmitPending(true);
    setCaptchaToken(null);
    setChallengeVisible(true);
    setErrorMessage("");
    setSuccessMessage("");
  }

  function handleChallengeToken(token: string | null) {
    setCaptchaToken(token);
    captchaTokenRef.current = token;
    if (!token) {
      submitPendingRef.current = false;
      setSubmitPending(false);
      return;
    }
    if (!submitPendingRef.current) return;
    submitPendingRef.current = false;
    captchaTokenRef.current = null;
    setCaptchaToken(null);
    setSubmitPending(false);
    void submitReset(token);
  }

  async function submitReset(token: string) {
    if (!token) return;
    setLoading(true);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      setCaptchaToken(null);
      setCaptchaReset((value) => value + 1);
      const response = await idempotentClientFetch("/api/auth/recovery", { body: JSON.stringify({ captchaToken: token, email }), headers: { "Content-Type": "application/json" }, method: "POST" }, `auth-recovery:${email.trim().toLowerCase()}`);
      const payload = await response.json().catch(() => null) as { error?: string; message?: string } | null;
      if (!response.ok) throw new Error(payload?.error || "Furvise could not send that reset link. Please try again.");
      setSuccessMessage(payload?.message || "If an account exists for that email, a recovery link will be sent.");
    } catch (resetError) {
      setErrorMessage(resetError instanceof Error ? resetError.message : "Furvise could not send that reset link. Please try again.");
    } finally {
      setLoading(false);
      setChallengeVisible(false);
    }
  }

  return (
    <AccountAccessLayout title="Reset your password">
      <div className="space-y-5">
        {configError ? <AccountStatus tone="warning" text={configError} /> : null}
        {successMessage ? <AccountStatus text={successMessage} /> : null}
        {errorMessage ? <AccountStatus tone="danger" text={errorMessage} /> : null}
        <form className="grid gap-4" onSubmit={requestReset}>
          <AccountField label="Email" name="email">
            <input autoComplete="email" className={accountInputClass} id="email" name="email" onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required type="email" value={email} />
          </AccountField>
          {challengeVisible ? <TurnstileChallenge onToken={handleChallengeToken} resetSignal={captchaReset} /> : null}
          <button className={accountPrimaryClass} disabled={loading || submitPending || Boolean(configError)} type="submit">{loading ? "Sending reset link..." : submitPending ? <AccountPendingLabel /> : "Send reset link"}</button>
        </form>
        <Link className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--ghost-action-foreground)] underline decoration-transparent underline-offset-4 transition hover:decoration-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pw-focus-ring)]" href="/login">Back to sign in</Link>
        {successMessage ? <p className="text-sm text-[var(--text-secondary)]">Check your spam folder before trying again.</p> : null}
      </div>
    </AccountAccessLayout>
  );
}
