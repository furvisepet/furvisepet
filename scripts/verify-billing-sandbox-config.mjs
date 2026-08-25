import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

const PRODUCTION_SUPABASE_HOST_SUFFIX = ".supabase.co";
const LOCAL_SUPABASE_HOSTS = new Set(["127.0.0.1", "localhost", "host.docker.internal"]);
const REQUIRED_BILLING_MIGRATIONS = [
  "security_compatibility_contract_v2",
  "add_billing_checkout_single_flight",
  "align_billing_checkout_currency_authority",
  "add_billing_payment_recovery_grace",
];

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`BILLING_SANDBOX_CONFIG_MISSING:${name}`);
  return value;
}

function assert(condition, code) {
  if (!condition) throw new Error(code);
}

function safeHost(value, code) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    throw new Error(code);
  }
}

async function main() {
  const stripeSecretKey = required("STRIPE_SECRET_KEY");
  const webhookSecret = required("STRIPE_WEBHOOK_SECRET");
  const priceId = required("STRIPE_PLUS_PRICE_ID");
  const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
  const supabaseSecretKey = required("SUPABASE_SECRET_KEY");
  const displayMarket = required("FURVISE_BILLING_DISPLAY_MARKET").toUpperCase();

  assert(/^sk_test_[A-Za-z0-9_]+$/.test(stripeSecretKey) || /^rk_test_[A-Za-z0-9_]+$/.test(stripeSecretKey), "BILLING_SANDBOX_STRIPE_KEY_NOT_TEST_MODE");
  assert(/^whsec_[A-Za-z0-9_]+$/.test(webhookSecret), "BILLING_SANDBOX_WEBHOOK_SECRET_INVALID");
  assert(/^price_[A-Za-z0-9]+$/.test(priceId), "BILLING_SANDBOX_PRICE_ID_INVALID");
  assert(supabaseSecretKey.length >= 20, "BILLING_SANDBOX_SUPABASE_SECRET_INVALID");
  assert(displayMarket === "CA" || displayMarket === "US", "BILLING_SANDBOX_MARKET_INVALID");

  const supabaseHost = safeHost(supabaseUrl, "BILLING_SANDBOX_SUPABASE_URL_INVALID");
  assert(LOCAL_SUPABASE_HOSTS.has(supabaseHost), "BILLING_SANDBOX_SUPABASE_MUST_BE_LOCAL");
  assert(!supabaseHost.endsWith(PRODUCTION_SUPABASE_HOST_SUFFIX), "BILLING_SANDBOX_PRODUCTION_SUPABASE_FORBIDDEN");

  const supabase = createClient(supabaseUrl, supabaseSecretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: compatibilityData, error: compatibilityError } = await supabase.rpc(
    "furvise_security_compatibility_snapshot_v2",
    { p_required_migration_names: REQUIRED_BILLING_MIGRATIONS },
  );
  assert(!compatibilityError, "BILLING_SANDBOX_SUPABASE_ADMIN_AUTHORITY_INVALID");
  const compatibility = Array.isArray(compatibilityData) ? compatibilityData[0] : compatibilityData;
  assert(
    compatibility?.contract_version === 2
      && Array.isArray(compatibility.failed_checks)
      && compatibility.failed_checks.length === 0,
    "BILLING_SANDBOX_SUPABASE_SCHEMA_NOT_READY",
  );

  const stripe = new Stripe(stripeSecretKey, { appInfo: { name: "Furvise Billing Sandbox Gate", version: "1.0" } });
  const price = await stripe.prices.retrieve(priceId, { expand: ["currency_options", "product"] });

  assert(price.livemode === false, "BILLING_SANDBOX_PRICE_IS_LIVE");
  assert(price.active === true, "BILLING_SANDBOX_PRICE_INACTIVE");
  assert(price.type === "recurring", "BILLING_SANDBOX_PRICE_NOT_RECURRING");
  assert(price.recurring?.interval === "month" && price.recurring.interval_count === 1, "BILLING_SANDBOX_PRICE_NOT_MONTHLY");

  const cad = price.currency_options?.cad;
  const usd = price.currency_options?.usd;
  assert(cad?.unit_amount === 549, "BILLING_SANDBOX_CAD_PRICE_NOT_549");
  assert(usd?.unit_amount === 549, "BILLING_SANDBOX_USD_PRICE_NOT_549");

  const product = typeof price.product === "string" ? await stripe.products.retrieve(price.product) : price.product;
  assert(product && !product.deleted, "BILLING_SANDBOX_PRODUCT_MISSING");
  assert(product.livemode === false, "BILLING_SANDBOX_PRODUCT_IS_LIVE");
  assert(product.active === true, "BILLING_SANDBOX_PRODUCT_INACTIVE");
  assert(product.name === "Furvise Plus", "BILLING_SANDBOX_PRODUCT_NAME_MISMATCH");

  console.log("PASS billing sandbox configuration");
  console.log(`- Stripe mode: test`);
  console.log(`- Plus price: ${price.id}`);
  console.log(`- CAD: 5.49/month`);
  console.log(`- USD: 5.49/month`);
  console.log(`- Billing display market: ${displayMarket}`);
  console.log(`- Supabase: local (${supabaseHost})`);
  console.log("- Supabase admin authority: verified");
  console.log("- Billing schema readiness: verified");
  console.log("- Webhook signing secret: configured");
}

main().catch((error) => {
  const code = error instanceof Error ? error.message : "BILLING_SANDBOX_VERIFICATION_FAILED";
  console.error(`FAIL ${code}`);
  process.exitCode = 1;
});
