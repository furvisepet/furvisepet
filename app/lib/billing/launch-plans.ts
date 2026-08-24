import { FREE_ASK_ALLOWANCE, PLUS_ASK_ALLOWANCE, type PlanId } from "./plan-limits.ts";

export { FREE_ASK_ALLOWANCE, PLUS_ASK_ALLOWANCE };

export type BillingSubscriptionStatus =
  | "none"
  | "incomplete"
  | "incomplete_expired"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "paused";

const TERMINAL_STRIPE_SUBSCRIPTION_STATUSES = new Set<string>(["canceled", "incomplete_expired"]);

export function isTerminalStripeSubscriptionStatus(status: string | null | undefined) {
  return Boolean(status && TERMINAL_STRIPE_SUBSCRIPTION_STATUSES.has(status));
}

export function shouldManageExistingSubscription(status: string | null | undefined) {
  return Boolean(status && status !== "none" && !isTerminalStripeSubscriptionStatus(status));
}

export function getAskAllowance(plan: PlanId) {
  return plan === "plus" ? PLUS_ASK_ALLOWANCE : FREE_ASK_ALLOWANCE;
}

export function getPlusPriceId(env: Record<string, string | undefined>) {
  const priceId = env.STRIPE_PLUS_PRICE_ID?.trim() || "";
  if (!isStripePriceId(priceId)) throw new Error("STRIPE_PRICE_CONFIGURATION_MISSING");
  return priceId;
}

export function recognizePlusPriceId(
  priceId: string | null | undefined,
  env: Record<string, string | undefined>,
): boolean {
  const candidate = priceId?.trim() || "";
  const configured = env.STRIPE_PLUS_PRICE_ID?.trim() || "";
  return isStripePriceId(candidate) && isStripePriceId(configured) && candidate === configured;
}

export function resolvesToPlus({
  periodEnd,
  periodStart,
  priceRecognized,
  status,
}: {
  periodEnd: Date | null;
  periodStart: Date | null;
  priceRecognized: boolean;
  status: BillingSubscriptionStatus;
}) {
  return Boolean(
    priceRecognized
      && status === "active"
      && periodStart
      && periodEnd
      && Number.isFinite(periodStart.getTime())
      && Number.isFinite(periodEnd.getTime())
      && periodEnd > periodStart,
  );
}

function isStripePriceId(value: string) {
  return /^price_[A-Za-z0-9]+$/.test(value);
}
