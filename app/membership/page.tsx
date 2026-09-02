"use client";

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
const creamButtonClass = "![--text-inverse:var(--deep-forest)] !bg-[var(--warm-cream)] hover:!bg-[var(--surface-overlay)] disabled:!bg-[color-mix(in_srgb,var(--warm-cream)_35%,transparent)] disabled:![--text-inverse:var(--warm-cream)]";

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
      <PageHeader supportingText="Choose the plan that fits how much Furvise you use." title="MEMBERSHIP" />

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
      ) : isInternalQa ? (
        <InternalAccessCard usage={membership.askUsage} />
      ) : (
        <div className="pb-14">
          <BillingStatusNotice
            cancelAtPeriodEnd={membership.askUsage.cancelAtPeriodEnd}
            isPlus={Boolean(isPlus)}
            loading={billingBusy === "portal"}
            onManage={() => void openBilling("portal")}
            resetAt={membership.askUsage.resetAt}
            status={subscriptionStatus}
          />

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

          <section className="mt-12 grid gap-6 lg:grid-cols-2" aria-label="Furvise membership plans" data-ui="membership-plan-cards">
            <PlanCard
              current={!isPlus}
              features={[`${FREE_ASK_ALLOWANCE} Ask each month`, "1 pet", "Care history"]}
              price="$0"
              usage={!isPlus ? membership.askUsage : undefined}
              value="A simple way to start with Furvise."
            />
            <PlanCard
              action={isPlus ? (
                <PrimaryButton className={`${creamButtonClass} w-full`} disabled={billingBusy !== null} loading={billingBusy === "portal"} onClick={() => void openBilling("portal")} type="button">Manage billing</PrimaryButton>
              ) : (
                <PrimaryButton className={`${creamButtonClass} w-full`} disabled={billingBusy !== null} loading={billingBusy === billingDestination} onClick={() => void openBilling(billingDestination)} type="button">
                  {billingDestination === "portal" ? "Manage billing" : "Upgrade to Plus"}
                </PrimaryButton>
              )}
              current={Boolean(isPlus)}
              features={plusFeatures()}
              premium
              price={membership.billingPresentation.priceLabel}
              usage={isPlus ? membership.askUsage : undefined}
              value="More room for the pets you care for."
            />
          </section>

          <p className="mt-10 max-w-3xl text-sm leading-6 text-[var(--text-secondary)]">Plus gives you more room to use Furvise. It does not change Furvise&apos;s safety standards.</p>
        </div>
      )}
    </AppPage>
  );
}

function PlanCard({
  action,
  current,
  features,
  premium = false,
  price,
  usage,
  value,
}: {
  action?: React.ReactNode;
  current: boolean;
  features: string[];
  premium?: boolean;
  price: string;
  usage?: AskUsage;
  value: string;
}) {
  const title = premium ? "PLUS" : "FREE";
  return (
    <article className={`flex min-h-[34rem] flex-col rounded-[var(--radius-lg)] border p-7 sm:p-9 ${premium ? "border-[var(--deep-forest)] bg-[var(--deep-forest)] text-[var(--warm-cream)]" : "border-[var(--border-strong)] bg-[var(--surface-overlay)] text-[var(--text-primary)]"}`} data-current-plan={current || undefined} data-plan={title.toLowerCase()}>
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-3xl font-semibold tracking-[-0.035em]">{title}</h2>
        {current && premium ? <span className="rounded-full border border-[color-mix(in_srgb,var(--warm-cream)_45%,transparent)] px-3 py-1 text-xs font-bold uppercase tracking-[0.08em]">Current plan</span> : null}
      </div>
      <p className="mt-7 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">{price}</p>
      <p className={`mt-4 min-h-14 leading-7 ${premium ? "text-[color-mix(in_srgb,var(--warm-cream)_78%,transparent)]" : "text-[var(--text-secondary)]"}`}>{value}</p>

      {usage ? <UsageSummary premium={premium} usage={usage} /> : null}

      <ul className={`mt-8 grid gap-3 border-t pt-7 text-sm leading-6 ${premium ? "border-[color-mix(in_srgb,var(--warm-cream)_25%,transparent)]" : "border-[var(--line)] text-[var(--text-secondary)]"}`}>
        {features.map((feature) => <li className="flex gap-3" key={feature}><span aria-hidden="true">✓</span><span>{feature}</span></li>)}
      </ul>

      <div className="mt-auto pt-9">
        {current && !premium ? <button className="min-h-12 w-full rounded-full border border-[var(--border-strong)] bg-[var(--surface-supportive)] px-5 text-sm font-semibold text-[var(--text-secondary)]" disabled type="button">Current plan</button> : action}
      </div>
    </article>
  );
}

function UsageSummary({ premium, usage }: { premium: boolean; usage: AskUsage }) {
  const limit = Math.max(1, usage.limit);
  const remaining = Math.min(limit, Math.max(0, usage.remaining));
  const periodVerb = premium ? (usage.cancelAtPeriodEnd ? "Ends" : "Renews") : "Resets";
  return (
    <div className={`mt-6 border-y py-5 ${premium ? "border-[color-mix(in_srgb,var(--warm-cream)_25%,transparent)]" : "border-[var(--line)]"}`} data-ui="current-plan-usage">
      <p className="font-semibold">{remaining.toLocaleString()} of {limit.toLocaleString()} Ask remaining</p>
      <p className={`mt-1 text-sm ${premium ? "text-[color-mix(in_srgb,var(--warm-cream)_72%,transparent)]" : "text-[var(--text-secondary)]"}`}>{periodVerb} {formatBillingDate(usage.resetAt)}</p>
    </div>
  );
}

function InternalAccessCard({ usage }: { usage: AskUsage }) {
  return (
    <section className="mt-12 max-w-2xl rounded-[var(--radius-lg)] border border-[var(--border-strong)] bg-[var(--surface-overlay)] p-8 sm:p-10" data-ui="internal-testing-access">
      <h2 className="text-2xl font-semibold tracking-[-0.025em] text-[var(--text-primary)]">INTERNAL TESTING ACCESS</h2>
      <p className="mt-7 text-3xl font-semibold text-[var(--text-primary)]">{Math.max(0, usage.remaining).toLocaleString()} Ask remaining</p>
      <p className="mt-4 leading-7 text-[var(--text-secondary)]">Testing access is separate from consumer billing.</p>
    </section>
  );
}

function BillingStatusNotice({ cancelAtPeriodEnd, isPlus, loading, onManage, resetAt, status }: { cancelAtPeriodEnd?: boolean; isPlus: boolean; loading: boolean; onManage: () => void; resetAt?: string; status?: BillingSubscriptionStatus }) {
  const message = billingStatusMessage(status, isPlus, cancelAtPeriodEnd, resetAt);
  if (!message) return null;
  return (
    <section className="mt-8 border-y border-[var(--border-strong)] bg-[var(--surface-supportive)] px-4 py-5" role="status">
      <h2 className="font-bold text-[var(--text-primary)]">{message.title}</h2>
      <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--text-secondary)]">{message.body}</p>
      {message.manage ? <PrimaryButton className={`${forestButtonClass} mt-4 w-full sm:w-auto`} loading={loading} onClick={onManage} type="button">Manage billing</PrimaryButton> : null}
    </section>
  );
}

function billingStatusMessage(status: BillingSubscriptionStatus | undefined, isPlus: boolean, cancelAtPeriodEnd?: boolean, resetAt?: string) {
  if (status === "past_due") {
    return isPlus
      ? { title: "Your payment needs attention.", body: "Your Plus access is temporarily still available while payment recovery is in progress. Update your payment method to keep Plus active.", manage: true }
      : { title: "Your Plus payment is still overdue.", body: "Plus access is paused. Open billing to update your payment method and resolve the subscription before trying to upgrade again.", manage: true };
  }
  if (status === "unpaid") return { title: "Your Plus payment could not be recovered.", body: "Plus access is paused. Open billing to update your payment method and resolve the existing subscription.", manage: true };
  if (status === "incomplete") return { title: "Your Plus setup is not finished yet.", body: "There is already a subscription in progress. Open billing to finish resolving it instead of starting another checkout.", manage: true };
  if (status === "paused") return { title: "Your Furvise subscription is paused.", body: "Open billing to review the existing subscription before starting another checkout.", manage: true };
  if (cancelAtPeriodEnd && isPlus) return { title: "Your cancellation is scheduled.", body: `Plus remains available through ${formatBillingDate(resetAt)}.`, manage: false };
  return null;
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
