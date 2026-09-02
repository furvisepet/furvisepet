"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppPage } from "../components/app-page";
import { PageHeader, PrimaryButton } from "../components/product-primitives";
import { useRequireConfirmedSupabaseAuth } from "../lib/auth-session";
import type { BillingPresentation } from "../lib/billing/billing-presentation";
import type { EffectiveEntitlements } from "../lib/billing/entitlement-types";
import {
  FREE_ASK_ALLOWANCE,
  PLUS_ASK_ALLOWANCE,
  shouldManageExistingSubscription,
  type BillingSubscriptionStatus,
} from "../lib/billing/launch-plans";
import { PLAN_CAPABILITIES } from "../lib/billing/plan-limits";
import { idempotentClientFetch } from "../lib/security/idempotency/client";
import { getBrowserSupabase } from "../lib/supabase";

type AskUsage = {
  billingPlan?: "free" | "plus";
  cancelAtPeriodEnd?: boolean;
  limit: number;
  planId: "free" | "plus";
  remaining: number;
  resetAt?: string;
  subscriptionStatus?: BillingSubscriptionStatus;
};

type MembershipPayload = {
  askUsage: AskUsage;
  billingPresentation: BillingPresentation;
  entitlements: EffectiveEntitlements;
};

const forestButtonClass = "![--text-inverse:var(--warm-cream)] !bg-[var(--deep-forest)] hover:!bg-[var(--forest)] disabled:!bg-[var(--disabled-surface)] aria-disabled:!bg-[var(--disabled-surface)]";

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
      const response = await idempotentClientFetch(
        `/api/billing/${destination}`,
        { headers: await authorizationHeaders(), method: "POST" },
        `billing-${destination}`,
      );
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
  const subscriptionStatus = membership?.askUsage.subscriptionStatus;
  const billingDestination = isPlus || shouldManageExistingSubscription(subscriptionStatus) ? "portal" : "checkout";
  const confirming = checkoutState === "success" && !isPlus && !isInternalQa;

  return (
    <AppPage shell="reading">
      <Link className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--forest)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" href="/account">← Account</Link>
      <div className="mt-5">
        <PageHeader supportingText="Choose how much room you need in Furvise." title="MEMBERSHIP" />
      </div>

      {authStatus !== "signedIn" ? (
        <StatusBand>{authStatus === "loading" ? "Loading membership..." : "Redirecting to sign in..."}</StatusBand>
      ) : loading && !membership ? (
        <StatusBand>Loading your membership and Ask allowance...</StatusBand>
      ) : !membership ? (
        <StatusBand>
          <p className="font-semibold text-[var(--text-primary)]">Membership is temporarily unavailable.</p>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">{error || "Furvise could not verify your plan. Your access has not changed."}</p>
          <PrimaryButton className={`${forestButtonClass} mt-4`} loading={billingBusy === "refresh"} onClick={() => void refreshMembership()} type="button">Try again</PrimaryButton>
        </StatusBand>
      ) : (
        <div className="pb-12">
          <MembershipSummary entitlements={membership.entitlements} usage={membership.askUsage} />

          {!isInternalQa ? (
            <BillingStatusNotice
              isPlus={Boolean(isPlus)}
              loading={billingBusy === "portal"}
              onManage={() => void openBilling("portal")}
              status={subscriptionStatus}
            />
          ) : null}

          {confirming ? (
            <StatusBand>
              <h2 className="font-bold text-[var(--text-primary)]">We&apos;re confirming your Furvise Plus subscription.</h2>
              <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">Checkout is complete. Plus will appear after Stripe confirms the subscription.</p>
              <PrimaryButton className={`${forestButtonClass} mt-4 w-full sm:w-auto`} loading={billingBusy === "refresh"} onClick={() => void refreshMembership()} type="button">Refresh status</PrimaryButton>
            </StatusBand>
          ) : checkoutState === "cancelled" && !isPlus ? (
            <StatusBand>Checkout was cancelled. Your Free membership has not changed.</StatusBand>
          ) : null}

          {error ? <p className="mt-8 border-y border-[var(--danger-text)] py-4 text-sm font-semibold text-[var(--danger-text)]" role="alert">{error}</p> : null}

          <section className="mt-16 border-y border-[var(--line)]" aria-label="Furvise membership plans">
            <PlanSection
              actions={!isInternalQa && !isPlus ? <PlanState>Current plan</PlanState> : null}
              features={[`${FREE_ASK_ALLOWANCE} Ask each month`, "1 pet", "Care history"]}
              price="$0"
              title="FREE"
            />
            <PlanSection
              actions={!isInternalQa ? (
                isPlus ? (
                  <div className="flex flex-col gap-3 sm:items-end">
                    <PlanState>Current plan</PlanState>
                    <PrimaryButton className={forestButtonClass} disabled={billingBusy !== null} loading={billingBusy === "portal"} onClick={() => void openBilling("portal")} type="button">Manage billing</PrimaryButton>
                  </div>
                ) : (
                  <PrimaryButton className={forestButtonClass} disabled={billingBusy !== null} loading={billingBusy === billingDestination} onClick={() => void openBilling(billingDestination)} type="button">
                    {billingDestination === "portal" ? "Manage billing" : "Upgrade to Plus"}
                  </PrimaryButton>
                )
              ) : null}
              features={plusFeatures()}
              price={membership.billingPresentation.priceLabel}
              title="PLUS"
            />
          </section>

          {isInternalQa ? <p className="mt-6 text-sm leading-6 text-[var(--text-secondary)]">Consumer billing actions are hidden for internal testing access.</p> : null}
          <p className="mt-12 max-w-3xl border-t border-[var(--line)] pt-6 text-sm leading-6 text-[var(--text-secondary)]">Plus gives you more room to use Furvise. It does not change Furvise&apos;s safety standards.</p>
        </div>
      )}
    </AppPage>
  );
}

function BillingStatusNotice({ isPlus, loading, onManage, status }: { isPlus: boolean; loading: boolean; onManage: () => void; status?: BillingSubscriptionStatus }) {
  const message = billingStatusMessage(status, isPlus);
  if (!message) return null;
  return (
    <section className="mt-8 border-y border-[var(--border-strong)] bg-[var(--surface-supportive)] px-4 py-5" role="status">
      <h2 className="font-bold text-[var(--text-primary)]">{message.title}</h2>
      <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--text-secondary)]">{message.body}</p>
      <PrimaryButton className={`${forestButtonClass} mt-4 w-full sm:w-auto`} loading={loading} onClick={onManage} type="button">Manage billing</PrimaryButton>
    </section>
  );
}

function billingStatusMessage(status: BillingSubscriptionStatus | undefined, isPlus: boolean) {
  if (status === "past_due") {
    return isPlus
      ? { title: "Your payment needs attention.", body: "Your Plus access is temporarily still available while payment recovery is in progress. Update your payment method to keep Plus active." }
      : { title: "Your Plus payment is still overdue.", body: "Plus access is paused. Open billing to update your payment method and resolve the subscription before trying to upgrade again." };
  }
  if (status === "unpaid") return { title: "Your Plus payment could not be recovered.", body: "Plus access is paused. Open billing to update your payment method and resolve the existing subscription." };
  if (status === "incomplete") return { title: "Your Plus setup is not finished yet.", body: "There is already a subscription in progress. Open billing to finish resolving it instead of starting another checkout." };
  if (status === "paused") return { title: "Your Furvise subscription is paused.", body: "Open billing to review the existing subscription before starting another checkout." };
  return null;
}

function MembershipSummary({ entitlements, usage }: { entitlements: EffectiveEntitlements; usage: AskUsage }) {
  const internalQa = entitlements.accessRole === "internal_qa";
  const plus = entitlements.billingPlan === "plus";
  const limit = Math.max(1, usage.limit);
  const remaining = Math.min(limit, Math.max(0, usage.remaining));
  const used = Math.max(0, limit - remaining);
  const percentage = Math.min(100, Math.round((used / limit) * 100));

  if (internalQa) {
    return (
      <section className="mt-12 border-y border-[var(--line)] py-7" data-ui="internal-testing-access">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--text-secondary)]">Internal testing access</p>
        <p className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">{remaining.toLocaleString()} Ask remaining</p>
      </section>
    );
  }

  const periodVerb = plus ? (usage.cancelAtPeriodEnd ? "Ends" : "Renews") : "Resets";
  return (
    <section className="mt-12 border-y border-[var(--line)] py-8" data-ui="current-membership">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--text-secondary)]">Your plan</p>
      <div className="mt-4 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-4xl font-semibold tracking-[-0.04em] text-[var(--text-primary)] sm:text-5xl">{plus ? "FURVISE PLUS" : "FREE"}</h2>
          <p className="mt-4 text-xl text-[var(--text-primary)]">{remaining.toLocaleString()} of {limit.toLocaleString()} Ask remaining</p>
        </div>
        <p className="text-sm text-[var(--text-secondary)]">{periodVerb} {formatBillingDate(usage.resetAt)}</p>
      </div>
      <div className="mt-7 h-1 overflow-hidden bg-[var(--surface-supportive)]" role="progressbar" aria-label="Ask allowance used" aria-valuemax={limit} aria-valuemin={0} aria-valuenow={used}>
        <div className="h-full bg-[var(--forest)] transition-[width]" style={{ width: `${percentage}%` }} />
      </div>
      {usage.cancelAtPeriodEnd && plus ? <p className="mt-6 border-t border-[var(--line)] pt-5 text-sm font-semibold text-[var(--text-primary)]">Your cancellation is scheduled. Plus remains available through {formatBillingDate(usage.resetAt)}.</p> : null}
    </section>
  );
}

function PlanSection({ actions, features, price, title }: { actions?: React.ReactNode; features: string[]; price: string; title: string }) {
  return (
    <article className="grid gap-7 border-b border-[var(--line)] py-10 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_minmax(14rem,0.7fr)_auto] sm:items-start sm:py-12">
      <div>
        <h2 className="text-4xl font-semibold tracking-[-0.04em] text-[var(--text-primary)] sm:text-5xl">{title}</h2>
        <p className="mt-3 text-2xl font-medium text-[var(--text-primary)]">{price}</p>
      </div>
      <FeatureList items={features} />
      <div className="sm:justify-self-end">{actions}</div>
    </article>
  );
}

function PlanState({ children }: { children: React.ReactNode }) {
  return <p className="inline-flex min-h-11 items-center text-sm font-bold uppercase tracking-[0.08em] text-[var(--text-secondary)]">{children}</p>;
}

function FeatureList({ items }: { items: string[] }) {
  return <ul className="grid gap-3 text-base leading-7 text-[var(--text-secondary)]">{items.map((item) => <li key={item}>{item}</li>)}</ul>;
}

function plusFeatures() {
  return [
    `${PLUS_ASK_ALLOWANCE} Ask each month`,
    "Up to 10 pets",
    "Care history",
    ...(PLAN_CAPABILITIES.plus.vetPrepExports ? ["Vet Brief"] : []),
  ];
}

function StatusBand({ children }: { children: React.ReactNode }) {
  return <div className="mt-10 border-y border-[var(--line)] py-5 text-[var(--text-secondary)]" role="status">{children}</div>;
}

function formatBillingDate(value?: string) {
  if (!value) return "at the next allowance period";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "at the next allowance period";
  return new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", year: "numeric" }).format(date);
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
