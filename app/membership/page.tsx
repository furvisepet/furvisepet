"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { AppPage } from "../components/app-page";
import { PageHeader, PrimaryButton, SecondaryButton } from "../components/product-primitives";
import { useRequireConfirmedSupabaseAuth } from "../lib/auth-session";
import type { BillingPresentation } from "../lib/billing/billing-presentation";
import type { EffectiveEntitlements } from "../lib/billing/entitlement-types";
import { FREE_ASK_ALLOWANCE, PLUS_ASK_ALLOWANCE } from "../lib/billing/launch-plans";
import { idempotentClientFetch } from "../lib/security/idempotency/client";
import { getBrowserSupabase } from "../lib/supabase";

type AskUsage = {
  billingPlan?: "free" | "plus";
  cancelAtPeriodEnd?: boolean;
  limit: number;
  planId: "free" | "plus";
  remaining: number;
  resetAt?: string;
  subscriptionStatus?: string;
};

type MembershipPayload = {
  askUsage: AskUsage;
  billingPresentation: BillingPresentation;
  entitlements: EffectiveEntitlements;
};

export default function MembershipPage() {
  const { status: authStatus } = useRequireConfirmedSupabaseAuth();
  const [membership, setMembership] = useState<MembershipPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [billingBusy, setBillingBusy] = useState<"checkout" | "portal" | "refresh" | null>(null);
  const [error, setError] = useState("");
  const [checkoutState, setCheckoutState] = useState<"cancelled" | "success" | null>(null);

  useEffect(() => {
    if (authStatus !== "signedIn") return;
    let active = true;
    async function load() {
      try {
        const payload = await fetchMembership();
        if (!active) return;
        setMembership(payload);
        setCheckoutState(readCheckoutState());
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "Membership is temporarily unavailable.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [authStatus]);

  async function openBilling(destination: "checkout" | "portal") {
    setBillingBusy(destination);
    setError("");
    try {
      const response = await idempotentClientFetch(`/api/billing/${destination}`, {
        headers: await authorizationHeaders(),
        method: "POST",
      }, `billing-${destination}`);
      const body = await response.json().catch(() => null) as { error?: string; url?: string } | null;
      if (!response.ok || !body?.url) throw new Error(body?.error || "Billing is temporarily unavailable.");
      window.location.assign(body.url);
    } catch (billingError) {
      setError(billingError instanceof Error ? billingError.message : "Billing is temporarily unavailable.");
      setBillingBusy(null);
    }
  }

  async function refreshMembership() {
    setBillingBusy("refresh");
    setError("");
    try {
      setMembership(await fetchMembership());
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Membership status could not be refreshed.");
    } finally {
      setLoading(false);
      setBillingBusy(null);
    }
  }

  const isInternalQa = membership?.entitlements.accessRole === "internal_qa";
  const isPlus = membership?.entitlements.billingPlan === "plus";
  const confirming = checkoutState === "success" && !isPlus && !isInternalQa;

  return (
    <AppPage shell="reading">
      <PageHeader
        supportingText="Choose the plan that gives you the right amount of room to ask, track, and care for your pets."
        title="Membership"
      />
      {authStatus !== "signedIn" ? (
        <StatusCard>{authStatus === "loading" ? "Loading membership..." : "Redirecting to sign in..."}</StatusCard>
      ) : loading && !membership ? (
        <StatusCard>Loading your membership and Ask allowance...</StatusCard>
      ) : !membership ? (
        <StatusCard>
          <p className="font-semibold text-[var(--text-primary)]">Membership is temporarily unavailable.</p>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">{error || "Furvise could not verify your plan. Your access has not changed."}</p>
          <PrimaryButton className="mt-4" loading={billingBusy === "refresh"} onClick={() => void refreshMembership()} type="button">Try again</PrimaryButton>
        </StatusCard>
      ) : (
        <>
          <MembershipSummary entitlements={membership.entitlements} usage={membership.askUsage} />

          {confirming ? (
            <section className="mt-6 rounded-[var(--radius-lg)] border border-[var(--border-strong)] bg-[var(--surface-supportive)] p-5 shadow-[var(--shadow-surface-1)]" role="status">
              <h2 className="font-bold text-[var(--text-primary)]">We&apos;re confirming your Furvise Plus subscription.</h2>
              <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">Checkout is complete. Plus will appear after Stripe confirms the subscription.</p>
              <PrimaryButton className="mt-4 w-full sm:w-auto" loading={billingBusy === "refresh"} onClick={() => void refreshMembership()} type="button">Refresh status</PrimaryButton>
            </section>
          ) : checkoutState === "cancelled" && !isPlus ? (
            <p className="mt-6 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-primary)] px-4 py-3 text-sm text-[var(--text-secondary)]" role="status">Checkout was cancelled. Your Free membership has not changed.</p>
          ) : null}

          {error ? <p className="mt-6 rounded-[var(--radius-md)] border border-[var(--pw-danger-border)] bg-[var(--danger-surface)] px-4 py-3 text-sm font-semibold text-[var(--danger-text)]" role="alert">{error}</p> : null}

          <section className="mt-10 grid gap-5 lg:grid-cols-2" aria-label="Furvise membership plans">
            <PlanCard
              current={!isInternalQa && !isPlus}
              image="/images/paywall_free.png"
              imageAlt="A Furvise pup waiting under a small rain cloud"
              title="Free"
            >
              <p className="text-2xl font-bold tracking-[-0.025em] text-[var(--text-primary)]">8 Ask per month</p>
              <FeatureList items={["One pet", "Care history and tracking", "Curated product browsing"]} />
              {!isInternalQa && !isPlus ? <SecondaryButton className="mt-auto w-full" disabled type="button">Current plan</SecondaryButton> : null}
            </PlanCard>

            <PlanCard
              accent
              current={!isInternalQa && isPlus}
              image="/images/paywall_paid.png"
              imageAlt="A happy Furvise pup waving among warm sparkles"
              title="Furvise Plus"
            >
              <div>
                <p className="text-2xl font-bold tracking-[-0.025em] text-[var(--text-primary)]">{membership.billingPresentation.priceLabel}</p>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">Monthly billing only · Cancel anytime</p>
              </div>
              <FeatureList items={[
                "55 thoughtful Ask messages every month",
                "Up to 10 pets",
                "Live product research",
                "Longer-history pattern detection",
                "Vet prep exports",
                "Premium product functionality",
              ]} />
              {!isInternalQa ? (
                <PrimaryButton
                  className="mt-auto w-full"
                  disabled={billingBusy !== null}
                  loading={billingBusy === (isPlus ? "portal" : "checkout")}
                  onClick={() => void openBilling(isPlus ? "portal" : "checkout")}
                  type="button"
                >
                  {isPlus ? "Manage billing" : "Upgrade to Furvise Plus"}
                </PrimaryButton>
              ) : (
                <p className="mt-auto rounded-[var(--radius-md)] bg-[var(--surface-supportive)] px-4 py-3 text-sm font-semibold text-[var(--text-primary)]">Consumer billing actions are hidden for internal testing access.</p>
              )}
            </PlanCard>
          </section>

          <Comparison />
          <p className="mb-12 mt-6 text-center text-sm leading-6 text-[var(--text-secondary)]">Free and Plus use the same Furvise reasoning and safety standards. Plus adds room and product capabilities, not a different quality of care guidance.</p>
        </>
      )}
    </AppPage>
  );
}

function MembershipSummary({ entitlements, usage }: { entitlements: EffectiveEntitlements; usage: AskUsage }) {
  const internalQa = entitlements.accessRole === "internal_qa";
  const plus = entitlements.billingPlan === "plus";
  const limit = Math.max(1, usage.limit);
  const remaining = Math.min(limit, Math.max(0, usage.remaining));
  const used = Math.max(0, limit - remaining);
  const percentage = Math.min(100, Math.round((used / limit) * 100));
  const planName = internalQa ? "Internal testing access" : plus ? "Furvise Plus" : "Furvise Free";
  return (
    <section className="mt-8 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-primary)] p-6 shadow-[var(--shadow-surface-1)] sm:p-7">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">Current membership</p>
          <h2 className="mt-2 text-2xl font-bold tracking-[-0.025em] text-[var(--text-primary)]">{planName}</h2>
          <p className="mt-2 text-[var(--text-secondary)]">{limit.toLocaleString()} Ask per month</p>
        </div>
        <div className="sm:text-right">
          <p className="text-3xl font-bold text-[var(--deep-forest)]">{remaining.toLocaleString()}</p>
          <p className="text-sm text-[var(--text-secondary)]">Ask remaining</p>
        </div>
      </div>
      <div className="mt-6 h-2.5 overflow-hidden rounded-full bg-[var(--surface-supportive)]" role="progressbar" aria-label="Ask allowance used" aria-valuemax={limit} aria-valuemin={0} aria-valuenow={used}>
        <div className="h-full rounded-full bg-[var(--action-primary)] transition-[width]" style={{ width: `${percentage}%` }} />
      </div>
      <div className="mt-3 flex flex-wrap justify-between gap-2 text-sm text-[var(--text-secondary)]">
        <span>{used.toLocaleString()} used</span>
        <span>{plus && !internalQa ? "Renews" : "Resets"} {formatBillingDate(usage.resetAt)}</span>
      </div>
      {usage.cancelAtPeriodEnd && plus ? <p className="mt-5 rounded-[var(--radius-md)] bg-[var(--surface-supportive)] px-4 py-3 text-sm font-semibold text-[var(--text-primary)]">Your cancellation is scheduled. Plus remains available through {formatBillingDate(usage.resetAt)}.</p> : null}
      {internalQa ? <p className="mt-5 text-sm leading-6 text-[var(--text-secondary)]">Expanded testing access remains separate from consumer billing and does not create a Plus subscription.</p> : null}
    </section>
  );
}

function PlanCard({ accent = false, children, current, image, imageAlt, title }: { accent?: boolean; children: React.ReactNode; current: boolean; image: string; imageAlt: string; title: string }) {
  return (
    <article className={`flex min-h-full flex-col overflow-hidden rounded-[var(--radius-lg)] border bg-[var(--surface-primary)] shadow-[var(--shadow-surface-1)] ${accent ? "border-[var(--action-primary)]" : "border-[var(--border-subtle)]"}`}>
      <div className={`relative flex h-52 items-center justify-center overflow-hidden ${accent ? "bg-[var(--surface-supportive)]" : "bg-[var(--surface-secondary)]"}`}>
        <Image alt={imageAlt} className="h-48 w-48 object-contain" height={1280} sizes="192px" src={image} width={1280} />
      </div>
      <div className="flex flex-1 flex-col gap-5 p-6 sm:p-7">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-2xl font-bold tracking-[-0.025em] text-[var(--text-primary)]">{title}</h2>
          {current ? <span className="rounded-full bg-[var(--surface-supportive)] px-3 py-1 text-xs font-bold text-[var(--deep-forest)]">Current plan</span> : null}
        </div>
        {children}
      </div>
    </article>
  );
}

function FeatureList({ items }: { items: string[] }) {
  return <ul className="grid gap-3 text-sm leading-6 text-[var(--text-secondary)]">{items.map((item) => <li className="flex gap-2" key={item}><span aria-hidden="true" className="font-bold text-[var(--deep-forest)]">✓</span><span>{item}</span></li>)}</ul>;
}

function Comparison() {
  const rows = [
    ["Ask allowance", `${FREE_ASK_ALLOWANCE} / month`, `${PLUS_ASK_ALLOWANCE} / month`],
    ["Pets", "1", "Up to 10"],
    ["Live product research", "Not included", "Included"],
    ["Longer-history patterns", "Not included", "Included"],
    ["Vet prep exports", "Not included", "Included"],
    ["Premium product functionality", "Not included", "Included"],
  ];
  return (
    <section className="mt-12 pb-4">
      <h2 className="text-2xl font-bold tracking-[-0.025em] text-[var(--text-primary)]">Compare plans</h2>
      <div className="mt-5 overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-primary)] shadow-[var(--shadow-surface-1)]">
        <table className="w-full min-w-[620px] border-collapse text-left text-sm">
          <thead><tr className="border-b border-[var(--border-subtle)]"><th className="p-4 font-semibold text-[var(--text-secondary)]">Feature</th><th className="p-4 text-base font-bold text-[var(--text-primary)]">Free</th><th className="p-4 text-base font-bold text-[var(--text-primary)]">Furvise Plus</th></tr></thead>
          <tbody>{rows.map(([feature, free, plus]) => <tr className="border-b border-[var(--border-subtle)] last:border-0" key={feature}><th className="p-4 font-semibold text-[var(--text-primary)]">{feature}</th><td className="p-4 text-[var(--text-secondary)]">{free}</td><td className="p-4 font-semibold text-[var(--deep-forest)]">{plus}</td></tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}

function StatusCard({ children }: { children: React.ReactNode }) {
  return <div className="mt-8 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-primary)] p-5 text-[var(--text-secondary)] shadow-[var(--shadow-surface-1)]" role="status">{children}</div>;
}

function formatBillingDate(value?: string) {
  if (!value) return "at the next allowance period";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "at the next allowance period";
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "long", timeZone: "UTC", year: "numeric" }).format(date);
}

function readCheckoutState() {
  const value = new URLSearchParams(window.location.search).get("checkout");
  return value === "success" || value === "cancelled" ? value : null;
}

function isMembershipPayload(value: unknown): value is MembershipPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<MembershipPayload>;
  return Boolean(payload.askUsage && payload.entitlements && payload.billingPresentation?.priceLabel);
}

async function fetchMembership() {
  const response = await fetch("/api/account/entitlements", {
    cache: "no-store",
    headers: await authorizationHeaders(),
  });
  const payload = await response.json().catch(() => null) as MembershipPayload | { error?: string } | null;
  if (!response.ok || !isMembershipPayload(payload)) {
    throw new Error(payload && "error" in payload ? payload.error || "Furvise could not verify membership." : "Furvise could not verify membership.");
  }
  return payload;
}

async function authorizationHeaders() {
  const client = getBrowserSupabase();
  const { data } = await client?.auth.getSession() || { data: { session: null } };
  if (!data.session?.access_token) throw new Error("Sign in again to continue.");
  return { Authorization: `Bearer ${data.session.access_token}` };
}
