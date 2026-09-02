"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { AccountSettingsShell } from "../../components/account-settings-shell";
import { AccountStatus } from "../../components/account-access";
import { Field, PrimaryButton, SecondaryButton } from "../../components/product-primitives";
import { TurnstileChallenge } from "../../components/turnstile-challenge";
import { GOOGLE_AUTH_ENABLED, buildOAuthCallbackUrl, getConnectedAuthProviders } from "../../lib/auth-identity";
import { useRequireConfirmedSupabaseAuth } from "../../lib/auth-session";
import { getBrowserSupabase } from "../../lib/supabase";

type PasswordField = "current" | "new" | "confirmation";

const forestButtonClass = "![--text-inverse:var(--warm-cream)] !bg-[var(--deep-forest)] hover:!bg-[var(--forest)] disabled:!bg-[var(--disabled-surface)] aria-disabled:!bg-[var(--disabled-surface)]";

export default function SecuritySettingsPage() {
  const { status, user } = useRequireConfirmedSupabaseAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [visible, setVisible] = useState<Record<PasswordField, boolean>>({ confirmation: false, current: false, new: false });
  const [saving, setSaving] = useState(false);
  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const idempotencyKey = useRef<string | null>(null);
  const providers = getConnectedAuthProviders(user);
  const emailPasswordUser = providers.includes("email");
  const googleConnected = providers.includes("google");

  function changePasswordValue(setter: (value: string) => void, value: string) {
    idempotencyKey.current = null;
    setter(value);
  }

  function toggleVisibility(field: PasswordField) {
    setVisible((current) => ({ ...current, [field]: !current[field] }));
  }

  async function connectGoogle() {
    const client = getBrowserSupabase();
    if (!client || connectingGoogle) return;
    setConnectingGoogle(true);
    setMessage("");
    setError("");
    const redirectTo = buildOAuthCallbackUrl(window.location.origin, "/settings/security");
    const { error: linkError } = await client.auth.linkIdentity({
      provider: "google",
      options: { redirectTo },
    });
    if (linkError) {
      setError("Furvise could not connect Google. Sign in with your existing method and try again.");
      setConnectingGoogle(false);
    }
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
    <AccountSettingsShell description="Manage how you sign in to Furvise." title="LOGIN & SECURITY">
      {status !== "signedIn" ? (
        <p className="mt-8 border-y border-[var(--line)] py-5 text-[var(--text-secondary)]" role="status">
          {status === "loading" ? "Checking your account..." : "Redirecting to sign in..."}
        </p>
      ) : (
        <div className="pb-12">
          <section className="mt-10" aria-labelledby="sign-in-methods-heading">
            <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--text-secondary)]" id="sign-in-methods-heading">Sign-in methods</h2>
            <div className="mt-4 border-y border-[var(--line)]">
              {(GOOGLE_AUTH_ENABLED || googleConnected) ? (
                <SignInMethodRow
                  action={!googleConnected && GOOGLE_AUTH_ENABLED ? (
                    <button className="inline-flex min-h-11 items-center font-bold uppercase tracking-[0.06em] text-[var(--forest)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" disabled={connectingGoogle} onClick={() => void connectGoogle()} type="button">
                      {connectingGoogle ? "Connecting..." : "Connect"}
                    </button>
                  ) : null}
                  label="Google"
                  state={googleConnected ? "Connected" : "Not connected"}
                />
              ) : null}
              <SignInMethodRow
                action={emailPasswordUser ? (
                  <button className="inline-flex min-h-11 items-center font-bold uppercase tracking-[0.06em] text-[var(--forest)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" onClick={() => setShowPasswordForm(true)} type="button">Change password</button>
                ) : (
                  <Link className="inline-flex min-h-11 items-center font-bold uppercase tracking-[0.06em] text-[var(--forest)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" href="/forgot-password?mode=setup">Set up</Link>
                )}
                label="Email & password"
                state={emailPasswordUser ? "Connected" : "Not set up"}
              />
            </div>
          </section>

          <div aria-live="polite" className="mt-7 max-w-[720px] space-y-3">
            {message ? <AccountStatus text={message} /> : null}
            {error ? <AccountStatus text={error} tone="danger" /> : null}
          </div>

          {!emailPasswordUser ? (
            <p className="mt-7 max-w-[640px] text-sm leading-6 text-[var(--text-secondary)]">Set up sends a secure password link to your verified email. Your Google sign-in remains available.</p>
          ) : showPasswordForm ? (
            <section className="mt-12 max-w-[720px] border-t border-[var(--line)] pt-8" aria-labelledby="change-password-heading" data-ui="change-password-form">
              <h2 className="text-xl font-semibold text-[var(--text-primary)]" id="change-password-heading">CHANGE PASSWORD</h2>
              <div className="mt-6">
                  <form className="grid gap-5" onSubmit={submit}>
                    <PasswordInput autoComplete="current-password" label="Current password" minLength={1} name="current-password" onChange={(value) => changePasswordValue(setCurrentPassword, value)} onToggle={() => toggleVisibility("current")} value={currentPassword} visible={visible.current} />
                    <PasswordInput autoComplete="new-password" label="New password" name="new-password" onChange={(value) => changePasswordValue(setNewPassword, value)} onToggle={() => toggleVisibility("new")} value={newPassword} visible={visible.new} />
                    <PasswordInput autoComplete="new-password" label="Confirm new password" name="confirm-password" onChange={(value) => changePasswordValue(setConfirmPassword, value)} onToggle={() => toggleVisibility("confirmation")} value={confirmPassword} visible={visible.confirmation} />
                    <p className="text-sm leading-6 text-[var(--text-secondary)]">Use 12 to 128 characters. Spaces and password-manager generated passwords are supported.</p>
                    <TurnstileChallenge onToken={setCaptchaToken} resetSignal={captchaReset} />
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <PrimaryButton className={`${forestButtonClass} w-full sm:w-auto`} disabled={saving || (process.env.NODE_ENV === "production" && !captchaToken)} loading={saving} type="submit">{saving ? "Changing password..." : "Change password"}</PrimaryButton>
                      <SecondaryButton className="w-full sm:w-auto" disabled={saving} onClick={() => setShowPasswordForm(false)} type="button">Cancel</SecondaryButton>
                    </div>
                  </form>
                  <p className="mt-8 border-t border-[var(--line)] pt-5 text-sm leading-6 text-[var(--text-secondary)]">
                    Forgot your current password? <Link className="font-semibold text-[var(--forest)] underline underline-offset-4" href="/forgot-password">Request a password email</Link>.
                  </p>
              </div>
            </section>
          ) : null}
        </div>
      )}
    </AccountSettingsShell>
  );
}

function SignInMethodRow({ action, label, state }: { action?: React.ReactNode; label: string; state: string }) {
  return (
    <div className="grid min-h-[4.75rem] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-5 gap-y-1 border-b border-[var(--line)] py-4 last:border-b-0 sm:grid-cols-[minmax(12rem,0.8fr)_minmax(0,1.2fr)_auto]">
      <h3 className="col-start-1 row-start-1 text-sm font-bold uppercase tracking-[0.08em] text-[var(--text-primary)]">{label}</h3>
      <p className="col-start-1 row-start-2 text-sm text-[var(--text-secondary)] sm:col-start-2 sm:row-start-1 sm:text-right">{state}</p>
      <div className="col-start-2 row-span-2 row-start-1 self-center justify-self-end sm:col-start-3 sm:row-span-1">{action || null}</div>
    </div>
  );
}

function PasswordInput({ autoComplete, label, minLength = 12, name, onChange, onToggle, value, visible }: { autoComplete: string; label: string; minLength?: number; name: string; onChange: (value: string) => void; onToggle: () => void; value: string; visible: boolean }) {
  return (
    <div className="relative">
      <Field autoComplete={autoComplete} label={label} maxLength={128} minLength={minLength} name={name} onChange={(event) => onChange(event.target.value)} required type={visible ? "text" : "password"} value={value} />
      <button aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`} className="absolute bottom-1.5 right-2 min-h-10 rounded-lg px-3 text-sm font-semibold text-[var(--forest)] hover:bg-[var(--ghost-action-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" onClick={onToggle} type="button">
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
  if (code === "CAPTCHA_REQUIRED") return "Complete the security check and try again.";
  if (code === "RATE_LIMITED") return "Too many password-change attempts. Wait a little before trying again.";
  if (code === "REQUEST_IN_PROGRESS") return "That password change is already in progress. Wait a moment before trying again.";
  if (code === "SESSION_EXPIRED") return "Your session expired. Sign in again before changing your password.";
  return "Furvise could not change your password. Please try again.";
}
