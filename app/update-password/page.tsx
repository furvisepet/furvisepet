"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { AccountAccessLayout, AccountField, AccountStatus, accountInputClass, accountPrimaryClass } from "../components/account-access";
import { getBrowserSupabase, getSupabaseConfigError } from "../lib/supabase";

export default function UpdatePasswordPage() {
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const configError = getSupabaseConfigError();
  const [loading, setLoading] = useState(!configError);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState(configError);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    const supabaseClient = getBrowserSupabase();
    if (!supabaseClient) return;
    const authClient = supabaseClient;
    let active = true;
    async function prepareSession() {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");
        if (code) {
          const { error } = await authClient.auth.exchangeCodeForSession(code);
          if (error) throw error;
          url.searchParams.delete("code");
          window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
        } else if (accessToken && refreshToken) {
          const { error } = await authClient.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          if (error) throw error;
          window.history.replaceState(null, "", `${url.pathname}${url.search}`);
        }
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
    setSuccessMessage("");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) throw new Error("This password reset link is missing or expired. Request a new reset email.");
      const response = await fetch("/api/auth/update-password", { body: JSON.stringify({ password: newPassword }), headers: { "Content-Type": "application/json" }, method: "POST" });
      const payload = await response.json().catch(() => null) as { error?: string; message?: string } | null;
      if (!response.ok) throw new Error(payload?.error || "Furvise could not update your password. Please try again.");
      setSuccessMessage(payload?.message || "Your password was updated.");
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
        {successMessage ? (
          <div className="grid gap-4">
            <AccountStatus text={successMessage} />
            <Link className={accountPrimaryClass} href="/dashboard">Go to Today</Link>
          </div>
        ) : (
          <form className="grid gap-4" onSubmit={submitPassword}>
            <AccountField label="New password" name="new-password"><input autoComplete="new-password" className={accountInputClass} id="new-password" maxLength={128} minLength={12} name="new-password" onChange={(event) => setNewPassword(event.target.value)} placeholder="New password" required type="password" value={newPassword} /></AccountField>
            <AccountField label="Confirm password" name="confirm-password"><input autoComplete="new-password" className={accountInputClass} id="confirm-password" maxLength={128} minLength={12} name="confirm-password" onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Confirm password" required type="password" value={confirmPassword} /></AccountField>
            <p className="text-sm leading-6 text-[var(--text-secondary)]">Use 12 to 128 characters. Spaces and password-manager generated passwords are supported.</p>
            <button className={accountPrimaryClass} disabled={loading || saving || Boolean(configError) || !sessionReady} type="submit">{saving ? "Updating password..." : "Update password"}</button>
          </form>
        )}
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
