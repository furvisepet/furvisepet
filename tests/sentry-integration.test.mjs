import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { buildContentSecurityPolicy } from "../app/lib/security/headers/content-security-policy.ts";
import { SENTRY_DATA_COLLECTION, SENTRY_PRIVACY_OPTIONS, getSentryTracesSampleRate } from "../app/lib/operations/sentry-privacy.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const sentryConfigs = ["instrumentation-client.ts", "sentry.server.config.ts", "sentry.edge.config.ts"];

test("Sentry demo routes are removed and no tracked configuration hard-codes a DSN", () => {
  assert.equal(existsSync(new URL("../app/api/sentry-example-api", import.meta.url)), false);
  assert.equal(existsSync(new URL("../app/sentry-example-page", import.meta.url)), false);
  const source = [...sentryConfigs, "instrumentation.ts", "next.config.ts", "app/global-error.tsx"].map(read).join("\n");
  assert.doesNotMatch(source, /https:\/\/[^@\s"']+@[^/\s"']+\/\d+/);
  assert.match(read(".env.example"), /^NEXT_PUBLIC_SENTRY_DSN=$/m);
});

test("Next.js App Router Sentry hooks and absent-DSN guards remain complete", () => {
  const instrumentation = read("instrumentation.ts");
  assert.match(instrumentation, /NEXT_RUNTIME === "nodejs"[\s\S]*import\("\.\/sentry\.server\.config"\)/);
  assert.match(instrumentation, /NEXT_RUNTIME === "edge"[\s\S]*import\("\.\/sentry\.edge\.config"\)/);
  assert.match(instrumentation, /onRequestError = Sentry\.captureRequestError/);
  assert.match(read("instrumentation-client.ts"), /onRouterTransitionStart = Sentry\.captureRouterTransitionStart/);
  for (const path of sentryConfigs) {
    const source = read(path);
    assert.match(source, /process\.env\.NEXT_PUBLIC_SENTRY_DSN\?\.trim\(\)/, path);
    assert.match(source, /if \(dsn\) \{[\s\S]*Sentry\.init/, path);
  }
  assert.match(read("next.config.ts"), /export default withSentryConfig\(nextConfig/);
});

test("production tracing is sampled at ten percent and non-production remains full", () => {
  assert.equal(getSentryTracesSampleRate("production"), 0.1);
  assert.equal(getSentryTracesSampleRate("development"), 1);
  assert.equal(getSentryTracesSampleRate("test"), 1);
  for (const path of sentryConfigs) assert.match(read(path), /tracesSampleRate: getSentryTracesSampleRate\(process\.env\.NODE_ENV\)/, path);
});

test("Sentry automatic collection, Replay, logs, breadcrumbs, attachments and sensitive event fields are disabled", () => {
  assert.deepEqual(SENTRY_DATA_COLLECTION, {
    cookies: false,
    databaseQueryData: false,
    frameContextLines: 0,
    genAI: { inputs: false, outputs: false },
    graphQL: { document: false, variables: false },
    httpBodies: [],
    httpHeaders: { request: false, response: false },
    stackFrameVariables: false,
    urlQueryParams: false,
    userInfo: false,
  });
  assert.equal(SENTRY_PRIVACY_OPTIONS.enableLogs, false);
  assert.equal(SENTRY_PRIVACY_OPTIONS.sendDefaultPii, false);
  assert.deepEqual(SENTRY_PRIVACY_OPTIONS.tracePropagationTargets, []);
  assert.equal(SENTRY_PRIVACY_OPTIONS.beforeBreadcrumb(), null);

  const hint = { attachments: [{ filename: "private.txt" }] };
  const event = SENTRY_PRIVACY_OPTIONS.beforeSend({
    breadcrumbs: [{ message: "pet medical note" }],
    contexts: { private: "context" },
    exception: { values: [{ stacktrace: { frames: [{ context_line: "private source", filename: "https://furvise.test/route.ts?token=private", vars: { password: "secret" } }] }, type: "owner@example.test", value: "owner@example.test pet medical note" }] },
    extra: { captchaToken: "private" },
    fingerprint: ["owner@example.test"],
    logentry: { message: "private pet note" },
    message: "private pet note",
    request: { cookies: { session: "private" }, data: { password: "private" }, headers: { authorization: "private" } },
    tags: { email: "owner@example.test" },
    user: { email: "owner@example.test" },
  }, hint);
  assert.equal(event.breadcrumbs, undefined);
  assert.equal(event.contexts, undefined);
  assert.equal(event.extra, undefined);
  assert.equal(event.fingerprint, undefined);
  assert.equal(event.logentry, undefined);
  assert.equal(event.message, undefined);
  assert.equal(event.request, undefined);
  assert.equal(event.tags, undefined);
  assert.equal(event.user, undefined);
  assert.deepEqual(hint.attachments, []);
  assert.equal(event.exception.values[0].value, "Unexpected application error");
  assert.equal(event.exception.values[0].type, "Error");
  assert.equal(event.exception.values[0].stacktrace.frames[0].context_line, undefined);
  assert.equal(event.exception.values[0].stacktrace.frames[0].filename, "https://furvise.test/route.ts");
  assert.equal(event.exception.values[0].stacktrace.frames[0].vars, undefined);
  assert.deepEqual(SENTRY_PRIVACY_OPTIONS.beforeSendSpan({ data: { body: "private" }, description: "private query", op: "http" }), { data: {}, description: undefined, op: "http" });

  const operational = SENTRY_PRIVACY_OPTIONS.beforeSend({
    tags: { errorCode: "WEBHOOK_PROCESSING_FAILED", email: "owner@example.test", requestId: "request-123", route: "/api/billing/webhook", severity: "critical" },
  });
  assert.deepEqual(operational.tags, { errorCode: "WEBHOOK_PROCESSING_FAILED", requestId: "request-123", route: "/api/billing/webhook", severity: "critical" });

  const source = sentryConfigs.map(read).join("\n") + read("app/lib/operations/sentry-privacy.ts");
  assert.doesNotMatch(source, /replayIntegration|replaysSessionSampleRate|replaysOnErrorSampleRate|enableLogs:\s*true/);
});

test("global error UI captures the exception without rendering sensitive error details", () => {
  const source = read("app/global-error.tsx");
  assert.match(source, /Sentry\.captureException\(error\)/);
  assert.match(source, /<html lang="en">[\s\S]*<body/);
  assert.match(source, />Something went wrong</);
  assert.match(source, /Furvise ran into an unexpected problem\. Refresh the page or try again in a moment\./);
  assert.match(source, /window\.location\.reload\(\)/);
  assert.doesNotMatch(source, /NextError|error\.message|error\.stack|error\.digest|requestId/);
});

test("CSP permits only the exact configured Sentry ingest origin and remains report-only by configuration", () => {
  const dsn = "https://public-key@o123.ingest.us.sentry.io/456";
  const policy = buildContentSecurityPolicy({ env: { NEXT_PUBLIC_SENTRY_DSN: dsn, FURVISE_CSP_MODE: "report-only" }, production: true });
  assert.match(policy, /connect-src[^;]*https:\/\/o123\.ingest\.us\.sentry\.io/);
  assert.doesNotMatch(policy, /public-key|https: \*|\.sentry\.io\/456/);
  const malformed = buildContentSecurityPolicy({ env: { NEXT_PUBLIC_SENTRY_DSN: "https://o123.ingest.us.sentry.io/456" }, production: true });
  assert.doesNotMatch(malformed, /o123\.ingest\.us\.sentry\.io/);
  assert.match(read(".env.example"), /^FURVISE_CSP_MODE=report-only$/m);
});
