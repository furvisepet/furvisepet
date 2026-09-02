"use client";

import { useState } from "react";
import { AccountSettingsShell } from "../../components/account-settings-shell";
import { accountInputClass, AccountStatus } from "../../components/account-access";
import { PrimaryButton, SecondaryButton } from "../../components/product-primitives";
import { useRequireConfirmedSupabaseAuth } from "../../lib/auth-session";
import { idempotentClientFetch } from "../../lib/security/idempotency/client";
import { getBrowserSupabase } from "../../lib/supabase";

const forestButtonClass = "![--text-inverse:var(--warm-cream)] !bg-[var(--deep-forest)] hover:!bg-[var(--forest)] disabled:!bg-[var(--disabled-surface)] aria-disabled:!bg-[var(--disabled-surface)]";

export default function DataPrivacyPage() {
  const { status } = useRequireConfirmedSupabaseAuth();
  const [exporting, setExporting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

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

  function closeDeleteConfirmation() {
    setDeleteOpen(false);
    setDeleteConfirmation("");
    setError("");
  }

  return (
    <AccountSettingsShell description="Manage the information stored in your Furvise account." title="DATA & PRIVACY">
      {status !== "signedIn" ? (
        <p className="mt-8 border-y border-[var(--line)] py-5 text-[var(--text-secondary)]" role="status">
          {status === "loading" ? "Loading data controls..." : "Redirecting to sign in..."}
        </p>
      ) : (
        <div className="pb-6">
          <section className="border-b border-[var(--line)] py-10" aria-labelledby="download-data-heading">
            <h2 className="text-xl font-semibold text-[var(--text-primary)]" id="download-data-heading">DOWNLOAD YOUR DATA</h2>
            <p className="mt-3 max-w-[640px] leading-7 text-[var(--text-secondary)]">Get a copy of the information stored in your Furvise account.</p>
            <PrimaryButton className={`${forestButtonClass} mt-6 w-full sm:w-auto`} disabled={exporting || deleting} loading={exporting} onClick={() => void exportAccountData()} type="button">
              {exporting ? "Preparing download..." : "Download data"}
            </PrimaryButton>
          </section>

          <section className="py-10" aria-labelledby="delete-account-heading">
            <h2 className="text-xl font-semibold text-[var(--text-primary)]" id="delete-account-heading">DELETE ACCOUNT</h2>
            <p className="mt-3 max-w-[640px] leading-7 text-[var(--text-secondary)]">Permanently delete your Furvise account and its data.</p>
            {!deleteOpen ? (
              <button className="mt-6 inline-flex min-h-12 items-center rounded-full border border-[var(--danger-text)] px-5 text-sm font-semibold text-[var(--danger-text)] hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" onClick={() => setDeleteOpen(true)} type="button">Delete account</button>
            ) : (
              <div className="mt-7 max-w-[640px] border-y border-[var(--line)] py-7" data-ui="delete-account-confirmation">
                <h3 className="text-lg font-semibold text-[var(--text-primary)]">Confirm permanent deletion</h3>
                <p className="mt-3 leading-7 text-[var(--text-secondary)]">This permanently removes your pets, care history, memories, conversations, briefs, and account identity. Sign in again first if your session is older than 15 minutes.</p>
                <label className="mt-6 block text-sm font-semibold text-[var(--text-primary)]" htmlFor="delete-confirmation">Type DELETE to confirm</label>
                <input className={`${accountInputClass} mt-2`} id="delete-confirmation" onChange={(event) => setDeleteConfirmation(event.target.value)} value={deleteConfirmation} />
                <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                  <PrimaryButton className={`${forestButtonClass} w-full sm:w-auto`} disabled={deleting || exporting || deleteConfirmation !== "DELETE"} loading={deleting} onClick={() => void deleteAccount()} type="button">
                    {deleting ? "Deleting account..." : "Permanently delete account"}
                  </PrimaryButton>
                  <SecondaryButton className="w-full sm:w-auto" disabled={deleting} onClick={closeDeleteConfirmation} type="button">Cancel</SecondaryButton>
                </div>
              </div>
            )}
          </section>

          <div aria-live="polite" className="space-y-3">
            {message ? <AccountStatus text={message} /> : null}
            {error ? <AccountStatus text={error} tone="danger" /> : null}
          </div>
        </div>
      )}
    </AccountSettingsShell>
  );
}

async function authorizationHeaders() {
  const client = getBrowserSupabase();
  const { data } = await client?.auth.getSession() || { data: { session: null } };
  if (!data.session?.access_token) throw new Error("Sign in again to continue.");
  return { Authorization: `Bearer ${data.session.access_token}` };
}
