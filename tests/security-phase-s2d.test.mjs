import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { buildContentSecurityPolicy, configuredOrigins, getCspHeaderName, getCspMode } from "../app/lib/security/headers/content-security-policy.ts";
import { createCspNonce, isValidCspNonce } from "../app/lib/security/headers/nonce.ts";
import {
  getAllowedApplicationOrigins,
  originRejectionResponse,
  resolveTargetOrigin,
  validateRecoveryContinuationOrigin,
  validateSensitiveRequestOrigin,
} from "../app/lib/security/headers/origin-policy.ts";
import { PERMISSIONS_POLICY, buildSecurityHeaders } from "../app/lib/security/headers/security-headers.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const headerMap = (headers) => new Map(headers.map(({ key, value }) => [key, value]));

function filesUnder(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = `${directory}/${name}`;
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

test("baseline browser security headers are centralized and production information disclosure is reduced", () => {
  const headers = headerMap(buildSecurityHeaders({ env: { FURVISE_CSP_MODE: "report-only", NODE_ENV: "production" }, production: true }));
  assert.equal(headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(headers.get("Referrer-Policy"), "strict-origin-when-cross-origin");
  assert.equal(headers.get("X-Frame-Options"), "DENY");
  for (const capability of ["camera", "microphone", "geolocation", "payment", "usb", "bluetooth", "accelerometer", "gyroscope", "magnetometer", "browsing-topics", "interest-cohort", "fullscreen", "display-capture"]) {
    assert.match(PERMISSIONS_POLICY, new RegExp(`${capability}=\\(\\)`));
  }
  assert.match(read("next.config.ts"), /poweredByHeader:\s*false/);
});

test("HSTS is production-only and deliberately omits preload", () => {
  const production = headerMap(buildSecurityHeaders({ env: { NODE_ENV: "production" }, https: true, production: true }));
  const development = headerMap(buildSecurityHeaders({ env: { NODE_ENV: "development" }, production: false }));
  assert.equal(production.get("Strict-Transport-Security"), "max-age=31536000; includeSubDomains");
  assert.equal(development.has("Strict-Transport-Security"), false);
  assert.doesNotMatch(production.get("Strict-Transport-Security"), /preload/i);
});

test("production CSP is deterministic and carries the required restrictive baseline", () => {
  const env = { NODE_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: "https://project-ref.supabase.co" };
  const left = buildContentSecurityPolicy({ env, production: true });
  const right = buildContentSecurityPolicy({ env, production: true });
  assert.equal(left, right);
  for (const directive of ["default-src 'self'", "base-uri 'self'", "object-src 'none'", "form-action 'self'", "frame-ancestors 'none'", "frame-src 'none'", "manifest-src 'self'"]) assert.match(left, new RegExp(directive.replace(/[']/g, "'")));
  assert.match(left, /connect-src 'self' https:\/\/project-ref\.supabase\.co/);
  assert.match(left, /upgrade-insecure-requests/);
});

test("production browser policy excludes OpenAI, broad network schemes, wildcards, and unsafe-eval", () => {
  const policy = buildContentSecurityPolicy({ env: { NODE_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co" }, production: true });
  assert.doesNotMatch(policy, /openai/i);
  assert.doesNotMatch(policy, /(?:^|\s)\*(?:\s|;|$)/);
  const connectSources = policy.split("; ").find((directive) => directive.startsWith("connect-src ")).split(/\s+/).slice(1);
  assert.equal(connectSources.includes("https:"), false);
  assert.equal(connectSources.includes("wss:"), false);
  assert.doesNotMatch(policy, /unsafe-eval/);
});

test("development CSP adds only local HMR WebSockets and unsafe-eval", () => {
  const policy = buildContentSecurityPolicy({ env: { NODE_ENV: "development", NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co" }, production: false });
  assert.match(policy, /ws:\/\/localhost:\*/);
  assert.match(policy, /ws:\/\/127\.0\.0\.1:\*/);
  assert.match(policy, /'unsafe-eval'/);
  assert.doesNotMatch(policy, /upgrade-insecure-requests/);
});

test("CSP modes emit exactly one selected header name", () => {
  assert.equal(getCspMode({}), "report-only");
  assert.equal(getCspHeaderName("report-only"), "Content-Security-Policy-Report-Only");
  assert.equal(getCspHeaderName("enforce"), "Content-Security-Policy");
  assert.equal(getCspHeaderName("off"), null);
  const reportOnly = headerMap(buildSecurityHeaders({ env: { FURVISE_CSP_MODE: "report-only" } }));
  const enforced = headerMap(buildSecurityHeaders({ env: { FURVISE_CSP_MODE: "enforce" } }));
  assert.equal(reportOnly.has("Content-Security-Policy-Report-Only"), true);
  assert.equal(reportOnly.has("Content-Security-Policy"), false);
  assert.equal(enforced.has("Content-Security-Policy"), true);
  assert.equal(enforced.has("Content-Security-Policy-Report-Only"), false);
});

test("CSP nonces are unpredictable and remove the temporary script unsafe-inline allowance", () => {
  const first = createCspNonce();
  const second = createCspNonce();
  assert.equal(isValidCspNonce(first), true);
  assert.notEqual(first, second);
  const policy = buildContentSecurityPolicy({ env: { NODE_ENV: "production" }, nonce: first, production: true });
  const scriptDirective = policy.split("; ").find((directive) => directive.startsWith("script-src "));
  assert.match(scriptDirective, new RegExp(`nonce-${first}`));
  assert.match(scriptDirective, /strict-dynamic/);
  assert.doesNotMatch(scriptDirective, /unsafe-inline/);
});

test("configurable CSP origins accept exact approved origins and reject malformed or broad inputs", () => {
  assert.deepEqual(configuredOrigins("https://images.example.com, https://cdn.example.com", ["https:"]), ["https://cdn.example.com", "https://images.example.com"]);
  assert.deepEqual(configuredOrigins("*,https:,https://good.example/path,https://user:pass@bad.example,https://good.example", ["https:"]), ["https://good.example"]);
  const policy = buildContentSecurityPolicy({ env: { FURVISE_CSP_REPORT_URI: "https://evil.example/report", FURVISE_ALLOWED_CONNECT_ORIGINS: "https://api.example.com/path" } });
  assert.doesNotMatch(policy, /evil\.example|api\.example/);
});

test("same-origin browser writes pass and foreign, malformed, or cross-site requests fail", () => {
  const same = new Request("https://www.furvise.com/api/pets", { method: "POST", headers: { origin: "https://www.furvise.com", "sec-fetch-site": "same-origin" } });
  assert.deepEqual(validateSensitiveRequestOrigin(same, { NODE_ENV: "production" }), { allowed: true, mode: "browser-origin" });
  for (const request of [
    new Request("https://www.furvise.com/api/pets", { method: "POST", headers: { origin: "https://evil.example" } }),
    new Request("https://www.furvise.com/api/pets", { method: "POST", headers: { origin: "https://www.furvise.com/path" } }),
    new Request("https://www.furvise.com/api/pets", { method: "POST", headers: { origin: "https://www.furvise.com", "sec-fetch-site": "cross-site" } }),
  ]) assert.equal(validateSensitiveRequestOrigin(request, { NODE_ENV: "production" }).allowed, false);
});

test("recovery continuation accepts the canonical native form headers and exact configured previews", () => {
  const productionEnv = { NODE_ENV: "production", VERCEL: "1", VERCEL_ENV: "production" };
  const production = new Request("https://www.furvise.com/api/auth/recovery/continue", { method: "POST", headers: {
    host: "www.furvise.com", origin: "https://www.furvise.com", referer: "https://www.furvise.com/reset-password/confirm",
    "sec-fetch-site": "same-origin", "x-forwarded-host": "www.furvise.com", "x-forwarded-proto": "https", "x-vercel-id": "pdx1::request",
  } });
  assert.deepEqual(validateRecoveryContinuationOrigin(production, productionEnv), { allowed: true, mode: "browser-origin" });

  const previewOrigin = "https://furvise-git-recovery-preview.vercel.app";
  const previewEnv = { ...productionEnv, VERCEL_ENV: "preview", VERCEL_URL: "furvise-git-recovery-preview.vercel.app" };
  const preview = new Request(`${previewOrigin}/api/auth/recovery/continue`, { method: "POST", headers: {
    host: "furvise-git-recovery-preview.vercel.app", origin: previewOrigin, "sec-fetch-site": "same-origin",
    "x-forwarded-host": "furvise-git-recovery-preview.vercel.app", "x-forwarded-proto": "https", "x-vercel-id": "pdx1::preview",
  } });
  assert.deepEqual(validateRecoveryContinuationOrigin(preview, previewEnv), { allowed: true, mode: "browser-origin" });
});

test("recovery continuation rejects malformed, opaque, foreign, apex, and missing browser origins", () => {
  const direct = (headers = {}) => new Request("https://www.furvise.com/api/auth/recovery/continue", {
    method: "POST", headers: { host: "www.furvise.com", "sec-fetch-site": "same-origin", ...headers },
  });
  const env = { NODE_ENV: "production" };
  assert.deepEqual(validateRecoveryContinuationOrigin(direct({ origin: "https://www.furvise.com/path" }), env), { allowed: false, reason: "malformed_origin" });
  assert.deepEqual(validateRecoveryContinuationOrigin(direct({ origin: "null" }), env), { allowed: false, reason: "malformed_origin" });
  assert.deepEqual(validateRecoveryContinuationOrigin(direct({ origin: "https://evil.example" }), env), { allowed: false, reason: "foreign_origin" });
  assert.deepEqual(validateRecoveryContinuationOrigin(direct({ origin: "https://furvise.com" }), env), { allowed: false, reason: "foreign_origin" });
  assert.deepEqual(validateRecoveryContinuationOrigin(direct(), env), { allowed: false, reason: "missing_browser_origin" });
});

test("recovery continuation's missing-Origin fallback is exact and route-scoped", () => {
  const request = (referer, extra = {}) => new Request("https://www.furvise.com/api/auth/recovery/continue", { method: "POST", headers: {
    host: "www.furvise.com", referer, "sec-fetch-site": "same-origin", ...extra,
  } });
  const env = { NODE_ENV: "production" };
  assert.deepEqual(validateRecoveryContinuationOrigin(request("https://www.furvise.com/reset-password/confirm"), env), { allowed: true, mode: "same-origin-referer" });
  assert.deepEqual(validateSensitiveRequestOrigin(request("https://www.furvise.com/reset-password/confirm"), env), { allowed: false, reason: "missing_browser_origin" });
  assert.deepEqual(validateRecoveryContinuationOrigin(request("https://www.furvise.com/account"), env), { allowed: false, reason: "malformed_referer" });
  assert.deepEqual(validateRecoveryContinuationOrigin(request("https://www.furvise.com/reset-password/confirm?token=forbidden"), env), { allowed: false, reason: "malformed_referer" });
  assert.deepEqual(validateRecoveryContinuationOrigin(request("https://evil.example/reset-password/confirm"), env), { allowed: false, reason: "foreign_referer" });
  assert.deepEqual(validateRecoveryContinuationOrigin(request("https://www.furvise.com/reset-password/confirm", { "sec-fetch-site": "cross-site" }), env), { allowed: false, reason: "cross_site_fetch" });
});

test("recovery continuation rejects spoofed or conflicting forwarding headers", () => {
  const vercelEnv = { NODE_ENV: "production", VERCEL: "1", VERCEL_ENV: "production" };
  const headers = {
    host: "www.furvise.com", origin: "https://www.furvise.com", "sec-fetch-site": "same-origin",
    "x-forwarded-host": "www.furvise.com", "x-forwarded-proto": "https", "x-vercel-id": "pdx1::request",
  };
  const make = (overrides, env = vercelEnv) => validateRecoveryContinuationOrigin(
    new Request("https://www.furvise.com/api/auth/recovery/continue", { method: "POST", headers: { ...headers, ...overrides } }),
    env,
  );
  assert.deepEqual(make({ "x-forwarded-host": "evil.example" }), { allowed: false, reason: "target_origin_mismatch" });
  assert.deepEqual(make({ "x-forwarded-host": "www.furvise.com,evil.example" }), { allowed: false, reason: "target_origin_mismatch" });
  assert.deepEqual(make({ "x-forwarded-proto": "http" }), { allowed: false, reason: "target_origin_mismatch" });
  assert.deepEqual(make({}, { NODE_ENV: "production" }), { allowed: false, reason: "target_origin_mismatch" });
});

test("origin denial diagnostics never serialize token-bearing request values", () => {
  const tokenValue = "never-log-this-recovery-token";
  const request = new Request(`https://www.furvise.com/api/auth/recovery/continue?confirmation_url=${tokenValue}`, {
    method: "POST",
    headers: { authorization: `Bearer ${tokenValue}`, cookie: `furvise-auth-session=${tokenValue}`, origin: "null", referer: `https://www.furvise.com/reset-password/confirm#${tokenValue}` },
  });
  const originalWarn = console.warn;
  const events = [];
  console.warn = (...values) => events.push(values);
  try {
    originRejectionResponse({ allowed: false, reason: "malformed_origin" }, request);
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(JSON.stringify(events).includes(tokenValue), false);
  assert.deepEqual(events[0][1], { method: "POST", reason: "malformed_origin", route: "/api/auth/recovery/continue" });
});

test("missing Origin follows the documented browser-cookie and explicit bearer policy", () => {
  const bearer = new Request("https://www.furvise.com/api/pets", { method: "POST", headers: { authorization: "Bearer server-token" } });
  assert.deepEqual(validateSensitiveRequestOrigin(bearer, { NODE_ENV: "production" }), { allowed: true, mode: "non-browser-bearer" });
  const cookie = new Request("https://www.furvise.com/api/pets", { method: "POST", headers: { cookie: "sb-project-auth-token=value" } });
  assert.deepEqual(validateSensitiveRequestOrigin(cookie, { NODE_ENV: "production" }), { allowed: false, reason: "missing_browser_origin" });
  const unauthenticated = new Request("https://www.furvise.com/api/pets", { method: "POST" });
  assert.deepEqual(validateSensitiveRequestOrigin(unauthenticated, { NODE_ENV: "production" }), { allowed: true, mode: "unauthenticated" });
});

test("untrusted forwarded hosts cannot bypass target matching and verified Vercel resolution is explicit", () => {
  const untrusted = new Request("https://www.furvise.com/api/pets", { method: "POST", headers: { origin: "https://evil.example", "x-forwarded-host": "evil.example" } });
  assert.equal(validateSensitiveRequestOrigin(untrusted, { NODE_ENV: "production" }).allowed, false);
  const preview = new Request("https://internal.invalid/api/pets", { method: "POST", headers: {
    origin: "https://furvise-preview.vercel.app", "x-forwarded-host": "furvise-preview.vercel.app", "x-forwarded-proto": "https", "x-vercel-id": "iad1::request",
  } });
  const env = { FURVISE_ALLOWED_ORIGINS: "https://furvise-preview.vercel.app", NODE_ENV: "production", VERCEL: "1" };
  assert.equal(resolveTargetOrigin(preview, env), "https://furvise-preview.vercel.app");
  assert.deepEqual(validateSensitiveRequestOrigin(preview, env), { allowed: true, mode: "browser-origin" });
});

test("only the exact current Vercel Preview origin is added from deployment metadata", () => {
  const currentOrigin = "https://furvise-git-security-preview.vercel.app";
  const env = { NODE_ENV: "production", VERCEL: "1", VERCEL_ENV: "preview", VERCEL_URL: "furvise-git-security-preview.vercel.app" };
  const current = new Request("https://internal.invalid/api/pets", { method: "POST", headers: {
    origin: currentOrigin, "x-forwarded-host": "furvise-git-security-preview.vercel.app", "x-forwarded-proto": "https", "x-vercel-id": "iad1::current",
  } });
  const unrelated = new Request("https://internal.invalid/api/pets", { method: "POST", headers: {
    origin: "https://unrelated-preview.vercel.app", "x-forwarded-host": "unrelated-preview.vercel.app", "x-forwarded-proto": "https", "x-vercel-id": "iad1::unrelated",
  } });

  assert.equal(getAllowedApplicationOrigins(current, env).has(currentOrigin), true);
  assert.equal(resolveTargetOrigin(current, env), currentOrigin);
  assert.deepEqual(validateSensitiveRequestOrigin(current, env), { allowed: true, mode: "browser-origin" });
  assert.equal(resolveTargetOrigin(unrelated, env), "https://unrelated-preview.vercel.app");
  assert.deepEqual(validateSensitiveRequestOrigin(unrelated, env), { allowed: false, reason: "foreign_origin" });
});

test("malformed or production VERCEL_URL metadata does not grant a preview origin", () => {
  const origin = "https://furvise-git-security-preview.vercel.app";
  const request = new Request("https://internal.invalid/api/pets", { method: "POST", headers: {
    origin, "x-forwarded-host": "furvise-git-security-preview.vercel.app", "x-forwarded-proto": "https", "x-vercel-id": "iad1::request",
  } });
  const production = { NODE_ENV: "production", VERCEL: "1", VERCEL_ENV: "production", VERCEL_URL: "furvise-git-security-preview.vercel.app" };

  for (const vercelUrl of ["furvise-git-security-preview.vercel.app/path", "https://furvise-git-security-preview.vercel.app", "furvise-git-security-preview.vercel.app,unrelated.vercel.app"]) {
    const malformed = { NODE_ENV: "production", VERCEL: "1", VERCEL_ENV: "preview", VERCEL_URL: vercelUrl };
    assert.equal(getAllowedApplicationOrigins(request, malformed).has(origin), false);
    assert.deepEqual(validateSensitiveRequestOrigin(request, malformed), { allowed: false, reason: "foreign_origin" });
  }
  assert.equal(getAllowedApplicationOrigins(request, production).has(origin), false);
  assert.deepEqual(validateSensitiveRequestOrigin(request, production), { allowed: false, reason: "foreign_origin" });
});

test("canonical production origin remains allowed alongside preview metadata", () => {
  const request = new Request("https://www.furvise.com/api/pets", { method: "POST", headers: { origin: "https://www.furvise.com" } });
  const env = { NODE_ENV: "production", VERCEL: "1", VERCEL_ENV: "preview", VERCEL_URL: "furvise-git-security-preview.vercel.app" };
  assert.equal(getAllowedApplicationOrigins(request, env).has("https://www.furvise.com"), true);
  assert.deepEqual(validateSensitiveRequestOrigin(request, env), { allowed: true, mode: "browser-origin" });
});

test("production never accepts arbitrary localhost while development binds to the actual local origin", () => {
  const local = new Request("http://localhost:3000/api/pets", { method: "POST", headers: { origin: "http://localhost:3000" } });
  assert.equal(validateSensitiveRequestOrigin(local, { NODE_ENV: "production" }).allowed, false);
  assert.deepEqual(validateSensitiveRequestOrigin(local, { NODE_ENV: "development" }), { allowed: true, mode: "browser-origin" });
});

test("origin checks are shared by every authenticated mutation context before application writes", () => {
  for (const helper of ["app/lib/authenticated-api-server.ts", "app/lib/ask-conversation-server.ts", "app/lib/vet-brief/server.ts"]) {
    const source = read(helper);
    assert.match(source, /validateSensitiveRequestOriginResponse/);
    assert.ok(source.indexOf("validateSensitiveRequestOriginResponse(request)") < source.lastIndexOf("return {"), helper);
  }
  for (const route of [
    "app/api/account/detect-country/route.ts", "app/api/analyze/route.ts", "app/api/ask/route.ts",
    "app/api/ask/suggestions/[id]/route.ts", "app/api/memories/[id]/route.ts", "app/api/safety-followup/route.ts",
    "app/api/shop/catalog/route.ts", "app/api/shop/explain-product-fit/route.ts",
    "app/api/shop/interpret-query/route.ts", "app/api/shop/product-question/route.ts",
  ]) assert.match(read(route), /validateSensitiveRequestOriginResponse/, route);
});

test("every current API mutation route is inventoried behind a direct or canonical origin guard", () => {
  const apiRoot = fileURLToPath(new URL("../app/api", import.meta.url)).replaceAll("\\", "/");
  const mutationRoutes = filesUnder(apiRoot)
    .filter((path) => path.endsWith("/route.ts") && /export async function (?:POST|PUT|PATCH|DELETE)/.test(readFileSync(path, "utf8")))
    .map((path) => `app/api${path.slice(apiRoot.length)}`)
    .sort();
  const direct = new Set([
    "app/api/account/detect-country/route.ts", "app/api/analyze/route.ts", "app/api/ask/route.ts",
    "app/api/ask/suggestions/[id]/route.ts", "app/api/memories/[id]/route.ts", "app/api/safety-followup/route.ts",
    "app/api/shop/catalog/route.ts", "app/api/shop/explain-product-fit/route.ts",
    "app/api/shop/interpret-query/route.ts", "app/api/shop/product-question/route.ts",
  ]);
  const authenticated = new Set([
    "app/api/account/delete/route.ts", "app/api/account/export/route.ts", "app/api/account/product-country/route.ts", "app/api/ask/actions/[messageId]/route.ts", "app/api/billing/checkout/route.ts", "app/api/billing/portal/route.ts", "app/api/care-entries/[id]/route.ts", "app/api/care-entries/route.ts",
    "app/api/legacy-memories/route.ts", "app/api/pets/[id]/route.ts", "app/api/product-feedback/route.ts",
  ]);
  const conversations = new Set([
    "app/api/ask/conversations/[id]/messages/route.ts", "app/api/ask/conversations/[id]/route.ts",
    "app/api/ask/conversations/route.ts",
  ]);
  const vetBriefs = new Set(["app/api/vet-briefs/draft/route.ts", "app/api/vet-briefs/route.ts"]);
  const petProfiles = new Set(["app/api/pets/route.ts"]);
  const publicAuth = new Set([
    "app/api/account/change-password/route.ts",
    "app/api/auth/login/route.ts", "app/api/auth/oauth/route.ts", "app/api/auth/recovery/continue/route.ts", "app/api/auth/recovery/route.ts",
    "app/api/auth/resend/route.ts", "app/api/auth/signup/route.ts", "app/api/auth/update-password/route.ts",
  ]);
  const signedWebhooks = new Set(["app/api/billing/webhook/route.ts"]);
  const inventoried = [...direct, ...authenticated, ...conversations, ...vetBriefs, ...petProfiles, ...publicAuth, ...signedWebhooks].sort();
  assert.deepEqual(mutationRoutes, inventoried);
  for (const route of direct) assert.match(read(route), /validateSensitiveRequestOriginResponse/, route);
  for (const route of authenticated) assert.match(read(route), /getAuthenticatedApiContext/, route);
  for (const route of conversations) assert.match(read(route), /getAskConversationRequestContext/, route);
  for (const route of vetBriefs) assert.match(read(route), /getVetBriefRequestContext/, route);
  for (const route of petProfiles) assert.match(read(route), /saveProfile/, route);
  for (const route of publicAuth) assert.match(read(route), /validatePublicAuthOrigin/, route);
  for (const route of signedWebhooks) {
    assert.match(read(route), /stripe-signature/, route);
    assert.match(read(route), /constructEvent\(rawBody, signature, getStripeWebhookSecret\(\)\)/, route);
  }
  assert.match(read("app/lib/pet-profile-api-server.ts"), /getAuthenticatedApiContext/);
});

test("origin denial precedes rate limiting, AI credits, provider calls, and mutation queries", () => {
  for (const path of ["app/api/ask/route.ts", "app/api/analyze/route.ts", "app/api/safety-followup/route.ts", "app/api/shop/interpret-query/route.ts"]) {
    const source = read(path);
    const validation = source.lastIndexOf("validateSensitiveRequestOriginResponse(request)");
    assert.ok(validation > -1, path);
    const routeStart = source.indexOf("export async function POST");
    const contextLoad = path === "app/api/ask/route.ts"
      ? source.indexOf("loadAskAuthenticationContext(request)", routeStart)
      : source.indexOf("RequestContext(request)", routeStart);
    const rateLimit = source.indexOf("requireRateLimitedRequest", routeStart);
    const admission = path === "app/api/ask/route.ts"
      ? source.indexOf("aiAdmission = await admitAiOperation", routeStart)
      : source.indexOf("runAdmittedAiOperation", routeStart);
    assert.ok(contextLoad > routeStart && contextLoad < rateLimit, `${path}: context before rate limit`);
    assert.ok(contextLoad < admission, `${path}: context before admission`);
  }
  const memory = read("app/api/memories/[id]/route.ts");
  assert.ok(memory.indexOf("authenticatedClient(request)") < memory.indexOf("ownedMemory"));
  assert.match(memory, /validateSensitiveRequestOriginResponse\(request\)/);
});

test("private HTML, redirects, APIs, AI errors, and Set-Cookie paths retain private no-store policy", () => {
  const privateRoutes = read("app/lib/security/private-routes.ts");
  const proxy = read("app/lib/supabase/proxy.ts");
  const nextConfig = read("next.config.ts");
  assert.match(privateRoutes, /private, no-cache, no-store, must-revalidate, max-age=0/);
  assert.match(proxy, /applyPrivateCacheHeaders\(response\.headers\)/);
  assert.match(proxy, /response\.cookies\.getAll\(\)\.length > 0/);
  assert.match(proxy, /protectCacheWhenNeeded\(response\)/);
  assert.match(proxy, /redirectToLogin/);
  assert.match(nextConfig, /source:\s*"\/api\/:path\*"/);
  assert.match(nextConfig, /private, no-cache, no-store, must-revalidate, max-age=0/);
  assert.match(read("app/lib/ai/usage-guard/errors.ts"), /PRIVATE_CACHE_HEADERS/);
  assert.match(read("app/lib/security/rate-limit/errors.ts"), /PRIVATE_CACHE_HEADERS/);
});

test("public hashed assets are not assigned private cache headers", () => {
  const config = read("next.config.ts");
  const apiCacheBlock = config.slice(config.indexOf('source: "/api/:path*"'));
  assert.doesNotMatch(apiCacheBlock, /_next\/static|_next\/image/);
  assert.doesNotMatch(config.slice(0, config.indexOf('source: "/api/:path*"')), /Cache-Control/);
});

test("custom APIs expose no permissive CORS contract or wildcard credential combination", () => {
  const routes = readFileSync(new URL("../docs/security-resource-inventory.md", import.meta.url), "utf8");
  assert.doesNotMatch(routes, /Access-Control-Allow-Origin:\s*\*/i);
  for (const path of ["app/api/ask/route.ts", "app/api/pets/route.ts", "app/api/vet-briefs/route.ts", "next.config.ts"]) {
    const source = read(path);
    assert.doesNotMatch(source, /Access-Control-Allow-Origin|Access-Control-Allow-Credentials/i);
  }
});

test("auth callback keeps internal redirects and no-store behavior under the policy", () => {
  const callback = read("app/auth/callback/route.ts");
  const routing = read("app/lib/auth-routing.ts");
  const policy = buildContentSecurityPolicy({ env: { NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co" } });
  assert.match(callback, /applyPrivateCacheHeaders/);
  assert.match(routing, /candidate\.startsWith\("\/\/"\)/);
  assert.match(routing, /parsed\.origin !== LOCAL_ORIGIN/);
  assert.match(policy, /form-action 'self'/);
  assert.match(policy, /connect-src 'self' https:\/\/project\.supabase\.co/);
});

test("server and provider details stay absent from new public security errors", () => {
  const source = read("app/lib/security/headers/origin-policy.ts");
  assert.match(source, /ORIGIN_NOT_ALLOWED/);
  assert.doesNotMatch(source, /Redis|OpenAI|Supabase|stack|file path/i);
  assert.match(source, /PRIVATE_CACHE_HEADERS/);
});
