import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getRateLimitPolicy } from "../app/lib/security/rate-limit/config.ts";
import { MemoryAuthAbuseTestStore } from "../app/lib/security/auth-abuse/memory-test-store.ts";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const authRoutes = ["signup", "login", "recovery", "resend", "oauth", "update-password"].map((name) => `app/api/auth/${name}/route.ts`);

test("browser Auth calls are mediated by same-origin application routes", () => {
  const login = source("app/login/page.tsx"); const recovery = source("app/forgot-password/page.tsx"); const update = source("app/update-password/page.tsx");
  assert.doesNotMatch(login, /auth\.signUp|auth\.signInWithPassword|auth\.resend/);
  assert.doesNotMatch(recovery, /resetPasswordForEmail/);
  assert.doesNotMatch(update, /auth\.updateUser/);
  assert.match(login, /\/api\/auth\/signup/); assert.match(login, /\/api\/auth\/login/); assert.match(login, /\/api\/auth\/resend/);
  assert.match(recovery, /\/api\/auth\/recovery/); assert.match(update, /\/api\/auth\/update-password/);
});

test("signup, recovery, and resend require and forward a CAPTCHA token", () => {
  for (const path of ["app/api/auth/signup/route.ts", "app/api/auth/recovery/route.ts", "app/api/auth/resend/route.ts"]) {
    const route = source(path); assert.match(route, /requireCaptchaToken/); assert.match(route, /captchaToken: captcha\.token/); assert.ok(route.indexOf("requireCaptchaToken") < route.indexOf("supabase.auth."), path);
  }
});

test("CAPTCHA tokens remain transient and reset after every protected client submission", () => {
  const widget = source("app/components/turnstile-challenge.tsx"); const login = source("app/login/page.tsx"); const recovery = source("app/forgot-password/page.tsx");
  assert.match(widget, /expired-callback/); assert.match(widget, /error-callback/); assert.match(widget, /turnstile\.reset/);
  assert.match(login, /setCaptchaToken\(null\)/); assert.match(recovery, /setCaptchaToken\(null\)/);
  assert.doesNotMatch(widget + login + recovery, /localStorage|sessionStorage|document\.cookie/);
});

test("production cannot activate the explicit CAPTCHA development bypass", () => {
  const captcha = source("app/lib/security/auth-abuse/captcha.ts"); const config = source("app/lib/security/auth-abuse/config.ts");
  assert.match(config, /NODE_ENV !== "production" && env\.FURVISE_CAPTCHA_DEV_BYPASS === "true"/);
  assert.doesNotMatch(captcha, /bypass-token|test-token|always-pass/);
});

test("email sign-in mounts CAPTCHA immediately while server-side challenge enforcement remains layered", () => {
  const login = source("app/login/page.tsx"); const route = source("app/api/auth/login/route.ts");
  assert.match(login, /<TurnstileChallenge onToken=\{setCaptchaToken\} resetSignal=\{captchaReset\} \/>/);
  assert.doesNotMatch(login, /loginCaptchaRequired/);
  assert.match(route, /failures\.challengeRequired/); assert.match(route, /getLoginCaptchaMode\(\) === "always"/);
  assert.ok(route.indexOf("getLoginFailureState") < route.indexOf("signInWithPassword"));
});

test("public Auth responses do not enumerate account state", () => {
  const responses = source("app/lib/security/auth-abuse/responses.ts"); const login = source("app/api/auth/login/route.ts");
  assert.match(responses, /Check your email to continue\. If you already have an account/);
  assert.match(responses, /If an account exists for that email/); assert.match(responses, /If confirmation is still required/);
  assert.match(login, /Email or password is incorrect\./); assert.doesNotMatch(login, /email not confirmed|already registered|google-only/i);
});

test("Auth policies use the canonical registry with the reviewed windows", () => {
  const signup = getRateLimitPolicy("AUTH_SIGNUP", { NODE_ENV: "test" }); const login = getRateLimitPolicy("AUTH_LOGIN", { NODE_ENV: "test" });
  const recovery = getRateLimitPolicy("AUTH_PASSWORD_RECOVERY", { NODE_ENV: "test" }); const resend = getRateLimitPolicy("AUTH_CONFIRMATION_RESEND", { NODE_ENV: "test" });
  assert.deepEqual(signup.ip, { limit: 5, windowMs: 15 * 60_000 }); assert.deepEqual(signup.email, { limit: 3, windowMs: 60 * 60_000 });
  assert.deepEqual(login.ip, { limit: 20, windowMs: 15 * 60_000 }); assert.deepEqual(login.email, { limit: 10, windowMs: 15 * 60_000 });
  assert.equal(recovery.ip.limit, 5); assert.equal(recovery.email.limit, 3); assert.equal(resend.ip.limit, 5); assert.equal(resend.email.limit, 3);
  assert.equal(getRateLimitPolicy("AUTH_OAUTH_INITIATION", { NODE_ENV: "test" }).ip.limit, 20);
});

test("distributed Auth store enforces windows and exact replay fingerprints", async () => {
  const store = new MemoryAuthAbuseTestStore(); const base = { key: "hashed-only", limit: 2, nowMs: 1_000, windowMs: 60_000 };
  assert.equal((await store.check({ ...base, member: "one" })).allowed, true); assert.equal((await store.check({ ...base, member: "two" })).allowed, true);
  assert.equal((await store.check({ ...base, member: "three" })).allowed, false);
  assert.equal(await store.claim({ fingerprint: "a", key: "operation", ttlMs: 60_000 }), "new");
  assert.equal(await store.claim({ fingerprint: "a", key: "operation", ttlMs: 60_000 }), "replay");
  assert.equal(await store.claim({ fingerprint: "b", key: "operation", ttlMs: 60_000 }), "conflict");
});

test("email normalization is bounded and limiter identities are dedicated HMACs", () => {
  const email = source("app/lib/security/auth-abuse/email.ts"); const keys = source("app/lib/security/auth-abuse/keys.ts");
  assert.match(email, /normalize\("NFKC"\)\.trim\(\)\.toLowerCase\(\)/); assert.doesNotMatch(email, /gmail|replace\([^\n]*\+|remove.*dot/i);
  assert.match(keys, /createHmac\("sha256"/); assert.match(keys, /emailHash/); assert.doesNotMatch(keys, /passwordHash|bcrypt|argon/);
  assert.match(source(".env.example"), /FURVISE_AUTH_RATE_LIMIT_HASH_SECRET/);
});

test("failed-login tracking counts credential failures, challenges temporarily, and clears on success", () => {
  const route = source("app/api/auth/login/route.ts"); const limiter = source("app/lib/security/auth-abuse/limiter.ts");
  assert.match(route, /isCredentialFailure\(error\).*recordLoginCredentialFailure/s); assert.match(route, /clearLoginCredentialFailures/);
  assert.match(limiter, /state\.count >= 3/); assert.match(limiter, /state\.count >= policy\.email!\.limit/);
  assert.doesNotMatch(route, /permanent|locked account/i);
});

test("all public Auth mutations require an explicit same-origin browser request", () => {
  for (const path of authRoutes) { const route = source(path); assert.match(route, /validatePublicAuthOrigin/); assert.ok(route.indexOf("validatePublicAuthOrigin") < route.indexOf("supabase.auth"), path); }
  const origin = source("app/lib/security/auth-abuse/origin.ts"); assert.match(origin, /mode === "browser-origin"/); assert.match(origin, /ORIGIN_NOT_ALLOWED/);
});

test("rejected Auth requests cannot send email before CAPTCHA, limit, and replay decisions", () => {
  for (const path of ["app/api/auth/signup/route.ts", "app/api/auth/recovery/route.ts", "app/api/auth/resend/route.ts"]) {
    const route = source(path); const provider = route.indexOf("supabase.auth.");
    assert.ok(route.indexOf("requireCaptchaToken") < provider, path); assert.ok(route.indexOf("enforceAuthInitiationLimit") < provider, path); assert.ok(route.indexOf("claimPublicAuthOperation") < provider, path);
  }
});

test("pre-provider infrastructure failures release email-operation replay claims", () => {
  for (const path of ["app/api/auth/signup/route.ts", "app/api/auth/recovery/route.ts", "app/api/auth/resend/route.ts"]) {
    const route = source(path);
    assert.match(route, /if \(!supabase\) \{[\s\S]*releasePublicAuthOperation[\s\S]*authUnavailableResponse/, path);
    assert.match(route, /catch \{[\s\S]*releasePublicAuthOperation[\s\S]*authUnavailableResponse/, path);
  }
});

test("password policy is length-only, bounded, and does not mutate passwords", () => {
  const policy = source("app/lib/security/auth-abuse/password.ts");
  assert.match(policy, /MIN_LENGTH = 12/); assert.match(policy, /MAX_LENGTH = 128/);
  assert.doesNotMatch(policy, /\.trim\(|toLowerCase|normalize\(|uppercase|special character/i);
  assert.match(source("app/login/page.tsx"), /minLength=\{mode === "signin" \? 1 : 12\}/);
});

test("recovery redirects are server-selected and password update requires verified session", () => {
  const recovery = source("app/api/auth/recovery/route.ts"); const callback = source("app/auth/callback/route.ts"); const update = source("app/api/auth/update-password/route.ts");
  assert.match(recovery, /\/auth\/callback\?flow=recovery&next=\/update-password/); assert.doesNotMatch(recovery, /redirectTo.*input|body.*redirect/i);
  assert.match(callback, /flow === "recovery"/); assert.match(update, /supabase\.auth\.getUser\(\)/); assert.ok(update.indexOf("getUser()") < update.indexOf("updateUser"));
  assert.match(source("app/lib/supabase/proxy.ts"), /pathname === "\/update-password"/);
});

test("confirmation is required at the authoritative AI-credit reservation boundary", () => {
  const migration = source("supabase/migrations/20260730020000_require_confirmed_users_for_ai_credits.sql");
  assert.match(migration, /auth\.users/); assert.match(migration, /email_confirmed_at is not null/); assert.match(migration, /is_anonymous/); assert.match(migration, /EMAIL_CONFIRMATION_REQUIRED/);
  assert.ok(migration.indexOf("EMAIL_CONFIRMATION_REQUIRED") < migration.indexOf("insert into public.ai_usage_events"));
});

test("application workspace and entitlement remain keyed to canonical auth user", () => {
  const identity = source("app/lib/auth-identity.ts"); const schema = source("supabase/migrations/20260718000000_ensure_user_profiles_schema.sql"); const usage = source("supabase/migrations/20260727020000_add_unified_ai_credits_and_care_state.sql");
  assert.match(identity, /onConflict: "user_id"/); assert.match(identity, /ignoreDuplicates: true/); assert.match(schema, /user_id uuid primary key references auth\.users/);
  assert.match(usage, /user_id uuid not null references auth\.users/); assert.match(usage, /unique index.*user_request/s);
});

test("Auth logs and client code do not log secrets or raw account identifiers", () => {
  const logging = source("app/lib/security/auth-abuse/logging.ts"); const routes = authRoutes.map(source).join("\n");
  assert.doesNotMatch(logging, /email:|password|captchaToken|access_token|refresh_token|cookie/);
  assert.doesNotMatch(routes, /console\.(?:log|info|warn|error)\([^\n]*(?:email|password|captcha|token)/i);
});

test("Auth APIs expose no permissive CORS and CAPTCHA is not added to product features", () => {
  const routes = authRoutes.map(source).join("\n"); assert.doesNotMatch(routes, /Access-Control-Allow-Origin|\*.*credentials/i);
  for (const path of ["app/api/ask/route.ts", "app/api/shop/interpret-query/route.ts", "app/api/care-entries/route.ts"]) assert.doesNotMatch(source(path), /TurnstileChallenge|captchaToken/);
});

test("Turnstile browser origins are exact and conditional in report-only CSP", () => {
  const csp = source("app/lib/security/headers/content-security-policy.ts");
  assert.match(csp, /https:\/\/challenges\.cloudflare\.com/); assert.match(csp, /NEXT_PUBLIC_TURNSTILE_SITE_KEY/); assert.doesNotMatch(csp, /cloudflare\.com\/\*|https:\s|\*\.cloudflare/);
});
