import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const verifier = source("scripts/verify-billing-sandbox-config.mjs");
const devLauncher = source("scripts/start-billing-sandbox-dev.mjs");
const runbook = source("docs/billing-sandbox-e2e.md");
const packageJson = JSON.parse(source("package.json"));
const gitignore = source(".gitignore");

test("billing sandbox verifier fails closed against live Stripe and remote Supabase", () => {
  assert.match(verifier, /sk_test_/);
  assert.match(verifier, /rk_test_/);
  assert.doesNotMatch(verifier, /sk_live_/);
  assert.match(verifier, /BILLING_SANDBOX_STRIPE_KEY_NOT_TEST_MODE/);
  assert.match(verifier, /BILLING_SANDBOX_SUPABASE_MUST_BE_LOCAL/);
  assert.match(verifier, /LOCAL_SUPABASE_HOSTS/);
  assert.match(verifier, /localhost/);
  assert.match(verifier, /127\.0\.0\.1/);
});

test("billing sandbox verifier proves local Supabase admin authority and billing schema readiness", () => {
  assert.match(verifier, /createClient\(supabaseUrl, supabaseSecretKey/);
  assert.match(verifier, /furvise_security_compatibility_snapshot_v2/);
  assert.match(verifier, /BILLING_SANDBOX_SUPABASE_ADMIN_AUTHORITY_INVALID/);
  assert.match(verifier, /BILLING_SANDBOX_SUPABASE_SCHEMA_NOT_READY/);
  assert.match(verifier, /security_compatibility_contract_v2/);
  assert.match(verifier, /add_billing_checkout_single_flight/);
  assert.match(verifier, /align_billing_checkout_currency_authority/);
  assert.match(verifier, /add_billing_payment_recovery_grace/);
  assert.match(verifier, /Supabase admin authority: verified/);
  assert.match(verifier, /Billing schema readiness: verified/);
});

test("billing sandbox verifier checks the real launch price contract without logging secrets", () => {
  assert.match(verifier, /stripe\.prices\.retrieve/);
  assert.match(verifier, /price\.livemode === false/);
  assert.match(verifier, /price\.recurring\?\.interval === "month"/);
  assert.match(verifier, /currency_options\?\.cad/);
  assert.match(verifier, /currency_options\?\.usd/);
  assert.match(verifier, /unit_amount === 549/);
  assert.match(verifier, /product\.name === "Furvise Plus"/);
  assert.match(verifier, /WEBHOOK_SECRET_INVALID/);
  assert.doesNotMatch(verifier, /console\.(?:log|error)\([^\n]*(?:stripeSecretKey|webhookSecret|supabaseSecretKey)/);
});

test("sandbox dev launcher loads the env file without putting --env-file into Next child process flags", () => {
  assert.equal(
    packageJson.scripts["billing:sandbox:dev"],
    "npm run billing:sandbox:verify && node scripts/start-billing-sandbox-dev.mjs",
  );
  assert.match(devLauncher, /parseEnv/);
  assert.match(devLauncher, /spawn\(/);
  assert.match(devLauncher, /node_modules\/next\/dist\/bin\/next/);
  assert.match(devLauncher, /"dev", "--webpack"/);
  assert.match(devLauncher, /BILLING_SANDBOX_NODE_OPTIONS_ENV_FILE_FORBIDDEN/);
  assert.doesNotMatch(devLauncher, /spawn\([^]*--env-file/);
  assert.doesNotMatch(runbook, /node --env-file=\.env\.billing-sandbox\.local node_modules\/next\/dist\/bin\/next/);
  assert.match(runbook, /npm run billing:sandbox:dev/);
});

test("sandbox launch gate is dedicated, ignored, and covers the canonical commercial lifecycle", () => {
  assert.equal(
    packageJson.scripts["billing:sandbox:verify"],
    "node --env-file=.env.billing-sandbox.local scripts/verify-billing-sandbox-config.mjs",
  );
  assert.match(gitignore, /\.env\*/);
  assert.match(runbook, /checkout\.session\.completed/);
  assert.match(runbook, /customer\.subscription\.created/);
  assert.match(runbook, /customer\.subscription\.updated/);
  assert.match(runbook, /customer\.subscription\.deleted/);
  assert.match(runbook, /55 Ask\/month/);
  assert.match(runbook, /10 pets/);
  assert.match(runbook, /Vet Brief/);
  assert.match(runbook, /cancel_at_period_end=true/);
  assert.match(runbook, /past_due/);
  assert.match(runbook, /replayed/);
  assert.match(runbook, /ignored_stale/);
  assert.match(runbook, /Customer Portal/);
  assert.match(runbook, /4242 4242 4242 4242/);
});
