"use client";

import Link from "next/link";
import { useState } from "react";
import { AccountSettingsShell } from "../../components/account-settings-shell";
import { accountInputClass, AccountStatus } from "../../components/account-access";
import { PrimaryButton, SecondaryButton } from "../../components/product-primitives";
import { useRequireConfirmedSupabaseAuth } from "../../lib/auth-session";
import { idempotentClientFetch } from "../../lib/security/idempotency/client";
import { downloadGeneratedFile } from "../../lib/furvise-output";
import { getBrowserSupabase } from "../../lib/supabase";

const forestButtonClass = "![--text-inverse:var(--warm-cream)] !bg-[var(--deep-forest)] hover:!bg-[var(--forest)] disabled:!bg-[var(--disabled-surface)] aria-disabled:!bg-[var(--disabled-surface)]";

export default function DataPrivacyPage() {
  const { status } = useRequireConfirmedSupabaseAuth();
  const [reauthRequired, setReauthRequired] = useState(false);
  const [exporting, setExporting] = useState<"pdf" | "account" | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function exportAccountData(format: "pdf" | "account") {
    setExporting(format);
    setError("");
    setMessage("");
    setReauthRequired(false);
    try {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const endpoint = format === "pdf" ? "/api/account/export?" + new URLSearchParams({ format: "pet-records-pdf", tz: timeZone }) : "/api/account/export";
      const response = await idempotentClientFetch(
        endpoint,
        { credentials: "same-origin", method: "POST" },
        format === "pdf" ? "pet-records-pdf:" + timeZone : "account-data-export",
      );
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setReauthRequired(body?.code === "RECENT_AUTH_REQUIRED");
        throw new Error(body?.error || "Your export could not be prepared.");
      }
      const blob = await response.blob();
      const date = new Date().toISOString().slice(0, 10);
      const suffix = blob.type === "application/gzip" ? ".json.gz" : ".json";
      downloadGeneratedFile(blob, format === "pdf" ? `furvise-pet-care-records-${date}.pdf` : `furvise-data-${date}${suffix}`);
      setMessage(format === "pdf" ? "Your pet care PDF is ready." : "Your Furvise data export is ready.");
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Your export could not be prepared.");
    } finally {
      setExporting(null);
    }
  }

  async function deleteAccount() {
    if (deleteConfirmation !== "DELETE") return setError("Type DELETE to confirm account deletion.");
    setDeleting(true);
    setError("");
    setMessage("");
    setReauthRequired(false);
    try {
      const response = await idempotentClientFetch(
        "/api/account/delete",
        {
          body: JSON.stringify({ confirmation: deleteConfirmation }),
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          method: "POST",
        },
        "account-delete",
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setReauthRequired(body?.code === "RECENT_AUTH_REQUIRED");
        throw new Error(body?.error || "Account deletion could not be completed.");
      }
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
            <h3 className="app-section-title" id="download-data-heading">DOWNLOAD YOUR DATA</h3>
            <p className="mt-3 max-w-[640px] leading-7 text-[var(--text-secondary)]">Get a readable PDF of your pet profiles and dated care entries.</p>
            <PrimaryButton className={`${forestButtonClass} mt-6 w-full sm:w-auto`} disabled={Boolean(exporting) || deleting} loading={exporting === "pdf"} onClick={() => void exportAccountData("pdf")} type="button">
              {exporting === "pdf" ? "Preparing PDF..." : "Download pet care records (PDF)"}
            </PrimaryButton>
            <p className="mt-6 text-sm text-[var(--text-secondary)]">The full account export includes Ask conversations and account activity.</p>
            <SecondaryButton className="mt-3 w-full sm:w-auto" disabled={Boolean(exporting) || deleting} onClick={() => void exportAccountData("account")} type="button">
              {exporting === "account" ? "Preparing download..." : "Download all account data (JSON)"}
            </SecondaryButton>
          </section>

          <section className="py-10" aria-labelledby="delete-account-heading">
            <h3 className="app-section-title" id="delete-account-heading">DELETE ACCOUNT</h3>
            <p className="mt-3 max-w-[640px] leading-7 text-[var(--text-secondary)]">Permanently delete your Furvise account and its data.</p>
            {!deleteOpen ? (
              <button className="mt-6 inline-flex min-h-12 items-center rounded-[var(--radius-sm)] border border-[var(--danger-text)] px-5 text-sm font-semibold text-[var(--danger-text)] hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" onClick={() => setDeleteOpen(true)} type="button">Delete account</button>
            ) : (
              <div className="mt-7 max-w-[640px] border-y border-[var(--line)] py-7" data-ui="delete-account-confirmation">
                <h3 className="text-lg font-semibold text-[var(--text-primary)]">Confirm permanent deletion</h3>
                <p className="mt-3 leading-7 text-[var(--text-secondary)]">This permanently removes your pets, care history, memories, conversations, briefs, and account identity. Sign in again first if your session is older than 15 minutes.</p>
                <label className="mt-6 block text-sm font-semibold text-[var(--text-primary)]" htmlFor="delete-confirmation">Type DELETE to confirm</label>
                <input className={`${accountInputClass} mt-2`} id="delete-confirmation" onChange={(event) => setDeleteConfirmation(event.target.value)} value={deleteConfirmation} />
                <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                  <PrimaryButton className={`${forestButtonClass} w-full sm:w-auto`} disabled={deleting || Boolean(exporting) || deleteConfirmation !== "DELETE"} loading={deleting} onClick={() => void deleteAccount()} type="button">
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
            {reauthRequired ? <Link className="inline-flex min-h-12 items-center font-semibold underline underline-offset-4" href="/login?next=%2Fsettings%2Fdata-privacy&reauth=account-data">Sign in again</Link> : null}
          </div>
        </div>
      )}
    </AccountSettingsShell>
  );
}
