import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getRateLimitPolicy } from "../app/lib/security/rate-limit/config.ts";
import { MemoryAuthAbuseTestStore } from "../app/lib/security/auth-abuse/memory-test-store.ts";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const authRoutes = [
  "app/api/auth/signup/route.ts",
  "app/api/auth/login/route.ts",
  "app/api/auth/login-otp/start/route.ts",
  "app/api/auth/account-route/route.ts",
  "app/api/auth/recovery/route.ts",
  "app/api/auth/resend/route.ts",
  "app/api/auth/oauth/route.ts",
  "app/api/auth/update-password/route.ts",
  "app/api/auth/verify-email-otp/route.ts",
];

test("browser Auth calls are mediated by same-origin application routes", () => {
  const login = source("app/login/page.tsx"); const recovery = source("app/forgot-password/page.tsx") + source("app/forgot-password/password-email-form.tsx"); const update = source("app/update-password/page.tsx");
  assert.doesNotMatch(login, /auth\.signUp|auth\.signInWithPassword|auth\.resend/);
  assert.doesNotMatch(recovery, /resetPasswordForEmail/);
  assert.doesNotMatch(update, /auth\.updateUser/);
  assert.match(login, /\/api\/auth\/signup/); assert.match(login, /\/api\/auth\/login/); assert.match(login, /\/api\/auth\/resend/);
  assert.match(login, /\/api\/auth\/account-route/);
  assert.match(recovery, /\/api\/auth\/recovery/); assert.match(update, /\/api\/auth\/update-password/);
});

test("signup, recovery, resend, and login OTP start require and forward a CAPTCHA token", () => {
  for (const path of ["app/api/auth/signup/route.ts", "app/api/auth/recovery/route.ts", "app/api/auth/resend/route.ts", "app/api/auth/login-otp/start/route.ts"]) {
    const route = source(path); assert.match(route, /requireCaptchaToken/); assert.match(route, /captchaToken: captcha\.token/); assert.ok(route.indexOf("requireCaptchaToken") < route.indexOf("supabase.auth."), path);
  }
});

test("CAPTCHA tokens remain transient and reset after every protected client submission", () => {
  const widget = source("app/components/turnstile-challenge.tsx"); const login = source("app/login/page.tsx"); const recovery = source("app/forgot-password/page.tsx") + source("app/forgot-password/password-email-form.tsx");
  assert.match(widget, /expired-callback/); assert.match(widget, /error-callback/); assert.match(widget, /turnstile\.reset/);
  assert.match(login, /setCaptchaToken\(null\)/); assert.match(recovery, /setCaptchaToken\(null\)/);
  assert.doesNotMatch(widget + login + recovery, /localStorage|sessionStorage|document\.cookie/);
});

test("production cannot activate the explicit CAPTCHA development bypass", () => {
  const captcha = source("app/lib/security/auth-abuse/captcha.ts"); const config = source("app/lib/security/auth-abuse/config.ts");
  assert.match(config, /NODE_ENV !== "production" && env\.FURVISE_CAPTCHA_DEV_BYPASS === "true"/);
  assert.doesNotMatch(captcha, /bypass-token|test-token|always-pass/);
});

test("email sign-in defers CAPTCHA to the password step while server-side challenge enforcement remains layered", () => {
  const login = source("app/login/page.tsx"); const route = source("app/api/auth/login/route.ts");
  const method = login.slice(login.indexOf("function SigninMethodStep"), login.indexOf("function SigninPasswordStep"));
  const password = login.slice(login.indexOf("function SigninPasswordStep"), login.indexOf("function SignupMethodStep"));
  const request = login.slice(login.indexOf("function requestAuthSubmission"), login.indexOf("function handleAuthChallengeToken"));
  const handler = login.slice(login.indexOf("function handleAuthChallengeToken"), login.indexOf("async function submitAuth"));
  const submit = login.slice(login.indexOf("async function submitAuth"), login.indexOf("async function startGoogle"));
  assert.doesNotMatch(method, /TurnstileChallenge|PasswordInput/);
  assert.match(password, /authChallengeVisible \? <TurnstileChallenge onToken=\{handleAuthChallengeToken\}/);
  assert.match(request, /setAuthChallengeVisible\(true\)/);
  assert.doesNotMatch(request, /fetch|idempotentClientFetch|\/api\/auth/);
  assert.match(handler, /if \(!token\) \{[\s\S]*setAuthSubmitPending\(false\)/);
  assert.match(handler, /if \(!authSubmitPendingRef\.current\) return/);
  assert.match(submit, /if \(!token\) return/);
  assert.match(submit, /captchaToken: token/);
  assert.doesNotMatch(login, /loginCaptchaRequired/);
  assert.match(route, /failures\.challengeRequired/); assert.match(route, /getLoginCaptchaMode\(\) === "always"/);
  assert.ok(route.indexOf("getLoginFailureState") < route.indexOf("signInWithPassword"));
});

test("credential and email-send Auth responses remain neutral while account routing returns only a bounded flow", () => {
  const responses = source("app/lib/security/auth-abuse/responses.ts"); const login = source("app/api/auth/login/route.ts");
  assert.match(responses, /Enter the code from your email to continue\. If you already have an account/);
  assert.match(responses, /If that email can receive a sign-in code, it’s on the way/);
  assert.match(responses, /If an account exists for that email/); assert.match(responses, /If confirmation is still required, a new code will be sent/);
  assert.match(login, /Email or password is incorrect\./); assert.doesNotMatch(login, /email not confirmed|already registered|google-only/i);
  const accountRoute = source("app/api/auth/account-route/route.ts");
  assert.match(accountRoute, /authJson\(\{ flow: exists \? "signin" : "signup" \}\)/);
  assert.doesNotMatch(accountRoute, /userId|provider|identity|metadata|app_metadata|user_metadata/);
});

test("Auth policies use the canonical registry with the reviewed windows", () => {
  const signup = getRateLimitPolicy("AUTH_SIGNUP", { NODE_ENV: "test" }); const login = getRateLimitPolicy("AUTH_LOGIN", { NODE_ENV: "test" });
  const recovery = getRateLimitPolicy("AUTH_PASSWORD_RECOVERY", { NODE_ENV: "test" }); const resend = getRateLimitPolicy("AUTH_CONFIRMATION_RESEND", { NODE_ENV: "test" });
  const verify = getRateLimitPolicy("AUTH_CONFIRMATION_VERIFY", { NODE_ENV: "test" });
  const loginOtp = getRateLimitPolicy("AUTH_LOGIN_OTP_START", { NODE_ENV: "test" });
  const accountRoute = getRateLimitPolicy("AUTH_ACCOUNT_ROUTE", { NODE_ENV: "test" });
  assert.deepEqual(signup.ip, { limit: 5, windowMs: 15 * 60_000 }); assert.deepEqual(signup.email, { limit: 3, windowMs: 60 * 60_000 });
  assert.deepEqual(login.ip, { limit: 20, windowMs: 15 * 60_000 }); assert.deepEqual(login.email, { limit: 10, windowMs: 15 * 60_000 });
  assert.equal(recovery.ip.limit, 5); assert.equal(recovery.email.limit, 3); assert.equal(resend.ip.limit, 5); assert.equal(resend.email.limit, 3);
  assert.deepEqual(verify.ip, { limit: 20, windowMs: 10 * 60_000 }); assert.deepEqual(verify.email, { limit: 6, windowMs: 10 * 60_000 }); assert.equal(verify.failurePolicy, "fail_closed");
  assert.deepEqual(loginOtp.ip, { limit: 10, windowMs: 10 * 60_000 }); assert.deepEqual(loginOtp.email, { limit: 3, windowMs: 10 * 60_000 }); assert.equal(loginOtp.failurePolicy, "fail_closed");
  assert.deepEqual(accountRoute.ip, { limit: 10, windowMs: 10 * 60_000 }); assert.deepEqual(accountRoute.email, { limit: 3, windowMs: 10 * 60_000 }); assert.equal(accountRoute.failurePolicy, "fail_closed");
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
  for (const path of authRoutes) {
    const route = source(path); const handler = route.slice(route.indexOf("export async function POST"));
    const authority = path.endsWith("account-route/route.ts") ? handler.indexOf("authUserExistsByEmail") : handler.indexOf("supabase.auth");
    assert.match(handler, /validatePublicAuthOrigin/); assert.ok(handler.indexOf("validatePublicAuthOrigin") < authority, path);
  }
  const origin = source("app/lib/security/auth-abuse/origin.ts"); assert.match(origin, /mode === "browser-origin"/); assert.match(origin, /ORIGIN_NOT_ALLOWED/);
});

test("rejected Auth requests cannot send email before CAPTCHA, limit, and replay decisions", () => {
  for (const path of ["app/api/auth/signup/route.ts", "app/api/auth/recovery/route.ts", "app/api/auth/resend/route.ts", "app/api/auth/login-otp/start/route.ts"]) {
    const route = source(path); const provider = route.indexOf("supabase.auth.");
    assert.ok(route.indexOf("requireCaptchaToken") < provider, path); assert.ok(route.indexOf("enforceAuthInitiationLimit") < provider, path); assert.ok(route.indexOf("claimPublicAuthOperation") < provider, path);
  }
});

test("pre-provider infrastructure failures release email-operation replay claims", () => {
  for (const path of ["app/api/auth/signup/route.ts", "app/api/auth/recovery/route.ts", "app/api/auth/resend/route.ts", "app/api/auth/login-otp/start/route.ts"]) {
    const route = source(path);
    assert.match(route, /if \(!supabase\) \{[\s\S]*releasePublicAuthOperation[\s\S]*authUnavailableResponse/, path);
    assert.match(route, /catch \{[\s\S]*releasePublicAuthOperation[\s\S]*authUnavailableResponse/, path);
  }
});

test("password policy is length-only, bounded, and does not mutate passwords", () => {
  const policy = source("app/lib/security/auth-abuse/password.ts");
  const login = source("app/login/page.tsx");
  assert.match(policy, /MIN_LENGTH = 12/); assert.match(policy, /MAX_LENGTH = 128/);
  assert.doesNotMatch(policy, /\.trim\(|toLowerCase|normalize\(|uppercase|special character/i);
  assert.match(login, /minLength=\{12\}/);
  assert.match(login, /maxLength=\{128\}/);
  assert.doesNotMatch(login, /Use 12 to 128 characters\./);
  assert.match(login, /Password needs at least 12 characters\./);
});

test("recovery redirects are server-selected and password update requires verified session", () => {
  const recovery = source("app/api/auth/recovery/route.ts"); const callback = source("app/auth/callback/route.ts"); const update = source("app/api/auth/update-password/route.ts"); const classification = source("app/lib/security/auth-abuse/recovery-callback.mjs");
  assert.match(recovery, /\/auth\/callback\?flow=recovery/); assert.doesNotMatch(recovery, /redirectTo.*input|body.*redirect/i);
  assert.match(classification, /redirectType === "recovery"/); assert.match(callback, /consumeRecoveryHandoff/); assert.match(callback, /issueRecoveryAuthorization\(data\.user\.id, exchangeData\.session\.access_token\)/);
  assert.match(update, /supabase\.auth\.getUser\(\)/); assert.match(update, /readRecoveryAuthorizationCookie/); assert.ok(update.indexOf("getUser()") < update.indexOf("updateUser"));
  assert.match(source("app/lib/supabase/proxy.ts"), /pathname === "\/update-password"/);
});

test("password recovery completion has a dedicated fail-closed policy", () => {
  const policy = getRateLimitPolicy("AUTH_PASSWORD_UPDATE", { NODE_ENV: "production" });
  assert.equal(policy.failurePolicy, "fail_closed");
  assert.deepEqual(policy.user, { limit: 5, windowMs: 15 * 60_000 });
  assert.deepEqual(policy.ip, { limit: 20, windowMs: 15 * 60_000 });
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
