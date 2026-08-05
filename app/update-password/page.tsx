"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { AccountAccessLayout, AccountField, AccountStatus, accountInputClass, accountPrimaryClass } from "../components/account-access";
import { getBrowserSupabase, getSupabaseConfigError, setBrowserSupabasePersistence } from "../lib/supabase";

const PASSWORD_RESET_SUCCESS_PATH = "/login?passwordReset=success";

export default function UpdatePasswordPage() {
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const configError = getSupabaseConfigError();
  const [loading, setLoading] = useState(!configError);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState(configError);
  const [sessionReady, setSessionReady] = useState(false);
  const idempotencyKey = useRef<string | null>(null);

  useEffect(() => {
    const supabaseClient = getBrowserSupabase();
    if (!supabaseClient) return;
    const authClient = supabaseClient;
    let active = true;
    async function prepareSession() {
      try {
        const { data } = await authClient.auth.getSession();
        if (!data.session) throw new Error("This password reset link is missing or expired. Request a new reset email.");
        const { data: userData } = await authClient.auth.getUser();
        if (active) {
          setEmail(userData.user?.email || "");
          setSessionReady(true);
        }
      } catch (sessionError) {
        if (active) setErrorMessage(sessionError instanceof Error ? friendlyUpdatePasswordError(sessionError.message) : "Furvise could not open this reset link. Please request a new one.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void prepareSession();
    return () => { active = false; };
  }, [configError]);

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }
    const supabase = getBrowserSupabase();
    if (!supabase) {
      setErrorMessage(configError || "Supabase is not configured.");
      return;
    }
    setSaving(true);
    setErrorMessage("");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) throw new Error("This password reset link is missing or expired. Request a new reset email.");
      idempotencyKey.current ||= crypto.randomUUID();
      const response = await fetch("/api/auth/update-password", { body: JSON.stringify({ password: newPassword }), headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey.current }, method: "POST" });
      const payload = await response.json().catch(() => null) as { code?: string; error?: string; message?: string } | null;
      if (!response.ok) {
        setErrorMessage(friendlyUpdatePasswordCode(payload?.code));
        return;
      }
      idempotencyKey.current = null;
      setNewPassword("");
      setConfirmPassword("");
      try { await supabase.auth.signOut({ scope: "local" }); }
      catch { /* Server cookie cleanup has already failed closed. */ }
      setBrowserSupabasePersistence(null);
      window.location.replace(PASSWORD_RESET_SUCCESS_PATH);
    } catch (updateError) {
      setErrorMessage(updateError instanceof Error ? friendlyUpdatePasswordError(updateError.message) : "Furvise could not update your password. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AccountAccessLayout supportingText={loading ? "Verifying your reset link..." : email ? `Set a new password for ${email}.` : "Set a new password for your Furvise account."} title="Choose a new password">
      <div className="space-y-5">
        {configError ? <AccountStatus tone="warning" text={configError} /> : null}
        {errorMessage ? <AccountStatus tone="danger" text={errorMessage} /> : null}
        <form className="grid gap-4" onSubmit={submitPassword}>
          <AccountField label="New password" name="new-password"><input autoComplete="new-password" className={accountInputClass} id="new-password" maxLength={128} minLength={12} name="new-password" onChange={(event) => { idempotencyKey.current = null; setNewPassword(event.target.value); }} placeholder="New password" required type="password" value={newPassword} /></AccountField>
          <AccountField label="Confirm password" name="confirm-password"><input autoComplete="new-password" className={accountInputClass} id="confirm-password" maxLength={128} minLength={12} name="confirm-password" onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Confirm password" required type="password" value={confirmPassword} /></AccountField>
          <p className="text-sm leading-6 text-[var(--text-secondary)]">Use 12 to 128 characters. Spaces and password-manager generated passwords are supported.</p>
          <button className={accountPrimaryClass} disabled={loading || saving || Boolean(configError) || !sessionReady} type="submit">{saving ? "Updating password..." : "Update password"}</button>
        </form>
        {errorMessage && !sessionReady ? <Link className={accountPrimaryClass} href="/forgot-password">Request a new reset link</Link> : null}
        <Link className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--ghost-action-foreground)] underline decoration-transparent underline-offset-4 transition hover:decoration-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pw-focus-ring)]" href="/login">Back to sign in</Link>
        {loading ? <p className="text-sm text-[var(--text-secondary)]">Recovery session is being prepared.</p> : null}
      </div>
    </AccountAccessLayout>
  );
}

function friendlyUpdatePasswordError(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("expired") || lower.includes("invalid") || lower.includes("missing")) return "This reset link is missing or expired. Request a new reset email.";
  if (lower.includes("password")) return "Use a stronger password and try again.";
  if (lower.includes("network") || lower.includes("fetch")) return "Furvise could not reach the password service. Please try again.";
  return "Furvise could not update your password. Please try again.";
}

function friendlyUpdatePasswordCode(code?: string) {
  if (code === "PASSWORD_INVALID") return "Use a password between 12 and 128 characters.";
  if (code === "RATE_LIMITED") return "Too many password update attempts. Wait a moment and try again.";
  if (code === "REQUEST_IN_PROGRESS" || code === "RECOVERY_UPDATE_IN_PROGRESS") return "This password update is already being processed.";
  if (code === "RECOVERY_AUTH_CONSUMED") return "This reset link has already been used. Request a new reset email.";
  if (code?.startsWith("RECOVERY_AUTH_") || code?.startsWith("IDEMPOTENCY_")) return "This reset link is missing or expired. Request a new reset email.";
  return "Furvise could not update your password. Please try again.";
}
