import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const login = read("app/login/page.tsx");
const layout = read("app/components/account-access.tsx");
const methodStep = login.slice(login.indexOf("function SignupMethodStep"), login.indexOf("function SignupPasswordStep"));
const passwordStep = login.slice(login.indexOf("function SignupPasswordStep"), login.indexOf("function SignupOtpStep"));
const otpStep = login.slice(login.indexOf("function SignupOtpStep"), login.indexOf("function EmailInput"));
const localEmailAdvance = login.slice(login.indexOf("function continueSignupWithEmail"), login.indexOf("async function submitAuth"));
const requestAuth = login.slice(login.indexOf("function requestAuthSubmission"), login.indexOf("function handleAuthChallengeToken"));
const authTokenHandler = login.slice(login.indexOf("function handleAuthChallengeToken"), login.indexOf("async function submitAuth"));
const submitAuth = login.slice(login.indexOf("async function submitAuth"), login.indexOf("async function startGoogle"));
const requestResend = login.slice(login.indexOf("function requestResendConfirmation"), login.indexOf("function handleResendChallengeToken"));
const resendTokenHandler = login.slice(login.indexOf("function handleResendChallengeToken"), login.indexOf("async function resendConfirmation"));
const resendConfirmation = login.slice(login.indexOf("async function resendConfirmation"), login.indexOf('if (authStatus === "signedIn")'));
const clearTransientState = login.slice(login.indexOf("function clearTransientAuthState"), login.indexOf("function returnViewportToTop"));
const returnToSignupEmail = login.slice(login.indexOf("function returnToSignupEmail"), login.indexOf("function continueSigninWithEmail"));
const signinMethod = login.slice(login.indexOf("function SigninMethodStep"), login.indexOf("function SigninPasswordStep"));
const signinPassword = login.slice(login.indexOf("function SigninPasswordStep"), login.indexOf("function SignupMethodStep"));

test("normal signup starts with one local email decision and no password or security challenge", () => {
  assert.match(login, /type SignupStep = "method" \| "password" \| "otp"/);
  assert.match(login, /useState<SignupStep>\("method"\)/);
  assert.match(login, /signupStep === "method" \? "Create your account" : signupStep === "password" \? "Create a password" : "Confirm your email"/);
  assert.doesNotMatch(login, /Secure your account/);
  assert.doesNotMatch(login, /Create your Furvise account/);
  assert.match(methodStep, /EmailInput/);
  assert.match(methodStep, />Continue<\/button>/);
  assert.match(methodStep, /Already have an account\? Sign in/);
  assert.doesNotMatch(methodStep, /PasswordInput|TurnstileChallenge|Create account/);
});

test("shared auth branding is heron-only, responsive, accessible, and safe-area aware", () => {
  assert.match(layout, /<BrandMark priority showName=\{false\} size=\{30\} \/>/);
  assert.doesNotMatch(layout, /furvise-wordmark|FURVISE_WORDMARK_ASSET/);
  assert.match(layout, /aria-label="Close and return to Furvise home"/);
  assert.match(layout, /min-h-11 min-w-11/);
  assert.match(layout, /\[--brand-mark-size:1\.875rem\] sm:\[--brand-mark-size:2rem\]/);
  assert.match(layout, /min-h-\[100svh\]/);
  assert.match(layout, /safe-area-inset-top/);
});

test("valid email advances locally after normalization without an account lookup or signup request", () => {
  assert.match(localEmailAdvance, /event\.preventDefault\(\)/);
  assert.match(localEmailAdvance, /normalizeAuthEmail\(email\)/);
  assert.match(localEmailAdvance, /setEmail\(normalizedEmail\)/);
  assert.match(localEmailAdvance, /setSignupStep\("password"\)/);
  assert.doesNotMatch(localEmailAdvance, /fetch|idempotentClientFetch|\/api\/auth/);
  assert.doesNotMatch(login, /email-exists|check-email|account-exists/i);
});

test("password step stays visually quiet while preserving exact policy, Turnstile, and forest action", () => {
  assert.doesNotMatch(login, /<span className="block">For<\/span>/);
  assert.doesNotMatch(passwordStep, /Change email/);
  assert.match(login, /onBack=\{passwordStep \? returnToEmail : undefined\}/);
  assert.match(passwordStep, /placeholder="Create a password"/);
  assert.match(passwordStep, /minLength=\{12\}/);
  assert.match(passwordStep, /maxLength=\{128\}/);
  assert.doesNotMatch(passwordStep, /Use 12 to 128 characters\./);
  assert.match(passwordStep, /Password needs at least 12 characters\./);
  assert.match(passwordStep, /authChallengeVisible \? <TurnstileChallenge/);
  assert.match(passwordStep, /accountPrimaryClass/);
  assert.match(passwordStep, /Create account/);
  assert.match(layout, /accountPrimaryClass[\s\S]*bg-\[var\(--deep-forest\)\]/);
});

test("production signup stays captcha-gated and uses the existing idempotent signup API", () => {
  assert.match(requestAuth, /setAuthChallengeVisible\(true\)/);
  assert.doesNotMatch(requestAuth, /fetch|idempotentClientFetch/);
  assert.match(authTokenHandler, /if \(!token\) \{[\s\S]*setAuthSubmitPending\(false\)/);
  assert.match(authTokenHandler, /if \(!authSubmitPendingRef\.current\) return/);
  assert.match(authTokenHandler, /submitAuth\(token\)/);
  assert.match(submitAuth, /if \(!token\) return/);
  assert.match(submitAuth, /"\/api\/auth\/signup"/);
  assert.match(submitAuth, /await idempotentClientFetch\(endpoint, init, `auth-signup:\$\{normalizedEmail\}`\)/);
  assert.match(submitAuth, /captchaToken: token/);
});

test("successful signup clears the password and transitions to focused OTP verification", () => {
  assert.match(submitAuth, /setPassword\(""\)/);
  assert.match(submitAuth, /setSignupStep\("otp"\)/);
  assert.doesNotMatch(login, /We sent a verification link to/);
  assert.match(login, /signupStep === "otp"[\s\S]*We sent a code to <strong className="break-all font-semibold text-\[var\(--text-primary\)\]">\{email\}<\/strong>\./);
  assert.match(otpStep, /"Resend code"/);
  assert.match(otpStep, /Use another email/);
  assert.doesNotMatch(otpStep, /PasswordInput|GoogleButton|Create account/);
});

test("verification recovery reveals a captcha-gated resend with a sixty-second cooldown", () => {
  assert.match(otpStep, /resendChallengeVisible/);
  assert.match(otpStep, /resendChallengeVisible \? \([\s\S]*TurnstileChallenge/);
  assert.match(otpStep, /disabled=\{loading \|\| resendCooldown > 0 \|\| resendSubmitPending \|\| otpVerifying\}/);
  assert.match(otpStep, /"Resend code"/);
  assert.match(login, /const SIGNUP_RESEND_COOLDOWN_SECONDS = 60/);
  assert.match(requestResend, /resendSubmitPendingRef\.current = true/);
  assert.match(requestResend, /setResendChallengeVisible\(true\)/);
  assert.doesNotMatch(requestResend, /idempotentClientFetch|\/api\/auth\/resend/);
  assert.match(resendTokenHandler, /if \(!token\) \{[\s\S]*setResendSubmitPending\(false\)/);
  assert.match(resendTokenHandler, /if \(!resendSubmitPendingRef\.current\) return/);
  assert.equal((resendTokenHandler.match(/resendConfirmation\(token\)/g) || []).length, 1);
  assert.match(resendConfirmation, /if \(!normalizedEmail \|\| !token \|\| resendCooldown > 0 \|\| loading\) return/);
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
  assert.match(returnToSignupEmail, /if \(clearEmail\) setEmail\(""\)/);
  assert.match(returnToSignupEmail, /setSignupStep\("method"\)/);
});

test("Google and sign-in recovery behavior remain available without signup-only consent", () => {
  assert.match(methodStep, /GoogleButton/);
  assert.match(login, /signInWithGoogle\(nextPath\)/);
  assert.doesNotMatch(login, /Keep me signed in|keepSignedIn/);
  assert.doesNotMatch(signinMethod, /PasswordInput|TurnstileChallenge|Forgot password/);
  assert.match(signinPassword, /href="\/forgot-password"/);
  assert.match(signinPassword, /TurnstileChallenge/);
  assert.match(signinPassword, /accountPrimaryClass/);
  assert.doesNotMatch(`${signinMethod}\n${signinPassword}`, /Terms|Privacy Policy/);
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
  assert.match(layout, /sm:max-w-\[500px\]/);
  assert.match(layout, /compact \? "min-h-0" : "min-h-\[calc\(100svh-1\.5rem\)\]"/);
  assert.match(layout, /rounded-\[1\.75rem\][\s\S]*border border-\[var\(--line\)\][\s\S]*bg-\[var\(--surface-primary\)\]/);
  assert.match(layout, /shadow-\[var\(--shadow-surface-1\)\]/);
  assert.match(methodStep, /accountPrimaryClass/);
  assert.match(layout, /min-h-12 w-full/);
  assert.match(login, /min-h-11/);
});

test("authoritative auth routes retain CAPTCHA and legacy confirmation-link handling", () => {
  const signupRoute = read("app/api/auth/signup/route.ts");
  const resendRoute = read("app/api/auth/resend/route.ts");
  const callback = read("app/auth/callback/route.ts");
  assert.match(signupRoute, /requireCaptchaToken/);
  assert.match(resendRoute, /requireCaptchaToken/);
  assert.match(callback, /exchangeCodeForSession/);
  assert.match(callback, /ensureCanonicalApplicationUser/);
  assert.match(callback, /hasPet/);
  assert.match(login, /autoComplete="one-time-code"/);
  assert.doesNotMatch(login, /signInWithOtp/);
});
