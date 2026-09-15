import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import test from "node:test";
import { requestErrorEvent } from "../app/lib/operations/request-error-event.ts";
import { buildContentSecurityPolicy } from "../app/lib/security/headers/content-security-policy.ts";
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("framework failures retain correlation while excluding URL secrets and raw error content", () => {
  assert.deepEqual(requestErrorEvent("/pets/[id]?token=secret#private", "qa-id", "2026-09-15T00:00:00Z"), {
    eventType: "application_error", feature: "app", severity: "high", errorCode: "UNHANDLED_REQUEST_ERROR",
    route: "/pets/[id]", requestId: "qa-id", timestamp: "2026-09-15T00:00:00Z", metadata: {},
  });
  const hook = read("instrumentation.ts");
  assert.match(hook, /await writeDashboardEvent\(event\)/);
  assert.doesNotMatch(hook, /_error\.|_request\./);
  assert.match(read("app/global-error.tsx"), /kind: "browser_error"/);
  assert.match(read("app/lib/operations/events/logger.ts"), /persistDashboardEvent\(event\)/);
});

test("Sentry is absent from runtime, dependency and build configuration", () => {
  for (const path of ["package.json", "package-lock.json", "next.config.ts", "instrumentation.ts", "app/global-error.tsx", "app/lib/operations/events/logger.ts", "app/lib/operations/production-config.ts", ".env.example"]) {
    assert.doesNotMatch(read(path), /sentry/i, path);
  }
  for (const path of ["instrumentation-client.ts", "sentry.server.config.ts", "sentry.edge.config.ts"]) assert.equal(existsSync(new URL(`../${path}`, import.meta.url)), false);
  assert.doesNotMatch(buildContentSecurityPolicy({ env: { NEXT_PUBLIC_SENTRY_DSN: "https://public@o123.ingest.sentry.io/1" }, production: true }), /sentry/);
});
