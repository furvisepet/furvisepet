"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import { AppHeader } from "../components/app-header";
import { useConfirmedSupabaseAuth } from "../lib/auth-session";
import { getSafeNextPath, pointsToNewPetOnboarding } from "../lib/auth-routing";
import { getBrowserSupabase, getSupabaseConfigError, setBrowserSupabasePersistence } from "../lib/supabase";

type AuthMode = "signin" | "signup";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageContent />
    </Suspense>
  );
}

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = getBrowserSupabase();
  const configError = getSupabaseConfigError();
  const nextPath = getSafeNextPath(searchParams.get("next") || searchParams.get("returnTo"), "/dashboard");
  const isNewPetNext = pointsToNewPetOnboarding(nextPath);
  const { status: authStatus } = useConfirmedSupabaseAuth();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const didRedirectRef = useRef(false);
  const authChecked = authStatus !== "loading";

  useEffect(() => {
    if (didRedirectRef.current) return;
    if (authStatus !== "signedIn") return;
    didRedirectRef.current = true;
    router.replace(nextPath);
  }, [authStatus, nextPath, router]);

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError("");
    setStatusMessage("");
    setShowPassword(false);
    if (nextMode === "signin") {
      setKeepSignedIn(true);
    }
  }

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;

    setLoading(true);
    setError("");
    setStatusMessage("");

    if (mode === "signin") {
      setBrowserSupabasePersistence(keepSignedIn ? null : "session");
    } else {
      setBrowserSupabasePersistence(null);
    }

    const authSupabase = getBrowserSupabase(mode === "signin" ? keepSignedIn : true);
    if (!authSupabase) {
      setLoading(false);
      setError(configError || "Supabase is not configured.");
      return;
    }

    const result =
      mode === "signin"
        ? await authSupabase.auth.signInWithPassword({ email, password })
        : await authSupabase.auth.signUp({ email, password });

    if (result.error) {
      setLoading(false);
      setError(friendlyAuthError(result.error.message));
      return;
    }

    if (result.data.session) {
      didRedirectRef.current = true;
      router.replace(nextPath);
      return;
    }

    setLoading(false);

    if (mode === "signup") {
      setStatusMessage(
        "Account created. Check your inbox if Furvise asked you to confirm your email.",
      );
    }
  }

  const isSignedIn = authStatus === "signedIn";

  return (
    <main className="min-h-screen overflow-x-hidden bg-transparent text-[var(--pw-text)]">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl min-w-0 flex-col px-5 py-5 sm:px-8 lg:px-10">
        <AppHeader
          actions={[]}
          backFallbackHref="/"
          brandHref="/"
          homepagePolish
          showBackButton
        />

        <section className="grid min-w-0 flex-1 items-center gap-10 py-10 lg:grid-cols-[0.95fr_1.05fr] lg:gap-14 lg:py-14">
          <div className="min-w-0 max-w-2xl">
            <p className="inline-flex rounded-full border border-[var(--pw-border)] bg-[var(--pw-surface)] px-3 py-1 text-xs font-semibold tracking-[0.24em] text-[var(--pw-primary)] shadow-sm sm:text-sm">
              YOUR PET FAMILY CARE COMPANION
            </p>
            <h1 className="mt-5 max-w-xl text-4xl font-semibold leading-[1.04] tracking-tight text-[var(--pw-heading)] sm:text-5xl lg:text-[3.95rem]">
              Keep your pet&apos;s care history connected.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-[var(--pw-muted)] sm:text-xl">
              {isNewPetNext
                ? "Sign in to save your pet's care history."
                : "Sign in to save pet profiles, memories, care updates, and product feedback in one private place."}
            </p>

            <div className="mt-7 grid gap-2.5 sm:grid-cols-3 lg:max-w-xl lg:grid-cols-1">
              {trustPoints.map((point) => (
                <div
                  className="flex items-center gap-2.5 rounded-[1.15rem] border border-[var(--pw-border)] bg-[var(--pw-surface-elevated)] px-3.5 py-2.5 shadow-[0_10px_30px_var(--pw-shadow)]"
                  key={point}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--pw-primary-soft)] text-[var(--pw-primary)] ring-1 ring-[color-mix(in_srgb,var(--pw-primary)_12%,transparent)]">
                    <CheckIcon />
                  </span>
                  <span className="text-sm font-medium leading-5 text-[var(--pw-heading)] sm:text-[0.95rem]">
                    {point}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="relative min-w-0 overflow-hidden rounded-[2rem]">
            <div className="absolute -left-6 top-0 h-24 w-24 rounded-full bg-[color-mix(in_srgb,var(--pw-primary)_10%,transparent)] blur-3xl" />
            <div className="absolute -right-8 bottom-8 h-32 w-32 rounded-full bg-[color-mix(in_srgb,var(--pw-secondary)_12%,transparent)] blur-3xl" />

            <div className="relative overflow-hidden rounded-[2rem] border border-[var(--pw-border)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--pw-surface)_98%,white),color-mix(in_srgb,var(--pw-card-muted)_72%,var(--pw-surface)))] p-4 shadow-[0_30px_80px_var(--pw-shadow)] sm:p-5 lg:p-6">
              <div className="rounded-[1.7rem] border border-[var(--pw-border)] bg-[var(--pw-surface-elevated)] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.5),0_16px_40px_var(--pw-shadow)] sm:p-6">
                {isSignedIn ? (
                  <div className="space-y-5">
                    <div>
                      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--pw-primary)]">
                        Redirecting
                      </p>
                      <h2 className="mt-3 text-2xl font-semibold tracking-tight text-[var(--pw-heading)] sm:text-3xl">
                        {isNewPetNext ? "Sending you to pet setup" : "Sending you to your dashboard"}
                      </h2>
                      <p className="mt-3 max-w-lg text-base leading-7 text-[var(--pw-muted)]">
                        Your session is ready. Furvise is taking you to the right place now.
                      </p>
                    </div>

                    <div className="rounded-[1.5rem] border border-[var(--pw-border)] bg-[var(--pw-card-muted)] p-4 sm:p-5">
                      <div className="h-3 w-28 rounded-full bg-[var(--pw-border)]/70" />
                      <div className="mt-3 h-11 w-full rounded-2xl bg-[var(--pw-card-muted)]" />
                      <div className="mt-3 h-11 w-full rounded-2xl bg-[var(--pw-card-muted)]" />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-5">
                    <div>
                      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--pw-primary)]">
                        Account access
                      </p>
                      <div
                        aria-label="Authentication mode"
                        className="mt-4 inline-grid w-full grid-cols-2 rounded-full border border-[var(--pw-border-strong)] bg-[var(--pw-card-muted)] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]"
                        role="tablist"
                      >
                        <button
                          aria-selected={mode === "signin"}
                          className={`rounded-full px-4 py-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pw-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--pw-surface)] ${
                            mode === "signin"
                              ? "border border-[var(--pw-border)] bg-[var(--pw-surface-elevated)] text-[var(--pw-heading)] shadow-sm"
                              : "text-[var(--pw-muted)] hover:text-[var(--pw-text)]"
                          }`}
                          onClick={() => switchMode("signin")}
                          role="tab"
                          type="button"
                        >
                          Sign in
                        </button>
                        <button
                          aria-selected={mode === "signup"}
                          className={`rounded-full px-4 py-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pw-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--pw-surface)] ${
                            mode === "signup"
                              ? "border border-[var(--pw-border)] bg-[var(--pw-surface-elevated)] text-[var(--pw-heading)] shadow-sm"
                              : "text-[var(--pw-muted)] hover:text-[var(--pw-text)]"
                          }`}
                          onClick={() => switchMode("signup")}
                          role="tab"
                          type="button"
                        >
                          Create account
                        </button>
                      </div>
                      {mode === "signup" ? (
                        <p className="mt-4 text-sm leading-6 text-[var(--pw-muted)]">
                          Passwords need at least 6 characters.
                        </p>
                      ) : null}
                      {isNewPetNext ? (
                        <p className="mt-4 text-sm leading-6 text-[var(--pw-muted)]">
                          Sign in to save your pet&rsquo;s care history.
                        </p>
                      ) : null}
                    </div>

                    {!authChecked ? (
                      <StatusBanner text="Checking your session..." />
                    ) : configError ? (
                      <StatusBanner tone="warning" text={configError} />
                    ) : null}

                    <form className="grid gap-4" onSubmit={submitAuth}>
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

                      <Field label="Password" name="password">
                        <div className="space-y-2">
                          <div className="relative">
                            <input
                              autoComplete={mode === "signin" ? "current-password" : "new-password"}
                              className="w-full rounded-2xl border border-[var(--pw-border-strong)] bg-[var(--pw-input)] px-4 py-3 pr-20 text-base text-[var(--pw-text)] outline-none transition placeholder:text-[var(--pw-placeholder)] focus:border-[var(--pw-primary)] focus:bg-[var(--pw-surface-elevated)] focus-visible:ring-2 focus-visible:ring-[var(--pw-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--pw-surface)] sm:pr-24"
                              id="password"
                              minLength={6}
                              name="password"
                              onChange={(event) => setPassword(event.target.value)}
                              placeholder="Your password"
                              required
                              type={showPassword ? "text" : "password"}
                              value={password}
                            />
                            <button
                              className="absolute right-2 top-1/2 inline-flex min-h-10 -translate-y-1/2 items-center rounded-full px-3 text-xs font-semibold text-[var(--pw-primary)] transition hover:bg-[var(--pw-primary-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pw-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--pw-surface)]"
                              onClick={() => setShowPassword((value) => !value)}
                              type="button"
                              aria-pressed={showPassword}
                            >
                              <span className="sm:hidden">{showPassword ? "Hide" : "Show"}</span>
                              <span className="hidden sm:inline">{showPassword ? "Hide" : "Show"} password</span>
                              </button>
                            </div>
                          {mode === "signin" ? (
                            <div className="flex justify-end">
                              <Link
                                className="text-sm font-semibold text-[var(--pw-primary)] underline decoration-[color-mix(in_srgb,var(--pw-primary)_42%,transparent)] decoration-2 underline-offset-4 transition hover:text-[var(--pw-primary-hover)]"
                                href="/forgot-password"
                              >
                                Forgot password?
                              </Link>
                            </div>
                          ) : null}
                          {mode === "signup" ? (
                            <p className="text-sm leading-6 text-[var(--pw-muted)]">
                              Use at least 6 characters.
                            </p>
                          ) : null}
                        </div>
                      </Field>

                      {mode === "signin" ? (
                        <label
                          className="flex cursor-pointer items-start gap-3 rounded-[1.25rem] border border-[var(--pw-border)] bg-[var(--pw-card-muted)] px-4 py-3 transition hover:border-[var(--pw-border-strong)] hover:bg-[color-mix(in_srgb,var(--pw-card-muted)_84%,white)]"
                          htmlFor="keep-signed-in"
                        >
                          <input
                            checked={keepSignedIn}
                            className="mt-0.5 h-4 w-4 rounded border-[var(--pw-border-strong)] text-[var(--pw-primary)] accent-[var(--pw-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pw-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--pw-surface)]"
                            id="keep-signed-in"
                            onChange={(event) => setKeepSignedIn(event.target.checked)}
                            type="checkbox"
                          />
                          <span className="grid gap-0.5">
                            <span className="text-sm font-semibold text-[var(--pw-heading)]">
                              Keep me signed in
                            </span>
                            <span className="text-sm leading-6 text-[var(--pw-muted)]">
                              Stay signed in on this device.
                            </span>
                          </span>
                        </label>
                      ) : null}

                      <button
                        className="inline-flex min-h-12 items-center justify-center rounded-full bg-[var(--pw-primary)] px-5 py-3.5 text-base font-semibold text-white shadow-[0_18px_36px_var(--pw-shadow)] transition hover:bg-[var(--pw-primary-hover)] disabled:cursor-wait disabled:bg-[var(--pw-secondary)] disabled:text-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pw-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--pw-surface)]"
                        disabled={!authChecked || loading || Boolean(configError)}
                        type="submit"
                      >
                        {loading
                          ? mode === "signin"
                            ? "Signing in..."
                            : "Creating account..."
                          : mode === "signin"
                            ? "Sign in"
                            : "Create account"}
                      </button>
                    </form>
                  </div>
                )}

                {error ? (
                  <StatusBanner tone="danger" text={error} />
                ) : statusMessage ? (
                  <StatusBanner text={statusMessage} />
                ) : null}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function friendlyAuthError(message: string) {
  const lower = message.toLowerCase();

  if (
    lower.includes("invalid login") ||
    lower.includes("invalid credentials") ||
    lower.includes("wrong email or password") ||
    lower.includes("invalid email or password")
  ) {
    return "That email and password did not match.";
  }

  if (lower.includes("email not confirmed")) {
    return "Please confirm your email before signing in.";
  }

  if (lower.includes("already registered") || lower.includes("user already registered")) {
    return "An account already exists for that email.";
  }

  if (lower.includes("password")) {
    return "Use a password with at least 6 characters.";
  }

  if (lower.includes("signups not allowed") || lower.includes("signup disabled")) {
    return "New account creation is currently unavailable.";
  }

  if (lower.includes("network") || lower.includes("fetch")) {
    return "Furvise could not reach the sign-in service. Please try again.";
  }

  return "Furvise could not complete that request. Please try again.";
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

function CheckIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
      <path
        d="m6.5 12.5 3.2 3.2L17.5 8"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

const trustPoints = [
  "Private pet profiles",
  "You control saved details",
  "Open care across devices",
] as const;
