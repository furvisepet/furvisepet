"use client";

import { AccountSettingsShell } from "../components/account-settings-shell";
import { useRequireConfirmedSupabaseAuth } from "../lib/auth-session";

export default function AccountPage() {
  const { status, user } = useRequireConfirmedSupabaseAuth();

  return (
    <AccountSettingsShell title="ACCOUNT DETAILS">
      {status !== "signedIn" ? (
        <p className="mt-8 border-y border-[var(--line)] py-5 text-[var(--text-secondary)]" role="status">
          {status === "loading" ? "Loading account details..." : "Redirecting to sign in..."}
        </p>
      ) : (
        <section className="mt-10" aria-labelledby="account-email-heading">
          <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--text-secondary)]" id="account-email-heading">Email address</h3>
          <p className="mt-3 break-words text-xl font-medium text-[var(--text-primary)]">{user?.email || "Email unavailable"}</p>
        </section>
      )}
    </AccountSettingsShell>
  );
}
