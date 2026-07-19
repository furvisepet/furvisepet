"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { AppHeader } from "../components/app-header";
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

      if (error) {
        throw error;
      }

      setSuccessMessage(
        "Check your email. If an account exists for this email, we sent a password reset link.",
      );
    } catch (resetError) {
      setErrorMessage(
        resetError instanceof Error
          ? friendlyResetPasswordError(resetError.message)
          : "Furvise could not send that reset link. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-transparent text-[var(--pw-text)]">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 py-5 sm:px-8 lg:px-10">
        <AppHeader
          backFallbackHref="/login"
          brandHref="/"
          showBackButton
          title="Password recovery"
        />

        <section className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[0.95fr_1.05fr] lg:gap-14 lg:py-14">
          <div className="max-w-2xl">
            <p className="inline-flex rounded-full border border-[var(--pw-border)] bg-[var(--pw-surface)] px-3 py-1 text-xs font-semibold tracking-[0.24em] text-[var(--pw-primary)] shadow-sm sm:text-sm">
              ACCOUNT ACCESS
            </p>
            <h1 className="mt-5 max-w-xl text-4xl font-semibold leading-[1.04] tracking-tight text-[var(--pw-heading)] sm:text-5xl lg:text-[3.95rem]">
              Reset your password
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-[var(--pw-muted)] sm:text-xl">
              Enter your email and we&apos;ll send you a password reset link.
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
                      Reset link
                    </p>
                    <h2 className="mt-3 text-2xl font-semibold tracking-tight text-[var(--pw-heading)] sm:text-3xl">
                      Choose a new password
                    </h2>
                    <p className="mt-3 max-w-lg text-base leading-7 text-[var(--pw-muted)]">
                      We will send you back to Furvise so you can update your password securely.
                    </p>
                  </div>

                  {configError ? <StatusBanner tone="warning" text={configError} /> : null}
                  {successMessage ? <StatusBanner text={successMessage} /> : null}
                  {errorMessage ? <StatusBanner tone="danger" text={errorMessage} /> : null}

                  <form className="grid gap-4" onSubmit={submitReset}>
                    <Field label="Email" name="email">
                      <input
                        autoComplete="email"
                        className="w-full rounded-2xl border border-[var(--pw-border-strong)] bg-[var(--pw-input)] px-4 py-3 text-base text-[var(--pw-text)] outline-none transition placeholder:text-[var(--pw-placeholder)] focus:border-[var(--pw-primary)] focus:bg-[var(--pw-surface-elevated)] focus-visible:ring-2 focus-visible:ring-[var(--pw-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--pw-surface)]"
                        id="email"
                        name="email"
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder="you@example.com"
                        required
                        type="email"
                        value={email}
                      />
                    </Field>

                    <button
                      className="inline-flex min-h-12 items-center justify-center rounded-full bg-[var(--pw-primary)] px-5 py-3.5 text-base font-semibold text-white shadow-[0_18px_36px_var(--pw-shadow)] transition hover:bg-[var(--pw-primary-hover)] disabled:cursor-wait disabled:bg-[var(--pw-secondary)] disabled:text-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pw-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--pw-surface)]"
                      disabled={loading || Boolean(configError)}
                      type="submit"
                    >
                      {loading ? "Sending reset link..." : "Send reset link"}
                    </button>
                  </form>

                  <div className="flex flex-col gap-3 border-t border-[var(--pw-border)] pt-4 sm:flex-row sm:items-center sm:justify-between">
                    <Link
                      className="text-sm font-semibold text-[var(--pw-primary)] underline decoration-[color-mix(in_srgb,var(--pw-primary)_42%,transparent)] decoration-2 underline-offset-4 transition hover:text-[var(--pw-primary-hover)]"
                      href="/login"
                    >
                      Back to sign in
                    </Link>
                    {successMessage ? (
                      <span className="text-sm font-medium text-[var(--pw-muted)]">
                        Didn&apos;t get it? Check spam or resend.
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

function friendlyResetPasswordError(message: string) {
  const lower = message.toLowerCase();

  if (lower.includes("email")) {
    return "Enter a valid email address and try again.";
  }

  if (lower.includes("rate limit") || lower.includes("too many requests")) {
    return "Too many reset attempts. Please wait a moment and try again.";
  }

  if (lower.includes("network") || lower.includes("fetch")) {
    return "Furvise could not reach the reset service. Please try again.";
  }

  return "Furvise could not send that reset link. Please try again.";
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
