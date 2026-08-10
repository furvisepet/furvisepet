"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AppPage } from "../components/app-page";
import { accountInputClass } from "../components/account-access";
import { PageHeader, PrimaryButton, TextAction } from "../components/product-primitives";
import { getAccountCountrySourceLabel } from "../lib/account-country";
import { idempotentClientFetch } from "../lib/security/idempotency/client";
import { GOOGLE_AUTH_ENABLED, buildOAuthCallbackUrl, getConnectedAuthProviders } from "../lib/auth-identity";
import { useRequireConfirmedSupabaseAuth } from "../lib/auth-session";
import {
  detectAccountProductCountry,
  getBrowserSupabase,
  getCurrentUser,
  loadUserProfileForUser,
  updateUserProductCountryForUser,
  type UserProfileRow,
} from "../lib/supabase";

export default function AccountPage() {
  const { status: authStatus, user: authUser } = useRequireConfirmedSupabaseAuth();
  const [email, setEmail] = useState("");
  const [profile, setProfile] = useState<UserProfileRow | null>(null);
  const [selectedCountry, setSelectedCountry] = useState("CA");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [connectedProviders, setConnectedProviders] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [entitlements, setEntitlements] = useState<{
    accessRole: "consumer" | "internal_qa";
    billingPlan: "free" | "plus";
    effectivePlan: "free" | "plus";
  } | null>(null);

  useEffect(() => {
    if (authStatus !== "signedIn" || !authUser) return;
    let active = true;
    async function loadAccount() {
      try {
        const user = authUser;
        if (!user) return;
        if (!active) return;
        setEmail(user.email || "");
        setConnectedProviders(getConnectedAuthProviders(user));

        const row = await loadUserProfileForUser(user);
        const detectedRow = row?.country ? row : await detectAccountProductCountry();
        if (!active) return;
        setProfile(detectedRow);
        setSelectedCountry(detectedRow?.country || "CA");
        const entitlementResponse = await fetch("/api/account/entitlements", { headers: await authorizationHeaders() });
        const entitlementPayload = await entitlementResponse.json().catch(() => null) as { entitlements?: typeof entitlements } | null;
        if (!entitlementResponse.ok || !entitlementPayload?.entitlements) throw new Error("Furvise could not verify account access.");
        setEntitlements(entitlementPayload.entitlements);
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Furvise could not load account settings.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadAccount();
    return () => {
      active = false;
    };
  }, [authStatus, authUser]);

  const sourceLabel = useMemo(
    () => getAccountCountrySourceLabel(profile?.country_source),
    [profile?.country_source],
  );

  async function saveProductCountry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");

    try {
      const user = await getCurrentUser();
      if (!user) throw new Error("Please sign in again before saving account settings.");
      const updated = await updateUserProductCountryForUser(selectedCountry, user);
      setProfile(updated);
      setSelectedCountry(updated?.country || selectedCountry);
      setMessage("Product country saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Furvise could not save account settings.");
    } finally {
      setSaving(false);
    }
  }

  async function connectGoogle() {
    const client = getBrowserSupabase();
    if (!client) return setError("Furvise could not open that sign-in method.");
    setError(""); setMessage("");
    const redirectTo = buildOAuthCallbackUrl(window.location.origin, "/account");
    const { error: linkError } = await client.auth.linkIdentity({ provider: "google", options: { redirectTo } });
    if (linkError) setError("Furvise could not connect Google. Sign in with your existing method and try again.");
  }

  async function authorizationHeaders() {
    const client = getBrowserSupabase();
    const { data } = await client?.auth.getSession() || { data: { session: null } };
    if (!data.session?.access_token) throw new Error("Sign in again to continue.");
    return { Authorization: `Bearer ${data.session.access_token}` };
  }

  async function exportAccountData() {
    setExporting(true); setError(""); setMessage("");
    try {
      const response = await idempotentClientFetch("/api/account/export", { headers: await authorizationHeaders(), method: "POST" }, "account-data-export");
      if (!response.ok) { const body = await response.json().catch(() => null); throw new Error(body?.error || "Your export could not be prepared."); }
      const blob = await response.blob(); const link = document.createElement("a");
      link.href = URL.createObjectURL(blob); link.download = `furvise-data-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(link.href);
      setMessage("Your Furvise data export is ready.");
    } catch (exportError) { setError(exportError instanceof Error ? exportError.message : "Your export could not be prepared."); }
    finally { setExporting(false); }
  }

  async function deleteAccount() {
    if (deleteConfirmation !== "DELETE") return setError("Type DELETE to confirm account deletion.");
    setDeleting(true); setError(""); setMessage("");
    try {
      const response = await idempotentClientFetch("/api/account/delete", { body: JSON.stringify({ confirmation: deleteConfirmation }), headers: { ...(await authorizationHeaders()), "Content-Type": "application/json" }, method: "POST" }, "account-delete");
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Account deletion could not be completed.");
      await getBrowserSupabase()?.auth.signOut().catch(() => null);
      window.location.replace("/login");
    } catch (deleteError) { setError(deleteError instanceof Error ? deleteError.message : "Account deletion could not be completed."); }
    finally { setDeleting(false); }
  }

  return (
    <AppPage shell="reading">
      <PageHeader supportingText="Your signed-in Furvise account." title="Account" />
      {authStatus !== "signedIn" ? (
        <Status text={authStatus === "loading" ? "Loading account..." : "Redirecting to sign in..."} />
      ) : (
      <>
      <section className="mt-8 max-w-2xl overflow-hidden rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface-primary)] p-6 shadow-[var(--shadow-surface-1)]">
        <h2 className="text-lg font-semibold text-[var(--pw-heading)]">Email</h2>
        <p className="mt-2 text-[var(--pw-muted)]">{email || (loading ? "Loading..." : "Not signed in")}</p>
      </section>
      <section className="mt-6 max-w-2xl overflow-hidden rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-6">
        <form onSubmit={saveProductCountry}>
          <div>
            <h2 className="text-lg font-semibold text-[var(--pw-heading)]">Product country</h2>
            <p className="mt-2 leading-7 text-[var(--pw-muted)]">
              Used to show region-relevant product suggestions. You can change this anytime.
            </p>
            {sourceLabel ? (
              <p className="mt-2 text-sm font-semibold text-[var(--pw-subtle)]">{sourceLabel}</p>
            ) : null}
          </div>
          <label className="mt-5 block text-sm font-semibold text-[var(--pw-text)]" htmlFor="product-country">
            Country
          </label>
          <select
            className="mt-2 w-full rounded-2xl border border-[var(--pw-border-strong)] bg-[var(--pw-input)] px-4 py-3 text-base font-semibold text-[var(--pw-text)] outline-none transition focus:border-[var(--pw-primary)] focus:bg-[var(--pw-surface-elevated)] focus-visible:ring-2 focus-visible:ring-[var(--pw-primary)]"
            disabled={loading || saving}
            id="product-country"
            name="product-country"
            onChange={(event) => setSelectedCountry(event.target.value)}
            value={selectedCountry}
          >
            <option value="CA">Canada</option>
            <option value="US">United States</option>
          </select>
          <PrimaryButton
            className="mt-5 w-full sm:w-auto"
            disabled={loading || saving}
            loading={saving}
            type="submit"
          >
            {saving ? "Saving..." : "Save product country"}
          </PrimaryButton>
          {message ? <p className="mt-3 text-sm font-semibold text-[var(--pw-primary)]">{message}</p> : null}
          {error ? <p className="mt-3 text-sm font-semibold text-[var(--pw-danger-text)]">{error}</p> : null}
        </form>
      </section>
      {GOOGLE_AUTH_ENABLED ? <section className="mt-6 max-w-2xl overflow-hidden rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface-primary)] p-6">
        <h2 className="text-lg font-semibold text-[var(--pw-heading)]">Connected sign-in methods</h2>
        <p className="mt-2 leading-7 text-[var(--pw-muted)]">Connect a provider only after signing in to this Furvise account. Furvise never merges accounts from an unverified email.</p>
        <PrimaryButton className="mt-4 w-full sm:w-auto" disabled={connectedProviders.includes("google")} onClick={() => void connectGoogle()} type="button">{connectedProviders.includes("google") ? "Google connected" : "Connect Google"}</PrimaryButton>
      </section> : null}
      <section className="mt-6 max-w-2xl overflow-hidden rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface-primary)] p-6" id="plans">
        <h2 className="text-lg font-semibold text-[var(--pw-heading)]">Plan</h2>
        <p className="mt-2 font-semibold text-[var(--pw-text)]">
          {entitlements?.accessRole === "internal_qa" ? "Internal testing access" : entitlements?.billingPlan === "plus" ? "Furvise Plus" : "Free plan"}
        </p>
        <p className="mt-2 leading-7 text-[var(--pw-muted)]">
          {entitlements?.accessRole === "internal_qa"
            ? "Paid feature entitlements and expanded testing quotas are enabled without changing billing."
            : entitlements?.billingPlan === "plus"
              ? "Your paid feature entitlements are active."
              : "Furvise Plus is not available yet. No checkout is started from this page."}
        </p>
      </section>
      <section className="mt-6 max-w-2xl overflow-hidden rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface-primary)] p-6">
        <h2 className="text-lg font-semibold text-[var(--pw-heading)]">Security</h2>
        <p className="mt-2 leading-7 text-[var(--pw-muted)]">Change your sign-in password or use the verified reset-email option if you have forgotten it.</p>
        <TextAction className="mt-3" href="/settings/security">Open security settings</TextAction>
      </section>
      <section className="mt-6 max-w-2xl overflow-hidden rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface-primary)] p-6">
        <h2 className="text-lg font-semibold text-[var(--pw-heading)]">Your Furvise data</h2>
        <p className="mt-2 leading-7 text-[var(--pw-muted)]">Download a private JSON copy of your current Furvise account data. Large accounts require a support-assisted export.</p>
        <PrimaryButton className="mt-4 w-full sm:w-auto" disabled={exporting || deleting} loading={exporting} onClick={() => void exportAccountData()} type="button">{exporting ? "Preparing export..." : "Download my data"}</PrimaryButton>
      </section>
      <section className="mt-6 max-w-2xl overflow-hidden rounded-3xl border border-[var(--pw-danger-border)] bg-[var(--surface-primary)] p-6">
        <h2 className="text-lg font-semibold text-[var(--pw-heading)]">Delete account</h2>
        <p className="mt-2 leading-7 text-[var(--pw-muted)]">This permanently removes your Furvise pets, care history, memories, conversations, briefs, and account identity. Sign in again first if your session is older than 15 minutes.</p>
        <label className="mt-4 block text-sm font-semibold text-[var(--pw-text)]" htmlFor="delete-confirmation">Type DELETE to confirm</label>
        <input className={`${accountInputClass} mt-2`} id="delete-confirmation" onChange={(event) => setDeleteConfirmation(event.target.value)} value={deleteConfirmation} />
        <PrimaryButton className="mt-4 w-full sm:w-auto" disabled={deleting || exporting || deleteConfirmation !== "DELETE"} loading={deleting} onClick={() => void deleteAccount()} type="button">{deleting ? "Deleting account..." : "Permanently delete account"}</PrimaryButton>
      </section>
      </>
      )}
    </AppPage>
  );
}

function Status({ text }: { text: string }) {
  return (
    <div className="mt-8 rounded-3xl border border-[var(--pw-border)] bg-[var(--pw-surface)] p-5 text-[var(--pw-muted)]" role="status">
      {text}
    </div>
  );
}
