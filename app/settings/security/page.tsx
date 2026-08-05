"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { AppPage } from "../../components/app-page";
import { AccountStatus } from "../../components/account-access";
import { Field, PageHeader, PrimaryButton, TextAction } from "../../components/product-primitives";
import { TurnstileChallenge } from "../../components/turnstile-challenge";
import { getConnectedAuthProviders } from "../../lib/auth-identity";
import { useRequireConfirmedSupabaseAuth } from "../../lib/auth-session";

type PasswordField = "current" | "new" | "confirmation";

export default function SecuritySettingsPage() {
  const { status, user } = useRequireConfirmedSupabaseAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [visible, setVisible] = useState<Record<PasswordField, boolean>>({ confirmation: false, current: false, new: false });
  const [saving, setSaving] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const idempotencyKey = useRef<string | null>(null);
  const emailPasswordUser = getConnectedAuthProviders(user).includes("email");

  function changePasswordValue(setter: (value: string) => void, value: string) {
    idempotencyKey.current = null;
    setter(value);
  }

  function toggleVisibility(field: PasswordField) {
    setVisible((current) => ({ ...current, [field]: !current[field] }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    if (newPassword !== confirmPassword) return setError("The new passwords do not match.");
    if (newPassword === currentPassword) return setError("Choose a password different from your current password.");
    setSaving(true);
    idempotencyKey.current ||= crypto.randomUUID();
    try {
      const challengeToken = captchaToken;
      setCaptchaToken(null);
      setCaptchaReset((value) => value + 1);
      const response = await fetch("/api/account/change-password", {
        body: JSON.stringify({ captchaToken: challengeToken || undefined, confirmPassword, currentPassword, newPassword }),
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey.current },
        method: "POST",
      });
      const payload = await response.json().catch(() => null) as { code?: string; message?: string } | null;
      if (!response.ok) {
        if (response.status < 500 && payload?.code !== "RATE_LIMITED") idempotencyKey.current = null;
        setError(friendlyPasswordChangeError(payload?.code));
        return;
      }
      idempotencyKey.current = null;
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage(payload?.message || "Password changed.");
    } catch {
      setError("Furvise could not reach account security. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppPage shell="reading">
      <PageHeader
        actions={<TextAction href="/account">Back to account</TextAction>}
        supportingText="Manage the password used to sign in to your Furvise account."
        title="Security"
      />
      {status !== "signedIn" ? (
        <div className="mt-8 max-w-2xl rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface-primary)] p-6 text-[var(--text-secondary)]" role="status">
          {status === "loading" ? "Checking your account..." : "Redirecting to sign in..."}
        </div>
      ) : !emailPasswordUser ? (
        <section className="mt-8 max-w-2xl rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface-primary)] p-6 shadow-[var(--shadow-surface-1)] sm:p-8">
          <h2 className="text-xl font-bold tracking-[-0.02em] text-[var(--text-primary)]">Set a password by verified email</h2>
          <p className="mt-3 leading-7 text-[var(--text-secondary)]">
            This account currently uses a connected sign-in provider, so there is no current Furvise password to enter. Use the verified password-reset email flow to set one safely.
          </p>
          <PrimaryButton className="mt-6 w-full sm:w-auto" href="/forgot-password">Send a password-reset email</PrimaryButton>
        </section>
      ) : (
        <section className="mt-8 max-w-2xl rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface-primary)] p-6 shadow-[var(--shadow-surface-1)] sm:p-8">
          <h2 className="text-xl font-bold tracking-[-0.02em] text-[var(--text-primary)]">Change password</h2>
          <p className="mt-2 leading-7 text-[var(--text-secondary)]">Confirm your current password before choosing a new one.</p>
          <div aria-live="polite" className="mt-5 space-y-3">
            {message ? <AccountStatus text={message} /> : null}
            {error ? <AccountStatus text={error} tone="danger" /> : null}
          </div>
          <form className="mt-6 grid gap-5" onSubmit={submit}>
            <PasswordInput autoComplete="current-password" label="Current password" minLength={1} name="current-password" onChange={(value) => changePasswordValue(setCurrentPassword, value)} onToggle={() => toggleVisibility("current")} value={currentPassword} visible={visible.current} />
            <PasswordInput autoComplete="new-password" label="New password" name="new-password" onChange={(value) => changePasswordValue(setNewPassword, value)} onToggle={() => toggleVisibility("new")} value={newPassword} visible={visible.new} />
            <PasswordInput autoComplete="new-password" label="Confirm new password" name="confirm-password" onChange={(value) => changePasswordValue(setConfirmPassword, value)} onToggle={() => toggleVisibility("confirmation")} value={confirmPassword} visible={visible.confirmation} />
            <p className="text-sm leading-6 text-[var(--text-secondary)]">Use 12 to 128 characters. Spaces and password-manager generated passwords are supported.</p>
            <TurnstileChallenge onToken={setCaptchaToken} resetSignal={captchaReset} />
            <PrimaryButton className="w-full sm:w-auto" disabled={saving || (process.env.NODE_ENV === "production" && !captchaToken)} loading={saving} type="submit">{saving ? "Changing password..." : "Change password"}</PrimaryButton>
          </form>
          <p className="mt-6 border-t border-[var(--line)] pt-5 text-sm leading-6 text-[var(--text-secondary)]">
            Forgot your current password? <Link className="font-semibold text-[var(--ghost-action-text)] underline underline-offset-4" href="/forgot-password">Request a password-reset email</Link>.
          </p>
        </section>
      )}
    </AppPage>
  );
}

function PasswordInput({ autoComplete, label, minLength = 12, name, onChange, onToggle, value, visible }: { autoComplete: string; label: string; minLength?: number; name: string; onChange: (value: string) => void; onToggle: () => void; value: string; visible: boolean }) {
  return (
    <div className="relative">
      <Field autoComplete={autoComplete} label={label} maxLength={128} minLength={minLength} name={name} onChange={(event) => onChange(event.target.value)} required type={visible ? "text" : "password"} value={value} />
      <button aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`} className="absolute bottom-1.5 right-2 min-h-10 rounded-lg px-3 text-sm font-semibold text-[var(--ghost-action-text)] hover:bg-[var(--ghost-action-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" onClick={onToggle} type="button">
        {visible ? "Hide" : "Show"}
      </button>
    </div>
  );
}

function friendlyPasswordChangeError(code?: string) {
  if (code === "CURRENT_PASSWORD_INVALID") return "The current password could not be verified.";
  if (code === "PASSWORD_INVALID") return "Use 12 to 128 characters for each password.";
  if (code === "PASSWORD_MISMATCH") return "The new passwords do not match.";
  if (code === "PASSWORD_REUSED") return "Choose a password different from your current password.";
  if (code === "AUTH_REQUIRED") return "Sign in again before changing your password.";
  if (code === "PASSWORD_RESET_REQUIRED") return "Use a verified password-reset email to set a password for this account.";
  if (code === "CAPTCHA_REQUIRED") return "Complete the security check and try again.";
  if (code === "RATE_LIMITED") return "Too many password attempts. Wait a moment and try again.";
  if (code === "REQUEST_IN_PROGRESS") return "This password change is already being processed.";
  return "Furvise could not change your password. Please try again.";
}
