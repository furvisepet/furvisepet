"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { AccountAccessLayout, AccountField, AccountStatus, accountInputClass, accountPrimaryClass } from "../components/account-access";
import { TurnstileChallenge } from "../components/turnstile-challenge";
import { getSupabaseConfigError } from "../lib/supabase";
import { idempotentClientFetch } from "../lib/security/idempotency/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);
  const configError = getSupabaseConfigError();

  async function submitReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const token = captchaToken; setCaptchaToken(null); setCaptchaReset((value) => value + 1);
      const response = await idempotentClientFetch("/api/auth/recovery", { body: JSON.stringify({ captchaToken: token || undefined, email }), headers: { "Content-Type": "application/json" }, method: "POST" }, `auth-recovery:${email.trim().toLowerCase()}`);
      const payload = await response.json().catch(() => null) as { error?: string; message?: string } | null;
      if (!response.ok) throw new Error(payload?.error || "Furvise could not send that reset link. Please try again.");
      setSuccessMessage(payload?.message || "If an account exists for that email, a recovery link will be sent.");
    } catch (resetError) {
      setErrorMessage(resetError instanceof Error ? resetError.message : "Furvise could not send that reset link. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AccountAccessLayout supportingText="Enter your email and we'll send you a password reset link." title="Reset your password">
      <div className="space-y-5">
        {configError ? <AccountStatus tone="warning" text={configError} /> : null}
        {successMessage ? <AccountStatus text={successMessage} /> : null}
        {errorMessage ? <AccountStatus tone="danger" text={errorMessage} /> : null}
        <form className="grid gap-4" onSubmit={submitReset}>
          <AccountField label="Email" name="email">
            <input autoComplete="email" className={accountInputClass} id="email" name="email" onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required type="email" value={email} />
          </AccountField>
          <TurnstileChallenge onToken={setCaptchaToken} resetSignal={captchaReset} />
          <button className={accountPrimaryClass} disabled={loading || Boolean(configError) || (process.env.NODE_ENV === "production" && !captchaToken)} type="submit">{loading ? "Sending reset link..." : "Send reset link"}</button>
        </form>
        <Link className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--ghost-action-foreground)] underline decoration-transparent underline-offset-4 transition hover:decoration-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pw-focus-ring)]" href="/login">Back to sign in</Link>
        {successMessage ? <p className="text-sm text-[var(--text-secondary)]">Check your spam folder before trying again.</p> : null}
      </div>
    </AccountAccessLayout>
  );
}
