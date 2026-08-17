import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import Stripe from "stripe";
import { REQUIRED_CORE_MIGRATION, requiredSchemaIsReady } from "../app/lib/operations/readiness.ts";
import { readBoundedRawBody, RawBodyTooLargeError, STRIPE_WEBHOOK_BODY_LIMIT } from "../app/lib/security/bounded-raw-body.ts";
const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
test("readiness accepts the real tombstone schema and fails closed for a missing required column", () => {
  const route = source("app/api/readiness/route.ts");
  assert.match(route, /billing_deletion_tombstones"\)\.select\("user_id,stripe_customer_id,stripe_subscription_id,deletion_idempotency_key"\)/);
  assert.doesNotMatch(route, /billing_deletion_tombstones"\)\.select\([^\n]*operation_id/);
  assert.equal(requiredSchemaIsReady({ billingAccountsError: null, deletionTombstonesError: null, latestMigration: REQUIRED_CORE_MIGRATION }), true);
  assert.equal(requiredSchemaIsReady({ billingAccountsError: null, deletionTombstonesError: new Error("missing"), latestMigration: REQUIRED_CORE_MIGRATION }), false);
  assert.equal(requiredSchemaIsReady({ billingAccountsError: null, deletionTombstonesError: null, latestMigration: "20260815075551" }), false);
});
test("readiness exposes only component states and ignores deferred Product infrastructure", () => {
  const route = source("app/api/readiness/route.ts");
  assert.match(route, /billing_deletion_tombstones/);
  assert.doesNotMatch(route, /catalog|product_ingestion|impact/i);
  assert.doesNotMatch(route, /config\.missing|process\.env\[[^\]]+\].*Response/);
});
test("missing Sentry is an operational warning and cannot fail core readiness", () => {
  const config = source("app/lib/operations/production-config.ts");
  const requiredLoop = config.slice(config.indexOf("for (const name of ["), config.indexOf("]) {", config.indexOf("for (const name of [")));
  assert.doesNotMatch(requiredLoop, /NEXT_PUBLIC_SENTRY_DSN/);
  assert.match(config, /if \(!env\.NEXT_PUBLIC_SENTRY_DSN\?\.trim\(\)\) warnings\.push\("SENTRY_DSN_MISSING"\)/);
  assert.match(source("app/api/readiness/route.ts"), /configuration: config\.ready \? "ready" : "misconfigured"/);
});
test("bounded raw body preserves normal bytes and rejects declared or streamed oversize bodies", async () => {
  const payload = new TextEncoder().encode('{"id":"evt_test"}');
  assert.deepEqual(await readBoundedRawBody(new Request("https://furvise.test", { body: payload, method: "POST" }), STRIPE_WEBHOOK_BODY_LIMIT), payload);
  await assert.rejects(
    readBoundedRawBody(new Request("https://furvise.test", { body: "small", headers: { "content-length": String(STRIPE_WEBHOOK_BODY_LIMIT + 1) }, method: "POST" }), STRIPE_WEBHOOK_BODY_LIMIT),
    (error) => error instanceof RawBodyTooLargeError,
  );
  await assert.rejects(
    readBoundedRawBody(new Request("https://furvise.test", { body: new Uint8Array(9), method: "POST" }), 8),
    (error) => error instanceof RawBodyTooLargeError,
  );
});
test("webhook verifies the bounded raw body before processing and never parses JSON first", () => {
  const route = source("app/api/billing/webhook/route.ts");
  const read = route.indexOf("readBoundedRawBody");
  const verify = route.indexOf("constructEvent(rawBody");
  const projection = route.indexOf("subscriptionForEvent(event)");
  assert.ok(read > -1 && read < verify && verify < projection);
  assert.match(route, /Invalid webhook signature/);
  assert.doesNotMatch(route, /request\.json\(/);
});
test("normal Stripe signatures verify and invalid signatures fail against the unchanged raw bytes", () => {
  const payload = JSON.stringify({ id: "evt_launch_hardening", object: "event", type: "customer.subscription.updated" });
  const secret = "whsec_launch_hardening_test";
  const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret });
  const stripe = new Stripe("sk_test_launch_hardening");
  assert.equal(stripe.webhooks.constructEvent(payload, signature, secret).id, "evt_launch_hardening");
  assert.throws(() => stripe.webhooks.constructEvent(payload, signature, "whsec_wrong"), /signature/i);
});
test("critical operational failures are durable with safe correlation tags", () => {
  const logger = source("app/lib/operations/events/logger.ts");
  const webhook = source("app/api/billing/webhook/route.ts");
  const ask = source("app/api/ask/route.ts");
  assert.match(logger, /Sentry\.captureException/);
  assert.match(logger, /DURABLE_FAILURE_EVENT_TYPES/);
  assert.doesNotMatch(logger.slice(logger.indexOf("DURABLE_FAILURE_EVENT_TYPES"), logger.indexOf("export const durableOperationalLogger")), /started|completed/);
  for (const field of ["errorCode", "eventType", "operationId", "requestId", "route"]) assert.match(logger, new RegExp(`${field}: captureTag\\(event\\.${field}\\)`));
  assert.match(logger, /severity: event\.severity/);
  assert.match(webhook, /emitOperationalEvent\([\s\S]*operationId: event\.id[\s\S]*severity: "critical"/);
  assert.match(ask, /eventType: "provider_failure"[\s\S]*route: "\/api\/ask", severity: "high"/);
  assert.match(ask, /persistence\|reconciliation\|credit_/);
});
test("Products is a no-request Coming Soon presentation while retaining the route shell", () => {
  const page = source("app/shop/page.tsx");
  assert.match(page, /<AppPage layout="focused" shell="wide">/);
  assert.match(page, /products_mobile\.png/);
  assert.match(page, /products_desktop\.png/);
  assert.match(page, /data-ui="products-coming-soon-hero"/);
  assert.match(page, /Products coming soon/);
  assert.match(
    page,
    /fixed inset-x-0 bottom-0 top-\[4\.25rem\]/
  );
  assert.match(
    page,
    /lg:top-\[4\.25rem\]/
  );
  assert.match(
    page,
    /overflow-hidden/
  );
  assert.match(page, /getImageProps\([\s\S]*products_mobile\.png/);
  assert.match(page, /getImageProps\([\s\S]*products_desktop\.png/);
  assert.match(
    page,
    /<picture className="absolute inset-0">[\s\S]*media="\(min-width: 1024px\)"[\s\S]*srcSet=\{desktopImage\.srcSet\}[\s\S]*\{\.\.\.mobileImage\}[\s\S]*<\/picture>/
  );
  assert.doesNotMatch(page, /comingsoon_bg\.jpg/);
  assert.doesNotMatch(page, /products_mobile\.jpg/);
  assert.doesNotMatch(
    page,
    /fetch\(|\/api\/shop|useEffect|search|waitlist|release date|<form|<button/i
  );
});