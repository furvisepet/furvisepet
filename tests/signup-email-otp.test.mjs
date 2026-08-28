import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { resolvePostAuthDestination } from "../app/lib/auth-identity.ts";
import { isCompleteSignupOtp, normalizeSignupOtp } from "../app/lib/signup-otp.ts";
import { MemoryAuthAbuseTestStore } from "../app/lib/security/auth-abuse/memory-test-store.ts";
import { getRateLimitPolicy } from "../app/lib/security/rate-limit/config.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const login = read("app/login/page.tsx");
const route = read("app/api/auth/verify-signup-otp/route.ts");
const signupRoute = read("app/api/auth/signup/route.ts");
const resendRoute = read("app/api/auth/resend/route.ts");
const callback = read("app/auth/callback/route.ts");
const serverClient = read("app/lib/supabase/server.ts");
const limiter = read("app/lib/security/auth-abuse/limiter.ts");
const otpStep = login.slice(login.indexOf("function SignupOtpStep"), login.indexOf("function EmailInput"));
const updateOtp = login.slice(login.indexOf("function updateSignupOtp"), login.indexOf("function submitSignupOtp"));
const submitOtp = login.slice(login.indexOf("function submitSignupOtp"), login.indexOf("async function verifySignupOtp"));
const verifyOtp = login.slice(login.indexOf("async function verifySignupOtp"), login.indexOf("async function startGoogle"));
const clearTransient = login.slice(login.indexOf("function clearTransientAuthState"), login.indexOf("function returnViewportToTop"));
const resend = login.slice(login.indexOf("async function resendConfirmation"), login.indexOf('if (authStatus === "signedIn"'));

test("signup OTP route accepts only a small exact POST body", () => {
  assert.match(route, /export async function POST\(request: Request\)/);
  assert.doesNotMatch(route, /export async function (?:GET|PUT|PATCH|DELETE)/);
  assert.match(route, /readBoundedJson\(request, API_BODY_LIMITS\.authOtp\)/);
  assert.match(read("app/lib/security/request.ts"), /authOtp: 1024/);
  assert.match(route, /hasOnlyKeys\(body, \["email", "token"\]\)/);
  assert.doesNotMatch(route, /password|captchaToken|requestedNext|returnTo/);
});

test("server normalizes email and accepts exactly six ASCII digits", () => {
  assert.match(route, /normalizeAuthAbuseEmail\(input\.email\)/);
  assert.match(route, /typeof input\.token === "string" && \/\^\[0-9\]\{6\}\$\//);
  assert.doesNotMatch(route, /parseInt|Number\(input\.token\)|\\d\{6\}/);
  assert.match(route, /otpFailure\("INVALID_REQUEST", requestId, 400\)/);
});

test("cookie-aware server verification owns the Supabase OTP exchange", () => {
  assert.match(route, /createServerSupabase\(\)/);
  assert.match(route, /supabase\.auth\.verifyOtp\(\{ email, token, type: "email" \}\)/);
  assert.match(route, /verification\.data\.session/);
  assert.match(route, /supabase\.auth\.getUser\(\)/);
  assert.match(serverClient, /createServerClient/);
  assert.match(serverClient, /setAll\(cookiesToSet\)/);
  assert.match(serverClient, /cookieStore\.set\(name, value/);
  assert.doesNotMatch(route, /signInWithOtp|token_hash|new URL|searchParams/);
});

test("invalid OTPs cannot create canonical application state", () => {
  const providerError = route.indexOf("if (verification.error)");
  const confirmedUser = route.indexOf("isConfirmedAuthUser(data.user)");
  const canonical = route.indexOf("ensureCanonicalApplicationUser(supabase, data.user)");
  assert.ok(providerError >= 0 && confirmedUser > providerError && canonical > confirmedUser);
  assert.match(route, /signOut\(\{ scope: "local" \}\)/);
  assert.match(route, /INVALID_OR_EXPIRED_CODE/);
});

test("successful verification preserves canonical user and server-selected routing authority", () => {
  assert.match(route, /ensureCanonicalApplicationUser\(supabase, data\.user\)/);
  assert.match(route, /resolvePostAuthDestination\(hasPet, null\)/);
  assert.match(route, /destination:[\s\S]*verified: true/);
  assert.equal(resolvePostAuthDestination(false, null), "/onboarding");
  assert.equal(resolvePostAuthDestination(true, null), "/today");
  assert.equal(resolvePostAuthDestination(true, "https://evil.example"), "/today");
  assert.equal(resolvePostAuthDestination(true, "javascript:alert(1)"), "/today");
});

test("OTP attempts use dedicated fail-closed email and IP limits", async () => {
  const policy = getRateLimitPolicy("AUTH_CONFIRMATION_VERIFY", { NODE_ENV: "production" });
  assert.deepEqual(policy.email, { limit: 6, windowMs: 10 * 60_000 });
  assert.deepEqual(policy.ip, { limit: 20, windowMs: 10 * 60_000 });
  assert.equal(policy.failurePolicy, "fail_closed");
  assert.match(route, /flow: "confirmation_verify"/);
  assert.match(route, /policy: "AUTH_CONFIRMATION_VERIFY"/);
  assert.match(route, /authUnavailableResponse\(requestId\)/);
  assert.match(limiter, /store\.check\(\{ key: keys\.ipKey/);
  assert.match(limiter, /store\.check\(\{ key: keys\.emailKey/);

  const store = new MemoryAuthAbuseTestStore();
  for (let attempt = 0; attempt < 6; attempt += 1) {
    assert.equal((await store.check({ key: "hashed-email", limit: 6, member: String(attempt), nowMs: 1_000, windowMs: 600_000 })).allowed, true);
  }
  assert.equal((await store.check({ key: "hashed-email", limit: 6, member: "blocked", nowMs: 1_000, windowMs: 600_000 })).allowed, false);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    assert.equal((await store.check({ key: "hashed-ip", limit: 20, member: String(attempt), nowMs: 1_000, windowMs: 600_000 })).allowed, true);
  }
  assert.equal((await store.check({ key: "hashed-ip", limit: 20, member: "blocked", nowMs: 1_000, windowMs: 600_000 })).allowed, false);
});

test("OTP failures remain generic and never log or expose the raw token", () => {
  assert.match(route, /That code is invalid or expired\. Try again or send a new one\./);
  assert.doesNotMatch(route, /account (?:exists|does not exist)|user not found|wrong provider|email not found/i);
  assert.doesNotMatch(route, /console\.|logger|emitOperationalEvent/);
  assert.doesNotMatch(route, /URLSearchParams|request\.url|redirectTo/);
  assert.match(read("app/lib/security/auth-abuse/keys.ts"), /createHmac\("sha256"/);
});

test("signup success transitions from password creation to active OTP entry", () => {
  assert.match(login, /type SignupStep = "method" \| "password" \| "otp"/);
  assert.match(login, /setSignupStep\("otp"\)/);
  assert.match(login, /"Confirm your email"/);
  assert.match(login, /signupStep === "otp"[\s\S]*\{email\}/);
  assert.doesNotMatch(login, /"Check your email"|We sent a verification link|Resend email/);
  assert.doesNotMatch(otpStep, /PasswordInput|GoogleButton|Try another way/);
});

test("one semantic OTP input supports numeric typing, paste, and autofill", () => {
  assert.equal((otpStep.match(/<input/g) || []).length, 1);
  assert.match(otpStep, /aria-label="Verification code"/);
  assert.match(otpStep, /inputMode="numeric"/);
  assert.match(otpStep, /autoComplete="one-time-code"/);
  assert.match(otpStep, /pattern="\[0-9\]\{6\}"/);
  assert.match(otpStep, /maxLength=\{6\}/);
  assert.match(otpStep, /onPaste=\{\(event\) => \{[\s\S]*event\.preventDefault\(\)[\s\S]*event\.clipboardData\.getData\("text"\)/);
  assert.match(otpStep, /Array\.from\(\{ length: 6 \}/);
  assert.equal(normalizeSignupOtp("123456"), "123456");
  assert.equal(normalizeSignupOtp("12 34-56"), "123456");
  assert.equal(normalizeSignupOtp("１２34ab5678"), "345678");
  assert.equal(isCompleteSignupOtp("123456"), true);
  assert.equal(isCompleteSignupOtp("12345"), false);
  assert.equal(isCompleteSignupOtp("12345a"), false);
});

test("complete codes auto-submit once while Enter supports a complete code", () => {
  assert.match(updateOtp, /normalizeSignupOtp\(value\)/);
  assert.match(updateOtp, /isCompleteSignupOtp\(normalized\)[\s\S]*verifySignupOtp\(normalized\)/);
  assert.match(submitOtp, /event\.preventDefault\(\)/);
  assert.match(submitOtp, /if \(!isCompleteSignupOtp\(signupOtp\)\)[\s\S]*return/);
  assert.match(submitOtp, /verifySignupOtp\(signupOtp\)/);
  assert.match(verifyOtp, /if \(!isCompleteSignupOtp\(code\) \|\| otpVerifyingRef\.current\) return/);
  assert.match(verifyOtp, /otpVerifyingRef\.current = true/);
  assert.equal((verifyOtp.match(/fetch\("\/api\/auth\/verify-signup-otp"/g) || []).length, 1);
});

test("OTP verification stays in the same tab and failures recover predictably", () => {
  assert.match(verifyOtp, /body: JSON\.stringify\(\{ email: normalizeAuthEmail\(email\), token: code \}\)/);
  assert.match(verifyOtp, /router\.replace\(getSafeNextPath\(payload\.destination, "\/onboarding"\)\)/);
  assert.doesNotMatch(verifyOtp, /window\.open|target=|location\.href|router\.push/);
  assert.match(verifyOtp, /setSignupOtp\(""\)/);
  assert.match(verifyOtp, /otpInputRef\.current\?\.focus\(\)/);
  assert.match(verifyOtp, /otpInputRef\.current\?\.select\(\)/);
  assert.match(verifyOtp, /otpAbortRef\.current/);
  assert.match(login, /mode === "signup" && signupStep === "otp"/);
  assert.match(otpStep, /Verifying…/);
});

test("Use another email clears OTP, password, CAPTCHA, resend, and pending verification state", () => {
  assert.match(otpStep, /Use another email/);
  assert.match(login, /useDifferentEmail=\{\(\) => returnToSignupEmail\(true\)\}/);
  assert.match(clearTransient, /otpAbortRef\.current\?\.abort\(\)/);
  assert.match(clearTransient, /otpVerifyingRef\.current = false/);
  assert.match(clearTransient, /setPassword\(""\)/);
  assert.match(clearTransient, /setSignupOtp\(""\)/);
  assert.match(clearTransient, /setOtpVerifying\(false\)/);
  assert.match(clearTransient, /setCaptchaToken\(null\)/);
  assert.match(clearTransient, /setResendChallengeVisible\(false\)/);
  assert.match(clearTransient, /setResendCooldown\(0\)/);
});

test("resend remains lazy, captcha protected, idempotent, and code-focused", () => {
  assert.match(otpStep, /Didn&apos;t get it\?/);
  assert.match(otpStep, /"Resend code"/);
  assert.match(otpStep, /You can resend in \{resendCooldown\}s/);
  assert.match(otpStep, /resendChallengeVisible \? \([\s\S]*TurnstileChallenge/);
  assert.match(login, /const SIGNUP_RESEND_COOLDOWN_SECONDS = 60/);
  assert.match(resend, /idempotentClientFetch\("\/api\/auth\/resend"/);
  assert.match(resend, /captchaToken: token/);
  assert.match(resend, /setStatusMessage\("New code sent\."\)/);
  assert.match(resendRoute, /requireCaptchaToken/);
  assert.match(resendRoute, /claimPublicAuthOperation/);
  assert.match(resendRoute, /enforceAuthInitiationLimit/);
  assert.match(resendRoute, /supabase\.auth\.resend\(\{ type: "signup", email, options: \{ captchaToken: captcha\.token/);
});

test("password signup, legacy links, recovery, and Google callback authority remain compatible", () => {
  assert.match(signupRoute, /supabase\.auth\.signUp\(\{ email, password: password\.password/);
  assert.match(signupRoute, /captchaToken: captcha\.token/);
  assert.match(signupRoute, /claimPublicAuthOperation/);
  assert.doesNotMatch(signupRoute + login, /signInWithOtp/);
  assert.match(callback, /exchangeCodeForSession\(code\)/);
  assert.match(callback, /classifyRecoveryCallback/);
  assert.match(callback, /ensureCanonicalApplicationUser/);
  assert.match(callback, /resolvePostGoogleAuthDestination/);
  assert.match(callback, /flow === "confirmation"/);
});

test("hosted Confirm signup template rollout is explicit and remains external", () => {
  const rollout = read("docs/signup-email-otp-rollout.md");
  assert.match(rollout, /Phase A:[\s\S]*Phase B:[\s\S]*Phase C:[\s\S]*Phase D:/);
  assert.match(rollout, /Your Furvise verification code/);
  assert.match(rollout, /\{\{ \.Token \}\}/);
  assert.match(rollout, /\{\{ \.ConfirmationURL \}\}/);
  assert.match(rollout, /Leave Confirm Email enabled/);
  assert.match(rollout, /Do not use `signInWithOtp`/);
  assert.equal(existsSync(new URL("../supabase/config.toml", import.meta.url)), false);
});
