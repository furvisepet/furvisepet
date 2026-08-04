import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { MemoryAuthAbuseTestStore } from "../app/lib/security/auth-abuse/memory-test-store.ts";
import {
  claimRecoveryContinuationInStore,
  parseRecoveryConfirmationUrl,
} from "../app/lib/security/auth-abuse/recovery-confirmation.mjs";
import { createRecoveryContinuationIdentity } from "../app/lib/security/auth-abuse/recovery-secrets.mjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const appOrigin = "https://www.furvise.com";
const supabaseOrigin = "https://project-ref.supabase.co";
const token = "a".repeat(64);
const secret = "scanner-resistant-recovery-test-secret-longer-than-32-characters";

function confirmationUrl(overrides = {}) {
  const url = new URL("/auth/v1/verify", overrides.origin || supabaseOrigin);
  url.searchParams.set("token", overrides.token || token);
  url.searchParams.set("type", overrides.type || "recovery");
  url.searchParams.set("redirect_to", overrides.redirectTo || `${appOrigin}/auth/callback?flow=recovery`);
  if (overrides.extra) url.searchParams.set("next", overrides.extra);
  return url.toString();
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
  assert.ok(action.indexOf("export async function POST") < action.indexOf("claimRecoveryContinuationToken(parsed.token)"));
  assert.equal(action.match(/claimRecoveryContinuationToken\(parsed\.token\)/g)?.length, 1);
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
  assert.match(page, /setConfirmationUrl\(value\)/);
  assert.doesNotMatch(page, /localStorage|sessionStorage|document\.cookie|automatically|onSubmit|requestSubmit/);
  const documentation = read("docs/supabase-auth-production-checklist.md");
  assert.match(documentation, /#confirmation_url={{ \.ConfirmationURL }}/);
  assert.doesNotMatch(documentation, /href="{{ \.ConfirmationURL }}"/);
});

test("only the configured Supabase recovery verification URL is accepted", () => {
  const parsed = parseRecoveryConfirmationUrl(confirmationUrl(), supabaseOrigin, appOrigin);
  assert.ok(parsed);
  assert.equal(parsed.url.origin, supabaseOrigin);
  assert.equal(parsed.url.pathname, "/auth/v1/verify");
  assert.equal(parsed.url.searchParams.get("type"), "recovery");
  assert.equal(parsed.url.searchParams.get("redirect_to"), `${appOrigin}/auth/callback?flow=recovery`);

  for (const candidate of [
    confirmationUrl({ origin: "https://evil.example" }),
    confirmationUrl({ redirectTo: "https://evil.example/update-password" }),
    confirmationUrl({ redirectTo: "//evil.example/update-password" }),
    confirmationUrl({ type: "signup" }),
    confirmationUrl({ token: "short" }),
    confirmationUrl({ extra: "https://evil.example" }),
    `${supabaseOrigin}/auth/v1/token?token=${token}&type=recovery&redirect_to=${encodeURIComponent(`${appOrigin}/auth/callback?flow=recovery`)}`,
    `https://user:password@project-ref.supabase.co/auth/v1/verify?token=${token}&type=recovery&redirect_to=${encodeURIComponent(`${appOrigin}/auth/callback?flow=recovery`)}`,
    "not a URL",
  ]) assert.equal(parseRecoveryConfirmationUrl(candidate, supabaseOrigin, appOrigin), null, candidate);
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
  const recoveryBranch = callback.slice(callback.indexOf('if (redirectType === "recovery")'), callback.indexOf("const { hasPet }"));
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
