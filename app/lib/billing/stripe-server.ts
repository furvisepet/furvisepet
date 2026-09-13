import "server-only";

import Stripe from "stripe";

let stripeClient: Stripe | null = null;

export function getStripeServerClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) throw new Error("STRIPE_SERVER_CONFIGURATION_MISSING");
  stripeClient ||= new Stripe(secretKey, { appInfo: { name: "Furvise", version: "1.0" } });
  return stripeClient;
}

export function getStripeWebhookSecret() {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) throw new Error("STRIPE_WEBHOOK_CONFIGURATION_MISSING");
  return secret;
}
