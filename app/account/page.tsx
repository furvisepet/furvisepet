"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppPage } from "../components/app-page";
import { accountInputClass, AccountStatus } from "../components/account-access";
import { PageHeader, PrimaryButton } from "../components/product-primitives";
import { getConnectedAuthProviders } from "../lib/auth-identity";
import { useRequireConfirmedSupabaseAuth } from "../lib/auth-session";
import { idempotentClientFetch } from "../lib/security/idempotency/client";
import { signOutOfFurvise } from "../lib/sign-out";
import { getBrowserSupabase } from "../lib/supabase";

type MembershipDirectoryPayload = {
  askUsage?: { limit?: number };
  entitlements?: { accessRole?: "consumer" | "internal_qa"; billingPlan?: "free" | "plus" };
};

const forestButtonClass = "![--text-inverse:var(--warm-cream)] !bg-[var(--deep-forest)] hover:!bg-[var(--forest)] disabled:!bg-[var(--disabled-surface)] aria-disabled:!bg-[var(--disabled-surface)]";

export default function AccountPage() {
  const { status: authStatus, user } = useRequireConfirmedSupabaseAuth();
  const [membershipSummary, setMembershipSummary] = useState("Loading membership...");
  const [exporting, setExporting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const connectedProviders = getConnectedAuthProviders(user);
  const securitySummary = formatProviderSummary(connectedProviders);

  useEffect(() => {
    if (authStatus !== "signedIn") return;
    let active = true;

    async function loadMembershipSummary() {
      try {
        const response = await fetch("/api/account/entitlements", {
          cache: "no-store",
          headers: await authorizationHeaders(),
        });
        const payload = await response.json().catch(() => null) as MembershipDirectoryPayload | null;
        if (!response.ok || !payload?.entitlements || !payload.askUsage) throw new Error();
        if (active) setMembershipSummary(formatMembershipSummary(payload));
      } catch {
        if (active) setMembershipSummary("Membership details unavailable");
      }
    }

    void loadMembershipSummary();
    return () => { active = false; };
  }, [authStatus]);

  async function exportAccountData() {
    setExporting(true);
    setError("");
    setMessage("");
    try {
      const response = await idempotentClientFetch(
        "/api/account/export",
        { headers: await authorizationHeaders(), method: "POST" },
        "account-data-export",
      );
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || "Your export could not be prepared.");
      }
      const blob = await response.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `furvise-data-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(link.href);
      setMessage("Your Furvise data export is ready.");
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Your export could not be prepared.");
    } finally {
      setExporting(false);
    }
  }

  async function signOut() {
    const client = getBrowserSupabase();
    if (!client || signingOut) return;
    setSigningOut(true);
    setError("");
    try {
      await signOutOfFurvise(client);
      window.location.replace("/");
    } catch {
      setError("Couldn't sign out. Please try again.");
      setSigningOut(false);
    }
  }

  async function deleteAccount() {
    if (deleteConfirmation !== "DELETE") return setError("Type DELETE to confirm account deletion.");
    setDeleting(true);
    setError("");
    setMessage("");
    try {
      const response = await idempotentClientFetch(
        "/api/account/delete",
        {
          body: JSON.stringify({ confirmation: deleteConfirmation }),
          headers: { ...(await authorizationHeaders()), "Content-Type": "application/json" },
          method: "POST",
        },
        "account-delete",
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Account deletion could not be completed.");
      await getBrowserSupabase()?.auth.signOut().catch(() => null);
      window.location.replace("/login");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Account deletion could not be completed.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AppPage shell="reading">
      <PageHeader supportingText="Your Furvise account." title="ACCOUNT" />
      {authStatus !== "signedIn" ? (
        <p className="mt-10 border-y border-[var(--line)] py-5 text-[var(--text-secondary)]" role="status">
          {authStatus === "loading" ? "Loading account..." : "Redirecting to sign in..."}
        </p>
      ) : (
        <div className="pb-12">
          <section className="mt-12" aria-labelledby="account-email-heading">
            <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--text-secondary)]" id="account-email-heading">Email</h2>
            <p className="mt-3 break-words text-xl font-medium text-[var(--text-primary)]">{user?.email || "Email unavailable"}</p>
          </section>

          <section className="mt-12 border-y border-[var(--line)]" aria-label="Account settings">
            <DirectoryRow href="/membership" label="Membership" value={membershipSummary} />
            <DirectoryRow href="/settings/security" label="Security" value={securitySummary} />
          </section>

          <section className="mt-14" aria-labelledby="furvise-data-heading">
            <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--text-secondary)]" id="furvise-data-heading">Your Furvise data</h2>
            <div className="mt-4 flex min-h-20 flex-col justify-between gap-5 border-y border-[var(--line)] py-5 sm:flex-row sm:items-center">
              <p className="max-w-2xl leading-7 text-[var(--text-secondary)]">Download a copy of your Furvise data.</p>
              <PrimaryButton className={`${forestButtonClass} w-full shrink-0 sm:w-auto`} disabled={exporting || deleting} loading={exporting} onClick={() => void exportAccountData()} type="button">
                {exporting ? "Preparing export..." : "Download my data"}
              </PrimaryButton>
            </div>
          </section>

          <section className="mt-14" aria-labelledby="legal-heading">
            <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--text-secondary)]" id="legal-heading">Legal</h2>
            <div className="mt-4 border-y border-[var(--line)]">
              <DirectoryRow href="/privacy" label="Privacy" />
              <DirectoryRow href="/terms" label="Terms" />
            </div>
          </section>

          <div aria-live="polite" className="mt-8 space-y-3">
            {message ? <AccountStatus text={message} /> : null}
            {error ? <AccountStatus text={error} tone="danger" /> : null}
          </div>

          <section className="mt-12 border-y border-[var(--line)] py-4" aria-label="Sign out">
            <button className="inline-flex min-h-12 items-center text-sm font-bold uppercase tracking-[0.08em] text-[var(--forest)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" disabled={signingOut} onClick={() => void signOut()} type="button">
              {signingOut ? "Signing out..." : "Sign out"}
            </button>
          </section>

          <details className="group mt-16 border-y border-[var(--line)]" data-ui="delete-account-disclosure">
            <summary className="flex min-h-[4.75rem] cursor-pointer list-none items-center justify-between gap-4 text-sm font-bold uppercase tracking-[0.08em] text-[var(--danger-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
              <span>Delete account</span>
              <span aria-hidden="true" className="transition-transform group-open:rotate-90">→</span>
            </summary>
            <div className="border-t border-[var(--line)] py-7">
              <p className="max-w-3xl leading-7 text-[var(--text-secondary)]">This permanently removes your Furvise pets, care history, memories, conversations, briefs, and account identity. Sign in again first if your session is older than 15 minutes.</p>
              <div className="mt-6 max-w-[640px]">
                <label className="block text-sm font-semibold text-[var(--text-primary)]" htmlFor="delete-confirmation">Type DELETE to confirm</label>
                <input className={`${accountInputClass} mt-2`} id="delete-confirmation" onChange={(event) => setDeleteConfirmation(event.target.value)} value={deleteConfirmation} />
                <PrimaryButton className={`${forestButtonClass} mt-4 w-full sm:w-auto`} disabled={deleting || exporting || deleteConfirmation !== "DELETE"} loading={deleting} onClick={() => void deleteAccount()} type="button">
                  {deleting ? "Deleting account..." : "Permanently delete account"}
                </PrimaryButton>
              </div>
            </div>
          </details>
        </div>
      )}
    </AppPage>
  );
}

function DirectoryRow({ href, label, value }: { href: string; label: string; value?: string }) {
  return (
    <Link className="group grid min-h-[4.75rem] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-5 gap-y-1 border-b border-[var(--line)] py-4 last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] sm:grid-cols-[minmax(12rem,0.8fr)_minmax(0,1.2fr)_auto]" href={href}>
      <span className="col-start-1 row-start-1 text-sm font-bold uppercase tracking-[0.08em] text-[var(--text-primary)]">{label}</span>
      {value ? <span className="col-span-2 row-start-2 min-w-0 break-words text-sm leading-6 text-[var(--text-secondary)] sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:text-right">{value}</span> : <span />}
      <span aria-hidden="true" className="col-start-2 row-start-1 justify-self-end text-[var(--forest)] transition-transform group-hover:translate-x-0.5 sm:col-start-3">→</span>
    </Link>
  );
}

function formatMembershipSummary(payload: MembershipDirectoryPayload) {
  const accessRole = payload.entitlements?.accessRole;
  if (accessRole === "internal_qa") return "Internal testing access";
  const plan = payload.entitlements?.billingPlan === "plus" ? "Furvise Plus" : "Free";
  const limit = payload.askUsage?.limit;
  return typeof limit === "number" ? `${plan} · ${limit.toLocaleString()} Ask per month` : plan;
}

function formatProviderSummary(providers: string[]) {
  const google = providers.includes("google");
  const email = providers.includes("email");
  if (google && email) return "Google + email";
  if (google) return "Google connected";
  if (email) return "Email and password";
  return "Sign-in method unavailable";
}

async function authorizationHeaders() {
  const client = getBrowserSupabase();
  const { data } = await client?.auth.getSession() || { data: { session: null } };
  if (!data.session?.access_token) throw new Error("Sign in again to continue.");
  return { Authorization: `Bearer ${data.session.access_token}` };
}
