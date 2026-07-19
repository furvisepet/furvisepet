"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AppPage } from "../components/app-page";
import { getAccountCountrySourceLabel } from "../lib/account-country";
import { useRequireConfirmedSupabaseAuth } from "../lib/auth-session";
import {
  detectAccountProductCountry,
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

  useEffect(() => {
    if (authStatus !== "signedIn" || !authUser) return;
    let active = true;
    async function loadAccount() {
      try {
        const user = authUser;
        if (!user) return;
        if (!active) return;
        setEmail(user.email || "");

        const row = await loadUserProfileForUser(user);
        const detectedRow = row?.country ? row : await detectAccountProductCountry();
        if (!active) return;
        setProfile(detectedRow);
        setSelectedCountry(detectedRow?.country || "CA");
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

  return (
    <AppPage>
      <header>
        <h1 className="text-4xl font-semibold tracking-tight text-[var(--pw-heading)]">Account</h1>
        <p className="mt-3 text-[var(--pw-muted)]">Your signed-in Furvise account.</p>
      </header>
      {authStatus !== "signedIn" ? (
        <Status text={authStatus === "loading" ? "Loading account..." : "Redirecting to sign in..."} />
      ) : (
      <>
      <section className="mt-8 max-w-2xl overflow-hidden rounded-3xl border border-[var(--pw-border)] bg-[var(--pw-surface)] p-6">
        <h2 className="text-lg font-semibold text-[var(--pw-heading)]">Email</h2>
        <p className="mt-2 text-[var(--pw-muted)]">{email || (loading ? "Loading..." : "Not signed in")}</p>
      </section>
      <section className="mt-6 max-w-2xl overflow-hidden rounded-3xl border border-[var(--pw-border)] bg-[var(--pw-surface)] p-6">
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
          <button
            className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[var(--pw-primary)] px-5 text-sm font-semibold text-white transition hover:bg-[var(--pw-primary-hover)] disabled:cursor-wait disabled:opacity-70 sm:w-auto"
            disabled={loading || saving}
            type="submit"
          >
            {saving ? "Saving..." : "Save product country"}
          </button>
          {message ? <p className="mt-3 text-sm font-semibold text-[var(--pw-primary)]">{message}</p> : null}
          {error ? <p className="mt-3 text-sm font-semibold text-[var(--pw-danger-text)]">{error}</p> : null}
        </form>
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
