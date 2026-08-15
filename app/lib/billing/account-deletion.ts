import type Stripe from "stripe";
import type { BillingAccountRow } from "./billing-admin";
import { stripeObjectId } from "./stripe-projection.ts";

const TERMINAL_SUBSCRIPTION_STATUSES = new Set<Stripe.Subscription.Status>(["canceled", "incomplete_expired"]);

type StripeDeletionClient = {
  subscriptions: {
    cancel(id: string, params?: Stripe.SubscriptionCancelParams, options?: Stripe.RequestOptions): Promise<Stripe.Response<Stripe.Subscription>>;
    list(params: Stripe.SubscriptionListParams): Promise<Stripe.ApiList<Stripe.Subscription>>;
  };
};

export type TerminatedBillingSubscription = {
  status: "canceled" | "incomplete_expired";
  subscriptionId: string;
};

export async function terminateStripeBillingForAccountDeletion({
  account,
  idempotencyKey,
  stripe,
  userId,
}: {
  account: BillingAccountRow | null;
  idempotencyKey: string;
  stripe: StripeDeletionClient;
  userId: string;
}) {
  if (!account) return { customerId: null, subscriptions: [] as TerminatedBillingSubscription[] };
  if (account.user_id !== userId) throw new AccountDeletionBillingError("BILLING_ACCOUNT_OWNER_MISMATCH");

  const before = await listAllCustomerSubscriptions(stripe, account.stripe_customer_id);
  validateSubscriptions({ account, subscriptions: before, userId });
  const terminal = new Map<string, TerminatedBillingSubscription>();

  for (const subscription of before) {
    const finalSubscription = isTerminalSubscriptionStatus(subscription.status)
      ? subscription
      : await stripe.subscriptions.cancel(subscription.id, {}, {
        idempotencyKey: `furvise_account_delete_${userId}_${subscription.id}`,
      });
    validateSubscriptionOwner({ account, subscription: finalSubscription, userId });
    if (!isTerminalSubscriptionStatus(finalSubscription.status)) {
      throw new AccountDeletionBillingError("STRIPE_SUBSCRIPTION_NOT_TERMINAL");
    }
    terminal.set(finalSubscription.id, {
      status: finalSubscription.status,
      subscriptionId: finalSubscription.id,
    });
  }

  const verified = await listAllCustomerSubscriptions(stripe, account.stripe_customer_id);
  validateSubscriptions({ account, subscriptions: verified, userId });
  if (verified.some((subscription) => !isTerminalSubscriptionStatus(subscription.status))) {
    throw new AccountDeletionBillingError("STRIPE_SUBSCRIPTION_STILL_BILLABLE");
  }
  for (const subscription of verified) {
    terminal.set(subscription.id, { status: subscription.status as TerminatedBillingSubscription["status"], subscriptionId: subscription.id });
  }
  if (account.stripe_subscription_id && !terminal.has(account.stripe_subscription_id)) {
    throw new AccountDeletionBillingError("PROJECTED_SUBSCRIPTION_NOT_VERIFIED");
  }

  return {
    customerId: account.stripe_customer_id,
    idempotencyKey,
    subscriptions: [...terminal.values()].sort((left, right) => left.subscriptionId.localeCompare(right.subscriptionId)),
  };
}

export function isTerminalSubscriptionStatus(status: string): status is TerminatedBillingSubscription["status"] {
  return TERMINAL_SUBSCRIPTION_STATUSES.has(status as Stripe.Subscription.Status);
}

async function listAllCustomerSubscriptions(stripe: StripeDeletionClient, customerId: string) {
  const subscriptions: Stripe.Subscription[] = [];
  let startingAfter: string | undefined;
  do {
    const page = await stripe.subscriptions.list({ customer: customerId, limit: 100, starting_after: startingAfter, status: "all" });
    subscriptions.push(...page.data);
    startingAfter = page.has_more ? page.data.at(-1)?.id : undefined;
    if (page.has_more && !startingAfter) throw new AccountDeletionBillingError("STRIPE_SUBSCRIPTION_LIST_INCOMPLETE");
  } while (startingAfter);
  return subscriptions;
}

function validateSubscriptions({ account, subscriptions, userId }: { account: BillingAccountRow; subscriptions: Stripe.Subscription[]; userId: string }) {
  for (const subscription of subscriptions) validateSubscriptionOwner({ account, subscription, userId });
}

function validateSubscriptionOwner({ account, subscription, userId }: { account: BillingAccountRow; subscription: Stripe.Subscription; userId: string }) {
  if (stripeObjectId(subscription.customer) !== account.stripe_customer_id) {
    throw new AccountDeletionBillingError("STRIPE_CUSTOMER_ASSOCIATION_INVALID");
  }
  if (subscription.metadata.furvise_user_id !== userId) {
    throw new AccountDeletionBillingError("STRIPE_SUBSCRIPTION_USER_ASSOCIATION_INVALID");
  }
}

export class AccountDeletionBillingError extends Error {
  code: string;

  constructor(code: string) {
    super(code);
    this.code = code;
    this.name = "AccountDeletionBillingError";
  }
}
