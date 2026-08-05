import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { MemoryAuthAbuseTestStore } from "../app/lib/security/auth-abuse/memory-test-store.ts";
import {
  buildRecoveryVerificationUrl,
  claimRecoveryContinuationInStore,
} from "../app/lib/security/auth-abuse/recovery-confirmation.mjs";
import { parseRecoveryFormBody, parseRecoveryFragment } from "../app/lib/security/auth-abuse/recovery-fragment.mjs";
import { createRecoveryContinuationIdentity } from "../app/lib/security/auth-abuse/recovery-secrets.mjs";
import { SENTRY_DATA_COLLECTION, SENTRY_PRIVACY_OPTIONS } from "../app/lib/operations/sentry-privacy.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const appOrigin = "https://www.furvise.com";
const supabaseOrigin = "https://project-ref.supabase.co";
const token = "a".repeat(64);
const handoffId = "b".repeat(64);
const secret = "scanner-resistant-recovery-test-secret-longer-than-32-characters";

function confirmationUrl(overrides = {}) {
  const url = new URL("/auth/v1/verify", overrides.origin || supabaseOrigin);
  url.searchParams.set("token", overrides.token || token);
  url.searchParams.set("type", overrides.type || "recovery");
  url.searchParams.set("redirect_to", overrides.redirectTo || `${appOrigin}/auth/callback?flow=recovery`);
  if (overrides.extra) url.searchParams.set("next", overrides.extra);
  return url.toString();
}

function recoveryFragment(overrides = {}) {
  const parameters = new URLSearchParams();
  parameters.set("token_hash", overrides.tokenHash || token);
  parameters.set("type", overrides.type || "recovery");
  if (overrides.extra) parameters.append(overrides.extra[0], overrides.extra[1]);
  return `#${parameters}`;
}

test("the initial email-link page and HEAD rendering cannot consume recovery", () => {
  const page = read("app/reset-password/confirm/page.tsx");
  const layout = read("app/reset-password/confirm/layout.tsx");
  const action = read("app/api/auth/recovery/continue/route.ts");
  assert.doesNotMatch(page + layout, /exchangeCodeForSession|verifyOtp|auth\/v1\/verify|fetch\(|location\.(?:assign|replace)|router\.(?:push|replace)/);
  assert.match(page, /useEffect/);
  assert.match(page, /<form action="\/api\/auth\/recovery\/continue"[\s\S]*method="post"/);
  assert.doesNotMatch(page, /<Link[^>]+api\/auth\/recovery\/continue|prefetch={true}/);
  assert.match(action, /export function HEAD\(\)[\s\S]*status: 405/);
  assert.match(action, /export function GET\(\)[\s\S]*methodNotAllowed/);
  assert.ok(action.indexOf("export async function POST") < action.indexOf("claimRecoveryContinuationToken(parsed.tokenHash)"));
  assert.equal(action.match(/claimRecoveryContinuationToken\(parsed\.tokenHash\)/g)?.length, 1);
  assert.equal(action.match(/privateRedirect\(parsed\.url\)/g)?.length, 1);
  assert.doesNotMatch(action, /fetch\(|verifyOtp|exchangeCodeForSession/);
});

test("the canonical host owns the generated form action and apex requests redirect before rendering", () => {
  const page = read("app/reset-password/confirm/page.tsx");
  const config = read("next.config.ts");
  assert.match(page, /<form action="\/api\/auth\/recovery\/continue"[\s\S]*method="post"/);
  assert.match(config, /has: \[\{ type: "host", value: "furvise\.com" \}\][\s\S]*destination: "https:\/\/www\.furvise\.com\/:path\*"[\s\S]*permanent: true/);
  assert.doesNotMatch(config, /destination: "https:\/\/furvise\.com/);
});

test("scanner GETs and client rendering retain the token only in memory until an explicit POST", () => {
  const page = read("app/reset-password/confirm/page.tsx");
  assert.match(page, /const fragment = window\.location\.hash/);
  assert.match(page, /window\.history\.replaceState/);
  assert.match(page, /setTokenHash\(recovery\.tokenHash\)/);
  assert.doesNotMatch(page, /localStorage|sessionStorage|document\.cookie|automatically|onSubmit|requestSubmit/);
  const documentation = read("docs/supabase-auth-production-checklist.md");
  assert.match(documentation, /#token_hash={{ \.TokenHash }}&amp;type=recovery/);
  assert.doesNotMatch(documentation, /confirmation_url={{ \.ConfirmationURL }}/);
  assert.doesNotMatch(documentation, /href="{{ \.ConfirmationURL }}"/);
});

test("realistic nested ConfirmationURL data survives the browser fragment but is ambiguous as an outer parameter", () => {
  const realistic = confirmationUrl({
    redirectTo: `${appOrigin}/auth/callback?flow=recovery&source=email%2Breset`,
  });
  assert.match(realistic, /token=/);
  assert.match(realistic, /&type=recovery&redirect_to=/);
  assert.match(realistic, /%3Fflow%3Drecovery%26source%3Demail%252Breset/);

  const browserUrl = new URL(`${appOrigin}/reset-password/confirm#confirmation_url=${realistic}`);
  assert.equal(browserUrl.hash.slice("#confirmation_url=".length), realistic);
  assert.notEqual(new URLSearchParams(browserUrl.hash.slice(1)).get("confirmation_url"), realistic);
  assert.equal(browserUrl.search, "");
});

test("discrete recovery fragment fields round-trip without a nested URL", () => {
  const parsed = parseRecoveryFragment(recoveryFragment());
  assert.deepEqual(parsed, { ok: true, tokenHash: token, type: "recovery" });
  const encoded = new URL(`${appOrigin}/reset-password/confirm${recoveryFragment()}`);
  assert.equal(encoded.search, "");
  assert.equal(parseRecoveryFragment(encoded.hash).tokenHash, token);
});

test("only one configured Supabase recovery verification URL is reconstructed", () => {
  const parsed = buildRecoveryVerificationUrl({ tokenHash: token, type: "recovery" }, supabaseOrigin, appOrigin, handoffId);
  assert.ok(parsed);
  assert.equal(parsed.url.origin, supabaseOrigin);
  assert.equal(parsed.url.pathname, "/auth/v1/verify");
  assert.equal(parsed.url.searchParams.get("token"), token);
  assert.equal(parsed.url.searchParams.get("type"), "recovery");
  assert.equal(parsed.url.searchParams.get("redirect_to"), `${appOrigin}/auth/callback?flow=recovery&recovery_handoff=${handoffId}`);
  assert.deepEqual([...parsed.url.searchParams.keys()], ["token", "type", "redirect_to"]);
  const callback = new URL(parsed.url.searchParams.get("redirect_to"));
  callback.searchParams.set("code", "provider-code-placeholder");
  assert.equal(callback.searchParams.get("flow"), "recovery");
  assert.equal(callback.searchParams.get("recovery_handoff"), handoffId);

  for (const [payload, provider, application] of [
    [{ tokenHash: "short", type: "recovery" }, supabaseOrigin, appOrigin],
    [{ tokenHash: token, type: "signup" }, supabaseOrigin, appOrigin],
    [{ tokenHash: token, type: "recovery" }, "https://user:password@project-ref.supabase.co", appOrigin],
    [{ tokenHash: token, type: "recovery" }, `${supabaseOrigin}/auth/v1/verify`, appOrigin],
    [{ tokenHash: token, type: "recovery" }, "not a URL", appOrigin],
  ]) assert.equal(buildRecoveryVerificationUrl(payload, provider, application, handoffId), null);
  assert.equal(buildRecoveryVerificationUrl({ tokenHash: token, type: "recovery" }, supabaseOrigin, appOrigin, "forged"), null);
});

test("malformed, duplicated, incomplete, and extra fragment fields fail closed", () => {
  for (const fragment of [
    "", "#", "#token_hash=short&type=recovery", `#token_hash=${token}`, `#type=recovery`,
    `#token_hash=${token}&token_hash=${token}&type=recovery`,
    `#token_hash=${token}&type=recovery&type=recovery`,
    `#token_hash=${token}&type=recovery&redirect_to=${encodeURIComponent(appOrigin)}`,
    `#token_hash=${token}&type=signup`, `#token_hash=${token}%ZZ&type=recovery`,
  ]) assert.equal(parseRecoveryFragment(fragment).ok, false, fragment);

  for (const body of [
    "", `token_hash=${token}`, "type=recovery", `token_hash=${token}&token_hash=${token}&type=recovery`,
    `token_hash=${token}&type=recovery&type=recovery`, `token_hash=${token}&type=recovery&extra=value`,
    `token_hash=short&type=recovery`, `token_hash=${token}&type=signup`,
  ]) assert.equal(parseRecoveryFormBody(body), null, body);
});

test("explicit continuation is single-use and concurrent duplicates are blocked", async () => {
  const store = new MemoryAuthAbuseTestStore();
  const input = { secret, store, token };
  const [first, second] = await Promise.all([
    claimRecoveryContinuationInStore(input),
    claimRecoveryContinuationInStore(input),
  ]);
  assert.deepEqual([first, second].sort(), ["already_used", "claimed"]);
  assert.equal(await claimRecoveryContinuationInStore(input), "already_used");
});

test("continuation persistence and source contain no raw token-bearing data", async () => {
  const rawUrl = confirmationUrl();
  const store = new MemoryAuthAbuseTestStore();
  await claimRecoveryContinuationInStore({ secret, store, token });
  const serialized = JSON.stringify([...store.claims.entries()]);
  assert.equal(serialized.includes(token), false);
  assert.equal(serialized.includes(rawUrl), false);
  assert.match(createRecoveryContinuationIdentity(token, secret), /^[a-f0-9]{64}$/);
  const action = read("app/api/auth/recovery/continue/route.ts");
  const helper = read("app/lib/security/auth-abuse/recovery-continuation.ts");
  assert.doesNotMatch(action + helper, /console\.(?:log|info|warn|error)|emitOperationalEvent|captureException|captureMessage|localStorage|sessionStorage/);
  assert.doesNotMatch(helper, /key: `[^`]*\$\{token\}/);
});

test("fragments stay out of HTTP-facing state, Sentry payloads, and request-new-link prefetch", () => {
  const page = read("app/reset-password/confirm/page.tsx");
  const action = read("app/api/auth/recovery/continue/route.ts");
  assert.match(page, /const fragment = window\.location\.hash/);
  assert.match(page, /window\.history\.replaceState\(null, "", `\$\{window\.location\.pathname}\$\{window\.location\.search}`\)/);
  assert.match(page, /href="\/forgot-password" prefetch={false}/);
  assert.doesNotMatch(page, /Sentry|console\./);
  assert.doesNotMatch(action, /console\.|captureException|captureMessage|emitOperationalEvent/);
  assert.equal(SENTRY_DATA_COLLECTION.urlQueryParams, false);
  assert.equal(SENTRY_PRIVACY_OPTIONS.beforeBreadcrumb(), null);
  const scrubbed = SENTRY_PRIVACY_OPTIONS.beforeSend({ request: { url: `${appOrigin}/reset-password/confirm#token_hash=${token}` } });
  assert.equal(scrubbed.request, undefined);
});

test("the continuation form accepts exactly the two reconstructed fields", () => {
  const page = read("app/reset-password/confirm/page.tsx");
  const action = read("app/api/auth/recovery/continue/route.ts");
  assert.match(page, /name="token_hash"[\s\S]*name="type"[\s\S]*value="recovery"/);
  assert.match(action, /parseRecoveryFormBody\(text\)/);
  assert.doesNotMatch(action, /confirmation_url/);
});

test("intermediate and action responses are private and use route-appropriate referrer policy", () => {
  const config = read("next.config.ts");
  const action = read("app/api/auth/recovery/continue/route.ts");
  const proxy = read("app/lib/supabase/proxy.ts");
  assert.match(config, /source: "\/reset-password\/confirm"[\s\S]*private, no-cache, no-store[\s\S]*Referrer-Policy", value: "same-origin"/);
  assert.match(action, /applyPrivateCacheHeaders\(response\.headers\)/);
  assert.match(action, /response\.headers\.set\("Referrer-Policy", "no-referrer"\)/);
  assert.match(proxy, /request\.nextUrl\.pathname === "\/reset-password\/confirm"/);
});

test("verified recovery and ordinary callbacks retain their distinct behavior", () => {
  const callback = read("app/auth/callback/route.ts");
  const recovery = read("app/api/auth/recovery/route.ts");
  const recoveryBranch = callback.slice(callback.indexOf("if (recoveryClassification.recoveryCandidate)"), callback.indexOf("const { hasPet }"));
  assert.match(recovery, /new URL\("\/auth\/callback\?flow=recovery", request\.url\)/);
  assert.match(recoveryBranch, /issueRecoveryAuthorization/);
  assert.match(recoveryBranch, /new URL\("\/update-password", request\.nextUrl\.origin\)/);
  assert.doesNotMatch(recoveryBranch, /searchParams\.get\("(?:next|returnTo)"\)/);
  assert.match(callback, /resolvePostGoogleAuthDestination\([\s\S]*searchParams\.get\("next"\)/);
  assert.match(callback, /flow === "recovery"[\s\S]*\/reset-password\/confirm\?error=invalid/);
});

test("production continuation protection fails closed when Redis or HMAC configuration is missing", () => {
  const helper = read("app/lib/security/auth-abuse/recovery-continuation.ts");
  assert.match(helper, /process\.env\.NODE_ENV === "production"\) throw new Error\("AUTH_PROTECTION_UNAVAILABLE"\)/);
  assert.match(helper, /RedisAuthAbuseStore/);
  assert.match(helper, /createRecoveryContinuationIdentity/);
});
