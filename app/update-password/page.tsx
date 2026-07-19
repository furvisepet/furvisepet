"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { AppHeader } from "../components/app-header";
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
    if (!supabaseClient) {
      return;
    }
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
          const { error } = await authClient.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;
          window.history.replaceState(null, "", `${url.pathname}${url.search}`);
        }

        const { data } = await authClient.auth.getSession();
        if (!data.session) {
          throw new Error("This password reset link is missing or expired. Request a new reset email.");
        }

        const { data: userData } = await authClient.auth.getUser();
        if (active) {
          setEmail(userData.user?.email || "");
          setSessionReady(true);
        }
      } catch (sessionError) {
        if (active) {
          setErrorMessage(
            sessionError instanceof Error
              ? friendlyUpdatePasswordError(sessionError.message)
              : "Furvise could not open this reset link. Please request a new one.",
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void prepareSession();

    return () => {
      active = false;
    };
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
      if (!sessionData.session) {
        throw new Error("This password reset link is missing or expired. Request a new reset email.");
      }

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        throw error;
      }

      setSuccessMessage("Your password was updated.");
    } catch (updateError) {
      setErrorMessage(
        updateError instanceof Error
          ? friendlyUpdatePasswordError(updateError.message)
          : "Furvise could not update your password. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-transparent text-[var(--pw-text)]">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 py-5 sm:px-8 lg:px-10">
        <AppHeader backFallbackHref="/login" brandHref="/" showBackButton title="Password recovery" />

        <section className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[0.95fr_1.05fr] lg:gap-14 lg:py-14">
          <div className="max-w-2xl">
            <p className="inline-flex rounded-full border border-[var(--pw-border)] bg-[var(--pw-surface)] px-3 py-1 text-xs font-semibold tracking-[0.24em] text-[var(--pw-primary)] shadow-sm sm:text-sm">
              ACCOUNT ACCESS
            </p>
            <h1 className="mt-5 max-w-xl text-4xl font-semibold leading-[1.04] tracking-tight text-[var(--pw-heading)] sm:text-5xl lg:text-[3.95rem]">
              Choose a new password
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-[var(--pw-muted)] sm:text-xl">
              Set a new password for your Furvise account and return to sign in.
            </p>
          </div>

          <div className="relative">
            <div className="absolute -left-6 top-0 h-24 w-24 rounded-full bg-[color-mix(in_srgb,var(--pw-primary)_10%,transparent)] blur-3xl" />
            <div className="absolute -right-8 bottom-8 h-32 w-32 rounded-full bg-[color-mix(in_srgb,var(--pw-secondary)_12%,transparent)] blur-3xl" />

            <div className="relative overflow-hidden rounded-[2rem] border border-[var(--pw-border)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--pw-surface)_98%,white),color-mix(in_srgb,var(--pw-card-muted)_72%,var(--pw-surface)))] p-4 shadow-[0_30px_80px_var(--pw-shadow)] sm:p-5 lg:p-6">
              <div className="rounded-[1.7rem] border border-[var(--pw-border)] bg-[var(--pw-surface-elevated)] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.5),0_16px_40px_var(--pw-shadow)] sm:p-6">
                <div className="space-y-5">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--pw-primary)]">
                      Update password
                    </p>
                    <h2 className="mt-3 text-2xl font-semibold tracking-tight text-[var(--pw-heading)] sm:text-3xl">
                      Secure your account
                    </h2>
                    <p className="mt-3 max-w-lg text-base leading-7 text-[var(--pw-muted)]">
                      {loading
                        ? "Verifying your reset link..."
                        : email
                          ? `Resetting the password for ${email}.`
                          : "Enter a new password for your account."}
                    </p>
                  </div>

                  {configError ? <StatusBanner tone="warning" text={configError} /> : null}
                  {errorMessage ? <StatusBanner tone="danger" text={errorMessage} /> : null}
                  {successMessage ? (
                    <div className="grid gap-3">
                      <StatusBanner text={successMessage} />
                      <div className="flex flex-col gap-3 sm:flex-row">
                        <Link
                          className="inline-flex min-h-12 items-center justify-center rounded-full bg-[var(--pw-primary)] px-5 py-3.5 text-base font-semibold text-white shadow-[0_18px_36px_var(--pw-shadow)] transition hover:bg-[var(--pw-primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pw-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--pw-surface)]"
                          href="/dashboard"
                        >
                          Go to dashboard
                        </Link>
                        <Link
                          className="inline-flex min-h-12 items-center justify-center rounded-full border border-[var(--pw-border-strong)] bg-[var(--pw-surface-strong)] px-5 py-3.5 text-base font-semibold text-[var(--pw-text)] transition hover:border-[var(--pw-secondary)] hover:text-[var(--pw-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pw-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--pw-surface)]"
                          href="/login"
                        >
                          Back to sign in
                        </Link>
                      </div>
                    </div>
                  ) : (
                    <form className="grid gap-4" onSubmit={submitPassword}>
                      <Field label="New password" name="new-password">
                        <input
                          autoComplete="new-password"
                          className="w-full rounded-2xl border border-[var(--pw-border-strong)] bg-[var(--pw-input)] px-4 py-3 text-base text-[var(--pw-text)] outline-none transition placeholder:text-[var(--pw-placeholder)] focus:border-[var(--pw-primary)] focus:bg-[var(--pw-surface-elevated)] focus-visible:ring-2 focus-visible:ring-[var(--pw-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--pw-surface)]"
                          id="new-password"
                          minLength={6}
                          name="new-password"
                          onChange={(event) => setNewPassword(event.target.value)}
                          placeholder="New password"
                          required
                          type="password"
                          value={newPassword}
                        />
                      </Field>

                      <Field label="Confirm password" name="confirm-password">
                        <input
                          autoComplete="new-password"
                          className="w-full rounded-2xl border border-[var(--pw-border-strong)] bg-[var(--pw-input)] px-4 py-3 text-base text-[var(--pw-text)] outline-none transition placeholder:text-[var(--pw-placeholder)] focus:border-[var(--pw-primary)] focus:bg-[var(--pw-surface-elevated)] focus-visible:ring-2 focus-visible:ring-[var(--pw-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--pw-surface)]"
                          id="confirm-password"
                          minLength={6}
                          name="confirm-password"
                          onChange={(event) => setConfirmPassword(event.target.value)}
                          placeholder="Confirm password"
                          required
                          type="password"
                          value={confirmPassword}
                        />
                      </Field>

                      <button
                        className="inline-flex min-h-12 items-center justify-center rounded-full bg-[var(--pw-primary)] px-5 py-3.5 text-base font-semibold text-white shadow-[0_18px_36px_var(--pw-shadow)] transition hover:bg-[var(--pw-primary-hover)] disabled:cursor-wait disabled:bg-[var(--pw-secondary)] disabled:text-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pw-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--pw-surface)]"
                        disabled={loading || saving || Boolean(configError) || !sessionReady}
                        type="submit"
                      >
                        {saving ? "Updating password..." : "Update password"}
                      </button>
                    </form>
                  )}

                  <div className="flex flex-col gap-3 border-t border-[var(--pw-border)] pt-4 sm:flex-row sm:items-center sm:justify-between">
                    <Link
                      className="text-sm font-semibold text-[var(--pw-primary)] underline decoration-[color-mix(in_srgb,var(--pw-primary)_42%,transparent)] decoration-2 underline-offset-4 transition hover:text-[var(--pw-primary-hover)]"
                      href="/login"
                    >
                      Back to sign in
                    </Link>
                    {loading ? (
                      <span className="text-sm font-medium text-[var(--pw-muted)]">
                        Recovery session is being prepared.
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function friendlyUpdatePasswordError(message: string) {
  const lower = message.toLowerCase();

  if (lower.includes("expired") || lower.includes("invalid") || lower.includes("missing")) {
    return "This reset link is missing or expired. Request a new reset email.";
  }

  if (lower.includes("password")) {
    return "Use a stronger password and try again.";
  }

  if (lower.includes("network") || lower.includes("fetch")) {
    return "Furvise could not reach the password service. Please try again.";
  }

  return "Furvise could not update your password. Please try again.";
}

function Field({ children, label, name }: { children: React.ReactNode; label: string; name: string }) {
  return (
    <label className="grid gap-2" htmlFor={name}>
      <span className="text-sm font-semibold text-[var(--pw-heading)]">{label}</span>
      {children}
    </label>
  );
}

function StatusBanner({
  text,
  tone = "neutral",
}: {
  text: string;
  tone?: "neutral" | "warning" | "danger";
}) {
  const toneClasses =
    tone === "warning"
      ? "border-[var(--pw-warning-border)] bg-[var(--pw-warning-surface)] text-[var(--pw-warning-text)]"
      : tone === "danger"
        ? "border-[var(--pw-danger-border)] bg-[var(--pw-danger-surface)] text-[var(--pw-danger-text)]"
        : "border-[var(--pw-border)] bg-[var(--pw-card-muted)] text-[var(--pw-muted)]";

  return <div className={`rounded-[1.25rem] border p-4 text-sm font-medium leading-6 ${toneClasses}`}>{text}</div>;
}
