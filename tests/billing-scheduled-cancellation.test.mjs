import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isScheduledForPeriodEndCancellation } from "../app/lib/billing/stripe-projection.ts";

test("scheduled cancellation recognizes both Stripe period-end representations", () => {
  const periodEnd = 1_790_301_069;

  assert.equal(
    isScheduledForPeriodEndCancellation({ cancel_at: null, cancel_at_period_end: true }, periodEnd),
    true,
  );
  assert.equal(
    isScheduledForPeriodEndCancellation({ cancel_at: periodEnd, cancel_at_period_end: false }, periodEnd),
    true,
  );
});

test("an arbitrary cancel_at does not masquerade as period-end cancellation", () => {
  const periodEnd = 1_790_301_069;
  assert.equal(
    isScheduledForPeriodEndCancellation({ cancel_at: periodEnd - 3600, cancel_at_period_end: false }, periodEnd),
    false,
  );
  assert.equal(
    isScheduledForPeriodEndCancellation({ cancel_at: null, cancel_at_period_end: false }, periodEnd),
    false,
  );
});

test("Membership labels scheduled Plus access as ending and uses the browser timezone", () => {
  const source = readFileSync(new URL("../app/membership/page.tsx", import.meta.url), "utf8");
  assert.match(source, /usage\.cancelAtPeriodEnd\s*\?\s*"Ends"\s*:\s*"Renews"/);
  assert.doesNotMatch(source, /timeZone:\s*"UTC"/);
  assert.match(source, /Your cancellation is scheduled\. Plus remains available through/);
});
