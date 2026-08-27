import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const login = read("app/login/page.tsx");
const layout = read("app/components/account-access.tsx");
const methodStep = login.slice(login.indexOf("function SignupMethodStep"), login.indexOf("function SignupPasswordStep"));
const passwordStep = login.slice(login.indexOf("function SignupPasswordStep"), login.indexOf("function SignupVerificationStep"));
const verificationStep = login.slice(login.indexOf("function SignupVerificationStep"), login.indexOf("function EmailInput"));
const localEmailAdvance = login.slice(login.indexOf("function continueSignupWithEmail"), login.indexOf("async function submitAuth"));
const submitAuth = login.slice(login.indexOf("async function submitAuth"), login.indexOf("async function startGoogle"));
const resendConfirmation = login.slice(login.indexOf("async function resendConfirmation"), login.indexOf('if (authStatus === "signedIn")'));
const clearTransientState = login.slice(login.indexOf("function clearTransientSignupState"), login.indexOf("function resetCaptchaAfterRequest"));
const signIn = login.slice(login.indexOf("function SigninForm"), login.indexOf("function SignupMethodStep"));

test("normal signup starts with one local email decision and no password or security challenge", () => {
  assert.match(login, /type SignupStep = "method" \| "password" \| "verify"/);
  assert.match(login, /useState<SignupStep>\("method"\)/);
  assert.match(methodStep, /Create your Furvise account|EmailInput/);
  assert.match(methodStep, />Continue<\/button>/);
  assert.match(methodStep, /Already have an account\? Sign in/);
  assert.doesNotMatch(methodStep, /PasswordInput|TurnstileChallenge|Create account/);
});

test("valid email advances locally after normalization without an account lookup or signup request", () => {
  assert.match(localEmailAdvance, /event\.preventDefault\(\)/);
  assert.match(localEmailAdvance, /normalizeAuthEmail\(email\)/);
  assert.match(localEmailAdvance, /setEmail\(normalizedEmail\)/);
  assert.match(localEmailAdvance, /setSignupStep\("password"\)/);
  assert.doesNotMatch(localEmailAdvance, /fetch|idempotentClientFetch|\/api\/auth/);
  assert.doesNotMatch(login, /email-exists|check-email|account-exists/i);
});

test("password step exposes the normalized email, exact policy, Turnstile, and forest action", () => {
  assert.match(login, /Creating an account for[\s\S]*\{email\}/);
  assert.match(passwordStep, /Change email/);
  assert.match(passwordStep, /placeholder="Create a password"/);
  assert.match(passwordStep, /minLength=\{12\}/);
  assert.match(passwordStep, /maxLength=\{128\}/);
  assert.match(passwordStep, /Use 12 to 128 characters\./);
  assert.match(passwordStep, /TurnstileChallenge/);
  assert.match(passwordStep, /accountSignupPrimaryClass/);
  assert.match(passwordStep, /Create account/);
  assert.match(layout, /accountSignupPrimaryClass[\s\S]*bg-\[var\(--deep-forest\)\]/);
});

test("production signup stays captcha-gated and uses the existing idempotent signup API", () => {
  assert.match(login, /process\.env\.NODE_ENV === "production" && !captchaToken/);
  assert.match(passwordStep, /disabled=\{!authChecked \|\| loading \|\| Boolean\(configError\) \|\| captchaBlocksSubmission\}/);
  assert.match(submitAuth, /"\/api\/auth\/signup"/);
  assert.match(submitAuth, /await idempotentClientFetch\(endpoint, init, `auth-signup:\$\{normalizedEmail\}`\)/);
  assert.match(submitAuth, /captchaToken: token \|\| undefined/);
});

test("successful signup clears the password and transitions to focused link verification", () => {
  assert.match(submitAuth, /setPassword\(""\)/);
  assert.match(submitAuth, /setSignupStep\("verify"\)/);
  assert.match(login, /We sent a verification link to/);
  assert.match(verificationStep, /Didn&apos;t get it\? Resend email/);
  assert.match(verificationStep, /Use a different email/);
  assert.doesNotMatch(verificationStep, /PasswordInput|GoogleButton|Create account/);
});

test("verification recovery reveals a captcha-gated resend with a sixty-second cooldown", () => {
  assert.match(verificationStep, /resendChallengeVisible/);
  assert.match(verificationStep, /TurnstileChallenge/);
  assert.match(verificationStep, /disabled=\{loading \|\| resendCooldown > 0 \|\| !captchaToken\}/);
  assert.match(verificationStep, /Send new email/);
  assert.match(login, /const SIGNUP_RESEND_COOLDOWN_SECONDS = 60/);
  assert.match(resendConfirmation, /if \(!normalizedEmail \|\| !captchaToken \|\| resendCooldown > 0 \|\| loading\) return/);
  assert.match(resendConfirmation, /idempotentClientFetch\("\/api\/auth\/resend"/);
  assert.match(resendConfirmation, /Math\.max\(SIGNUP_RESEND_COOLDOWN_SECONDS/);
});

test("using a different email removes sensitive and transient signup state", () => {
  assert.match(clearTransientState, /setPassword\(""\)/);
  assert.match(clearTransientState, /setCaptchaToken\(null\)/);
  assert.match(clearTransientState, /setCaptchaReset/);
  assert.match(clearTransientState, /setError\(""\)/);
  assert.match(clearTransientState, /setStatusMessage\(""\)/);
  assert.match(clearTransientState, /setResendChallengeVisible\(false\)/);
  assert.match(clearTransientState, /setResendCooldown\(0\)/);
  assert.match(clearTransientState, /if \(clearEmail\) setEmail\(""\)/);
  assert.match(clearTransientState, /setSignupStep\("method"\)/);
});

test("Google and sign-in recovery behavior remain available without signup-only consent", () => {
  assert.match(methodStep, /GoogleButton/);
  assert.match(login, /signInWithGoogle\(nextPath\)/);
  assert.match(signIn, /Keep me signed in/);
  assert.match(signIn, /href="\/forgot-password"/);
  assert.match(signIn, /TurnstileChallenge/);
  assert.match(signIn, /accountPrimaryClass/);
  assert.doesNotMatch(signIn, /Terms|Privacy Policy/);
  assert.match(login, /passwordResetSucceeded/);
  assert.match(login, /isPetDeleteReauthentication/);
  assert.match(login, /searchParams\.get\("next"\) \|\| searchParams\.get\("returnTo"\)/);
});

test("signup consent links are exact and confined to account creation", () => {
  assert.match(passwordStep, /href="\/terms">Terms<\/Link>/);
  assert.match(passwordStep, /href="\/privacy">Privacy Policy<\/Link>/);
  assert.match(passwordStep, /By continuing, you agree to Furvise’s/);
});

test("progressive auth layout is page-like on mobile and restrained on larger screens", () => {
  assert.match(layout, /variant\?: "default" \| "progressive"/);
  assert.match(layout, /w-full max-w-\[460px\] bg-transparent py-2 sm:rounded-3xl sm:border/);
  assert.match(layout, /sm:shadow-\[var\(--shadow-surface-1\)\]/);
  assert.doesNotMatch(layout, /max-w-\[460px\] (?:rounded|border|bg-\[var\(--surface-primary\)\]|shadow)/);
  assert.match(methodStep, /accountSignupPrimaryClass/);
  assert.match(layout, /min-h-12 w-full/);
  assert.match(login, /min-h-11/);
});

test("authoritative auth routes retain CAPTCHA and confirmation-link handling", () => {
  const signupRoute = read("app/api/auth/signup/route.ts");
  const resendRoute = read("app/api/auth/resend/route.ts");
  const callback = read("app/auth/callback/route.ts");
  assert.match(signupRoute, /requireCaptchaToken/);
  assert.match(resendRoute, /requireCaptchaToken/);
  assert.match(callback, /exchangeCodeForSession/);
  assert.match(callback, /ensureCanonicalApplicationUser/);
  assert.match(callback, /hasPet/);
  assert.doesNotMatch(login, /otp|one-time code|6-digit/i);
});
