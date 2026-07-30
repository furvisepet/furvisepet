"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { AccountAccessLayout, AccountField, AccountStatus, accountInputClass, accountPrimaryClass } from "../components/account-access";
import { getBrowserSupabase, getSupabaseConfigError } from "../lib/supabase";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const configError = getSupabaseConfigError();

  async function submitReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = getBrowserSupabase();
    if (!supabase) {
      setErrorMessage(configError || "Supabase is not configured.");
      return;
    }
    setLoading(true);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const redirectTo = new URL("/update-password", window.location.origin).toString();
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw error;
      setSuccessMessage("Check your email. If an account exists for this email, we sent a password reset link.");
    } catch (resetError) {
      setErrorMessage(resetError instanceof Error ? friendlyResetPasswordError(resetError.message) : "Furvise could not send that reset link. Please try again.");
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
          <button className={accountPrimaryClass} disabled={loading || Boolean(configError)} type="submit">{loading ? "Sending reset link..." : "Send reset link"}</button>
        </form>
        <Link className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--ghost-action-foreground)] underline decoration-transparent underline-offset-4 transition hover:decoration-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pw-focus-ring)]" href="/login">Back to sign in</Link>
        {successMessage ? <p className="text-sm text-[var(--text-secondary)]">Didn&apos;t get it? Check spam or resend.</p> : null}
      </div>
    </AccountAccessLayout>
  );
}

function friendlyResetPasswordError(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("email")) return "Enter a valid email address and try again.";
  if (lower.includes("rate limit") || lower.includes("too many requests")) return "Too many reset attempts. Please wait a moment and try again.";
  if (lower.includes("network") || lower.includes("fetch")) return "Furvise could not reach the reset service. Please try again.";
  return "Furvise could not send that reset link. Please try again.";
}
